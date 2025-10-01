
#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Excel -> supportive.json Konverter

Nutzung:
  python excel_to_supportive_json.py <excel.xlsx> --out site/support/supportive.json
Optional:
  --sheet supportive

Abhängigkeiten:
  pip install pandas openpyxl
"""
import argparse, json, sys
from pathlib import Path
import pandas as pd

REQUIRED_COLUMNS = [
    "name","substance","class","indication","dosing",
    "max_daily","side_effects","warnings",
    "regimen_category","specialty","disease"
]
ALL_COLUMNS = ["id"] + REQUIRED_COLUMNS

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("excel")
    ap.add_argument("--sheet", default="supportive")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    xlsx = Path(args.excel)
    if not xlsx.exists():
        print(f"[ERR] Excel nicht gefunden: {xlsx}", file=sys.stderr); sys.exit(2)

    try:
        df = pd.read_excel(xlsx, sheet_name=args.sheet, dtype=str)
    except Exception as e:
        print(f"[ERR] Excel-Read fehlgeschlagen: {e}", file=sys.stderr); sys.exit(2)

    df = df[[c for c in df.columns if c in ALL_COLUMNS]].copy()
    for c in ALL_COLUMNS:
        if c not in df.columns: df[c] = ""

    df["name"] = df["name"].fillna("").astype(str).str.strip()
    df = df[df["name"]!=""].copy()

    for c in ALL_COLUMNS:
        df[c] = df[c].fillna("").astype(str).str.replace("\r\n","\n").str.replace("\r","\n").str.strip()

    seen = set()
    def ensure_id(val, idx):
        rid = (val or "").strip()
        if not rid:
            rid = f"sup-{idx+1:04d}"
        base = rid; k=1
        while rid in seen:
            rid = f"{base}-{k}"; k+=1
        seen.add(rid)
        return rid

    items=[]
    for i, row in df.iterrows():
        rec = {c: row.get(c,"") for c in ALL_COLUMNS}
        rec["id"] = ensure_id(rec["id"], i)
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
        })

    out = Path(args.out); out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)

    print(f"[OK] {len(items)} Einträge → {out}")

if __name__ == "__main__":
    main()
