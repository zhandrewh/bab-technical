"""Backtest: does a sealed-FCA "election to intervene for purposes of settlement" notice predict a DOJ settlement release?

Treatment: CourtListener RECAP docket entries matching an intervene-for-settlement notice in a False Claims Act case.
Control:   notices of election to *decline* intervention (the reference base rate p0 a random basket would see).
Outcome:   a justice.gov press release with "False Claims" in the title, whose title names the defendant (word-boundary
           match on a distinctive caption token), dated 0..60 days after the notice.

Writes:
  research/fca-baseline.json   per-item hit rates (treatment + control) at 30/60 days; the app's p0 comes from here
  research/fca-pairs.json      every treatment notice with its docket citation and matched release (replay baskets)

Usage: python3 research/backtest-fca.py      (keyless; ~5 minutes; polite to both APIs)
"""
import datetime as dt
import json
import os
import re
import statistics
import sys
import time
import urllib.parse
import urllib.request

OUT = os.path.dirname(os.path.abspath(__file__))
UA = {"User-Agent": "verity-research/0.2"}
WINDOW = 60


def get(url):
    for i in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                return json.loads(r.read())
        except Exception as e:  # noqa: BLE001
            print(f"  retry {i + 1}: {e}", file=sys.stderr)
            time.sleep(2 + i * 3)
    raise RuntimeError(url)


# ---- resolver corpus: DOJ FCA press releases
doj = []
for page in range(40):
    d = get(
        "https://www.justice.gov/api/v1/press_releases.json?pagesize=50&page=%d&sort=date&direction=DESC"
        "&parameters%%5Btitle%%5D=False%%20Claims" % page
    )
    doj += d["results"]
    if not d["results"]:
        break
for x in doj:
    x["d"] = dt.date.fromtimestamp(int(x["date"]))
doj.sort(key=lambda x: x["d"], reverse=True)
print(f"doj releases {len(doj)} range {doj[-1]['d']} -> {doj[0]['d']}", file=sys.stderr)

# ---- matching rules: app/lib/fca-stoplist.json is shared with the resolver (app/lib/fca.ts)
_SL = json.load(open(os.path.join(OUT, "..", "app", "lib", "fca-stoplist.json")))
STOP = set(_SL["boilerplate"])
GENERIC = set(_SL["generic"]) | STOP


def defendant_side(case):
    parts = re.split(r"\bv\.?s?\.?\b", case, maxsplit=1, flags=re.I)
    side = parts[1] if len(parts) > 1 else case
    if re.search(r"united states|usa|america", side, re.I):
        side = parts[0]
    return side


def match_terms(case):
    toks = [t for t in re.findall(r"[A-Za-z][A-Za-z'&-]{2,}", defendant_side(case)) if t.lower() not in STOP]
    return [t for t in toks if len(t) >= 6 and t.lower() not in GENERIC][:2]


def cl(q, pages):
    out = []
    url = "https://www.courtlistener.com/api/rest/v4/search/?" + urllib.parse.urlencode(
        {"type": "r", "q": q, "order_by": "entry_date_filed desc"}
    )
    for _ in range(pages):
        d = get(url)
        out += d["results"]
        url = d.get("next")
        if not url:
            break
        time.sleep(1)
    return out


def notice_entry(res, pat):
    docs = [
        rd
        for rd in (res.get("recap_documents") or [])
        if rd.get("entry_date_filed") and re.search(pat, (rd.get("description") or "") + (rd.get("short_description") or ""), re.I)
    ]
    return min(docs, key=lambda rd: rd["entry_date_filed"]) if docs else None


def run(label, q, pat, pages):
    rows = cl(q, pages)
    last = doj[0]["d"]
    items, lags, before = [], [], 0
    for r in rows:
        e = notice_entry(r, pat)
        terms = match_terms(r.get("caseName", ""))
        if not e or not terms:
            continue
        nd = dt.date.fromisoformat(e["entry_date_filed"][:10])
        if (last - nd).days < WINDOW or nd < doj[-1]["d"]:
            continue  # need a full observation window inside the corpus
        pats = [re.compile(r"\b" + re.escape(t) + r"\b", re.I) for t in terms]
        named = lambda x: any(p.search(x["title"]) for p in pats)  # noqa: E731
        if any(-120 <= (x["d"] - nd).days < 0 and named(x) for x in doj):
            before += 1
        match = sorted((x for x in doj if 0 < (x["d"] - nd).days <= WINDOW and named(x)), key=lambda x: x["d"])
        hit = match[0] if match else None
        if hit:
            lags.append((hit["d"] - nd).days)
        items.append(
            {
                "caseName": r.get("caseName"),
                "defendant": defendant_side(r.get("caseName", "")).strip(" ,.")[:120],
                "matchTerms": terms,
                "court": r.get("court") or r.get("court_id"),
                "docketId": r.get("docket_id"),
                "docketNumber": r.get("docketNumber"),
                "entryDate": str(nd),
                "entryText": ((e.get("description") or e.get("short_description") or "")[:400]).strip(),
                "courtlistenerURL": "https://www.courtlistener.com" + (r.get("docket_absolute_url") or f"/docket/{r.get('docket_id')}/"),
                "hit": bool(hit),
                "lagDays": (hit["d"] - nd).days if hit else None,
                "release": {"title": hit["title"], "date": str(hit["d"]), "url": hit["url"]} if hit else None,
            }
        )
    n = len(items)
    h30 = sum(1 for i in items if i["hit"] and i["lagDays"] <= 30)
    h60 = sum(1 for i in items if i["hit"])
    print(f"\n== {label}: n={n}  30d {h30}/{n}  60d {h60}/{n}  before-notice {before}", file=sys.stderr)
    if lags:
        print(f"   lag median {statistics.median(lags)} range {min(lags)}-{max(lags)}", file=sys.stderr)
    return {
        "n": n,
        "hits30": h30,
        "hits60": h60,
        "p30": h30 / n if n else None,
        "p60": h60 / n if n else None,
        "lagMedian": statistics.median(lags) if lags else None,
        "lagRange": [min(lags), max(lags)] if lags else None,
        "announcedBefore": before,
        "dateRange": [min(i["entryDate"] for i in items), max(i["entryDate"] for i in items)] if items else None,
    }, items


treat, treat_items = run(
    "INTERVENE FOR SETTLEMENT",
    '("purposes of settlement" OR "settlement purposes") AND "intervene" AND "False Claims"',
    r"settlement",
    10,
)
ctrl, _ = run("DECLINE (control)", '"election to decline" AND "False Claims"', r"decline", 10)

baseline = {
    "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    "windowDays": WINDOW,
    "method": (
        "CourtListener RECAP notices -> justice.gov press releases with 'False Claims' in the title whose title names a "
        "distinctive caption token (>=6 chars, not generic) 1..60 days after the notice. Title-only matching; a floor."
    ),
    "dojCorpus": {"n": len(doj), "range": [str(doj[-1]["d"]), str(doj[0]["d"])]},
    "treatment": treat,
    "control": ctrl,
}
with open(os.path.join(OUT, "fca-baseline.json"), "w") as f:
    json.dump(baseline, f, indent=2)
with open(os.path.join(OUT, "fca-pairs.json"), "w") as f:
    json.dump(treat_items, f, indent=2)
print(json.dumps({k: baseline[k] for k in ("treatment", "control")}, indent=2))
