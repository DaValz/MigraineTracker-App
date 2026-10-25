"""Strumenti per le traduzioni. Nel codice il testo italiano e' la chiave: t('Salva'), t('{n, plural, one {# giorno} other {# giorni}}', { n }).

  python tools/i18n_check.py keys [--out chiavi.json]      elenco delle chiavi estratte dal codice (con file:riga)
  python tools/i18n_check.py lint [file.js ...]            cerca testo non passato da t()/tr()/tv() e usi pericolosi
  python tools/i18n_check.py check [lingua ...]            controlla i dizionari js/i18n/<lingua>.js rispetto al codice
  python tools/i18n_check.py todo LINGUA [--out f.json]    chiavi ancora da tradurre (con contesto) per quella lingua
  python tools/i18n_check.py merge LINGUA f.json [...]     aggiunge/aggiorna traduzioni (JSON {"italiano": "traduzione"}) in js/i18n/LINGUA.js

Funzioni di marcatura (js/i18n.js): t() traduce una frase letterale; tr() marca solo i valori salvati nei dati (si traducono
in visualizzazione con tv()); tx() come t() ma con nodi DOM nei segnaposto.
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JS = ROOT / "js"
I18N = JS / "i18n"
LANGS = {"en": "English", "es": "Espanol", "fr": "Francais", "de": "Deutsch", "pt": "Portugues", "ro": "Romana", "nl": "Nederlands"}
REQUIRED_PLURALS = {"it": {"one", "other"}, "en": {"one", "other"}, "es": {"one", "other"}, "fr": {"one", "other"}, "de": {"one", "other"},
                    "pt": {"one", "other"}, "nl": {"one", "other"}, "ro": {"one", "few", "other"}}
MARKERS = {"t", "tr", "tx"}

# ---------------------------------------------------------------- tokenizer JS minimale

KEYWORDS_BEFORE_REGEX = {"return", "typeof", "case", "in", "of", "delete", "void", "throw", "new", "instanceof", "else", "do", "yield", "await"}
ESC = {"n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f", "v": "\v", "0": "\0"}
NUM_RE = re.compile(r"0[xX][0-9a-fA-F_]+|\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?n?|\.\d+")
ID_RE = re.compile(r"[\w$]+", re.UNICODE)
PUNCT_RE = re.compile(r"\?\?=|\.\.\.|===|!==|\*\*=|>>>|<<=|>>=|&&=|\|\|=|=>|==|!=|<=|>=|&&|\|\||\?\?|\?\.|\+\+|--|\+=|-=|\*=|/=|%=|&=|\|=|\^=|<<|>>|\*\*")


def decode_escapes(raw):
    out = []
    i = 0
    while i < len(raw):
        c = raw[i]
        if c != "\\":
            out.append(c)
            i += 1
            continue
        i += 1
        if i >= len(raw):
            break
        c = raw[i]
        if c == "u":
            if raw[i + 1:i + 2] == "{":
                j = raw.index("}", i)
                out.append(chr(int(raw[i + 2:j], 16)))
                i = j + 1
            else:
                out.append(chr(int(raw[i + 1:i + 5], 16)))
                i += 5
        elif c == "x":
            out.append(chr(int(raw[i + 1:i + 3], 16)))
            i += 3
        elif c == "\n":
            i += 1
        else:
            out.append(ESC.get(c, c))
            i += 1
    return "".join(out)


class Tok:
    __slots__ = ("kind", "text", "start", "end", "line", "parts", "exprs")

    def __init__(self, kind, text, start, end, line, parts=None, exprs=None):
        self.kind, self.text, self.start, self.end, self.line, self.parts, self.exprs = kind, text, start, end, line, parts, exprs


def skip_string(src, i):
    q = src[i]
    n = len(src)
    j = i + 1
    if q != "`":
        while j < n and src[j] != q:
            if src[j] == "\\":
                j += 1
            elif src[j] == "\n":
                return j
            j += 1
        return j + 1
    while j < n and src[j] != "`":
        if src[j] == "\\":
            j += 2
            continue
        if src[j] == "$" and src[j + 1:j + 2] == "{":
            j = skip_braces(src, j + 1)
            continue
        j += 1
    return j + 1


def skip_braces(src, i):
    n = len(src)
    depth = 0
    j = i
    while j < n:
        ch = src[j]
        if ch in "'\"`":
            j = skip_string(src, j)
            continue
        if ch == "/" and src[j + 1:j + 2] == "/":
            j = src.find("\n", j)
            if j < 0:
                return n
            continue
        if ch == "/" and src[j + 1:j + 2] == "*":
            j = src.find("*/", j + 2) + 2
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return j + 1
        j += 1
    return n


def tokenize(src, base=0, line0=1):
    """kind: str | tpl | regex | comment | id | num | p. I template hanno parts (quasi) ed exprs (token delle espressioni)."""
    toks = []
    i, n, line, prev = 0, len(src), line0, None

    def regex_allowed():
        if prev is None:
            return True
        if prev.kind in ("num", "str", "tpl", "regex"):
            return False
        if prev.kind == "id":
            return prev.text in KEYWORDS_BEFORE_REGEX
        return prev.text not in (")", "]", "}")

    while i < n:
        c = src[i]
        if c == "\n":
            line += 1
            i += 1
            continue
        if c in " \t\r":
            i += 1
            continue
        if c == "/" and src[i + 1:i + 2] == "/":
            j = src.find("\n", i)
            j = n if j < 0 else j
            toks.append(Tok("comment", src[i:j], base + i, base + j, line))
            i = j
            continue
        if c == "/" and src[i + 1:i + 2] == "*":
            j = src.find("*/", i + 2)
            j = n if j < 0 else j + 2
            toks.append(Tok("comment", src[i:j], base + i, base + j, line))
            line += src.count("\n", i, j)
            i = j
            continue
        if c in "'\"":
            j = skip_string(src, i)
            t = Tok("str", decode_escapes(src[i + 1:j - 1]), base + i, base + j, line)
            toks.append(t)
            prev = t
            i = j
            continue
        if c == "`":
            j = i + 1
            parts, exprs = [], []
            buf = j
            while j < n and src[j] != "`":
                if src[j] == "\\":
                    j += 2
                    continue
                if src[j] == "$" and src[j + 1:j + 2] == "{":
                    parts.append(src[buf:j])
                    end = skip_braces(src, j + 1)
                    exprs.append(tokenize(src[j + 2:end - 1], base + j + 2, line + src.count("\n", i, j)))
                    j = end
                    buf = j
                    continue
                j += 1
            parts.append(src[buf:j])
            t = Tok("tpl", "${}".join(parts), base + i, base + j + 1, line, parts=[decode_escapes(p) for p in parts], exprs=exprs)
            toks.append(t)
            prev = t
            line += src.count("\n", i, j)
            i = j + 1
            continue
        if c == "/" and regex_allowed():
            j = i + 1
            in_class = False
            while j < n and (src[j] != "/" or in_class):
                if src[j] == "\\":
                    j += 1
                elif src[j] == "[":
                    in_class = True
                elif src[j] == "]":
                    in_class = False
                j += 1
            j += 1
            while j < n and src[j].isalpha():
                j += 1
            t = Tok("regex", src[i:j], base + i, base + j, line)
            toks.append(t)
            prev = t
            i = j
            continue
        if c.isdigit() or (c == "." and src[i + 1:i + 2].isdigit()):
            m = NUM_RE.match(src, i)
            j = m.end() if m else i + 1
            t = Tok("num", src[i:j], base + i, base + j, line)
            toks.append(t)
            prev = t
            i = j
            continue
        if c.isalpha() or c in "_$":
            j = ID_RE.match(src, i).end()
            t = Tok("id", src[i:j], base + i, base + j, line)
            toks.append(t)
            prev = t
            i = j
            continue
        m = PUNCT_RE.match(src, i)
        j = m.end() if m else i + 1
        t = Tok("p", src[i:j], base + i, base + j, line)
        toks.append(t)
        prev = t
        i = j
    return toks


def flatten(toks):
    """Token in ordine di apparizione, comprese le espressioni annidate nei template (restano in sequenza)."""
    out = []

    def walk(ts):
        for t in ts:
            out.append(t)
            if t.kind == "tpl":
                for ex in t.exprs:
                    walk(ex)
    walk(toks)
    return out


def js_files(paths=None):
    if paths:
        return [Path(p) if Path(p).is_absolute() else ROOT / p for p in paths]
    return sorted(p for p in JS.rglob("*.js") if "i18n" not in p.relative_to(JS).parts)


def rel(p):
    try:
        return p.relative_to(ROOT).as_posix()
    except ValueError:
        return p.as_posix()


# ---------------------------------------------------------------- estrazione

def extract(files=None):
    """-> (keys: dict chiave -> [file:riga], problems: [str])"""
    keys, problems = {}, []
    for f in js_files(files):
        src = f.read_text(encoding="utf-8")
        toks = [t for t in flatten(tokenize(src)) if t.kind != "comment"]
        for i, t in enumerate(toks):
            if t.kind != "id" or t.text not in MARKERS:
                continue
            if i > 0 and toks[i - 1].text in (".", "function") or i + 2 >= len(toks) or toks[i + 1].text != "(":
                continue
            a = toks[i + 2]
            where = f"{rel(f)}:{t.line}"
            if a.kind == "str" or (a.kind == "tpl" and not a.exprs):
                nxt = toks[i + 3].text if i + 3 < len(toks) else ""
                if nxt not in (",", ")"):
                    problems.append(f"{where}: {t.text}() con un'espressione al posto del solo testo (concatenazione?)")
                    continue
                key = a.text
                if key != key.strip():
                    problems.append(f"{where}: la chiave ha spazi iniziali/finali: {key!r} (metti gli spazi nel codice)")
                keys.setdefault(key, []).append(where)
            elif a.kind == "tpl":
                problems.append(f"{where}: {t.text}() con template `${{...}}`: usa {{segnaposto}} e i parametri")
            else:
                problems.append(f"{where}: {t.text}() con argomento non letterale ({a.text})")
    return keys, problems


# ---------------------------------------------------------------- messaggi ICU semplificati

def match_brace(s, i):
    depth = 0
    for j in range(i, len(s)):
        if s[j] == "{":
            depth += 1
        elif s[j] == "}":
            depth -= 1
            if depth == 0:
                return j
    return -1


def parse_icu(msg):
    """-> {'names': set, 'plurals': [(nome, {categoria: testo})]}; ValueError se le graffe sono sbilanciate."""
    names, plurals = set(), []
    i = 0
    while i < len(msg):
        c = msg[i]
        if c == "}":
            raise ValueError("graffa chiusa senza apertura")
        if c != "{":
            i += 1
            continue
        end = match_brace(msg, i)
        if end < 0:
            raise ValueError("graffa aperta senza chiusura")
        inner = msg[i + 1:end]
        m = re.fullmatch(r"\s*(\w+)\s*", inner)
        if m:
            names.add(m.group(1))
        else:
            m = re.match(r"\s*(\w+)\s*,\s*plural\s*,\s*(.*)\Z", inner, re.S)
            if not m:
                raise ValueError(f"segnaposto non valido: {{{inner[:30]}}}")
            name, body = m.group(1), m.group(2)
            names.add(name)
            cases, j = {}, 0
            while j < len(body):
                while j < len(body) and body[j].isspace():
                    j += 1
                if j >= len(body):
                    break
                km = re.match(r"(=\d+|[a-z]+)\s*", body[j:])
                if not km:
                    raise ValueError(f"caso plurale non valido: {body[j:j + 20]!r}")
                j += km.end()
                if body[j:j + 1] != "{":
                    raise ValueError("caso plurale senza {testo}")
                e2 = match_brace(body, j)
                if e2 < 0:
                    raise ValueError("graffa del caso plurale non chiusa")
                text = body[j + 1:e2]
                cases[km.group(1)] = text
                sub = parse_icu(text)
                names |= sub["names"] - {name}
                j = e2 + 1
            plurals.append((name, cases))
        i = end + 1
    return {"names": names, "plurals": plurals}


# ---------------------------------------------------------------- lint

SKIP_PROPS = {"class", "className", "type", "id", "kind", "icon", "tone", "size", "role", "href", "d", "viewBox", "style", "name", "for", "autocomplete",
              "inputmode", "inputMode", "mode", "tag", "src", "target", "rel", "fill", "stroke", "cls", "key", "variant", "align", "width", "height", "min",
              "max", "step", "pattern", "accept", "method", "dir", "tabindex", "data", "color", "background", "transform", "points", "x", "y", "cx", "cy",
              "r", "autocapitalize", "enterkeyhint", "grade", "sort", "field", "unit", "group", "scope", "state", "view", "tab", "event", "storage"}
NEUTRAL_CALLS = {"querySelector", "querySelectorAll", "closest", "matches", "getElementById", "getAttribute", "setAttribute", "removeAttribute", "hasAttribute",
                 "addEventListener", "removeEventListener", "classList", "add", "remove", "toggle", "contains", "getItem", "setItem", "removeItem", "import",
                 "createElement", "createElementNS", "require", "postMessage", "dispatchEvent", "Event", "CustomEvent", "matchMedia", "RegExp", "indexOf",
                 "startsWith", "endsWith", "includes", "split", "replace", "replaceAll", "match", "test", "padStart", "padEnd", "normalize", "icon", "h",
                 "getContext", "focus", "scrollIntoView", "open", "Intl", "DateTimeFormat", "NumberFormat", "PluralRules", "ListFormat", "Collator", "localeCompare",
                 "console", "warn", "error", "log", "info", "debug", "fetch", "Request", "Response", "Blob", "File", "URL", "has", "get", "set", "delete", "obj"}
LETTERS = re.compile(r"[^\W\d_]", re.UNICODE)
ITALIAN_HINT = re.compile(r"[àèéìòùÀÈÉÌÒÙ’]|\b(il|lo|la|le|gli|di|del|della|dei|delle|un|una|con|per|che|non|nel|nella|sul|sulla|da|dal|dalla|più|ed|alla|agli|anche|solo|ogni|tutto|tutti|oggi|ieri|giorni|giorno|attacco|attacchi|mal|testa|emicrania|farmaco|farmaci|terapia|salva|annulla|apri|chiudi)\b", re.I)


def looks_human(s):
    s = s.strip()
    if len(LETTERS.findall(s)) < 2:
        return False
    if re.fullmatch(r"[a-z][a-z0-9_\-]*( [a-z][a-z0-9_\-]*)*", s) and not ITALIAN_HINT.search(s):
        return False
    if re.fullmatch(r"[\w\-./:#@%?=&,+*()\[\]^$|\\ ]*", s) and " " not in s and not s[0].isupper():
        return False
    return True


def lint(files=None):
    problems = []
    for f in js_files(files):
        src = f.read_text(encoding="utf-8")
        if "i18n-ignore-file" in src[:400]:
            continue
        lines = src.split("\n")
        toks = [t for t in flatten(tokenize(src)) if t.kind != "comment"]
        for i, t in enumerate(toks):
            if t.kind not in ("str", "tpl"):
                continue
            s = t.text
            if not looks_human(s):
                continue
            ignore_line = lines[t.line - 1] if t.line - 1 < len(lines) else ""
            if "i18n-ignore" in ignore_line:
                continue
            prev = toks[i - 1] if i else None
            prev2 = toks[i - 2] if i > 1 else None
            if prev and prev.text == "(" and prev2 and prev2.kind == "id" and (prev2.text in MARKERS or prev2.text == "tv"):
                continue
            if prev and prev.text == "(" and prev2 and prev2.text in NEUTRAL_CALLS:
                continue
            if prev and prev.text == "," and i > 3:
                # secondo argomento di una chiamata neutra, es. setAttribute('x', 'valore')
                depth, j = 0, i - 1
                while j >= 0:
                    if toks[j].text == ")":
                        depth += 1
                    elif toks[j].text == "(":
                        if depth == 0:
                            break
                        depth -= 1
                    j -= 1
                if j > 0 and toks[j - 1].text in NEUTRAL_CALLS:
                    continue
            if prev and prev.text == ":" and prev2 and prev2.text.strip("'\"") in SKIP_PROPS:
                continue
            if prev and prev.text in ("from", "import") or (prev and prev.text == "(" and prev2 and prev2.text == "import"):
                continue
            problems.append(f"{rel(f)}:{t.line}: testo non tradotto? {s[:90]!r}")
        for m in re.finditer(r"toFixed\([^)]*\)\.replace\('\.', ','\)", src):
            problems.append(f"{rel(f)}:{src.count(chr(10), 0, m.start()) + 1}: formato numerico italiano fisso: usa num()/pct()")
        for m in re.finditer(r"'it-IT'|'it'|\"it-IT\"", src):
            if f.name != "i18n.js":
                problems.append(f"{rel(f)}:{src.count(chr(10), 0, m.start()) + 1}: lingua fissa: usa locale da i18n.js")
        for m in re.finditer(r"\bplural\(", src):
            problems.append(f"{rel(f)}:{src.count(chr(10), 0, m.start()) + 1}: plural() va sostituito da t('{{n, plural, one {{...}} other {{...}}}}', {{ n }})")
        for m in re.finditer(r"join\('(?: e | o )'\)", src):
            problems.append(f"{rel(f)}:{src.count(chr(10), 0, m.start()) + 1}: elenco con ' e '/' o ': usa listAnd()/listOr()")
    return problems


def object_keys(toks, j):
    """toks[j] == '{': chiavi di primo livello dell'oggetto letterale e se contiene uno spread."""
    keys, spread = set(), False
    depth, state = 0, "key"
    k = j
    while k < len(toks):
        tk = toks[k]
        if tk.kind == "p" and tk.text in ("(", "[", "{"):
            depth += 1
        elif tk.kind == "p" and tk.text in (")", "]", "}"):
            depth -= 1
            if depth == 0:
                break
        elif depth == 1:
            if state == "key":
                if tk.kind == "p" and tk.text == "...":
                    spread = True
                    state = "value"
                elif tk.kind in ("id", "str"):
                    nxt = toks[k + 1].text if k + 1 < len(toks) else ""
                    if nxt in (":", ",", "}"):
                        keys.add(tk.text)
                        state = "value" if nxt == ":" else "key"
            elif tk.kind == "p" and tk.text == ",":
                state = "key"
        k += 1
    return keys, spread


def param_problems(files=None):
    """Segnaposto {x} nel messaggio senza il parametro corrispondente nella chiamata (comparirebbe a video come {x})."""
    problems = []
    for f in js_files(files):
        src = f.read_text(encoding="utf-8")
        toks = [t for t in flatten(tokenize(src)) if t.kind != "comment"]
        for i, t in enumerate(toks):
            if t.kind != "id" or t.text not in ("t", "tx") or i + 2 >= len(toks) or toks[i + 1].text != "(":
                continue
            if i > 0 and toks[i - 1].text in (".", "function"):
                continue
            a = toks[i + 2]
            if not (a.kind == "str" or (a.kind == "tpl" and not a.exprs)):
                continue
            try:
                names = parse_icu(a.text.split("§")[0])["names"]
            except ValueError as e:
                problems.append(f"{rel(f)}:{t.line}: messaggio non valido ({e}): {a.text[:60]!r}")
                continue
            if not names:
                continue
            nxt = toks[i + 3].text if i + 3 < len(toks) else ""
            if nxt == ")":
                problems.append(f"{rel(f)}:{t.line}: {sorted(names)} senza parametri: {a.text[:60]!r}")
            elif nxt == "," and i + 4 < len(toks) and toks[i + 4].text == "{":
                keys, spread = object_keys(toks, i + 4)
                missing = names - keys
                if missing and not spread:
                    problems.append(f"{rel(f)}:{t.line}: parametri mancanti {sorted(missing)}: {a.text[:60]!r}")
    return problems


# ---------------------------------------------------------------- dizionari

def load_dict(code):
    p = I18N / f"{code}.js"
    if not p.exists():
        return None, f"{rel(p)} non esiste"
    text = p.read_text(encoding="utf-8")
    try:
        return json.loads(text[text.index("{"):text.rindex("}") + 1]), None
    except Exception as e:  # noqa: BLE001
        return None, f"{rel(p)}: JSON non valido ({e})"


def write_dict(code, d, order):
    ordered = {k: d[k] for k in order if k in d}
    ordered.update({k: v for k, v in d.items() if k not in ordered})
    body = ",\n".join(f"  {json.dumps(k, ensure_ascii=False)}: {json.dumps(v, ensure_ascii=False)}" for k, v in ordered.items())
    I18N.mkdir(exist_ok=True)
    (I18N / f"{code}.js").write_text(
        f"/* Traduzione: {LANGS.get(code, code)}. Chiave = testo italiano del codice. Si controlla con: python tools/i18n_check.py check {code} */\nexport default {{\n{body}\n}};\n",
        encoding="utf-8", newline="\n")


def check_pair(code, key, val):
    """Lista di errori per una traduzione. La parte della chiave dopo '§' e' solo un contesto e non fa parte del testo."""
    errs = []
    if not isinstance(val, str) or not val.strip():
        return ["traduzione vuota"]
    if "§" in val:
        errs.append("la traduzione contiene '§' (il contesto non va tradotto)")
    key = key.split("§")[0]
    if key[:len(key) - len(key.lstrip())] != val[:len(val) - len(val.lstrip())] or key[len(key.rstrip()):] != val[len(val.rstrip()):]:
        errs.append("spazi iniziali/finali diversi dalla chiave")
    try:
        pk, pv = parse_icu(key), parse_icu(val)
    except ValueError as e:
        return [f"graffe/segnaposto non validi: {e}"]
    if pk["names"] != pv["names"]:
        errs.append(f"segnaposto diversi: chiave {sorted(pk['names'])} / traduzione {sorted(pv['names'])}")
    if len(pk["plurals"]) != len(pv["plurals"]):
        errs.append("numero di blocchi plural diverso dalla chiave")
    else:
        need = REQUIRED_PLURALS.get(code, {"one", "other"})
        for (n1, _), (n2, cases) in zip(pk["plurals"], pv["plurals"]):
            if n1 != n2:
                errs.append(f"plural su variabili diverse: {n1} / {n2}")
            missing = need - set(cases)
            if missing:
                errs.append(f"plural senza le forme {sorted(missing)}")
            if "other" not in cases:
                errs.append("plural senza 'other'")
    if key.count("\n") != val.count("\n"):
        errs.append("numero di a-capo diverso")
    return errs


def cmd_keys(a):
    keys, problems = extract()
    for p in problems:
        print("PROBLEMA:", p)
    if a.out:
        Path(a.out).write_text(json.dumps([{"key": k, "where": v[:4]} for k, v in keys.items()], ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(keys)} chiavi, {sum(len(v) for v in keys.values())} usi, {len(problems)} problemi")
    return 1 if problems else 0


def cmd_lint(a):
    problems = lint(a.files or None) + param_problems(a.files or None)
    _, kp = extract(a.files or None)
    for p in problems + kp:
        print(p)
    print(f"{len(problems) + len(kp)} segnalazioni")
    return 1 if problems or kp else 0


def cmd_check(a):
    keys, problems = extract()
    for p in problems:
        print("PROBLEMA:", p)
    codes = a.langs or sorted(LANGS)
    bad = len(problems)
    for code in codes:
        d, err = load_dict(code)
        if err:
            print(f"[{code}] {err}")
            bad += 1
            continue
        missing = [k for k in keys if k not in d]
        extra = [k for k in d if k not in keys]
        errs = []
        same = []
        for k, v in d.items():
            if k not in keys:
                continue
            e = check_pair(code, k, v)
            if e:
                errs.append((k, e))
            elif v == k and len(k) > 3 and not re.fullmatch(r"[\W\d_]*", k):
                same.append(k)
        print(f"[{code}] {len(d)} voci: {len(missing)} mancanti, {len(extra)} in piu', {len(errs)} con errori, {len(same)} identiche all'italiano")
        for k in missing[:a.max]:
            print(f"   MANCA: {k[:100]!r}  ({keys[k][0]})")
        for k, e in errs[:a.max]:
            print(f"   ERRORE: {k[:70]!r}: {'; '.join(e)}")
        if a.verbose:
            for k in extra[:a.max]:
                print(f"   IN PIU': {k[:100]!r}")
            for k in same[:a.max]:
                print(f"   IDENTICA: {k[:100]!r}")
        bad += len(missing) + len(errs)
    return 1 if bad else 0


def cmd_todo(a):
    keys, _ = extract()
    d, _ = load_dict(a.lang)
    d = d or {}
    todo = {k: "" for k in keys if k not in d}
    ctx = {k: keys[k][:3] for k in todo}
    out = {"todo": todo, "where": ctx}
    if a.out:
        Path(a.out).write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(todo)} chiavi da tradurre per {a.lang}")
    return 0


def cmd_merge(a):
    keys, _ = extract()
    d, _ = load_dict(a.lang)
    d = d or {}
    added, rejected = 0, 0
    for fp in a.files:
        data = json.loads(Path(fp).read_text(encoding="utf-8"))
        if "todo" in data and isinstance(data["todo"], dict):
            data = data["todo"]
        for k, v in data.items():
            if k not in keys:
                print(f"   ignorata (non e' una chiave del codice): {k[:80]!r}")
                continue
            e = check_pair(a.lang, k, v)
            if e:
                print(f"   RIFIUTATA {k[:70]!r}: {'; '.join(e)}")
                rejected += 1
                continue
            d[k] = v
            added += 1
    write_dict(a.lang, d, list(keys))
    print(f"[{a.lang}] {added} voci unite, {rejected} rifiutate, totale {len(d)}/{len(keys)}")
    return 1 if rejected else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    k = sub.add_parser("keys")
    k.add_argument("--out")
    k.set_defaults(fn=cmd_keys)
    li = sub.add_parser("lint")
    li.add_argument("files", nargs="*")
    li.set_defaults(fn=cmd_lint)
    c = sub.add_parser("check")
    c.add_argument("langs", nargs="*")
    c.add_argument("--max", type=int, default=15)
    c.add_argument("-v", "--verbose", action="store_true")
    c.set_defaults(fn=cmd_check)
    t = sub.add_parser("todo")
    t.add_argument("lang")
    t.add_argument("--out")
    t.set_defaults(fn=cmd_todo)
    m = sub.add_parser("merge")
    m.add_argument("lang")
    m.add_argument("files", nargs="+")
    m.set_defaults(fn=cmd_merge)
    a = ap.parse_args()
    sys.exit(a.fn(a))


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
