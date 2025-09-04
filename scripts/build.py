#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json, os, re, time
from datetime import datetime, timedelta, timezone
import feedparser, requests
from dateutil import parser as dtp
import yaml

ROOT = os.path.dirname(os.path.dirname(__file__))

# --- Config laden ---
CFG_PATH = os.path.join(ROOT, "data", "config.yaml")
with open(CFG_PATH, "r", encoding="utf-8") as fh:
    CFG = yaml.safe_load(fh)

EMAIL     = CFG.get("contact_email", "example@example.com")
RSS_FEEDS = CFG.get("rss_feeds", [])
DAYS_BACK = int(CFG.get("days_back", 7))  # großzügig zum Start

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
    if not pmids: return {}
    ids = ",".join(pmids)
    url = f"{NCBI_BASE}/esummary.fcgi"
    p = {"db":"pubmed","id":ids,"retmode":"json","tool":"oncology-digest","email":EMAIL}
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

def within_days(pubdate_iso):
    try:
        d = dtp.parse(pubdate_iso)
        if not d.tzinfo:
            d = d.replace(tzinfo=timezone.utc)
    except Exception:
        return True
    return d >= (datetime.now(timezone.utc) - timedelta(days=DAYS_BACK))

def main():
    # 1) PMIDs aus allen RSS sammeln
    pmids = []
    for url in RSS_FEEDS:
        pmids.extend(rss_pmids(url))
    pmids = list(dict.fromkeys(pmids))  # uniq

    # 2) Metadaten holen (ESummary), OA prüfen
    items = []
    BATCH = 180
    for i in range(0, len(pmids), BATCH):
        chunk = pmids[i:i+BATCH]
        res = esummary(chunk) or {}
        for uid in res.get("uids", []):
            it = res.get(uid, {})
            title   = it.get("title")
            journal = it.get("fulljournalname") or it.get("source")
            # Publikationstypen
            pubtypes = []
            pt = it.get("pubtype")
            if isinstance(pt, list):
                pubtypes = [x.get("text") if isinstance(x, dict) else str(x) for x in pt]
            elif pt:
                pubtypes = [str(pt)]
            # Datum
            pubdate = it.get("sortpubdate") or it.get("epubdate") or it.get("pubdate")
            try:
                pubdate_iso = dtp.parse(pubdate).astimezone(timezone.utc).isoformat()
            except Exception:
                pubdate_iso = pubdate
            # DOI
            doi = None
            for aid in it.get("articleids", []):
                if aid.get("idtype") == "doi":
                    doi = aid.get("value"); break
            # OA
            is_oa, oa_url = unpaywall(doi)

            items.append({
                "pmid": uid,
                "doi": doi,
                "title": title,
                "journal": journal,
                "pubdate": pubdate_iso,
                "pubtypes": pubtypes,
                "is_oa": is_oa,
                "oa_url": oa_url,
                "metric_name": None,
                "metric_value": None,
                "url_pubmed": f"https://pubmed.ncbi.nlm.nih.gov/{uid}/",
                "url_doi": f"https://doi.org/{doi}" if doi else None
            })
        time.sleep(0.34)  # NCBI courtesy

    # 3) Deduplikation & Zeitfilter
    seen = set(); out = []
    # Sortiere zunächst nach Datum absteigend
    items.sort(key=lambda x: x.get("pubdate") or "", reverse=True)
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
