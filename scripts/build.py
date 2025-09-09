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

# ---------- Hilfsfunktionen ----------
def extract_pmid(s: str):
    if not s: return None
    m = re.search(r"/(\d{4,10})(?:/|\?|$)", s)
    return m.group(1) if m else None

def rss_pmids(url):
    d = feedparser.parse(url)
    status = getattr(d, "status", None)
    n = len(getattr(d, "entries", []))
    print(f"[rss] {url} -> status={status}, entries={n}")
    pmids = []
    for e in d.entries:
        candidates = []
        for k in ("id", "link"):
            v = e.get(k)
            if v: candidates.append(v)
        for ln in (e.get("links") or []):
            href = ln.get("href")
            if href: candidates.append(href)
        # fallback: manchmal steckt eine PMID in title/summary
        for k in ("title", "summary"):
            v = e.get(k)
            if v: candidates.append(v)

        found = None
        for c in candidates:
            # Bevorzugt echte PubMed-Links
            m = re.search(r"pubmed\.ncbi\.nlm\.nih\.gov/(\d{4,10})", c)
            if m:
                found = m.group(1); break
            # generischer Fallback: nackte Zahl (4–10 Ziffern)
            m = re.search(r"\b(\d{4,10})\b", c)
            if m:
                found = m.group(1); break

        if found:
            pmids.append(found)

    pmids = list(dict.fromkeys(pmids))
    print(f"[rss] extracted {len(pmids)} pmids (example: {pmids[:5]})")
    return pmids


def esummary(pmids):
    if not pmids: return {}
    url = f"{NCBI_BASE}/esummary.fcgi"
    p = {"db":"pubmed","id":",".join(pmids),"retmode":"json","tool":"oncology-digest","email":EMAIL}
    api_key = os.getenv("NCBI_API_KEY")  # optional via GitHub Secret
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
    if not csv_path: return {}
    path = os.path.join(ROOT, csv_path)
    if not os.path.exists(path) or os.path.getsize(path) == 0: return {}
    metric = {}
    try:
        import csv as _csv
        with open(path, newline='', encoding='utf-8') as fh:
            reader = _csv.DictReader(fh)
            if not reader.fieldnames or journal_col not in reader.fieldnames or value_col not in reader.fieldnames:
                return {}
            for row in reader:
                j = (row.get(journal_col) or "").strip().lower()
                v = (row.get(value_col) or "").strip()
                if not j or not v: continue
                try: metric[j] = float(v)
                except ValueError: continue
    except Exception:
        return {}
    return metric

# Entität grob
def classify_entity(title: str):
    t = (title or "").lower()
    if any(k in t for k in ["nsclc", "non-small cell", "non–small cell", "adenocarcinoma of the lung", "squamous cell carcinoma of the lung"]):
        return "NSCLC"
    if any(k in t for k in ["sclc", "small cell lung"]):
        return "SCLC"
    if "mesothelioma" in t: return "Mesothelioma"
    if any(k in t for k in ["thymoma", "thymic"]): return "Thymic"
    if any(k in t for k in ["lung", "pulmonary", "bronchial"]): return "Thoracic-other"
    return "Other"

# Trial-Typ (aus PubTypes + Titel)
def classify_trial(pubtypes, title: str):
    pt = set([p.lower() for p in (pubtypes or [])])
    if any("randomized controlled trial" in p for p in pt): return "RCT"
    if any("clinical trial, phase iii" in p for p in pt) or re.search(r'\bphase\s*iii\b', title or "", flags=re.I): return "Phase III"
    if any("clinical trial, phase ii" in p for p in pt) or re.search(r'\bphase\s*ii\b', title or "", flags=re.I): return "Phase II"
    if any("practice guideline" in p or p == "guideline" for p in pt): return "Guideline"
    if any(p == "review" or "systematic review" in p or "meta-analysis" in p for p in pt): return "Review/Meta"
    if any("prospective studies" in p for p in pt) or re.search(r'\bprospective\b', title or "", flags=re.I): return "Prospective (non-RCT)"
    return None

# Studienklasse für Farbcode
_PRECLIN_KW = ("preclinical", "xenograft", "syngeneic", "murine", "mouse", "mice", "rat", "zebrafish", "organoid", "in vitro", "in vivo", "cell line")
def classify_study_class(pubtypes, title: str, trial_type: str):
    pt = set([p.lower() for p in (pubtypes or [])])
    t = (title or "").lower()
    if trial_type in {"RCT", "Phase III", "Phase II", "Prospective (non-RCT)"}:
        return "Prospective"
    if any("practice guideline" in p or p == "guideline" for p in pt):
        return "Guideline"
    if any(p == "review" or "systematic review" in p or "meta-analysis" in p for p in pt):
        return "Review"
    if any(k in t for k in _PRECLIN_KW):
        return "Preclinical"
    return "Other"

# ---------- Pipeline ----------
def main():
    metric_map = load_metric_map(
        METRIC_CFG.get("csv_path"),
        METRIC_CFG.get("journal_col","Journal"),
        METRIC_CFG.get("value_col","SJR_2024")
    )
    metric_name = METRIC_CFG.get("name") or ("SJR" if metric_map else None)

    pmids = []
    for url in RSS_FEEDS:
        pmids.extend(rss_pmids(url))
    pmids = list(dict.fromkeys(pmids))

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

            entity     = classify_entity(title)
            trial_type = classify_trial(pubtypes, title)
            study_cls  = classify_study_class(pubtypes, title, trial_type or "")

            jkey = (journal or "").strip().lower()
            mval = metric_map.get(jkey)

            items.append({
                "pmid": uid,
                "doi": doi,
                "title": title,
                "journal": journal,
                "pubdate": pubdate_iso,
                "pubtypes": pubtypes,
                "entity": entity,
                "trial_type": trial_type,
                "study_class": study_cls,
                "is_oa": is_oa,
                "oa_url": oa_url,
                "metric_name": (metric_name if mval is not None else None),
                "metric_value": mval,
                "url_pubmed": f"https://pubmed.ncbi.nlm.nih.gov/{uid}/",
                "url_doi": f"https://doi.org/{doi}" if doi else None
            })
        time.sleep(0.34)

    seen = set(); out = []
    items.sort(key=lambda x: ((x.get("metric_value") if x.get("metric_value") is not None else -1),
                              (x.get("pubdate") or "")), reverse=True)
    for x in items:
        key = x["doi"] or x["pmid"] or ((x.get("title") or "") + (x.get("pubdate") or ""))
        if key in seen: continue
        seen.add(key)
        if x.get("pubdate") and not within_days(x["pubdate"]): continue
        out.append(x)

    os.makedirs(os.path.join(ROOT, "site"), exist_ok=True)
    with open(os.path.join(ROOT, "site", "data.json"), "w", encoding="utf-8") as f:
        json.dump({"generated": datetime.utcnow().isoformat() + "Z", "items": out}, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()

