#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json, os, re, time
from datetime import datetime, timedelta, timezone
import feedparser, requests, pandas as pd
from dateutil import parser as dtp
import yaml

# --- Pfade & Config laden ---
ROOT = os.path.dirname(os.path.dirname(__file__))
CFG  = yaml.safe_load(open(os.path.join(ROOT, "data", "config.yaml"), "r", encoding="utf-8"))

EMAIL       = CFG.get("contact_email", "example@example.com")
RSS_FEEDS   = CFG.get("rss_feeds", [])
DAYS_BACK   = int(CFG.get("days_back", 2))
METRIC_CFG  = CFG.get("metric", {}) or {}

SJR_PATH    = METRIC_CFG.get("csv_path")
METRIC_NAME = METRIC_CFG.get("name", "SJR")
JOURNAL_COL = METRIC_CFG.get("journal_col", "Journal")
VALUE_COL   = METRIC_CFG.get("value_col", "SJR_2024")

NCBI_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
HEADERS   = {"User-Agent": f"oncology-digest/1.0 ({EMAIL})"}

def extract_pmid(s: str):
    if not s: return None
    m = re.search(r"/(\d{4,10})(?:/|\?|$)", s)
    return m.group(1) if m else None

def rss_pmids(url):
    d = feedparser.parse(url)
    pmids = []
    for e in d.entries:
        cand = extract_pmid(e.get("id") or "") or extract_pmid(e.get("link") or "")
        if cand: pmids.append(cand)
    return pmids

def esummary(pmids):
    if not pmids: return None
    ids = ",".join(pmids)
    url = f"{NCBI_BASE}/esummary.fcgi"
    p = {"db": "pubmed", "id": ids, "retmode": "json", "tool": "oncology-digest", "email": EMAIL}
    r = requests.get(url, params=p, headers=HEADERS, timeout=45)
    r.raise_for_status()
    return r.json().get("result", {})

def unpaywall(doi):
    if not doi: return None, None
    try:
        url = f"https://api.unpaywall.org/v2/{doi}"
        r = requests.get(url, params={"email": EMAIL}, headers=HEADERS, timeout=30)
        if r.status_code == 404: return False, None
        r.raise_for_status()
        j = r.json()
        return bool(j.get("is_oa")), (j.get("best_oa_location") or {}).get("url")
    except Exception:
        return None, None

def load_metric_map():
    path = os.path.join(ROOT, SJR_PATH) if SJR_PATH else None
    # Wenn kein Pfad, Datei fehlt oder ist leer -> ohne Metrik weitermachen
    if not path or not os.path.exists(path) or os.path.getsize(path) == 0:
        return {}
    try:
        df = pd.read_csv(path)
    except pd.errors.EmptyDataError:
        return {}
    except Exception as e:
        print(f"[metric] CSV konnte nicht gelesen werden ({e}); fahre ohne Metrik fort")
        return {}
    # Spalten prüfen
    if JOURNAL_COL not in df.columns or VALUE_COL not in df.columns:
        print(f"[metric] Spalten '{JOURNAL_COL}' oder '{VALUE_COL}' fehlen; ohne Metrik")
        return {}
    df[JOURNAL_COL] = df[JOURNAL_COL].astype(str).str.strip().str.lower()
    metric = dict(zip(df[JOURNAL_COL], df[VALUE_COL]))
    return metric

def norm_journal(name: str) -> str:
    return (name or "").strip().lower()

def within_days(pubdate_iso):
    try:
        d = dtp.parse(pubdate_iso)
        if not d.tzinfo:
            d = d.replace(tzinfo=timezone.utc)
    except Exception:
        return True
    return d >= (datetime.now(timezone.utc) - timedelta(days=DAYS_BACK))

def main():
    # 1) PMIDs einsammeln
    pmids = []
    for url in RSS_FEEDS:
        pmids.extend(rss_pmids(url))
    pmids = list(dict.fromkeys(pmids))  # uniq, order-preserving

    # 2) ESummary in Batches
    metric_map = load_metric_map()
    items = []
    BATCH = 180
    for i in range(0, len(pmids), BATCH):
        chunk = pmids[i:i+BATCH]
        res = esummary(chunk) or {}
        for uid in res.get("uids", []):
            it = res.get(uid, {})
            title   = it.get("title")
            journal = it.get("fulljournalname") or it.get("source")
            pubtypes = []
            pt = it.get("pubtype")
            if isinstance(pt, list):
                pubtypes = [x.get("text") if isinstance(x, dict) else str(x) for x in pt]
            elif pt:
                pubtypes = [str(pt)]
            pubdate = it.get("sortpubdate") or it.get("epubdate") or it.get("pubdate")
            pubdate_iso = None
            try:
                pubdate_iso = dtp.parse(pubdate).astimezone(timezone.utc).isoformat()
            except Exception:
                pubdate_iso = pubdate

            # DOI extrahieren
            doi = None
            for aid in it.get("articleids", []):
                if aid.get("idtype") == "doi":
                    doi = aid.get("value"); break

            # OA prüfen
            is_oa, oa_url = unpaywall(doi)

            # Metrik lookup
            mval = metric_map.get(norm_journal(journal))
            try:
                mval = float(mval) if mval not in (None, "", "NA") else None
            except Exception:
                mval = None

            items.append({
                "pmid": uid,
                "doi": doi,
                "title": title,
                "journal": journal,
                "pubdate": pubdate_iso,
                "pubtypes": pubtypes,
                "is_oa": is_oa,
                "oa_url": oa_url,
                "metric_name": METRIC_NAME if mval is not None else None,
                "metric_value": mval,
                "url_pubmed": f"https://pubmed.ncbi.nlm.nih.gov/{uid}/",
                "url_doi": f"https://doi.org/{doi}" if doi else None
            })

        # NCBI courtesy limit ~3 req/s
        time.sleep(0.34)

    # 3) Deduplikation und Filter (nur neue)
    seen = set(); out = []
    # Vor-Sortierung nach Metrik, dann Datum
    items.sort(key=lambda x: (x.get("metric_value") or -1, x.get("pubdate") or ""), reverse=True)
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

