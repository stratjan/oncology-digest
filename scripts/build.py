#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json, os, re, time, csv
from datetime import datetime, timedelta, timezone
import feedparser, requests
from dateutil import parser as dtp
import yaml

ROOT = os.path.dirname(os.path.dirname(__file__))
CFG_PATH = os.path.join(ROOT, "data", "config.yaml")

with open(CFG_PATH, "r", encoding="utf-8") as fh:
    CFG = yaml.safe_load(fh)

EMAIL      = CFG.get("contact_email", "example@example.com")
RSS_FEEDS  = CFG.get("rss_feeds", [])
DAYS_BACK  = int(CFG.get("days_back", 7))
METRIC_CFG = CFG.get("metric", {}) or {}

NCBI_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
HEADERS   = {"User-Agent": f"oncology-digest/1.0 ({EMAIL})"}

def extract_pmid(s: str):
    if not s: return None
    m = re.search(r"/(\d{4,10})(?:/|\?|$)", s)
    return m.group(1) if m else None

def rss_pmids(url):
    d = feedparser.parse(url)
    return [x for e in d.entries for x in [extract_pmid(e.get("id") or "") or extract_pmid(e.get("link") or "")] if x]

def esummary(pmids):
    if not pmids: return {}
    url = f"{NCBI_BASE}/esummary.fcgi"
    p = {"db":"pubmed","id":",".join(pmids),"retmode":"json","tool":"oncology-digest","email":EMAIL}
    # Optional: API Key -> in GitHub Secret NCBI_API_KEY speichern und hier aktivieren:
    api_key = os.getenv("NCBI_API_KEY")
    if api_key: p["api_key"] = api_key
    r = requests.get(url, params=p, headers=HEADERS, timeout=45)
    r.raise_for_status()
    return r.json().get("result", {})

def unpaywall(doi):
    if not doi: return None, None
    try:
        r = requests.get(f"https://api.unpaywall.org/v2/{doi}", params={"email": EMAIL}, headers=HEADERS, timeout=30)
        if r.status_code == 404: return False, None
        r.raise_for_status()
        j = r.json()
        return bool(j.get("is_oa")), (j.get("best_oa_location") or {}).get("url")
    except Exception:
        return None, None

def within_days(pubdate_iso):
    try:
        d = dtp.parse(pubdate_iso)
        if not d.tzinfo: d = d.replace(tzinfo=timezone.utc)
    except Exception:
        return True
    return d >= (datetime.now(timezone.utc) - timedelta(days=DAYS_BACK))

def load_metric_map(csv_path, journal_col="Journal", value_col="SJR_2024"):
    """Liest ein CSV robust ohne pandas. Gibt {journal_lower: float(value)} zurück."""
    if not csv_path:
        print("[metric] csv_path leer -> ohne Metrik")
        return {}
    path = os.path.join(ROOT, csv_path)
    if not os.path.exists(path):
        print(f"[metric] Datei nicht gefunden: {path} -> ohne Metrik")
        return {}
    size = os.path.getsize(path)
    if size == 0:
        print(f"[metric] Datei leer: {path} -> ohne Metrik")
        return {}
    metric = {}
    try:
        with open(path, newline='', encoding='utf-8') as fh:
            reader = csv.DictReader(fh)
            if not reader.fieldnames or journal_col not in reader.fieldnames or value_col not in reader.fieldnames:
                print(f"[metric] Spalten fehlen ({journal_col}, {value_col}); vorhanden: {reader.fieldnames}")
                return {}
            for row in reader:
                j = (row.get(journal_col) or "").strip().lower()
                v = (row.get(value_col) or "").strip()
                if not j or not v:
                    continue
                try:
                    metric[j] = float(v)
                except ValueError:
                    continue
    except Exception as e:
        print(f"[metric] CSV-Lesefehler: {e} -> ohne Metrik")
        return {}
    print(f"[metric] geladen: {len(metric)} Journale aus {path} ({size} bytes)")
    return metric

def main():
    # 0) Metric-Map laden
    metric_map = load_metric_map(
        METRIC_CFG.get("csv_path"),
        METRIC_CFG.get("journal_col","Journal"),
        METRIC_CFG.get("value_col","SJR_2024")
    )
    metric_name = METRIC_CFG.get("name") or ("SJR" if metric_map else None)

    # 1) PMIDs einsammeln
    pmids = []
    for url in RSS_FEEDS:
        pmids.extend(rss_pmids(url))
    pmids = list(dict.fromkeys(pmids))

    # 2) Metadaten holen
    items = []
    for i in range(0, len(pmids), 180):
        res = esummary(pmids[i:i+180]) or {}
        for uid in res.get("uids", []):
            it = res.get(uid, {})
            title   = it.get("title")
            journal = it.get("fulljournalname") or it.get("source")
            pt = it.get("pubtype")
            pubtypes = [x.get("text") if isinstance(x, dict) else str(x) for x in pt] if isinstance(pt, list) else ([str(pt)] if pt else [])
            pubdate = it.get("sortpubdate") or it.get("epubdate") or it.get("pubdate")
            try:
                pubdate_iso = dtp.parse(pubdate).astimezone(timezone.utc).isoformat()
            except Exception:
                pubdate_iso = pubdate
            doi = next((aid.get("value") for aid in it.get("articleids", []) if aid.get("idtype") == "doi"), None)
            is_oa, oa_url = unpaywall(doi)

            # Metrik lookup (case-insensitive)
            jkey = (journal or "").strip().lower()
            mval = metric_map.get(jkey)

            items.append({
                "pmid": uid,
                "doi": doi,
                "title": title,
                "journal": journal,
                "pubdate": pubdate_iso,
                "pubtypes": pubtypes,
                "is_oa": is_oa,
                "oa_url": oa_url,
                "metric_name": (metric_name if mval is not None else None),
                "metric_value": mval,
                "url_pubmed": f"https://pubmed.ncbi.nlm.nih.gov/{uid}/",
                "url_doi": f"https://doi.org/{doi}" if doi else None
            })
        time.sleep(0.34)  # NCBI courtesy

    # 3) Deduplikation & Filterung
    seen = set(); out = []
    # Sortiergrundlage: zuerst Metrik (desc, None=-1), dann Datum (desc)
    items.sort(key=lambda x: ((x.get("metric_value") if x.get("metric_value") is not None else -1),
                              (x.get("pubdate") or "")), reverse=True)
    for x in items:
        key = x["doi"] or x["pmid"] or ((x.get("title") or "") + (x.get("pubdate") or ""))
        if key in seen: 
            continue
        seen.add(key)
        if x.get("pubdate") and not within_days(x["pubdate"]):
            continue
        out.append(x)

    # 4) Schreiben
    os.makedirs(os.path.join(ROOT, "site"), exist_ok=True)
    with open(os.path.join(ROOT, "site", "data.json"), "w", encoding="utf-8") as f:
        json.dump({"generated": datetime.utcnow().isoformat() + "Z", "items": out}, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
