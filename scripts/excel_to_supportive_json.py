#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Excel -> supportive.json (normalisiert)

Eingabe (Excel, 3 Sheets):
- supportive:     id,opt | name, substance, class, indication, dosing, max_daily, side_effects, warnings, regimen_category, specialty, disease
- regimen_catalog: regimen_id, regimen_name, group(opt), aliases(opt; Semikolon-getrennt)
- supportive_regimen: sup_id, regimen_id

Ausgabe (JSON):
{
  "regimen_catalog": [ { "id","name","group","aliases":[...] }, ... ],
  "items": [ { ..wie supportive.., "regimens":[regimen_id,...] }, ... ]
}

Nutzung:
  python scripts/excel_to_supportive_json.py data/supportive.xlsx --out site/support/supportive.json
"""
import argparse, json, sys, re
from pathlib import Path
import pandas as pd

SUP_COLS_REQ = [
    "name","substance","class","indication","dosing",
    "max_daily","side_effects","warnings",
    "regimen_category","specialty","disease"
]
SUP_COLS_ALL = ["id"] + SUP_COLS_REQ

CAT_COLS_REQ = ["regimen_id","regimen_name"]
MAP_COLS_REQ = ["sup_id","regimen_id"]

def split_multi(s):
    return [t.strip() for t in str(s or "").split(";") if t.strip()]

def slugify(s):
    s = str(s or "").lower()
    s = s.strip()
    s = re.sub(r"[äàáâ]", "a", s)
    s = re.sub(r"[öòóô]", "o", s)
    s = re.sub(r"[üùúû]", "u", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s

def trim_df(df):
    for c in df.columns:
        df[c] = df[c].astype(str).str.replace("\r\n","\n").str.replace("\r","\n").str.strip()
    return df

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("excel")
    ap.add_argument("--sheet_supportive", default="supportive")
    ap.add_argument("--sheet_catalog", default="regimen_catalog")
    ap.add_argument("--sheet_map", default="supportive_regimen")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    xlsx = Path(args.excel)
    if not xlsx.exists():
        print(f"[ERR] Excel nicht gefunden: {xlsx}", file=sys.stderr); sys.exit(2)

    try:
        sup = pd.read_excel(xlsx, sheet_name=args.sheet_supportive, dtype=str)
        cat = pd.read_excel(xlsx, sheet_name=args.sheet_catalog, dtype=str)
        mpp = pd.read_excel(xlsx, sheet_name=args.sheet_map, dtype=str)
    except Exception as e:
        print(f"[ERR] Excel-Read fehlgeschlagen: {e}", file=sys.stderr); sys.exit(2)

    # supportive: nur bekannte Spalten + leere Zeilen (ohne name) entfernen
    sup = sup[[c for c in sup.columns if c in SUP_COLS_ALL]].copy()
    for c in SUP_COLS_ALL:
        if c not in sup.columns: sup[c] = ""
    sup["name"] = sup["name"].fillna("").astype(str).str.strip()
    sup = sup[sup["name"]!=""].copy()
    sup = trim_df(sup)

    # IDs generieren falls leer
    seen_sup = set()
    def ensure_sup_id(val, idx):
        rid = (val or "").strip()
        if not rid:
            rid = f"sup-{idx+1:04d}"
        base = rid; k=1
        while rid in seen_sup:
            rid = f"{base}-{k}"; k+=1
        seen_sup.add(rid)
        return rid
    sup["id"] = [ensure_sup_id(v, i) for i, v in enumerate(sup["id"])]

    # regimen_catalog: Pflichtspalten prüfen + normalisieren
    missing = [c for c in CAT_COLS_REQ if c not in cat.columns]
    if missing:
        print(f"[ERR] regimen_catalog: fehlende Spalten: {', '.join(missing)}", file=sys.stderr); sys.exit(3)
    cat = cat.fillna("").astype(str)
    cat = trim_df(cat)
    out_catalog = []
    seen_reg = set()
    for _, row in cat.iterrows():
        rid = row.get("regimen_id","").strip() or slugify(row.get("regimen_name",""))
        rname = row.get("regimen_name","").strip()
        if not rname:
            print("[WARN] regimen ohne name übersprungen", file=sys.stderr)
            continue
        rid = slugify(rid)
        if not rid:
            print(f"[WARN] regimen_id leer für {rname} -> übersprungen", file=sys.stderr)
            continue
        if rid in seen_reg:
            print(f"[WARN] doppelte regimen_id '{rid}' -> übersprungen", file=sys.stderr); continue
        seen_reg.add(rid)
        aliases = split_multi(row.get("aliases",""))
        # optional: Name selbst in Aliases aufnehmen (für Suche), aber nicht doppeln
        if rname not in aliases: aliases.append(rname)
        out_catalog.append({
            "id": rid,
            "name": rname,
            "group": row.get("group","").strip() or None,
            "aliases": aliases
        })

    # supportive_regimen: Mapping prüfen
    missing = [c for c in MAP_COLS_REQ if c not in mpp.columns]
    if missing:
        print(f"[ERR] supportive_regimen: fehlende Spalten: {', '.join(missing)}", file=sys.stderr); sys.exit(4)
    mpp = trim_df(mpp.fillna(""))

    sup_ids = set(sup["id"].tolist())
    reg_ids = set([c["id"] for c in out_catalog])

    # Zuordnung sup_id -> [regimen_id,...]
    links = { sid: [] for sid in sup_ids }
    warn_count = 0
    for _, row in mpp.iterrows():
        sid = row.get("sup_id","").strip()
        rid = slugify(row.get("regimen_id","").strip())
        if not sid or not rid: 
            warn_count += 1; continue
        if sid not in sup_ids:
            print(f"[WARN] Mapping ignoriert: sup_id '{sid}' existiert nicht", file=sys.stderr); warn_count += 1; continue
        if rid not in reg_ids:
            print(f"[WARN] Mapping ignoriert: regimen_id '{rid}' nicht im Katalog", file=sys.stderr); warn_count += 1; continue
        links[sid].append(rid)

    # Items aufbauen
    items = []
    for _, row in sup.iterrows():
        rec = {c: row.get(c,"") for c in SUP_COLS_ALL}
        items.append({
            "id": rec["id"],
            "name": rec["name"],
            "substance": rec["substance"],
            "class": rec["class"],
            "indication": rec["indication"],
            "dosing": rec["dosing"],
            "max_daily": rec["max_daily"],
            "side_effects": rec["side_effects"],
            "warnings": rec["warnings"],
            "regimen_category": rec["regimen_category"],
            "specialty": rec["specialty"],
            "disease": rec["disease"],
            "regimens": links.get(rec["id"], [])
        })

    data = {
        "regimen_catalog": out_catalog,
        "items": items
    }

    out = Path(args.out); out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"[OK] items={len(items)}, regimens={len(out_catalog)} -> {out}")
    if warn_count:
        print(f"[WARN] {warn_count} Mapping-Zeilen übersprungen", file=sys.stderr)

if __name__ == "__main__":
    main()
