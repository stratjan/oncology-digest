#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json, os, re, time, csv
from datetime import datetime, timedelta, timezone
import feedparser, requests
from dateutil import parser as dtp
import xml.etree.ElementTree as ET
import yaml

ROOT = os.path.dirname(os.path.dirname(__file__))
CFG_PATH = os.path.join(ROOT, "data", "config.yaml")
with open(CFG_PATH, "r", encoding="utf-8") as fh:
    CFG = yaml.safe_load(fh)

EMAIL        = CFG.get("contact_email", "example@example.com")
DAYS_BACK    = int(CFG.get("days_back", 7))
INCL_ABS     = bool(CFG.get("include_abstracts", True))
METRIC_CFG   = CFG.get("metric", {}) or {}
RSS_GROUPS   = CFG.get("rss_groups") or []
RSS_FEEDS    = CFG.get("rss_feeds") or []  # Fallback falls keine Gruppen

NCBI_BASE  = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
HEADERS    = {"User-Agent": f"oncology-digest/1.0 ({EMAIL})"}

# ------------------- Utils -------------------
def extract_pmid_from_str(s: str):
    if not s: return None
    # Bevorzugt echte PubMed-Links
    m = re.search(r"pubmed\.ncbi\.nlm\.nih\.gov/(\d{4,10})", s)
    if m: return m.group(1)
    # generischer Fallback: nackte Zahl (4–10 Ziffern)
    m = re.search(r"\b(\d{4,10})\b", s)
    return m.group(1) if m else None

def rss_pmids(url):
    d = feedparser.parse(url)
    status = getattr(d, "status", None)
    n = len(getattr(d, "entries", []))
    print(f"[rss] {url} -> status={status}, entries={n}")
    pmids = []
    for e in d.entries:
        candidates = []
        for k in ("id", "link", "title", "summary"):
            v = e.get(k)
            if v: candidates.append(v)
        for ln in (e.get("links") or []):
            href = ln.get("href")
            if href: candidates.append(href)
        found = None
        for c in candidates:
            found = extract_pmid_from_str(c)
            if found: break
        if found:
            pmids.append(found)
    pmids = list(dict.fromkeys(pmids))
    print(f"[rss] extracted {len(pmids)} pmids (example: {pmids[:5]})")
    return pmids

def esummary(pmids):
    if not pmids: return {}
    p = {"db":"pubmed","id":",".join(pmids),"retmode":"json","tool":"oncology-digest","email":EMAIL}
    api_key = os.getenv("NCBI_API_KEY")
    if api_key: p["api_key"] = api_key
    r = requests.get(f"{NCBI_BASE}/esummary.fcgi", params=p, headers=HEADERS, timeout=45)
    r.raise_for_status()
    return r.json().get("result", {})

def efetch_abstracts(pmids):
    """Liefert {pmid: 'Abstract ...'} über EFetch (XML)."""
    out = {}
    if not pmids: return out
    api_key = os.getenv("NCBI_API_KEY")
    for i in range(0, len(pmids), 180):
        chunk = pmids[i:i+180]
        p = {"db":"pubmed","id":",".join(chunk),"retmode":"xml","tool":"oncology-digest","email":EMAIL}
        if api_key: p["api_key"] = api_key
        r = requests.get(f"{NCBI_BASE}/efetch.fcgi", params=p, headers=HEADERS, timeout=60)
        r.raise_for_status()
        try:
            root = ET.fromstring(r.text)
            for art in root.findall(".//PubmedArticle"):
                pmid = (art.findtext(".//MedlineCitation/PMID") or "").strip()
                abs_nodes = art.findall(".//Abstract/AbstractText")
                parts = []
                for n in abs_nodes:
                    label = (n.attrib.get('Label') or '').strip()
                    txt = (n.text or '').strip()
                    if not txt: continue
                    parts.append(f"{label}: {txt}" if label else txt)
                if pmid and parts:
                    out[pmid] = "\n\n".join(parts)
        except Exception:
            pass
        time.sleep(0.34)
    return out

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
        with open(path, newline='', encoding='utf-8') as fh:
            reader = csv.DictReader(fh)
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

# ------------------- Klassifikation -------------------
def classify_entity(title: str):
    t = (title or "").lower()
    if any(k in t for k in ["nsclc", "non-small cell", "non–small cell", "adenocarcinoma of the lung", "squamous cell carcinoma of the lung"]):
        return "NSCLC"
    if any(k in t for k in ["sclc", "small cell lung"]): return "SCLC"
    if "mesothelioma" in t: return "Mesothelioma"
    if any(k in t for k in ["thymoma", "thymic"]): return "Thymic"
    if any(k in t for k in ["lung", "pulmonary", "bronchial"]): return "Thoracic-other"
    return "Other"

def classify_trial(pubtypes, title: str):
    pt = set([p.lower() for p in (pubtypes or [])])
    if any("randomized controlled trial" in p for p in pt): return "RCT"
    if any("clinical trial, phase iii" in p for p in pt) or re.search(r'\bphase\s*iii\b', title or "", flags=re.I): return "Phase III"
    if any("clinical trial, phase ii" in p for p in pt) or re.search(r'\bphase\s*ii\b', title or "", flags=re.I): return "Phase II"
    if any("practice guideline" in p or p == "guideline" for p in pt): return "Guideline"
    if any(p == "review" or "systematic review" in p or "meta-analysis" in p for p in pt): return "Review/Meta"
    if any("prospective studies" in p for p in pt) or re.search(r'\bprospective\b', title or "", flags=re.I): return "Prospective (non-RCT)"
    return None

_PRECLIN_KW = ("preclinical","xenograft","syngeneic","murine","mouse","mice","rat","zebrafish","organoid","in vitro","in vivo","cell line")
def classify_study_class(pubtypes, title: str, trial_type: str):
    pt = set([p.lower() for p in (pubtypes or [])])
    t = (title or "").lower()
    if trial_type in {"RCT","Phase III","Phase II","Prospective (non-RCT)"}: return "Prospective"
    if any("practice guideline" in p or p == "guideline" for p in pt): return "Guideline"
    if any(p == "review" or "systematic review" in p or "meta-analysis" in p for p in pt): return "Review"
    if any(k in t for k in _PRECLIN_KW): return "Preclinical"
    return "Other"

# ------------------- Pipeline -------------------
def build_section(feeds, metric_map, metric_name):
    print(f"[cfg] section feeds={len(feeds)} days_back={DAYS_BACK}")
    pmids = []
    for url in feeds:
        pmids.extend(rss_pmids(url))
    pmids = list(dict.fromkeys(pmids))
    print(f"[sum] total pmids collected = {len(pmids)}")

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
                "url_doi": f"https://doi.org/{doi}" if doi else None,
                "abstract": None
            })
        time.sleep(0.34)

    print(f"[sum] items before date filter = {len(items)}")

    # Abstracts (optional)
    if INCL_ABS and items:
        amap = efetch_abstracts([x["pmid"] for x in items])
        for x in items:
            if x["pmid"] in amap:
                x["abstract"] = amap[x["pmid"]]

    # Dedupe / Filter / Sort
    seen = set(); out = []
    items.sort(key=lambda x: ((x.get("metric_value") if x.get("metric_value") is not None else -1),
                              (x.get("pubdate") or "")), reverse=True)
    for x in items:
        key = x["doi"] or x["pmid"] or ((x.get("title") or "") + (x.get("pubdate") or ""))
        if key in seen: continue
        seen.add(key)
        if x.get("pubdate") and not within_days(x["pubdate"]): continue
        out.append(x)

    print(f"[sum] items after date filter = {len(out)}")
    return out

def main():
    # Metrik laden
    metric_map = load_metric_map(
        METRIC_CFG.get("csv_path"),
        METRIC_CFG.get("journal_col","Journal"),
        METRIC_CFG.get("value_col","SJR_2024")
    )
    metric_name = METRIC_CFG.get("name") or ("SJR" if metric_map else None)

    # Feeds bestimmen
    groups = []
    if RSS_GROUPS:
        for g in RSS_GROUPS:
            key = g.get("key")
            feeds = g.get("feeds") or []
            label = g.get("label") or key or "group"
            if not key or not feeds: 
                print(f"[cfg] skip group without key/feeds: {g}")
                continue
            groups.append({"key": key, "label": label, "feeds": feeds})
        print(f"[cfg] using rss_groups: {', '.join([x['key'] for x in groups])}")
    elif RSS_FEEDS:
        print(f"[cfg] using legacy rss_feeds (n={len(RSS_FEEDS)})")
        groups.append({"key": "all", "label": "All feeds", "feeds": RSS_FEEDS})
    else:
        print(f"[cfg] no feeds configured; days_back={DAYS_BACK}")
        groups = []

    if not groups:
        # Leere data.json schreiben, damit Frontend nicht 404t
        os.makedirs(os.path.join(ROOT, "site"), exist_ok=True)
        with open(os.path.join(ROOT, "site", "data.json"), "w", encoding="utf-8") as f:
            json.dump({"generated": datetime.utcnow().isoformat() + "Z", "items": []}, f, ensure_ascii=False, indent=2)
        return

    # 1) Main data.json = erste Gruppe (bei dir: lc)
    main_group = groups[0]
    print(f"[cfg] main group = {main_group['key']} ({len(main_group['feeds'])} feeds)")
    items_main = build_section(main_group["feeds"], metric_map, metric_name)
    os.makedirs(os.path.join(ROOT, "site"), exist_ok=True)
    with open(os.path.join(ROOT, "site", "data.json"), "w", encoding="utf-8") as f:
        json.dump({"generated": datetime.utcnow().isoformat() + "Z", "items": items_main}, f, ensure_ascii=False, indent=2)

    # 2) Optionale Zusatz-Dateien je Gruppe (für spätere Unterseiten)
    for g in groups[1:]:
        items = build_section(g["feeds"], metric_map, metric_name)
        subdir = os.path.join(ROOT, "site", g["key"])
        os.makedirs(subdir, exist_ok=True)
        with open(os.path.join(subdir, "data.json"), "w", encoding="utf-8") as f:
            json.dump({"generated": datetime.utcnow().isoformat() + "Z", "items": items}, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()
