"""Visita automatica delle schermate dell'app: salva i testi visibili di ogni schermata (snapshot) per confrontarli tra versioni e lingue.

Uso (con il server su http://127.0.0.1:8765/ avviato dalla cartella del progetto):
  python tests/walk.py snapshot OUT.json [--lang it] [--engine chromium] [--profile full] [--depth 3] [--root N]
  python tests/walk.py compare A.json B.json
  python tests/walk.py pseudo SNAPSHOT_XX.json          # cerca testi non passati da t() (richiede --lang xx)
  python tests/walk.py check SNAPSHOT.json              # cerca segnaposto o valori rotti ({x}, undefined, NaN...)

La visita parte dalla schermata iniziale e clicca ogni bottone/riga (sempre per posizione, mai per testo), quindi funziona
identica in tutte le lingue. L'orologio e' fissato per avere testi riproducibili.
"""
import argparse
import base64
import datetime as dt
import json
import os
import re
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from seed import make_db, init_script, add_v2  # noqa: E402

BASE = os.environ.get("WALK_BASE", "http://127.0.0.1:8765/")
NOW = dt.datetime(2026, 10, 25, 12, 0)

MOCK_SHARE = """
window.__shared = [];
Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
Object.defineProperty(navigator, 'share', { value: async (data) => {
  const files = [];
  for (const f of (data.files || [])) {
    const buf = new Uint8Array(await f.arrayBuffer());
    let bin = ''; buf.forEach((b) => { bin += String.fromCharCode(b); });
    files.push({ name: f.name, type: f.type, size: f.size, b64: btoa(bin) });
  }
  window.__shared.push({ text: data.text || null, title: data.title || null, files });
}, configurable: true });
window.__canvasText = [];
for (const fn of ['fillText', 'strokeText']) {
  const orig = CanvasRenderingContext2D.prototype[fn];
  CanvasRenderingContext2D.prototype[fn] = function (text, ...rest) { window.__canvasText.push(String(text)); return orig.call(this, text, ...rest); };
}
"""

HELPERS = """
window.__walk = {
  list: [],
  layers() { return [...document.querySelectorAll('#overlays > *')].filter((e) => !e.classList.contains('closing')); },
  root() { const l = this.layers(); return l.length ? l[l.length - 1] : document.getElementById('app'); },
  tab() { return [...document.querySelectorAll('.tabbar .tab')].findIndex((b) => b.classList.contains('active')); },
  cands(cap, inner) {
    const root = this.root();
    this.list = [];
    if (root.classList.contains('dialog-wrap') || root.classList.contains('relief') || root.classList.contains('lang-page')) return 0;
    const EXC = '.chip,.int-btn,.stepper-btn,.sheet-close,.backdrop,.dlg-btn,.toast-act,.sheet-grab';
    const seen = {};
    for (const el of root.querySelectorAll('button, summary')) {
      if (el.disabled || el.matches(EXC) || el.closest('.switch')) continue;
      if (el.matches('.bar-btn') && (!el.closest('.bar-right') || el.matches('.solid'))) continue;
      if (inner && (el.closest('.tabbar') || el.matches('.tab-fab') || (el.matches('.topbar .nav-btn') && !el.nextElementSibling))) continue;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      const sig = el.tagName + '.' + String(el.className || '').replace(/\\b(on|active|open|today|sel|selected)\\b/g, '').replace(/\\s+/g, ' ').trim();
      seen[sig] = (seen[sig] || 0) + 1;
      if (seen[sig] > cap) continue;
      this.list.push(el);
    }
    return this.list.length;
  },
  click(i) { this.list[i].click(); },
  hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; },
  state() { const r = this.root(); return { n: this.layers().length, tab: this.tab(), h: this.hash(r.innerText + '|' + document.querySelectorAll('#toasts .toast').length) }; },
  snap() {
    const root = this.root();
    const attrs = [];
    root.querySelectorAll('[aria-label],[title],[placeholder],[alt]').forEach((e) => {
      for (const a of ['aria-label', 'title', 'placeholder', 'alt']) { const v = e.getAttribute(a); if (v) attrs.push(`${a}=${v}`); }
    });
    const clipped = [];
    root.querySelectorAll('*').forEach((el) => {
      if (el.closest('svg') || !el.textContent.trim()) return;
      const cs = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && (cs.textOverflow === 'ellipsis' || cs.overflowX === 'hidden') && el.children.length < 3) {
        clipped.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} | ${el.textContent.trim().slice(0, 60)}`);
      }
    });
    return {
      text: root.innerText,
      attrs,
      svg: [...root.querySelectorAll('svg text, svg title')].map((e) => e.textContent),
      toasts: [...document.querySelectorAll('#toasts .toast')].map((e) => e.innerText),
      lang: document.documentElement.lang,
      clipped,
      hscroll: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  },
};
"""


def seed_for(profile):
    if profile == "full":
        return add_v2(make_db(today=NOW, days=200, seed=7), today=NOW)
    if profile == "ongoing":
        return make_db(today=NOW, days=60, ongoing=True, seed=8)
    if profile == "empty":
        return None
    if profile == "new":
        return {"schema": 2, "createdAt": "2026-10-25T12:00", "settings": {"welcomeDone": True, "installHintDismissed": True}}
    raise SystemExit(f"profilo sconosciuto: {profile}")


class Walker:
    def __init__(self, pw, engine, lang, profile, depth, cap):
        self.pw = pw
        self.browser = getattr(pw, engine).launch()
        self.lang = lang
        self.seed = seed_for(profile)
        self.profile = profile
        self.depth = depth
        self.cap = cap
        self.ctx = None
        self.page = None
        self.errors = []
        self.out = {}
        self.t0 = time.time()
        self.fresh_count = 0

    def fresh(self):
        last = None
        for attempt in range(3):
            if self.ctx:
                self.ctx.close()
            self.ctx = self.browser.new_context(
                viewport={"width": 402, "height": 874}, device_scale_factor=1, is_mobile=True, has_touch=True,
                locale="it-IT", timezone_id="Europe/Rome", color_scheme="light", service_workers="block", accept_downloads=True,
            )
            self.ctx.clock.set_fixed_time(NOW)
            self.ctx.add_init_script(MOCK_SHARE)
            self.ctx.add_init_script(HELPERS)
            if self.lang != "it":
                self.ctx.add_init_script(f"try {{ localStorage.setItem('emicrania.lang', '{self.lang}'); }} catch (e) {{}}")
            if self.seed is not None:
                self.ctx.add_init_script(init_script(self.seed))
            self.page = self.ctx.new_page()
            self.page.on("console", lambda m: self.errors.append(f"[{m.type}] {m.text}") if m.type == "error" else None)
            self.page.on("pageerror", lambda e: self.errors.append(f"[pageerror] {e}"))
            try:
                self.page.goto(BASE + "index.html", timeout=60000)
                self.page.wait_for_selector(".tabbar", timeout=30000)
                break
            except Exception as e:  # noqa: BLE001
                last = e
                print(f"  ! caricamento fallito (tentativo {attempt + 1}): {str(e)[:120]} | errori: {self.errors[-2:]}", flush=True)
        else:
            raise last
        self.page.wait_for_timeout(500)
        self.fresh_count += 1

    def settle(self):
        p = self.page
        p.wait_for_timeout(380)
        for _ in range(40):
            busy = p.evaluate("() => !!document.querySelector('.page .btn.primary:disabled, [aria-busy=true]') || (!!document.querySelector('.report-page') === false && !!document.querySelector('.page.report'))")
            if not busy:
                break
            p.wait_for_timeout(250)
        p.wait_for_timeout(120)

    def cands(self, inner):
        return self.page.evaluate("([c, i]) => window.__walk.cands(c, i)", [self.cap, inner])

    def state(self):
        return self.page.evaluate("() => window.__walk.state()")

    def click(self, i, inner):
        self.cands(inner)
        self.page.evaluate("(i) => window.__walk.click(i)", i)
        self.settle()

    def replay(self, path):
        for k, i in enumerate(path):
            self.click(i, k > 0)

    def snapshot(self, path):
        snap = self.page.evaluate("() => window.__walk.snap()")
        shared = self.page.evaluate("() => window.__shared")
        snap["shared"] = [
            {"title": s["title"], "text": s["text"], "files": [
                {"name": f["name"], "type": f["type"], "text": base64.b64decode(f["b64"]).decode("utf-8", "replace") if re.search(r"text|csv|calendar|json", f["type"] or "") else None}
                for f in s["files"]]} for s in shared]
        canvas = self.page.evaluate("() => window.__canvasText")
        if canvas:
            snap["canvas"] = canvas
        try:
            snap["missing"] = self.page.evaluate("async () => [...(await import('./js/i18n.js')).missing]")
        except Exception:  # noqa: BLE001
            snap["missing"] = []
        key = "/".join(f"c{i}" for i in path) or "root"
        self.out[key] = snap
        print(f"  [{len(self.out):3d}] {key:28s} {self.page.evaluate('() => window.__walk.root().className')[:30]!r:34s} {len(snap['text']):5d} car  ({time.time() - self.t0:.0f}s)", flush=True)

    def explore(self, path, depth):
        """La pagina e' gia' nello stato `path`."""
        self.snapshot(path)
        if depth <= 0:
            return
        inner = len(path) > 0
        n = self.cands(inner)
        dirty = False
        for i in range(n):
            if dirty:
                self.fresh()
                self.replay(path)
                if self.cands(inner) != n:
                    print(f"  ! candidati diversi dopo il ripristino di {path}", flush=True)
                    break
                dirty = False
            before = self.state()
            self.page.evaluate("(i) => window.__walk.click(i)", i)
            self.settle()
            after = self.state()
            if after["n"] > before["n"] or (after["n"] == before["n"] and after["tab"] != before["tab"]):
                self.explore(path + [i], depth - 1)
                dirty = True
            elif after["h"] != before["h"] and after["n"] == before["n"]:
                self.snapshot(path + [i])
                dirty = True
            elif after["n"] < before["n"]:
                dirty = True

    def run(self, only_root=None):
        self.fresh()
        if only_root is None:
            self.explore([], self.depth)
        else:
            n = self.cands(False)
            print(f"candidati alla radice: {n}", flush=True)
            self.snapshot([])
            for i in only_root:
                if i >= n:
                    continue
                self.fresh()
                self.cands(False)
                before = self.state()
                self.page.evaluate("(i) => window.__walk.click(i)", i)
                self.settle()
                after = self.state()
                if after["n"] > before["n"] or after["tab"] != before["tab"]:
                    self.explore([i], self.depth - 1)
                else:
                    self.snapshot([i])
        self.out["__errors__"] = sorted(set(self.errors))
        self.browser.close()
        return self.out


def parse_roots(spec):
    out = []
    for part in spec.split(","):
        if "-" in part:
            a, b = part.split("-")
            out += list(range(int(a), int(b) + 1))
        elif part:
            out.append(int(part))
    return out


def cmd_snapshot(a):
    with sync_playwright() as pw:
        w = Walker(pw, a.engine, a.lang, a.profile, a.depth, a.cap)
        roots = parse_roots(a.root) if a.root else None
        out = w.run(roots)
    Path(a.out).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(out) - 1} stati salvati in {a.out} ({w.fresh_count} caricamenti, {time.time() - w.t0:.0f}s); errori console: {len(out['__errors__'])}")
    for e in out["__errors__"][:10]:
        print("  ", e[:200])


def flat(snap):
    lines = [f"text| {ln}" for ln in snap["text"].split("\n")]
    lines += [f"attr| {x}" for x in snap["attrs"]]
    lines += [f"svg| {x}" for x in snap["svg"]]
    lines += [f"toast| {x.replace(chr(10), ' / ')}" for x in snap["toasts"]]
    for s in snap.get("shared", []):
        lines += [f"share-title| {s['title']}"] + [f"share-text| {ln}" for ln in (s["text"] or "").split("\n")]
        for f in s["files"]:
            lines.append(f"share-file| {f['name']} {f['type']}")
            lines += [f"share-file-text| {ln}" for ln in (f["text"] or "").split("\n")]
    lines += [f"canvas| {x}" for x in snap.get("canvas", [])]
    return lines


def cmd_compare(a):
    import difflib
    A = json.loads(Path(a.a).read_text(encoding="utf-8"))
    B = json.loads(Path(a.b).read_text(encoding="utf-8"))
    ka, kb = set(A) - {"__errors__"}, set(B) - {"__errors__"}
    bad = 0
    for k in sorted(ka - kb):
        print(f"SOLO IN A: {k}")
        bad += 1
    for k in sorted(kb - ka):
        print(f"SOLO IN B: {k}")
        bad += 1
    for k in sorted(ka & kb):
        fa, fb = flat(A[k]), flat(B[k])
        if fa != fb:
            bad += 1
            print(f"--- {k}")
            shown = 0
            for ln in difflib.unified_diff(fa, fb, lineterm="", n=0):
                if ln.startswith(("---", "+++", "@@")):
                    continue
                print("   ", ln[:230])
                shown += 1
                if shown >= a.max:
                    print("    ...")
                    break
    print(f"{len(ka & kb)} stati confrontati, {bad} con differenze")
    sys.exit(1 if bad else 0)


WRAP = re.compile(r"⟦[^⟦⟧]*⟧")


def strip_wrapped(txt):
    """Toglie i segmenti marcati da t()/tv(), anche annidati (dal piu' interno)."""
    while True:
        new = WRAP.sub(" ", txt)
        if new == txt:
            return new
        txt = new
WORD = re.compile(r"[^\W\d_]{2,}", re.UNICODE)
IT_DATE_WORDS = set("""gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre novembre dicembre gen feb mar apr mag giu lug ago set ott nov dic
lunedì martedì mercoledì giovedì venerdì sabato domenica lun mer gio ven sab dom mer""".split())
UNITS = {"mg", "ml", "cpr", "hpa", "kpa", "min", "gg", "mmhg", "cm", "kg", "ii", "iii", "iv", "mm", "ok", "pdf", "ics", "csv", "zip", "json", "midas", "pin", "id", "jpg", "png", "cgrp", "ace", "snri", "fans", "rm", "tac", "eeg"}


FREE_KEYS = {"note", "text", "title", "place", "org", "dept", "address", "questions", "narrative", "name", "dose", "diagBy", "doctor", "otherMeds", "allergies",
             "conditionsNote", "outcome", "phone", "email", "files", "unit"}


def seed_vocab(profile):
    """Parole scritte liberamente dall'utente nei dati di prova (non devono passare da t())."""
    seed = seed_for(profile)
    words = set()

    def rec(v, free=False):
        if isinstance(v, str):
            if free:
                words.update(w.lower() for w in WORD.findall(v))
        elif isinstance(v, dict):
            for k, x in v.items():
                rec(x, free or k in FREE_KEYS)
        elif isinstance(v, list):
            for x in v:
                rec(x, free)
    rec(seed or {})
    return words


def cmd_pseudo(a):
    S = json.loads(Path(a.snap).read_text(encoding="utf-8"))
    vocab = seed_vocab(a.profile) | IT_DATE_WORDS | UNITS
    flagged = {}
    for k, snap in S.items():
        if k == "__errors__":
            continue
        for ln in flat(snap):
            kind, _, txt = ln.partition("| ")
            if kind == "attr":
                txt = txt.partition("=")[2]
            if kind in ("share-file-text", "share-text", "share-title", "canvas") and not a.deep:
                continue
            rest = strip_wrapped(txt)
            words = [w for w in WORD.findall(rest) if w.lower() not in vocab]
            if words:
                flagged.setdefault(txt.strip(), (k, kind, words))
    for txt, (k, kind, words) in sorted(flagged.items(), key=lambda kv: kv[1][0]):
        print(f"{k:24s} {kind:10s} {txt[:110]!r}  -> {words[:4]}")
    print(f"{len(flagged)} testi non passati da t()")
    sys.exit(1 if flagged else 0)


BROKEN = re.compile(r"undefined|NaN|\[object|\{[a-zA-Z]+\}|\{[a-z]+, plural|\bnull\b|⟦|⟧")


def cmd_check(a):
    S = json.loads(Path(a.snap).read_text(encoding="utf-8"))
    bad = 0
    missing = set()
    clipped = {}
    base_clipped = set()
    if a.baseline:
        B = json.loads(Path(a.baseline).read_text(encoding="utf-8"))
        base_clipped = {(k, c.split(" | ")[0]) for k, v in B.items() if k != "__errors__" for c in v.get("clipped", [])}
    for k, snap in S.items():
        if k == "__errors__":
            for e in snap:
                print("ERRORE CONSOLE:", e[:200])
                bad += 1
            continue
        missing.update(snap.get("missing", []))
        if a.layout:
            for c in snap.get("clipped", []):
                sig = c.split(" | ")[0]
                if (k, sig) not in base_clipped:
                    clipped.setdefault(c, []).append(k)
            if snap.get("hscroll"):
                print(f"{k:24s} scorrimento orizzontale della pagina")
                bad += 1
        for ln in flat(snap):
            if BROKEN.search(ln) and not ln.startswith(("share-file-text| {", "share-file-text|  ")):
                print(f"{k:24s} {ln[:200]!r}")
                bad += 1
        if snap.get("lang") != a.expect_lang:
            print(f"{k:24s} lang={snap.get('lang')!r} (atteso {a.expect_lang!r})")
            bad += 1
    for m in sorted(missing):
        print(f"TRADUZIONE MANCANTE: {m[:120]!r}")
        bad += 1
    for c, where in sorted(clipped.items()):
        print(f"TESTO TAGLIATO ({len(where)} schermate, es. {where[0]}): {c}")
    print(f"{bad} problemi" + (f", {len(clipped)} testi tagliati" if a.layout else ""))
    sys.exit(1 if bad else 0)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("snapshot")
    s.add_argument("out")
    s.add_argument("--lang", default="it")
    s.add_argument("--engine", default="chromium")
    s.add_argument("--profile", default="full")
    s.add_argument("--depth", type=int, default=3)
    s.add_argument("--cap", type=int, default=4, help="max elementi con la stessa firma per schermata")
    s.add_argument("--root", default="", help="indici dei candidati alla radice da esplorare (es. 0,1,2)")
    s.set_defaults(fn=cmd_snapshot)
    c = sub.add_parser("compare")
    c.add_argument("a")
    c.add_argument("b")
    c.add_argument("--max", type=int, default=12)
    c.set_defaults(fn=cmd_compare)
    p = sub.add_parser("pseudo")
    p.add_argument("snap")
    p.add_argument("--profile", default="full")
    p.add_argument("--deep", action="store_true", help="controlla anche testi condivisi e canvas")
    p.set_defaults(fn=cmd_pseudo)
    k = sub.add_parser("check")
    k.add_argument("snap")
    k.add_argument("--expect-lang", default="it")
    k.add_argument("--layout", action="store_true", help="segnala anche testi tagliati e scorrimento orizzontale")
    k.add_argument("--baseline", help="snapshot italiano con le stesse metriche: i testi gia' tagliati li' non vengono segnalati")
    k.set_defaults(fn=cmd_check)
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
