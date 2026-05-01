#!/usr/bin/env python3
"""Parse l'export Messenger Facebook pour extraire les pleins de la Mégane.

Format des messages (très variable):
  - Première ligne: station + date (parfois juste la date, parfois juste la station)
  - Lignes suivantes (ordre variable): km, prix/L, litres, total €
Suivi d'une ligne timestamp Messenger (ex: "avr 16, 2025 6:39:56 pm").

On ne garde que les messages contenant au moins (km OU litres OU prix total)
et postérieurs au passage à la Mégane (sept 2021). On filtre les autres notes.
"""
import json
import re
from html.parser import HTMLParser
from pathlib import Path

SRC = Path(__file__).parent / "donnees" / "message_1.html"
OUT_JSON = Path(__file__).parent / "app" / "data.json"

MONTHS = {
    "janv": 1, "jan": 1, "févr": 2, "fév": 2, "fev": 2, "mars": 3, "mar": 3,
    "avr": 4, "avril": 4, "mai": 5, "juin": 6, "juil": 7, "juillet": 7,
    "août": 8, "aout": 8, "sept": 9, "sep": 9, "oct": 10, "nov": 11,
    "déc": 12, "dec": 12,
}

# Pattern d'un en-tête de plein dans un message multi-pleins :
#   "5 sept 21- Total", "20 nov 21- Leclerc", "5 mai 22-Carrefour", "8 juillet 22- Leclerc"
MULTI_HEADER_RE = re.compile(
    r"^\s*(\d{1,2})\s+(janv|jan|févr|fév|fev|mars|mar|avr|avril|mai|juin|juil|juillet|août|aout|sept|sep|oct|nov|déc|dec)\s+(\d{2,4})\s*[-–—]\s*(.+?)\s*$",
    re.IGNORECASE,
)

STATIONS = [
    ("intermarche", ["intermarché", "intermarche", "inter ", "inter,", "inter."]),
    ("leclerc", ["leclerc"]),
    ("super_u", ["super u", "superu", "super-u"]),
    ("total", ["total"]),
    ("carrefour", ["carrefour"]),
    ("auchan", ["auchan"]),
    ("casino", ["casino"]),
    ("esso", ["esso"]),
    ("bp", ["bp "]),
    ("shell", ["shell"]),
    ("avia", ["avia"]),
]


class TextExtractor(HTMLParser):
    """Extrait les blocs de texte de l'export Messenger.

    Chaque message Messenger est dans un <div class="_3-95 _2let"> (le contenu)
    suivi d'un <div class="_3-94 _2lem"> (le timestamp). On garde une approche
    plus simple: on capture tout le texte avec des sauts de ligne aux <br> et
    aux fermetures de <div>, puis on regroupe par bloc.
    """

    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("style", "script", "head"):
            self.skip_depth += 1
        if tag in ("br", "p", "div"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("style", "script", "head") and self.skip_depth > 0:
            self.skip_depth -= 1
        if tag in ("p", "div"):
            self.parts.append("\n")

    def handle_data(self, data):
        if self.skip_depth == 0:
            self.parts.append(data)

    def text(self):
        return "".join(self.parts)


def extract_text():
    raw = SRC.read_text(encoding="utf-8")
    parser = TextExtractor()
    parser.feed(raw)
    text = parser.text()
    # Nettoyage HTML entities communes
    text = (text
            .replace("&#039;", "'").replace("&quot;", '"')
            .replace("&amp;", "&").replace("&#064;", "@")
            .replace("\xa0", " "))
    return text


TS_RE = re.compile(
    r"^(janv|jan|févr|fév|fev|mars|mar|avr|mai|juin|juil|août|aout|sept|sep|oct|nov|déc|dec)\s+"
    r"(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(am|pm)$",
    re.IGNORECASE,
)


def parse_timestamp(line):
    m = TS_RE.match(line.strip().lower())
    if not m:
        return None
    mon, day, year, h, mi, s, ampm = m.groups()
    month = MONTHS.get(mon)
    if not month:
        return None
    h = int(h)
    if ampm == "pm" and h < 12:
        h += 12
    if ampm == "am" and h == 12:
        h = 0
    return f"{int(year):04d}-{month:02d}-{int(day):02d}T{h:02d}:{int(mi):02d}:{int(s):02d}"


def split_messages(text):
    """Découpe le texte en messages: chaque message se termine par une ligne timestamp."""
    lines = [l.rstrip() for l in text.splitlines()]
    # Ignorer entièrement les lignes vides et "Fanny Goyet" qui est l'auteur
    msgs = []
    current = []
    for line in lines:
        s = line.strip()
        if not s:
            continue
        if s == "Fanny Goyet" or s == "Générée par Fanny Goyet le":
            # Marqueur de nouveau message: on ferme le précédent s'il a un timestamp
            continue
        ts = parse_timestamp(s)
        if ts:
            if current:
                msgs.append((ts, current))
                current = []
        else:
            current.append(s)
    return msgs


KM_RE = re.compile(r"(\d{1,3}[ .]?\d{3,6})\s*km", re.IGNORECASE)
KM_BARE_RE = re.compile(r"^\s*(\d{6})\s*$")  # 6 chiffres seuls sur une ligne
LITRES_RE = re.compile(r"(\d{1,3}[.,]\d{1,2})\s*L\b", re.IGNORECASE)
PRICE_PER_L_RE = re.compile(r"(\d[.,]\d{2,3})\s*€?\s*[/:]\s*L", re.IGNORECASE)
PRICE_PER_L_BARE_RE = re.compile(r"^\s*(\d[.,]\d{3})\s*$")  # 1,840
TOTAL_EUR_RE = re.compile(r"(\d{1,3}(?:[.,]\d{1,2})?)\s*€")
DATE_IN_HEADER_RE = re.compile(r"(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?")


def to_float(s):
    if s is None:
        return None
    return float(str(s).replace(" ", "").replace(",", "."))


def to_int_km(s):
    return int(str(s).replace(" ", "").replace(".", ""))


def detect_station(text):
    low = text.lower()
    for key, needles in STATIONS:
        for n in needles:
            if n in low:
                return key
    return None


def parse_message(ts, lines):
    """Tente de parser un message en plein. Retourne dict ou None."""
    full = "\n".join(lines)
    # Ignore les messages clairement non-pleins
    if "n'a pas été envoyé" in full or "n’a pas été envoyé" in full:
        return None
    if "facebook.com" in full or "instagram.com" in full:
        return None

    # Chercher km
    km = None
    for line in lines:
        m = KM_RE.search(line)
        if m:
            km = to_int_km(m.group(1))
            break
        m = KM_BARE_RE.match(line)
        if m:
            km = to_int_km(m.group(1))
            break
    # Cas spécial: ligne type "190375 km" sans espace
    if km is None:
        m = re.search(r"(\d{6})\s*(km|KM|Km)", full)
        if m:
            km = to_int_km(m.group(1))
    # Cas: "171100km" / "166011km"
    if km is None:
        m = re.search(r"(\d{6})km", full.replace(" ", ""))
        if m:
            km = to_int_km(m.group(1))

    # Litres
    litres = None
    for line in lines:
        m = LITRES_RE.search(line)
        if m:
            litres = to_float(m.group(1))
            break
    # Cas "56.11L" / "56,12" sur ligne seule (rare)
    if litres is None:
        for line in lines:
            m = re.match(r"^\s*(\d{1,3}[.,]\d{1,2})\s*$", line)
            if m:
                v = to_float(m.group(1))
                if 5 <= v <= 80:  # plausible pour litres
                    litres = v
                    break

    # Prix au litre
    prix_l = None
    for line in lines:
        m = PRICE_PER_L_RE.search(line)
        if m:
            prix_l = to_float(m.group(1))
            break
    if prix_l is None:
        for line in lines:
            m = PRICE_PER_L_BARE_RE.match(line)
            if m:
                v = to_float(m.group(1))
                if 1.0 <= v <= 3.0:
                    prix_l = v
                    break

    # Total €
    total = None
    for line in lines:
        # Skip ligne contenant déjà /L
        if re.search(r"[/:]\s*L", line, re.IGNORECASE):
            continue
        m = TOTAL_EUR_RE.search(line)
        if m:
            v = to_float(m.group(1))
            if 5 <= v <= 200:
                total = v
                break
    # Total sur ligne seule "100.01" / "97,94"
    if total is None:
        for line in lines:
            m = re.match(r"^\s*(\d{2,3}[.,]\d{1,2})\s*$", line)
            if m:
                v = to_float(m.group(1))
                if v != prix_l and v != litres and 20 <= v <= 200:
                    total = v
                    break

    # Filtre: il faut au minimum km + (litres ou total)
    if km is None:
        return None
    if litres is None and total is None and prix_l is None:
        return None

    # Plausibilité km Mégane : entre 90_000 et 350_000
    if km < 90_000 or km > 350_000:
        return None

    # Station: cherchée dans tout le message
    station = detect_station(full)

    # Date du plein: parfois écrite dans la première ligne ("16/04/25"),
    # sinon on retombe sur la date du timestamp Messenger.
    plein_date = None
    header = lines[0] if lines else ""
    m = DATE_IN_HEADER_RE.search(header)
    if m:
        d, mo, y = m.groups()
        d, mo = int(d), int(mo)
        if y is None:
            y = int(ts[:4])
        else:
            y = int(y)
            if y < 100:
                y += 2000
        if 1 <= d <= 31 and 1 <= mo <= 12 and 2021 <= y <= 2030:
            plein_date = f"{y:04d}-{mo:02d}-{d:02d}"
    if plein_date is None:
        plein_date = ts[:10]
    # Si la date du header diffère de plus de 30j du timestamp Messenger,
    # le user a probablement mal tapé : on fait confiance au timestamp.
    from datetime import date
    ts_d = date.fromisoformat(ts[:10])
    pd = date.fromisoformat(plein_date)
    if abs((pd - ts_d).days) > 30:
        plein_date = ts[:10]

    # Calculs auto si possible
    if total is None and litres is not None and prix_l is not None:
        total = round(litres * prix_l, 2)
    if litres is None and total is not None and prix_l:
        litres = round(total / prix_l, 2)
    if prix_l is None and total is not None and litres:
        prix_l = round(total / litres, 3)

    return {
        "date": plein_date,
        "station": station,
        "km": km,
        "litres": litres,
        "prix_litre": prix_l,
        "total": total,
        "raw_header": header,
        "messenger_ts": ts,
    }


def split_multi_plein(lines):
    """Détecte si un message contient plusieurs pleins (en-têtes type "5 sept 21- Total")
    et le découpe en sous-messages. Retourne une liste de (date_iso_or_None, sous_lines)
    ou None si ce n'est pas un message multi-pleins.
    """
    headers = []
    for i, l in enumerate(lines):
        m = MULTI_HEADER_RE.match(l)
        if m:
            headers.append(i)
    # Au moins 3 headers pour considérer que c'est un message agrégé
    if len(headers) < 3:
        return None
    blocks = []
    for j, idx in enumerate(headers):
        end = headers[j + 1] if j + 1 < len(headers) else len(lines)
        block_lines = lines[idx:end]
        # Reconstruire une date ISO depuis le header
        m = MULTI_HEADER_RE.match(block_lines[0])
        d, mon_name, y, station_part = m.groups()
        d = int(d)
        mon = MONTHS.get(mon_name.lower())
        y = int(y)
        if y < 100:
            y += 2000
        if mon is None or not (1 <= d <= 31):
            blocks.append((None, block_lines))
            continue
        try:
            iso = f"{y:04d}-{mon:02d}-{d:02d}"
        except Exception:
            iso = None
        # Le header devient une "ligne 0" exploitable par parse_message
        # On y injecte le nom de station pour que detect_station marche
        block_lines = [f"{station_part} {d:02d}/{mon:02d}/{y}"] + block_lines[1:]
        blocks.append((iso, block_lines))
    return blocks


def main():
    text = extract_text()
    msgs = split_messages(text)
    pleins = []
    for ts, lines in msgs:
        # 1. Cas message agrégé multi-pleins (juillet 2022 : sept 21 → juillet 22)
        sub = split_multi_plein(lines)
        if sub:
            for sub_date, sub_lines in sub:
                if sub_date is None:
                    continue
                # On synthétise un timestamp Messenger fictif (la date du plein elle-même)
                fake_ts = sub_date + "T12:00:00"
                p = parse_message(fake_ts, sub_lines)
                if p:
                    # Forcer la date du plein à celle du header (la fonction
                    # parse_message peut retomber sur fake_ts qui est correct)
                    p["date"] = sub_date
                    pleins.append(p)
            continue
        # 2. Message normal : on ignore les très longs (notes type liste piano)
        if sum(len(l) for l in lines) > 400:
            continue
        p = parse_message(ts, lines)
        if p:
            pleins.append(p)

    # Dédoublonnage: même date + même km = doublon
    seen = set()
    uniq = []
    for p in pleins:
        key = (p["date"], p["km"])
        if key in seen:
            continue
        seen.add(key)
        uniq.append(p)

    # Tri chronologique croissant
    uniq.sort(key=lambda x: (x["date"], x["km"]))

    # Sanity check: km doivent être croissants. On flag les anomalies.
    last_km = 0
    for p in uniq:
        if p["km"] < last_km:
            p["warning"] = f"km décroissant (précédent: {last_km})"
        last_km = max(last_km, p["km"])

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(
        json.dumps(uniq, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"{len(uniq)} pleins extraits → {OUT_JSON}")
    print(f"Période : {uniq[0]['date']} → {uniq[-1]['date']}")
    print(f"km : {uniq[0]['km']} → {uniq[-1]['km']} ({uniq[-1]['km'] - uniq[0]['km']} km)")
    warns = [p for p in uniq if "warning" in p]
    if warns:
        print(f"\n{len(warns)} anomalie(s) à vérifier :")
        for p in warns:
            print(f"  - {p['date']} {p['km']} km — {p['warning']} — header: {p['raw_header']!r}")


if __name__ == "__main__":
    main()
