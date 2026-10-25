"""Aggiorna sw.js con l'elenco dei file da mettere in cache e una nuova versione.

Va eseguito ogni volta che cambia un file dell'app, prima della pubblicazione:
    python tools/build_sw.py
"""
import hashlib
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INCLUDE_DIRS = ["css", "js", "icons", "vendor"]
INCLUDE_FILES = ["index.html", "manifest.webmanifest"]
SKIP_PARTS = {"splash"}
SKIP_SUFFIXES = {".txt", ".md", ".map"}


def collect():
    files = [ROOT / f for f in INCLUDE_FILES]
    for d in INCLUDE_DIRS:
        for p in sorted((ROOT / d).rglob("*")):
            if not p.is_file() or (SKIP_PARTS & set(p.relative_to(ROOT).parts)) or p.name == ".DS_Store":
                continue
            if p.suffix.lower() in SKIP_SUFFIXES or p.name.upper().startswith("LICENSE"):
                continue
            files.append(p)
    return files


def main():
    files = collect()
    digest = hashlib.sha256()
    urls = ["./"]
    for f in files:
        rel = f.relative_to(ROOT).as_posix()
        urls.append(rel)
        digest.update(rel.encode())
        digest.update(f.read_bytes())
    version = digest.hexdigest()[:10]
    sw = ROOT / "sw.js"
    text = sw.read_text(encoding="utf-8")
    assets = ",\n".join(f"  '{u}'" for u in urls)
    block = f"/* BEGIN GENERATED (tools/build_sw.py) */\nconst VERSION = '{version}';\nconst ASSETS = [\n{assets},\n];\n/* END GENERATED */"
    new = re.sub(r"/\* BEGIN GENERATED.*?/\* END GENERATED \*/", lambda _: block, text, flags=re.S)
    sw.write_text(new, encoding="utf-8", newline="\n")
    print(f"sw.js aggiornato: versione {version}, {len(urls)} file in cache")


if __name__ == "__main__":
    main()
