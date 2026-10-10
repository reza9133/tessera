#!/usr/bin/env python3
"""Generate golden vectors from the Python contract for the JavaScript mirror.

    python3 tools/make_vectors.py
"""
import json
import os
import random
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from tests.harness import load_module  # noqa: E402

m = load_module()
rnd = random.Random(20260929)

decide = []
for _ in range(400):
    n = rnd.randint(1, 5)
    criteria = [{"id": "c%d" % (i + 1), "weight": rnd.randint(1, 5), "required": rnd.random() < 0.3} for i in range(n)]
    verdicts = {c["id"]: rnd.choice(["met", "met", "unmet", "unclear"]) for c in criteria}
    if rnd.random() < 0.1:
        verdicts.pop(criteria[0]["id"])
    if rnd.random() < 0.05:
        verdicts[criteria[-1]["id"]] = "banana"
    final = rnd.random() < 0.4
    got = m._decide(criteria, verdicts, final)
    decide.append({"criteria": criteria, "verdicts": verdicts, "final": final, "expect": got})

split = []
for _ in range(200):
    stake = rnd.choice([1, 2, 3, 7, 99, 10 ** 18, 10 ** 18 + 1, rnd.randrange(1, 10 ** 30)])
    bps = rnd.choice([0, 10000, 1, 9999, rnd.randint(0, 10000)])
    d, mk = m._split(stake, bps)
    split.append({"stake": str(stake), "bps": bps, "deliverer": str(d), "maker": str(mk)})

score = []
for _ in range(100):
    a = [rnd.randint(0, 6) for _ in range(4)]
    score.append({"in": a, "out": m._score(*a)})

urls = ["https://example.com/a", "http://example.com/a?b=1#c", "ftp://example.com/x", "example.com", "https://localhost/x",
        "https://127.0.0.1/x", "https://10.1.2.3/", "https://192.168.0.1/", "https://172.16.0.1/", "https://172.31.9.9/",
        "https://172.32.0.1/", "https://172.x.0.1/", "https://169.254.169.254/x", "https://a.local/x", "https://a.internal/",
        "https://intranet/x", "https://a b.com/", "https://[::1]/x", "https://0.0.0.0/", "https://user@127.0.0.1/x",
        "https://user:pw@example.com/x", "https://example.com:8080/x", "HTTPS://EXAMPLE.COM/A", "https://example.com/" + "a" * 400, "", "  https://example.com/pad  ",
        "https://0x7f.0.0.1/", "https://2130706433/", "https://0177.0.0.1/", "https://127.1/", "https://localhost./x",
        "https://app.localhost/x", "https://nas.lan/x", "https://100.64.0.1/", "https://100.128.0.1/", "https://224.0.0.1/",
        "https://1.1.1.1/", "https://8.8.8.8/dns", "https://10.example.com/x", "https://0.fm/x", "https://127.example.org/",
        "https://example.com./x", "https://999.1.1.1/", "https://[2001:db8::1]/x"]
urlv = []
for u in urls:
    try:
        m._check_url(u)
        urlv.append({"url": u, "ok": True})
    except m._Refusal as e:
        urlv.append({"url": u, "ok": False, "reason": str(e)})

crit = []
cases = [
    [{"type": "live"}], [{"type": "contains", "arg": "  Offline   mode "}], [{"type": "min_words", "arg": "0250"}],
    [{"type": "judge", "text": "  Clear   benefits explained "}], [{"type": "judge", "text": "hm"}], [{"type": "vibes"}],
    [{"type": "judge", "text": "Something clear", "weight": 0}], [{"type": "judge", "text": "Something clear", "weight": 9}],
    [{"type": "judge", "text": "Something clear", "weight": True}], [{"type": "judge", "text": "Something clear", "required": 1}],
    [{"type": "min_words", "arg": "many"}], [{"type": "contains"}], [], [{"type": "live"}] * 6,
    [{"type": "judge", "text": "x" * 300}], [{"type": "live", "text": "Custom live text", "weight": 5, "required": True}],
    [{"type": "contains", "arg": "قرارداد امضا شد"}], [{"type": "contains", "arg": "\u00a9"}], [{"type": "contains", "arg": "!!! ???"}],
    [{"type": "contains", "arg": "M\u00fcnchen"}], [{"type": "min_words", "arg": "\u00b2"}], [{"type": "min_words", "arg": "\u06f1\u06f0\u06f0"}],
    [{"type": "min_words", "arg": "\u0663"}], [{"type": "min_words", "arg": "20001"}], [{"type": "min_words", "arg": "20000"}],
]
for c in cases:
    try:
        crit.append({"in": c, "ok": True, "out": m._criteria(json.dumps(c))})
    except m._Refusal as e:
        crit.append({"in": c, "ok": False, "reason": str(e)})

phrases = ["Offline  mode", "  M\u00fcnchen, Germany! ", "\u0642\u0631\u0627\u0631\u062f\u0627\u062f \u0627\u0645\u0636\u0627 \u0634\u062f", "a_b-c", "\u00a9 2026", "", "   ",
           "\u65e5\u672c\u8a9e\u306e\u30c6\u30b9\u30c8", "Caf\u00e9\u2014au lait", "\u0661\u0662\u0663 and 456", "\u00b2\u00b3 squared"]
alnum = [{"in": t, "out": m._alnum(t)} for t in phrases]

out = {"decide": decide, "split": split, "score": score, "urls": urlv, "criteria": crit, "alnum": alnum}
path = os.path.join(ROOT, "tests", "vectors", "rules.json")
with open(path, "w", encoding="utf-8") as fh:
    json.dump(out, fh, indent=1, sort_keys=True)
print("wrote", path, {k: len(v) for k, v in out.items()})
