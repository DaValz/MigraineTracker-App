"""Screenshot di tutte le schermate principali (chiaro/scuro) per la verifica visiva.

Uso: python tests/shots.py [chromium|webkit] [light|dark]
"""
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from seed import make_db, init_script, add_v2

OUT = Path(__file__).parent / "_shots"
OUT.mkdir(exist_ok=True)
URL = "http://127.0.0.1:8765/index.html"
engine = sys.argv[1] if len(sys.argv) > 1 else "chromium"
scheme = sys.argv[2] if len(sys.argv) > 2 else "light"
tall = 2200


def run():
    with sync_playwright() as p:
        browser = getattr(p, engine).launch()
        ctx = browser.new_context(
            viewport={"width": 402, "height": 874}, device_scale_factor=2, is_mobile=True, has_touch=True,
            locale="it-IT", timezone_id="Europe/Rome", color_scheme=scheme,
        )
        ctx.add_init_script(init_script(add_v2(make_db(ongoing=True, days=200))))
        page = ctx.new_page()
        msgs = []
        page.on("console", lambda m: msgs.append(f"[{m.type}] {m.text}") if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: msgs.append(f"[pageerror] {e}"))

        def shot(name, full=False):
            if full:
                page.set_viewport_size({"width": 402, "height": tall})
                page.wait_for_timeout(400)
            page.screenshot(path=str(OUT / f"{engine}-{scheme}-{name}.png"))
            if full:
                page.set_viewport_size({"width": 402, "height": 874})
                page.wait_for_timeout(200)

        def back():
            page.locator(".page").last.get_by_role("button", name=re.compile("Indietro|Annulla")).click()
            page.wait_for_timeout(450)

        def tab(label):
            page.locator(".tabbar .tab", has_text=label).click()
            page.wait_for_timeout(400)

        def row(title):
            page.locator(".page").last.locator(".row", has_text=title).first.click()
            page.wait_for_timeout(600)

        page.goto(URL)
        page.wait_for_timeout(900)
        shot("01-home")
        shot("01-home-full", full=True)
        page.locator(".view").evaluate("(v) => v.scrollTo(0, 400)")
        page.wait_for_timeout(300)
        shot("02-home-scrolled")
        page.locator(".view").evaluate("(v) => v.scrollTo(0, 0)")

        page.locator(".tab-fab").click()
        page.wait_for_timeout(500)
        page.locator(".int-btn", has_text=re.compile("^7$")).click()
        shot("03-editor-new", full=True)
        page.get_by_role("switch", name="Non ricordo l’orario").check()
        page.locator(".chip", has_text="Più giorni").click()
        page.wait_for_timeout(300)
        shot("04-editor-time-unknown")
        back()
        page.locator(".dialog-wrap:not(.closing) .dlg-btn.danger").click()
        page.wait_for_timeout(400)

        tab("Diario")
        shot("05-diario")
        page.locator(".cal-cell.s-migraine").nth(1).click()
        page.wait_for_timeout(500)
        shot("06-day-sheet")
        page.locator(".sheet-close").click()
        page.wait_for_timeout(400)

        tab("Analisi")
        shot("07-analisi", full=True)

        tab("Cartella")
        shot("08-cartella")
        shot("08-cartella-full", full=True)
        page.get_by_role("button", name="Leggi la sintesi completa").click()
        page.wait_for_timeout(600)
        shot("09-sintesi", full=True)
        back()

        page.locator(".view .row", has_text="La mia storia").click()
        page.wait_for_timeout(600)
        shot("10-storia")
        row("Com’è un attacco tipico")
        shot("11-storia-tipico", full=True)
        back()
        row("Frequenza negli anni")
        shot("12-storia-periodi")
        back()
        back()

        page.locator(".view .row", has_text="Terapie di prevenzione").click()
        page.wait_for_timeout(600)
        shot("13-terapie", full=True)
        row("Erenumab")
        shot("14-terapia-dettaglio", full=True)
        page.locator(".page").last.get_by_role("button", name="Modifica").click()
        page.wait_for_timeout(600)
        shot("15-terapia-editor", full=True)
        back()
        back()
        back()

        page.locator(".view .row", has_text="Documenti").click()
        page.wait_for_timeout(600)
        shot("16-documenti")
        back()
        page.locator(".view .row", has_text="Centro curante").click()
        page.wait_for_timeout(600)
        shot("17-centro")
        row("Centro Cefalee")
        shot("18-contatto")
        back()
        back()
        page.locator(".view .row", has_text="Questionario MIDAS").click()
        page.wait_for_timeout(600)
        shot("19-midas")
        back()
        page.locator(".view .row", has_text="Report per il medico").click()
        page.wait_for_timeout(2500)
        shot("20-report")
        back()

        page.get_by_role("button", name="Impostazioni").click()
        page.wait_for_timeout(600)
        shot("21-impostazioni", full=True)
        row("Dati e backup")
        shot("22-dati")
        back()
        back()

        tab("Oggi")
        page.locator(".ongoing").get_by_role("button", name="Termina").click()
        page.wait_for_timeout(500)
        shot("23-termina")
        page.locator(".sheet-close").click()
        page.wait_for_timeout(400)
        print("\n".join(msgs) or "nessun errore in console")
        browser.close()


run()
