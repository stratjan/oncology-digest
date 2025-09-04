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
    pmids = list(dict.fromkeys(pmids)
