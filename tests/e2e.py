"""Test end-to-end del Diario Emicrania (Playwright). Uso: python tests/e2e.py [chromium|webkit] [filtro]"""
import base64
import json
import re
import sys
import traceback
from pathlib import Path

from playwright.sync_api import sync_playwright, expect
from seed import make_db, init_script, add_v2

OUT = Path(__file__).parent / "_shots"
OUT.mkdir(exist_ok=True)
BASE = "http://127.0.0.1:8765/"
engine = sys.argv[1] if len(sys.argv) > 1 else "chromium"
only = sys.argv[2] if len(sys.argv) > 2 else ""

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
"""

results = []


class Ctx:
    def __init__(self, pw, seed=None, scheme="light", share=True, **kw):
        self.browser = getattr(pw, engine).launch()
        self.context = self.browser.new_context(
            viewport={"width": 402, "height": 874}, device_scale_factor=2, is_mobile=True, has_touch=True,
            locale="it-IT", timezone_id="Europe/Rome", color_scheme=scheme, accept_downloads=True, **kw,
        )
        if share:
            self.context.add_init_script(MOCK_SHARE)
        if seed is not None:
            self.context.add_init_script(init_script(seed))
        self.page = self.context.new_page()
        self.errors = []
        self.page.on("console", lambda m: self.errors.append(f"[{m.type}] {m.text}") if m.type == "error" else None)
        self.page.on("pageerror", lambda e: self.errors.append(f"[pageerror] {e}"))
        self.page.goto(BASE + "index.html")
        self.page.wait_for_selector(".tabbar")

    def db(self):
        self.page.wait_for_timeout(350)
        return self.page.evaluate("() => JSON.parse(localStorage.getItem('emicrania.db.v1'))")

    def close(self):
        self.browser.close()


def scenario(fn):
    def wrapper(pw):
        name = fn.__name__
        if only and only not in name:
            return
        ctx = None
        try:
            ctx = fn(pw)
            print(f"PASS  {name}")
            results.append((name, True, ""))
        except Exception as e:  # noqa: BLE001
            print(f"FAIL  {name}: {e}")
            traceback.print_exc()
            results.append((name, False, str(e)))
            try:
                if ctx and ctx.page:
                    ctx.page.screenshot(path=str(OUT / f"FAIL-{engine}-{name}.png"))
            except Exception:  # noqa: BLE001
                pass
        finally:
            if ctx:
                ctx.close()
    wrapper.__name__ = fn.__name__
    return wrapper


def poll(page, fn, timeout=15000, step=150):
    """Come wait_for_function, ma senza eval (la CSP dell'app lo vieta)."""
    waited = 0
    while waited <= timeout:
        if page.evaluate(fn):
            return
        page.wait_for_timeout(step)
        waited += step
    raise AssertionError(f"timeout in attesa di: {fn}")


def settle(page, ms=450):
    page.wait_for_timeout(ms)


def int_btn(page, n):
    return page.locator(".int-btn", has_text=re.compile(rf"^{n}$"))


def tab(page, label):
    page.locator(".tabbar .tab", has_text=label).click()
    page.wait_for_timeout(250)


def open_settings(page):
    page.get_by_role("button", name="Impostazioni").click()
    page.wait_for_timeout(450)


def open_data(page):
    open_settings(page)
    page.locator(".page").last.locator(".row", has_text="Dati e backup").click()
    page.wait_for_timeout(450)


def cartella(page, title):
    tab(page, "Cartella")
    page.locator(".view .row", has_text=title).first.click()
    page.wait_for_timeout(500)


def back(page):
    page.locator(".page").last.get_by_role("button", name="Indietro").click()
    page.wait_for_timeout(400)


def ensure_clean(ctx, where):
    assert not ctx.errors, f"{where}: errori in console: {ctx.errors}"


@scenario
def s01_first_run_welcome(pw):
    ctx = Ctx(pw)
    p = ctx.page
    expect(p.locator(".sheet-wrap .sheet-title")).to_have_text("Benvenuto")
    p.get_by_role("button", name="Inizia").click()
    p.wait_for_selector(".sheet-wrap", state="detached")
    assert ctx.db()["settings"]["welcomeDone"] is True
    ensure_clean(ctx, "welcome")
    return ctx


@scenario
def s02_log_episode_end_flow(pw):
    seed = make_db(days=40, seed=3)
    seed["episodes"] = {}
    seed["days"] = {}
    ctx = Ctx(pw, seed=seed)
    p = ctx.page
    p.locator(".tab-fab").click()
    expect(p.locator(".page .bar-title")).to_have_text("Nuovo attacco")
    save = p.locator(".bar-btn.solid")
    assert save.is_disabled(), "Salva deve essere disabilitato senza intensità"
    int_btn(p, 6).click()
    assert save.is_enabled()
    p.get_by_role("button", name="Aggiungi farmaco").click()
    p.locator(".sheet input[type=search]").fill("sumat")
    p.locator(".sheet .row", has_text="Sumatriptan").click()
    p.wait_for_selector(".sheet-wrap", state="detached")
    expect(p.locator(".med-card .med-name")).to_have_text("Sumatriptan")
    p.locator(".med-card .chip", has_text="Buono").click()
    p.locator(".acc", has_text="Fattori scatenanti").locator("summary").click()
    p.locator(".acc[open] .chip", has_text="Stress").first.click()
    p.locator(".acc[open] .chip.add").click()
    p.locator(".dialog-wrap:not(.closing) input").fill("Rumore improvviso")
    p.locator(".dialog-wrap:not(.closing) .dlg-btn.primary").click()
    p.wait_for_selector(".dialog-wrap", state="detached")
    expect(p.locator(".acc[open] .chip.on", has_text="Rumore improvviso")).to_have_count(1)
    save.click()
    p.wait_for_selector(".page", state="detached")
    expect(p.locator(".ongoing")).to_be_visible()
    expect(p.locator(".ongoing .timer")).to_contain_text("min")
    db = ctx.db()
    eps = list(db["episodes"].values())
    assert len(eps) == 1, eps
    e = eps[0]
    assert e["intensity"] == 6 and e["end"] is None
    assert e["triggers"] == ["Stress", "Rumore improvviso"], e["triggers"]
    assert e["meds"][0]["name"] == "Sumatriptan" and e["meds"][0]["effect"] == 2 and e["meds"][0]["cls"] == "triptan"
    assert "Rumore improvviso" in db["settings"]["custom"]["triggers"]
    p.get_by_role("button", name="Termina").click()
    expect(p.locator(".sheet-title")).to_have_text("Termina attacco")
    p.locator(".sheet .btn.primary", has_text="Termina").click()
    expect(p.locator(".toast")).to_contain_text("Attacco concluso")
    p.wait_for_selector(".ongoing", state="detached")
    expect(p.locator(".today-card .ep-card")).to_have_count(1)
    assert ctx.db()["episodes"][e["id"]]["end"] is not None
    ensure_clean(ctx, "log episode")
    return ctx


@scenario
def s03_edit_delete_undo(pw):
    seed = make_db(days=60, seed=11)
    ctx = Ctx(pw, seed=seed)
    p = ctx.page
    n0 = len(seed["episodes"])
    tab(p, "Diario")
    p.locator(".seg-btn", has_text="Elenco").click()
    first = p.locator(".ep-card").first
    first.click()
    expect(p.locator(".page .bar-title")).to_have_text("Modifica attacco")
    int_btn(p, 9).click()
    p.locator(".bar-btn.solid").click()
    p.wait_for_selector(".page", state="detached")
    db = ctx.db()
    assert any(e["intensity"] == 9 for e in db["episodes"].values())
    p.locator(".ep-card").first.click()
    p.get_by_role("button", name="Elimina attacco").click()
    p.locator(".dialog-wrap:not(.closing) .dlg-btn.danger").click()
    p.wait_for_selector(".page", state="detached")
    expect(p.locator(".toast")).to_contain_text("Attacco eliminato")
    assert len(ctx.db()["episodes"]) == n0 - 1
    p.locator(".toast-act").click()
    assert len(ctx.db()["episodes"]) == n0
    ensure_clean(ctx, "edit/delete")
    return ctx


@scenario
def s04_dirty_discard_and_validation(pw):
    ctx = Ctx(pw, seed=make_db(days=30, seed=5))
    p = ctx.page
    p.locator(".tab-fab").click()
    int_btn(p, 4).click()
    p.get_by_role("button", name="Annulla").first.click()
    expect(p.locator(".dialog .dlg-title")).to_have_text("Scartare le modifiche?")
    p.locator(".dlg-btn", has_text="Continua").click()
    expect(p.locator(".page")).to_have_count(1)
    p.get_by_role("switch", name="Attacco ancora in corso").uncheck()
    end = p.locator("input[aria-label=Fine]")
    end.fill("2020-01-01T10:00")
    p.locator(".bar-btn.solid").click()
    expect(p.locator(".toast.error")).to_contain_text("non può essere prima")
    p.get_by_role("button", name="Annulla").first.click()
    p.locator(".dialog-wrap:not(.closing) .dlg-btn.danger").click()
    p.wait_for_selector(".page", state="detached")
    ensure_clean(ctx, "dirty")
    return ctx


@scenario
def s05_day_sheet_free_and_checkin(pw):
    seed = make_db(days=60, seed=2)
    seed["days"] = {}
    ctx = Ctx(pw, seed=seed)
    p = ctx.page
    db0 = ctx.db()
    tab(p, "Diario")
    cell = p.locator(".cal-cell.s-assumed").first
    date = re.search(r"\d+ \w+ 2026|\w+ \d+ \w+ 2026", cell.get_attribute("aria-label")).group(0)
    cell.click()
    expect(p.locator(".sheet-title")).to_contain_text("2026")
    p.get_by_role("button", name="Conferma: nessuna emicrania").click()
    expect(p.locator(".toast")).to_contain_text("Giornata senza emicrania")
    free = [d for d, r in ctx.db()["days"].items() if r.get("free") and not db0["days"].get(d, {}).get("free")]
    assert len(free) == 1, free
    p.get_by_role("button", name=re.compile("Dettagli della giornata|Modifica dettagli")).click()
    expect(p.locator(".page .bar-title")).to_have_text("Giornata")
    p.locator(".stepper").first.get_by_label("Aumenta ore di sonno").click()
    p.locator(".chip", has_text="Alto").first.click()
    p.locator(".chip", has_text="Buono").nth(1).click()
    p.locator("textarea").fill("Giornata di prova")
    p.locator(".bar-btn.solid").click()
    p.wait_for_selector(".page", state="detached")
    rec = ctx.db()["days"][free[0]]
    assert rec["sleepH"] == 7 and rec["stress"] == 4 and rec["note"] == "Giornata di prova" and rec["checkin"], rec
    expect(p.locator(".sheet .pill").first).to_be_visible()
    ensure_clean(ctx, "day sheet")
    return ctx


@scenario
def s06_stats_all_periods(pw):
    ctx = Ctx(pw, seed=make_db(days=400, seed=4, ongoing=True))
    p = ctx.page
    tab(p, "Analisi")
    for label in ["30 g", "90 g", "6 mesi", "12 mesi", "Tutto"]:
        p.locator(".seg-btn", has_text=label).click()
        p.wait_for_timeout(200)
        assert p.locator(".chart").count() >= 3, label
        assert p.locator(".stat").count() >= 6
    p.screenshot(path=str(OUT / f"{engine}-stats-all.png"))
    ensure_clean(ctx, "stats")
    return ctx


@scenario
def s07_settings_lists_theme(pw):
    ctx = Ctx(pw, seed=make_db(days=30, seed=9))
    p = ctx.page
    open_settings(p)
    p.locator(".seg-btn", has_text="Scuro").click()
    assert p.evaluate("document.documentElement.dataset.theme") == "dark"
    assert ctx.db()["settings"]["theme"] == "dark"
    p.locator(".seg-btn", has_text="Chiaro").click()
    assert p.evaluate("document.documentElement.dataset.theme") == "light"
    p.locator(".row", has_text="Fattori scatenanti").click()
    settle(p)
    p.locator(".row", has_text="Aggiungi fattore").click()
    p.locator(".dialog-wrap:not(.closing) input").fill("Profumo del vicino")
    p.locator(".dialog-wrap:not(.closing) .dlg-btn.primary").click()
    expect(p.locator(".page").last.locator(".row", has_text="Profumo del vicino")).to_have_count(1)
    stress_row = p.locator(".page").last.locator(".row", has_text=re.compile(r"^Stress$"))
    stress_row.locator(".switch input").uncheck(force=True)
    assert "Stress" in ctx.db()["settings"]["hidden"]["triggers"]
    p.locator(".page").last.get_by_role("button", name="Indietro").click()
    p.wait_for_timeout(350)
    p.locator(".page").last.get_by_role("button", name="Indietro").click()
    p.wait_for_selector(".page", state="detached")
    p.locator(".tab-fab").click()
    p.locator(".acc", has_text="Fattori scatenanti").locator("summary").click()
    expect(p.locator(".acc[open] .chip", has_text=re.compile(r"^Stress$"))).to_have_count(0)
    expect(p.locator(".acc[open] .chip", has_text="Profumo del vicino")).to_have_count(1)
    ensure_clean(ctx, "settings")
    return ctx


@scenario
def s08_backup_export_import(pw):
    ctx = Ctx(pw, seed=make_db(days=50, seed=6))
    p = ctx.page
    n = len(ctx.db()["episodes"])
    open_data(p)
    p.get_by_role("button", name="Esporta", exact=True).click()
    poll(p, "() => window.__shared.length === 1")
    shared = p.evaluate("window.__shared[0]")
    f = shared["files"][0]
    assert f["name"].startswith("diario-emicrania-backup-") and f["name"].endswith(".json")
    raw = base64.b64decode(f["b64"]).decode("utf-8")
    data = json.loads(raw)
    assert data["app"] == "diario-emicrania" and len(data["data"]["episodes"]) == n
    assert data["data"]["settings"]["pin"] is None
    assert ctx.db()["settings"]["lastBackupAt"], "lastBackupAt deve essere aggiornato"
    # cancella tutto e ripristina
    (OUT / "_backup.json").write_text(raw, encoding="utf-8")
    back(p)
    p.get_by_text("Cancella tutti i dati").click()
    p.locator(".dialog-wrap:not(.closing) .dlg-btn.danger").click()
    p.wait_for_timeout(300)
    p.locator(".dialog-wrap:not(.closing) .dlg-btn.danger").click()
    p.wait_for_timeout(500)
    assert len(ctx.db()["episodes"]) == 0
    open_data(p)
    p.locator("input[type=file]").set_input_files(str(OUT / "_backup.json"))
    expect(p.locator(".dialog .dlg-title")).to_have_text("Ripristinare il backup?")
    p.locator(".dlg-btn", has_text="Sostituisci").click()
    p.wait_for_timeout(600)
    assert len(ctx.db()["episodes"]) == n
    p.locator("input[type=file]").set_input_files({"name": "x.json", "mimeType": "application/json", "buffer": b"{non json"})
    expect(p.locator(".toast.error")).to_contain_text("non è un backup valido")
    ensure_clean(ctx, "backup")
    return ctx


@scenario
def s09_report_pdf(pw):
    ctx = Ctx(pw, seed=make_db(days=200, seed=8, ongoing=True))
    p = ctx.page
    cartella(p, "Report per il medico")
    settle(p)
    poll(p, "() => !document.querySelector('.page .btn.primary:disabled') && document.querySelectorAll('.report-page').length > 0", timeout=20000)
    pages = p.locator(".report-page").count()
    assert pages >= 2, pages
    for i in range(min(pages, 3)):
        p.locator(".report-page").nth(i).screenshot(path=str(OUT / f"{engine}-report-p{i + 1}.png"))
    p.get_by_role("button", name="Condividi PDF").click()
    poll(p, "() => window.__shared.length === 1")
    f = p.evaluate("window.__shared[0].files[0]")
    pdf = base64.b64decode(f["b64"])
    (OUT / "report-test.pdf").write_bytes(pdf)
    assert pdf.startswith(b"%PDF-1.4") and pdf.rstrip().endswith(b"%%EOF") and f["type"] == "application/pdf"
    assert pdf.count(b"/Type /Page ") == pages, (pdf.count(b"/Type /Page "), pages)
    p.get_by_role("button", name="Condividi riepilogo testuale").click()
    poll(p, "() => window.__shared.length === 2")
    txt = p.evaluate("window.__shared[1].text")
    assert "Giorni con emicrania" in txt and "Attacchi" in txt
    p.locator(".seg-btn", has_text="3 mesi").click()
    p.wait_for_timeout(800)
    ensure_clean(ctx, "report")
    return ctx


@scenario
def s10_pin_lock(pw):
    ctx = Ctx(pw, seed=make_db(days=30, seed=1))
    p = ctx.page

    def enter(digits):
        for d in digits:
            p.locator(".lock .pin-key", has_text=re.compile(f"^{d}$")).click()

    open_settings(p)
    p.get_by_role("button", name="Attiva il blocco").click()
    enter("1234")
    p.wait_for_timeout(300)
    enter("1234")
    expect(p.locator(".toast")).to_contain_text("Blocco con PIN attivato")
    assert ctx.db()["settings"]["pin"]["len"] == 4
    p.reload()
    p.wait_for_selector(".lock")
    enter("0000")
    expect(p.locator(".lock .sub")).to_contain_text("PIN errato")
    enter("1234")
    p.wait_for_selector(".lock", state="detached")
    expect(p.locator(".tabbar")).to_be_visible()
    # disattivazione
    open_settings(p)
    p.get_by_text("Blocco con PIN attivo").click()
    enter("1234")
    p.wait_for_selector(".lock", state="detached")
    assert ctx.db()["settings"]["pin"] is None
    ensure_clean(ctx, "pin")
    return ctx


def fake_weather(days=120):
    import datetime as dt
    end = dt.date.today()
    times, pr, tt, hh = [], [], [], []
    for i in range(days, -1, -1):
        d = end - dt.timedelta(days=i)
        for h in range(24):
            times.append(f"{d.isoformat()}T{h:02d}:00")
            pr.append(1000 + (i % 7) * 2 + h * 0.1)
            tt.append(15 + h * 0.2)
            hh.append(60)
    return {"hourly": {"time": times, "surface_pressure": pr, "temperature_2m": tt, "relative_humidity_2m": hh}}


@scenario
def s11_weather_opt_in(pw):
    ctx = Ctx(pw, seed=make_db(days=100, seed=12, weather=False))
    p = ctx.page
    calls = []

    def geocode(route):
        calls.append("geo")
        route.fulfill(json={"results": [{"name": "Milano", "admin1": "Lombardia", "country": "Italia", "latitude": 45.4643, "longitude": 9.1895}]},
                      headers={"access-control-allow-origin": "*"})

    def forecast(route):
        calls.append("forecast")
        route.fulfill(json=fake_weather(92), headers={"access-control-allow-origin": "*"})

    def archive(route):
        calls.append("archive")
        route.fulfill(json=fake_weather(120), headers={"access-control-allow-origin": "*"})

    p.route("**/geocoding-api.open-meteo.com/**", geocode)
    p.route("**/api.open-meteo.com/**", forecast)
    p.route("**/archive-api.open-meteo.com/**", archive)
    open_settings(p)
    p.locator(".row", has_text="Meteo e pressione").locator(".switch input").click(force=True)
    expect(p.locator(".sheet-title")).to_have_text("Posizione per il meteo")
    p.locator(".sheet input[type=search]").fill("Milano")
    p.get_by_role("button", name="Cerca", exact=True).click()
    p.locator(".sheet .row", has_text="Milano").first.click()
    poll(p, "() => { const w = JSON.parse(localStorage.getItem('emicrania.db.v1')).weather; return !!w && Object.keys(w).length > 50; }", timeout=15000)
    db = ctx.db()
    assert db["settings"]["weatherOn"] and db["settings"]["weatherLoc"]["lat"] == 45.46
    if engine == "chromium":
        assert "forecast" in calls  # WebKit non passa dal mock di rete: usa i dati reali
    w = next(iter(db["weather"].values()))
    assert 990 < w["p"] < 1030 and "t" in w and "h" in w
    ensure_clean(ctx, "weather")
    return ctx


@scenario
def s12_offline_pwa(pw):
    if engine != "chromium":
        print("      (saltato: il test offline usa Chromium)")
        return None
    ctx = Ctx(pw, seed=make_db(days=30, seed=13))
    p = ctx.page
    reg = p.evaluate("Promise.race([navigator.serviceWorker.ready.then(r => !!r.active), new Promise(r => setTimeout(() => r('timeout'), 15000))])")
    assert reg is True, f"service worker non attivo: {reg}"
    p.reload()
    poll(p, "() => !!navigator.serviceWorker.controller", timeout=10000)
    ctx.context.set_offline(True)
    p.reload()
    p.wait_for_selector(".tabbar", timeout=10000)
    expect(p.locator(".bar-title")).to_have_text("Oggi")
    mf = p.evaluate("fetch('manifest.webmanifest').then(r => r.json())")
    assert mf["display"] == "standalone" and len(mf["icons"]) >= 3
    ctx.context.set_offline(False)
    ensure_clean(ctx, "offline")
    return ctx


@scenario
def s13_xss_and_sanitization(pw):
    seed = make_db(days=20, seed=14)
    first = next(iter(seed["episodes"].values()))
    first["note"] = '<img src=x onerror="window.__xss=1">'
    first["triggers"] = ['<b id="pwn">x</b>']
    seed["settings"]["name"] = '<script>window.__xss=2</script>'
    ctx = Ctx(pw, seed=seed)
    p = ctx.page
    tab(p, "Diario")
    p.locator(".seg-btn", has_text="Elenco").click()
    p.locator(".ep-card").first.click()
    p.wait_for_timeout(300)
    assert p.evaluate("window.__xss") is None
    assert p.locator("#pwn").count() == 0
    ensure_clean(ctx, "xss")
    return ctx


@scenario
def s14_relief_mode(pw):
    ctx = Ctx(pw, seed=make_db(days=20, seed=15))
    p = ctx.page
    p.get_by_text("Modalità sollievo", exact=True).first.click()
    p.wait_for_selector(".relief.open")
    p.get_by_role("button", name="Avvia").click()
    expect(p.locator(".relief-text")).to_have_text("Inspira")
    p.get_by_role("button", name="Pausa").click()
    expect(p.locator(".relief-text")).to_have_text("Respira con calma")
    p.get_by_role("button", name="Chiudi").click()
    p.wait_for_selector(".relief", state="detached")
    ensure_clean(ctx, "relief")
    return ctx


@scenario
def s15_empty_states_and_new_user(pw):
    ctx = Ctx(pw, seed={**make_db(days=1, seed=1), "episodes": {}, "days": {}, "weather": {}})
    p = ctx.page
    expect(p.locator(".today-card h2")).to_have_text("Come stai oggi?")
    p.get_by_role("button", name=re.compile("Nessuna emicrania oggi")).click()
    expect(p.locator(".toast")).to_contain_text("Giornata registrata")
    expect(p.locator(".today-card h2")).to_contain_text("Nessuna emicrania oggi")
    tab(p, "Analisi")
    expect(p.locator(".empty h3")).to_have_text("Ancora nessun dato")
    tab(p, "Diario")
    p.locator(".seg-btn", has_text="Elenco").click()
    expect(p.locator(".empty h3")).to_have_text("Nessun attacco registrato")
    ensure_clean(ctx, "empty")
    return ctx


@scenario
def s16_csv_and_reminder(pw):
    ctx = Ctx(pw, seed=make_db(days=60, seed=21))
    p = ctx.page
    db = ctx.db()
    open_data(p)
    p.get_by_role("button", name="Attacchi", exact=True).click()
    poll(p, "() => window.__shared.length === 1")
    csv = base64.b64decode(p.evaluate("window.__shared[0].files[0].b64")).decode("utf-8")
    assert csv.startswith("\ufeffInizio;Fine;Durata (min)"), csv[:60]
    lines = [l for l in csv.split("\r\n") if l]
    assert len(lines) == len(db["episodes"]) + 1, (len(lines), len(db["episodes"]))
    p.get_by_role("button", name="Giornate", exact=True).click()
    poll(p, "() => window.__shared.length === 2")
    csv2 = base64.b64decode(p.evaluate("window.__shared[1].files[0].b64")).decode("utf-8")
    assert csv2.startswith("\ufeffData;Stato;Sonno (ore)") and "Emicrania" in csv2
    back(p)
    p.get_by_role("button", name="Aggiungi", exact=True).click()
    poll(p, "() => window.__shared.length === 3")
    ics = base64.b64decode(p.evaluate("window.__shared[2].files[0].b64")).decode("utf-8")
    assert ics.startswith("BEGIN:VCALENDAR\r\n") and "RRULE:FREQ=DAILY" in ics and "BEGIN:VALARM" in ics and ics.endswith("END:VCALENDAR\r\n")
    assert re.search(r"DTSTART:\d{8}T210000", ics), ics
    ensure_clean(ctx, "csv/ics")
    return ctx


@scenario
def s17_quick_med_on_ongoing(pw):
    ctx = Ctx(pw, seed=make_db(days=30, seed=22, ongoing=True))
    p = ctx.page
    ongoing = [e for e in ctx.db()["episodes"].values() if e["end"] is None][0]
    n = len(ongoing["meds"])
    p.get_by_role("button", name="Ho preso un farmaco").click()
    p.locator(".sheet .row", has_text="Ibuprofene").click()
    expect(p.locator(".toast")).to_contain_text("Ibuprofene registrato alle")
    after = ctx.db()["episodes"][ongoing["id"]]
    assert len(after["meds"]) == n + 1 and after["meds"][-1]["name"] == "Ibuprofene" and after["end"] is None
    ensure_clean(ctx, "quick med")
    return ctx


@scenario
def s18_geolocation_weather(pw):
    ctx = Ctx(pw, seed=make_db(days=40, seed=23, weather=False))
    ctx.context.grant_permissions(["geolocation"], origin="http://127.0.0.1:8765")
    ctx.context.set_geolocation({"latitude": 41.9028, "longitude": 12.4964})
    p = ctx.page
    p.route("**/api.open-meteo.com/**", lambda route: route.fulfill(json=fake_weather(60), headers={"access-control-allow-origin": "*"}))
    p.route("**/archive-api.open-meteo.com/**", lambda route: route.fulfill(json=fake_weather(60), headers={"access-control-allow-origin": "*"}))
    open_settings(p)
    p.locator(".row", has_text="Meteo e pressione").locator(".switch input").click(force=True)
    settle(p)
    p.get_by_role("button", name="Usa la mia posizione").click()
    poll(p, "() => { const d = JSON.parse(localStorage.getItem('emicrania.db.v1')); return !!d.weather && Object.keys(d.weather).length > 20; }", timeout=15000)
    db = ctx.db()
    assert db["settings"]["weatherOn"] and abs(db["settings"]["weatherLoc"]["lat"] - 41.9) < 0.01
    settle(p)
    expect(p.locator(".row", has_text="Posizione")).to_contain_text("41.90")
    ensure_clean(ctx, "geolocation")
    return ctx


@scenario
def s19_preventives(pw):
    ctx = Ctx(pw, seed=make_db(days=200, seed=24))
    p = ctx.page
    n = len(ctx.db()["preventives"])
    assert n == 2
    cartella(p, "Terapie di prevenzione")
    expect(p.locator(".page").last.locator(".row", has_text="Topiramato")).to_contain_text("giorni/mese")
    expect(p.locator(".page").last.locator("svg.chart")).to_have_count(1)
    p.get_by_text("Aggiungi la terapia attuale").click()
    settle(p)
    p.locator(".page").last.locator("input[aria-label='Nome della terapia']").fill("Riboflavina (B2)")
    p.locator(".page").last.locator("input[aria-label='Dose']").fill("400 mg")
    p.locator(".page").last.locator(".bar-btn.solid").click()
    expect(p.locator(".toast")).to_contain_text("Terapia salvata")
    db = ctx.db()
    assert len(db["preventives"]) == n + 1 and any(x["name"] == "Riboflavina (B2)" and x["end"] is None and x["cls"] == "supplement" for x in db["preventives"])
    p.wait_for_timeout(300)
    p.locator(".page").last.locator(".row", has_text="Magnesio").click()
    settle(p)
    expect(p.locator(".page").last.locator(".card-title h3", has_text="Efficacia")).to_have_count(1)
    p.locator(".page").last.get_by_role("button", name="Modifica").click()
    settle(p)
    p.get_by_role("button", name="Elimina terapia").click()
    p.locator(".dialog-wrap:not(.closing) .dlg-btn.danger").click()
    expect(p.locator(".toast")).to_contain_text("Terapia eliminata")
    assert len(ctx.db()["preventives"]) == n
    p.locator(".toast-act").click()
    assert len(ctx.db()["preventives"]) == n + 1
    # nel report
    p.wait_for_timeout(400)
    while p.locator(".page").count():
        back(p)
    cartella(p, "Report per il medico")
    poll(p, "() => !document.querySelector('.page .btn.primary:disabled') && document.querySelectorAll('.report-page').length > 0", timeout=20000)
    p.get_by_role("button", name="Condividi riepilogo testuale").click()
    poll(p, "() => window.__shared.length === 1")
    txt = p.evaluate("window.__shared[0].text")
    assert "Terapie preventive:" in txt and "Topiramato" in txt and "giorni/mese" in txt, txt
    ensure_clean(ctx, "preventives")
    return ctx


@scenario
def s20_pin_forgotten_wipes_data(pw):
    ctx = Ctx(pw, seed=make_db(days=30, seed=25))
    p = ctx.page

    def enter(digits):
        for d in digits:
            p.locator(".lock .pin-key", has_text=re.compile(f"^{d}$")).click()

    open_settings(p)
    p.get_by_role("button", name="Attiva il blocco").click()
    enter("4321")
    p.wait_for_timeout(300)
    enter("4321")
    expect(p.locator(".toast")).to_contain_text("Blocco con PIN attivato")
    p.reload()
    p.wait_for_selector(".lock")
    p.get_by_role("button", name="PIN dimenticato?").click()
    expect(p.locator(".lock .dialog .dlg-title")).to_have_text("Cancellare tutti i dati?")
    p.locator(".lock .dialog .dlg-btn", has_text="Annulla").click()
    p.wait_for_selector(".lock .dialog", state="detached")
    p.get_by_role("button", name="PIN dimenticato?").click()
    p.locator(".lock .dialog .dlg-btn.danger").click()
    p.wait_for_selector(".lock", state="detached")
    db = ctx.db()
    assert db["settings"]["pin"] is None and len(db["episodes"]) == 0
    expect(p.locator(".tabbar")).to_be_visible()
    ensure_clean(ctx, "pin forgotten")
    return ctx


def idb_count(page, store="files"):
    return page.evaluate("""(store) => new Promise((resolve) => {
      const r = indexedDB.open('emicrania-files');
      r.onsuccess = () => {
        try {
          const q = r.result.transaction(store).objectStore(store).count();
          q.onsuccess = () => { resolve(q.result); r.result.close(); };
          q.onerror = () => resolve(-1);
        } catch (e) { resolve(-2); }
      };
      r.onerror = () => resolve(-3);
    })""", store)


def make_png(text="Referto", size=(900, 1200)):
    import io
    from PIL import Image, ImageDraw
    img = Image.new("RGB", size, "white")
    d = ImageDraw.Draw(img)
    for i in range(12):
        d.text((60, 80 + i * 80), f"{text} - riga {i + 1}", fill="black")
    d.rectangle([40, 40, size[0] - 40, size[1] - 40], outline="black", width=4)
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()


def make_pdf(pages=("Pagina 1", "Pagina 2")):
    import io
    from PIL import Image, ImageDraw
    imgs = []
    for t in pages:
        img = Image.new("RGB", (595, 842), "white")
        d = ImageDraw.Draw(img)
        d.text((60, 80), t, fill="black")
        d.rectangle([30, 30, 565, 812], outline="black", width=3)
        imgs.append(img)
    buf = io.BytesIO()
    imgs[0].save(buf, "PDF", save_all=True, append_images=imgs[1:], resolution=72)
    return buf.getvalue()


def close_pages(page):
    page.wait_for_timeout(350)
    while page.locator(".page").count():
        back(page)


@scenario
def s21_time_unknown_and_diary_start(pw):
    import datetime as dt
    ctx = Ctx(pw, seed=make_db(days=30, seed=32))
    p = ctx.page
    day = (dt.date.today() - dt.timedelta(days=10)).isoformat()
    p.locator(".tab-fab").click()
    int_btn(p, 5).click()
    p.get_by_role("switch", name="Non ricordo l’orario").check()
    expect(p.locator("input[aria-label='Inizio']")).to_be_hidden()
    p.locator("input[aria-label='Giorno dell’attacco']").fill(day)
    p.locator(".chip", has_text="4–12 ore").click()
    p.locator(".bar-btn.solid").click()
    p.wait_for_selector(".page", state="detached")
    eps = [e for e in ctx.db()["episodes"].values() if e.get("timeUnknown")]
    assert len(eps) == 1 and eps[0]["start"] == f"{day}T12:00" and eps[0]["approxDur"] == "4to12" and eps[0]["end"] == eps[0]["start"], eps
    assert ctx.db()["settings"]["diaryStart"] is None
    old = (dt.date.today() - dt.timedelta(days=400)).isoformat()
    old_end = (dt.date.today() - dt.timedelta(days=398)).isoformat()
    p.locator(".tab-fab").click()
    int_btn(p, 8).click()
    p.get_by_role("switch", name="Non ricordo l’orario").check()
    p.locator("input[aria-label='Giorno dell’attacco']").fill(old)
    p.locator(".chip", has_text="Più giorni").click()
    p.locator("input[aria-label='Ultimo giorno dell’attacco']").fill(old_end)
    p.locator(".bar-btn.solid").click()
    expect(p.locator(".dialog .dlg-title")).to_have_text("Attacco precedente all’inizio del diario")
    p.locator(".dlg-btn", has_text="No, è un attacco isolato").click()
    p.wait_for_timeout(500)
    db = ctx.db()
    assert db["settings"]["diaryStart"] == (dt.date.today() - dt.timedelta(days=30)).isoformat(), db["settings"]["diaryStart"]
    olds = [e for e in db["episodes"].values() if e["start"].startswith(old)]
    assert olds and olds[0]["end"] == f"{old_end}T12:00", olds
    tab(p, "Diario")
    p.locator(".seg-btn", has_text="Elenco").click()
    expect(p.locator(".ep-card", has_text="orario non ricordato").first).to_be_visible()
    tab(p, "Analisi")
    p.locator(".seg-btn", has_text="Tutto").click()
    p.wait_for_timeout(300)
    free = int(p.locator(".stat", has_text="Giorni senza emicrania").locator(".stat-value").inner_text())
    assert free <= 31, free
    ensure_clean(ctx, "time unknown")
    return ctx


@scenario
def s22_therapy_injections_and_episode_feedback(pw):
    import datetime as dt
    ctx = Ctx(pw, seed=make_db(days=200, seed=33))
    p = ctx.page
    start = (dt.date.today() - dt.timedelta(days=120)).isoformat()
    cartella(p, "Terapie di prevenzione")
    p.get_by_text("Aggiungi la terapia attuale").click()
    settle(p)
    pg = p.locator(".page").last
    pg.locator(".chip", has_text="Erenumab").click()
    pg.locator("input[aria-label='Data di inizio']").fill(start)
    expect(pg.locator(".card-title h3", has_text="Somministrazioni")).to_have_count(1)
    pg.get_by_role("button", name="Compila le date dal calendario previsto").click()
    pg.locator(".bar-btn.solid").click()
    expect(p.locator(".toast")).to_contain_text("Terapia salvata")
    t = [x for x in ctx.db()["preventives"] if x["name"] == "Erenumab"][0]
    assert t["cls"] == "mab" and t["every"] == 28 and len(t["doses"]) >= 4 and t["start"] == start, t
    p.wait_for_timeout(300)
    p.locator(".page").last.locator(".row", has_text="Erenumab").click()
    settle(p)
    detail = p.locator(".page").last
    expect(detail.locator(".compare-box").first).to_be_visible()
    expect(detail.locator(".card-title h3", has_text="Dentro ogni ciclo")).to_have_count(1)
    expect(detail.locator(".card-title h3", has_text="Mese per mese")).to_have_count(1)
    p.screenshot(path=str(OUT / f"{engine}-therapy-detail.png"))
    close_pages(p)
    p.locator(".tab-fab").click()
    int_btn(p, 4).click()
    expect(p.locator(".page .card", has_text="Terapia di prevenzione")).to_contain_text("Erenumab")
    p.locator(".chip", has_text="Più leggero").click()
    p.get_by_role("switch", name="Attacco ancora in corso").uncheck()
    p.locator(".bar-btn.solid").click()
    p.wait_for_selector(".page", state="detached")
    eps = sorted(ctx.db()["episodes"].values(), key=lambda e: e["createdAt"])
    assert eps[-1]["tx"]["vs"] == "better", eps[-1]["tx"]
    ensure_clean(ctx, "therapy")
    return ctx


@scenario
def s23_history_and_clinical_summary(pw):
    ctx = Ctx(pw, seed=make_db(days=120, seed=34))
    p = ctx.page
    cartella(p, "La mia storia")
    p.locator(".page").last.locator(".row", has_text="Chi sono e diagnosi").click()
    settle(p)
    pg = p.locator(".page").last
    pg.locator("select[aria-label='Anno di nascita']").select_option("1990")
    pg.locator(".chip", has_text="Donna").click()
    pg.get_by_label("Aumenta età di esordio").click()
    pg.locator(".chip", has_text="Emicrania cronica").click()
    pg.locator(".bar-btn.solid").click()
    expect(p.locator(".toast")).to_contain_text("Salvato")
    hs = ctx.db()["history"]
    assert hs["birthYear"] == 1990 and hs["sex"] == "f" and hs["onsetAge"] == 15 and "Emicrania cronica" in hs["diagnoses"], hs
    p.wait_for_timeout(300)
    p.locator(".page").last.locator(".row", has_text="Frequenza negli anni").click()
    settle(p)
    p.get_by_text("Aggiungi un periodo").click()
    settle(p)
    sh = p.locator(".sheet")
    sh.locator("select[aria-label='Inizio del periodo – anno']").select_option("2018")
    sh.get_by_role("switch", name="Fino a oggi").uncheck()
    sh.locator("select[aria-label='Fine del periodo – anno']").select_option("2022")
    sh.get_by_label("Aumenta giorni con mal di testa al mese").click()
    sh.get_by_label("Aumenta giorni con mal di testa al mese").click()
    sh.get_by_role("button", name="Salva periodo").click()
    expect(p.locator(".toast")).to_contain_text("Periodo salvato")
    per = ctx.db()["history"]["periods"]
    assert len(per) == 1 and per[0]["from"] == "2018-01" and per[0]["to"].startswith("2022-") and per[0]["days"] == 5, per
    back(p)
    p.locator(".page").last.locator(".row", has_text="Il mio racconto").click()
    settle(p)
    p.locator(".page").last.locator("textarea").fill("Racconto di prova: gli attacchi peggiorano in inverno.")
    p.locator(".page").last.locator(".bar-btn.solid").click()
    p.wait_for_timeout(400)
    p.get_by_role("button", name="Leggi la sintesi clinica").click()
    settle(p)
    summary = p.locator(".page").last
    expect(summary).to_contain_text("Mal di testa dall’età di 15 anni")
    expect(summary).to_contain_text("Racconto di prova")
    expect(summary).to_contain_text("2018")
    p.screenshot(path=str(OUT / f"{engine}-summary.png"))
    summary.get_by_role("button", name="Condividi il testo").click()
    poll(p, "() => window.__shared.length === 1")
    txt = p.evaluate("window.__shared[0].text")
    assert "PROFILO" in txt and "Racconto di prova" in txt and "non è una diagnosi" in txt, txt
    ensure_clean(ctx, "history")
    return ctx


@scenario
def s24_documents_viewer_and_zip_backup(pw):
    import io
    import zipfile
    ctx = Ctx(pw, seed=make_db(days=30, seed=31))
    p = ctx.page
    png = make_png("Referto RM encefalo", size=(2600, 3200))
    pdf = make_pdf(("Lettera di dimissione - pagina 1", "Lettera di dimissione - pagina 2"))
    cartella(p, "Documenti")
    expect(p.locator(".page .empty h3")).to_have_text("La tua cartella clinica")
    p.locator(".page").last.locator("input[type=file][accept='application/pdf,image/*']").set_input_files([
        {"name": "lettera_dimissione.pdf", "mimeType": "application/pdf", "buffer": pdf},
        {"name": "rm.png", "mimeType": "image/png", "buffer": png},
    ])
    poll(p, "() => document.querySelectorAll('#overlays > .page:last-child .doc-tile:not(.add)').length === 2", timeout=30000)
    pg = p.locator(".page").last
    expect(pg.locator("input[aria-label='Titolo del documento']")).to_have_value("lettera dimissione")
    pg.locator(".chip", has_text="Dimissioni e pronto soccorso").click()
    pg.locator(".bar-btn.solid").click()
    expect(p.locator(".toast")).to_contain_text("Documento salvato")
    docs = ctx.db()["docs"]
    assert len(docs) == 1 and len(docs[0]["files"]) == 2 and docs[0]["cat"] == "discharge", docs
    assert docs[0]["files"][1]["type"] == "image/jpeg", docs[0]["files"]
    assert idb_count(p) == 2
    p.locator(".page").last.locator(".row", has_text="lettera dimissione").click()
    settle(p)
    p.locator(".page").last.get_by_role("button", name="Apri", exact=True).click()
    poll(p, "() => document.querySelectorAll('.viewer .pdf-page img').length >= 1", timeout=30000)
    assert p.locator(".viewer .pdf-page").count() == 2
    p.screenshot(path=str(OUT / f"{engine}-viewer-pdf.png"))
    p.get_by_role("button", name="File successivo").click()
    poll(p, "() => { const i = document.querySelector('.viewer img.vimg'); return !!i && i.complete && i.naturalWidth > 0; }", timeout=15000)
    p.get_by_role("button", name="Chiudi").click()
    p.wait_for_timeout(500)
    close_pages(p)
    open_data(p)
    p.locator(".page").last.locator(".row", has_text="Backup completo con documenti").click()
    poll(p, "() => window.__shared.length === 1", timeout=30000)
    f = p.evaluate("window.__shared[0].files[0]")
    raw = base64.b64decode(f["b64"])
    assert f["name"].endswith(".zip") and f["type"] == "application/zip"
    z = zipfile.ZipFile(io.BytesIO(raw))
    names = z.namelist()
    assert "diario-emicrania.json" in names and "LEGGIMI.txt" in names, names
    assert len([n for n in names if n.startswith("documenti/")]) == 2, names
    data = json.loads(z.read("diario-emicrania.json"))
    assert data["docsIncluded"] is True and all(fl["path"] in names for fl in data["data"]["docs"][0]["files"])
    assert z.testzip() is None
    back(p)
    p.get_by_text("Cancella tutti i dati").click()
    p.locator(".dialog-wrap:not(.closing) .dlg-btn.danger").click()
    p.wait_for_timeout(300)
    p.locator(".dialog-wrap:not(.closing) .dlg-btn.danger").click()
    poll(p, "() => true")
    p.wait_for_timeout(600)
    assert len(ctx.db()["docs"]) == 0
    assert idb_count(p) == 0
    open_data(p)
    p.locator("input[type=file]").set_input_files({"name": "backup.zip", "mimeType": "application/zip", "buffer": raw})
    expect(p.locator(".dialog .dlg-title")).to_have_text("Ripristinare il backup?")
    expect(p.locator(".dialog .dlg-msg")).to_contain_text("1 documento")
    p.locator(".dlg-btn", has_text="Sostituisci tutto").click()
    expect(p.locator(".toast")).to_contain_text("Backup ripristinato", timeout=20000)
    assert len(ctx.db()["docs"]) == 1 and idb_count(p) == 2
    close_pages(p)
    cartella(p, "Documenti")
    p.locator(".page").last.locator(".row", has_text="lettera dimissione").click()
    settle(p)
    p.locator(".page").last.locator(".doc-tile").nth(1).click()
    poll(p, "() => { const i = document.querySelector('.viewer img.vimg'); return !!i && i.complete && i.naturalWidth > 0; }", timeout=15000)
    p.get_by_role("button", name="Chiudi").click()
    ensure_clean(ctx, "documents")
    return ctx


@scenario
def s25_care_contacts_visits_midas(pw):
    import datetime as dt
    ctx = Ctx(pw, seed=make_db(days=60, seed=35))
    p = ctx.page
    cartella(p, "Centro curante e visite")
    p.get_by_text("Aggiungi centro o medico").click()
    settle(p)
    pg = p.locator(".page").last
    pg.locator("input[aria-label='Nome']").fill("Centro Cefalee Test")
    pg.locator("input[aria-label='Telefono']").fill("02 9999 1111")
    pg.locator("input[aria-label='Email']").fill("test@example.org")
    pg.locator(".bar-btn.solid").click()
    expect(p.locator(".toast")).to_contain_text("Contatto salvato")
    c = ctx.db()["contacts"][0]
    assert c["name"] == "Centro Cefalee Test" and c["main"] is True and c["phone"] == "02 9999 1111", c
    p.wait_for_timeout(300)
    p.locator(".page").last.locator(".row", has_text="Centro Cefalee Test").click()
    settle(p)
    href = p.locator(".page").last.locator("a.row", has_text="Chiama").get_attribute("href")
    assert href == "tel:0299991111", href
    assert p.locator(".page").last.locator("a.row", has_text="email").get_attribute("href") == "mailto:test@example.org"
    back(p)
    p.get_by_text("Aggiungi una visita").click()
    settle(p)
    when = (dt.datetime.now() + dt.timedelta(days=10)).strftime("%Y-%m-%dT10:30")
    pg = p.locator(".page").last
    pg.locator("input[aria-label='Data e ora della visita']").fill(when)
    pg.locator("textarea[aria-label='Domande da fare']").fill("Posso cambiare terapia?")
    pg.locator(".bar-btn.solid").click()
    expect(p.locator(".toast")).to_contain_text("Visita salvata")
    p.locator(".toast-act").click()
    poll(p, "() => window.__shared.length === 1")
    ics = base64.b64decode(p.evaluate("window.__shared[0].files[0].b64")).decode("utf-8")
    assert "BEGIN:VEVENT" in ics and "Centro Cefalee Test" in ics and f"DTSTART:{when[:10].replace('-', '')}T103000" in ics, ics
    v = ctx.db()["visits"][0]
    assert v["contactId"] == c["id"] and v["at"] == when and v["questions"] == "Posso cambiare terapia?"
    close_pages(p)
    tab(p, "Oggi")
    expect(p.locator(".view .card", has_text="In programma")).to_contain_text("Visita neurologica")
    cartella(p, "Questionario MIDAS")
    p.get_by_role("button", name="Compila il questionario").click()
    settle(p)
    pg = p.locator(".page").last
    for _ in range(3):
        pg.get_by_label("Aumenta risposta alla domanda 1").click()
    pg.get_by_label("Aumenta risposta alla domanda 5").click()
    pg.locator(".bar-btn.solid").click()
    expect(p.locator(".toast")).to_contain_text("punteggio 4")
    a = ctx.db()["assessments"]
    assert len(a) == 1 and a[0]["q"] == [3, 0, 0, 0, 1], a
    ensure_clean(ctx, "care")
    return ctx


@scenario
def s26_report_with_history_and_agenda(pw):
    seed = add_v2(make_db(days=200, seed=36))
    ctx = Ctx(pw, seed=seed)
    p = ctx.page
    expect(p.locator(".view .card", has_text="In programma")).to_contain_text("Controllo")
    tab(p, "Cartella")
    p.screenshot(path=str(OUT / f"{engine}-cartella-v2.png"))
    p.get_by_role("button", name="Leggi la sintesi completa").click()
    settle(p)
    summary = p.locator(".page").last
    expect(summary).to_contain_text("Erenumab")
    expect(summary).to_contain_text("Stato emicranico")
    expect(summary).to_contain_text("madre")
    back(p)
    p.locator(".view .row", has_text="Report per il medico").click()
    settle(p)
    poll(p, "() => !document.querySelector('.page .btn.primary:disabled') && document.querySelectorAll('.report-page').length > 0", timeout=30000)
    pages = p.locator(".report-page").count()
    assert pages >= 3, pages
    for i in range(min(pages, 4)):
        p.locator(".report-page").nth(i).screenshot(path=str(OUT / f"{engine}-report-v2-p{i + 1}.png"))
    p.get_by_role("button", name="Condividi riepilogo testuale").click()
    poll(p, "() => window.__shared.length === 1")
    txt = p.evaluate("window.__shared[0].text")
    assert "Erenumab" in txt and "MIDAS:" in txt, txt
    ensure_clean(ctx, "report v2")
    return ctx


with sync_playwright() as pw:
    for name, fn in list(globals().items()):
        if name.startswith("s") and name[1:3].isdigit() and callable(fn):
            fn(pw)

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} scenari superati ({engine})")
sys.exit(1 if failed else 0)
