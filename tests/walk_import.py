"""Visita il flusso «Importa dalle note» in una lingua e salva i testi di ogni passaggio (stesso formato di walk.py).

Serve a controllare le traduzioni delle schermate che non si raggiungono solo con i clic (anteprima, modifica, risultato, errori).
Usa solo testi inventati. Con il server su http://127.0.0.1:8765/ avviato dalla cartella del progetto:

  python tests/walk_import.py snapshot OUT.json [--lang it] [--engine chromium]
  python tests/walk_import.py pseudo OUT.json             # con --lang xx: testi che non passano da t()
  python tests/walk_import.py check OUT.json [--expect-lang it] [--layout]
"""
import argparse
import io
import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import walk  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

NOTE = """Diario (esempio inventato)
2026
10.09 emicrania forte 8/10, lato sinistro, nausea e fotofobia, 2 oki
11.09 ^^
12.09 aura visiva, imigran 50 non ha fatto effetto
13.09 nessun dolore
14.09 ciclo
15.09 domani ciclo
16.09 visita dal neurologo
20.09 mal di testa leggero, preso zalexil 20 mg
Primi di ottobre
2.10 pronto soccorso per emicrania fortissima
3-4.10 forte, poco sonno, stress
31.04 forte
30.12 forte"""

AMBIGUOUS = "3/4 forte, oki\n5/4 leggero\n6/4 nausea"
NOTHING = "lista della spesa\nlatte\nuova"


class Flow:
    def __init__(self, pw, engine, lang, profile):
        self.w = walk.Walker(pw, engine, lang, profile, 1, 4)
        self.p = None
        self.out = self.w.out

    # ---- utilita' ----
    def wait(self, ms=450):
        self.p.wait_for_timeout(ms)

    def shot(self, name):
        p = self.p
        snap = p.evaluate("() => window.__walk.snap()")
        snap["shared"] = []
        try:
            snap["missing"] = p.evaluate("async () => [...(await import('./js/i18n.js')).missing]")
        except Exception:  # noqa: BLE001
            snap["missing"] = []
        self.out[name] = snap
        print(f"  [{len(self.out):3d}] {name:34s} {len(snap['text']):5d} car", flush=True)

    def top(self):
        return self.p.locator("#overlays > *:not(.closing)").last

    def click_nth(self, selector, n):
        self.p.locator(selector).nth(n).click()
        self.wait()

    def open_import(self):
        self.p.evaluate("async () => { const m = await import('./js/views/notes-import.js'); m.openNotesImport(); }")
        self.wait(600)

    def close_all(self):
        self.p.evaluate("async () => { const u = await import('./js/ui.js'); u.closeAllOverlays(); }")
        self.wait(400)

    def paste(self, text):
        page = self.p.locator(".page").last
        page.locator(".stack .btn").nth(1).click()
        self.wait(450)
        self.p.locator(".sheet-wrap textarea").fill(text)
        self.wait(200)

    def read_pasted(self):
        self.p.locator(".sheet-wrap .btn.primary").last.click()
        self.wait(1100)

    def expand_all(self):
        n = self.p.locator(".page").last.locator("summary.acc-sum").count()
        for i in range(n):
            summ = self.p.locator(".page").last.locator("summary.acc-sum").nth(i)
            if not summ.evaluate("(e) => e.parentElement.open"):
                summ.click()
                self.wait(200)

    # ---- il percorso ----
    def run(self):
        w = self.w
        w.fresh()
        self.p = w.page
        # 1. avvio e incolla
        self.open_import()
        self.shot("import/start")
        self.expand_all()
        self.shot("import/start-open")
        self.p.locator(".page").last.locator(".stack .btn").nth(1).click()
        self.wait(450)
        self.shot("import/paste")
        self.p.locator(".sheet-wrap textarea").fill(NOTE)
        self.wait(200)
        self.read_pasted()
        # 2. anteprima
        self.shot("import/review")
        self.expand_all()
        self.shot("import/review-open")
        for name, idx in (("review-chip-review", 1), ("review-chip-skipped", 2), ("review-chip-all", 0)):
            self.p.locator(".page").last.locator(".chip-group .chip, .chips .chip").nth(idx).click()
            self.wait(250)
            self.shot(f"import/{name}")
        # 3. foglio di modifica per i diversi tipi di riga
        rows = self.p.locator(".page").last.locator(".imp-row")
        total = rows.count()
        for name, idx in (("edit-attack", 0), ("edit-free", 3), ("edit-menses", 4), ("edit-other", 6), ("edit-invalid", total - 2), ("edit-future", total - 1)):
            if idx < 0 or idx >= total:
                continue
            rows.nth(idx).locator(".ep-card").click()
            self.wait(500)
            self.shot(f"import/{name}")
            self.p.locator(".sheet-wrap .sheet-close").last.click()
            self.wait(350)
        # 4. importa, risultato, annulla
        self.p.locator(".imp-foot .btn").click()
        self.wait(1000)
        self.shot("import/result")
        self.p.locator(".sheet-wrap .btn.danger").click()
        self.wait(450)
        self.shot("import/undo-confirm")
        self.p.locator(".dialog .dlg-btn").first.click()
        self.wait(350)
        self.p.locator(".sheet-wrap .btn.danger").click()
        self.wait(400)
        self.p.locator(".dialog .dlg-btn").last.click()
        self.wait(500)
        self.shot("import/undone-toast")
        self.close_all()
        # 5. di nuovo, poi elenco delle importazioni fatte
        self.open_import()
        self.paste(NOTE)
        self.read_pasted()
        self.p.locator(".imp-foot .btn").click()
        self.wait(1000)
        self.p.locator(".sheet-wrap .sheet-close").last.click()
        self.wait(400)
        self.close_all()
        self.open_import()
        self.shot("import/start-with-batches")
        self.p.locator(".page").last.locator(".group .row").first.click()
        self.wait(450)
        self.shot("import/batch-delete-confirm")
        self.p.locator(".dialog .dlg-btn").first.click()
        self.wait(300)
        # 6. la stessa nota una seconda volta: giorni gia' nel diario
        self.paste(NOTE)
        self.read_pasted()
        self.shot("import/review-again")
        self.p.locator(".page").last.get_by_role("button").first.click()
        self.wait(500)
        if self.p.locator(".dialog").count():
            self.p.locator(".dialog .dlg-btn").last.click()
            self.wait(400)
        self.close_all()
        # 7. date ambigue e senza anno
        self.open_import()
        self.paste(AMBIGUOUS)
        self.read_pasted()
        self.expand_all()
        self.shot("import/review-ambiguous")
        self.close_all()
        # 8. nessuna data
        self.open_import()
        self.paste(NOTHING)
        self.read_pasted()
        self.shot("import/nothing-found")
        self.close_all()
        # 9. file ed errori
        self.open_import()
        fin = self.p.locator(".page").last.locator("input[type=file]")
        fin.set_input_files({"name": "diario.txt", "mimeType": "text/plain", "buffer": NOTE.encode("utf-8")})
        self.wait(1200)
        self.shot("import/review-from-file")
        self.close_all()
        self.open_import()
        fin = self.p.locator(".page").last.locator("input[type=file]")
        for name, f in (
            ("image", {"name": "foto.png", "mimeType": "image/png", "buffer": b"\x89PNG\r\n\x1a\n"}),
            ("empty", {"name": "vuoto.txt", "mimeType": "text/plain", "buffer": b"  \n"}),
            ("unsupported", {"name": "diario.pages", "mimeType": "application/octet-stream", "buffer": b"PK\x03\x04"}),
            ("broken", {"name": "rotto.docx", "mimeType": "application/octet-stream", "buffer": b"non e' uno zip"}),
            ("pdf-empty", {"name": "scansione.pdf", "mimeType": "application/pdf", "buffer": empty_pdf()}),
        ):
            fin.set_input_files(f)
            self.wait(1500 if name == "pdf-empty" else 700)
            self.shot(f"import/error-{name}")
            self.wait(400)
        # 10. ingressi: calendario vuoto (mese ed elenco) solo con profilo vuoto
        self.out["__errors__"] = sorted(set(w.errors))
        w.browser.close()
        return self.out


def empty_pdf():
    """PDF valido senza testo (una pagina bianca): si comporta come una scansione."""
    objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offs = []
    for n, o in enumerate(objs, 1):
        offs.append(len(out))
        out += f"{n} 0 obj\n{o}\nendobj\n".encode()
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    for o in offs:
        out += f"{o:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


NOTE_WORDS = set(w.lower() for w in walk.WORD.findall(" ".join([NOTE, AMBIGUOUS, NOTHING, "diario txt pdf docx pages png foto vuoto rotto scansione"])))


def cmd_snapshot(a):
    with sync_playwright() as pw:
        flow = Flow(pw, a.engine, a.lang, a.profile)
        t0 = time.time()
        out = flow.run()
    Path(a.out).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(out) - 1} stati salvati in {a.out} ({time.time() - t0:.0f}s); errori console: {len(out['__errors__'])}")
    for e in out["__errors__"][:10]:
        print("  ", e[:200])


def cmd_pseudo(a):
    orig = walk.seed_vocab
    walk.seed_vocab = lambda profile: orig(profile) | NOTE_WORDS
    walk.cmd_pseudo(a)


def cmd_check(a):
    walk.cmd_check(a)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("snapshot")
    s.add_argument("out")
    s.add_argument("--lang", default="it")
    s.add_argument("--engine", default="chromium")
    s.add_argument("--profile", default="full")
    s.set_defaults(fn=cmd_snapshot)
    p = sub.add_parser("pseudo")
    p.add_argument("snap")
    p.add_argument("--profile", default="full")
    p.add_argument("--deep", action="store_true")
    p.set_defaults(fn=cmd_pseudo)
    k = sub.add_parser("check")
    k.add_argument("snap")
    k.add_argument("--expect-lang", default="it")
    k.add_argument("--layout", action="store_true")
    k.add_argument("--baseline")
    k.set_defaults(fn=cmd_check)
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
