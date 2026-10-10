#!/usr/bin/env python3
"""Mutation testing for the contract.

Each mutant breaks one rule on purpose. The test suite must notice. A mutant
that survives means a rule that nothing checks.

    python3 tools/mutate.py            # run all, print a table, exit 1 if any survive
    python3 tools/mutate.py --write    # also write tests/MUTATIONS.md
"""

import os
import subprocess
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "contracts", "tessera.py")

# (name, old, new, which occurrence to replace: 0 = first)
MUTANTS = [
    ("min_words is inclusive", 'len(corpus.split()) >= int(criterion["arg"])', 'len(corpus.split()) > int(criterion["arg"])', 0),
    ("payout uses basis points", 'to_deliverer = stake * bps // 10000', 'to_deliverer = stake * bps // 1000', 0),
    ("split conserves the stake", 'return to_deliverer, stake - to_deliverer', 'return to_deliverer, stake - to_deliverer - 1', 0),
    ("required criterion breaches", '        elif c["required"]:\n            required_failed = True', '        elif False:\n            required_failed = True', 0),
    ("final hearing: unclear is unmet", 'if final_round and v == UNCLEAR:', 'if False and v == UNCLEAR:', 0),
    ("unclear asks for evidence", '    elif unclear > 0:', '    elif False:', 0),
    ("partial is proportional to weight", 'met * 10000 // total', 'met * 100 // total', 0),
    ("fence replaces both brackets", '.replace("<", "(").replace(">", ")")', '.replace("<", "(")', 0),
    ("two orders must agree", 'verdicts[cid] = a[0] if a[0] == b[0] else UNCLEAR', 'verdicts[cid] = a[0]', 0),
    ("second asking is really reversed", 'parts[4], parts[5] = parts[5], parts[4]', 'pass', 0),
    ("verdict words are reversed too", '        words.reverse()', '        pass', 0),
    ("validator compares verdicts", 'return json.loads(leader_json)["verdicts"] == json.loads(mine_json)["verdicts"]', 'return True', 0),
    ("maker cannot accept own pact", 'if me == _hex(p.maker).lower():', 'if False:', 0),
    ("only maker cancels", 'if self._me() != _hex(p.maker).lower():', 'if False:', 0),
    ("only deliverer submits", 'if me != _hex(p.deliverer).lower():', 'if False:', 0),
    ("only a standing ruling is contested", 'if p.status != S_RULED:\n                _fail("only a standing ruling can be contested")', 'if False:\n                _fail("only a standing ruling can be contested")', 0),
    ("only a standing ruling is settled", 'if p.status != S_RULED:\n                _fail("there is no standing ruling to settle")', 'if False:\n                _fail("there is no standing ruling to settle")', 0),
    ("refusal returns funds", '        if refund > 0:\n            _pay(who, refund)', '        if False:\n            _pay(who, refund)', 0),
    ("no zero-value transfers", '    if amount > 0:\n        _Recipient', '    if amount >= 0:\n        _Recipient', 0),
    ("contest window gates settlement", 'window_over = hours == 0 or (now > 0 and int(p.ruled_ts) > 0 and now >= int(p.ruled_ts) + hours * 3600)', 'window_over = True', 0),
    ("final hearing settles at once", 'final = int(p.rounds) >= MAX_ROUNDS', 'final = False', 0),
    ("contest window closes", 'if now > 0 and int(p.ruled_ts) > 0 and now >= int(p.ruled_ts) + int(p.contest_hours) * 3600:', 'if False:', 0),
    ("contest needs a window", 'if int(p.contest_hours) == 0:', 'if False:', 0),
    ("deadline gates expiry", '            if self._evidence_open(p, now):', '            if False:', 0),
    ("needs_evidence has a grace period", 'limit = max(deadline, int(p.ruled_ts) + GRACE_DAYS * DAY)', 'limit = deadline', 0),
    ("late hearings are open to anyone", 'if not (is_party or late):', 'if False:', 0),
    ("final hearing is final", 'if round_no > MAX_ROUNDS:', 'if False:', 0),
    ("needs_evidence keeps the pact open", 'p.status = S_NEEDS if decision["outcome"] == OUT_NEEDS else S_RULED', 'p.status = S_RULED', 0),
    ("private hosts refused", 'a in (0, 10, 127)', 'a in (0, 11, 127)', 0),
    ("link-local hosts refused", '(a == 169 and b == 254)', '(a == 169 and b == 255)', 0),
    ("weights must be real ints", 'if type(weight) is not int or not (1 <= weight <= MAX_WEIGHT):', 'if not (1 <= weight <= MAX_WEIGHT):', 0),
    ("duplicate links refused", 'if any(e["url"].lower() == url.lower() for e in evidence):', 'if False:', 0),
    ("evidence is capped", 'if len(evidence) >= MAX_EVIDENCE:', 'if False:', 0),
    ("standing: partial counts half", '(fulfilled * 100 + partial * 50) // decided', '(fulfilled * 100 + partial * 100) // decided', 0),
    ("earnings recorded", 'd.earned = u256(int(d.earned) + to_deliverer)', 'd.earned = u256(int(d.earned) + to_maker)', 0),
    ("volume recorded", 'self.volume = u256(int(self.volume) + stake)', 'self.volume = u256(int(self.volume) + 0)', 0),
    ("refusal ledger counts", 'self.refusal_seq = u64(int(self.refusal_seq) + 1)', 'self.refusal_seq = u64(int(self.refusal_seq) + 0)', 0),
    ("list filter works", 'if wanted not in STATUSES or p.status == wanted:', 'if True:', 0),
    ("accept respects the deadline", 'if now > 0 and int(p.deadline_ts) > 0 and now > int(p.deadline_ts):', 'if False:', 0),
    ("unreachable is not missing", 'return UNCLEAR if any(d["status"] == 0 for d in docs) else MET', 'return MET', 0),
    ("blind judge is unclear when the net is down", 'blind = UNCLEAR if any(d["status"] == 0 for d in docs) else UNMET', 'blind = UNMET', 0),
    ("only 200 pages are read", '        if status == 200:\n            text = _html_to_text', '        if True:\n            text = _html_to_text', 0),
    ("century rule in the calendar", 'yoe // 4 - yoe // 100 + doy', 'yoe // 4 + doy', 0),
    ("every fragment of a quote must occur", 'return all(_alnum(f) in corpus_alnum for f in fragments)', 'return any(_alnum(f) in corpus_alnum for f in fragments)', 0),
    ("unreadable clock keeps evidence open", 'if now <= 0 or deadline <= 0:\n            return True', 'if False:\n            return True', 0),
    ("cancel returns the escrow", '            p.status = S_CANCELLED\n            p.to_maker = u256(stake)\n            p.settled_ts = u64(_now_ts())\n            _pay(_hex(p.maker), stake)', '            p.status = S_CANCELLED\n            p.to_maker = u256(stake)\n            p.settled_ts = u64(_now_ts())', 0),
    ("expiry returns the escrow", '            m.refunded = u256(int(m.refunded) + stake)\n            _pay(_hex(p.maker), stake)', '            m.refunded = u256(int(m.refunded) + stake)', 0),
    ("no-shows are recorded", 'd.expired = u32(int(d.expired) + 1)', 'd.expired = u32(int(d.expired) + 0)', 0),
    ("hearing count", 'self.hearings = u32(int(self.hearings) + 1)', 'self.hearings = u32(int(self.hearings) + 0)', 0),
    ("terms are fenced", '"AGREEMENT (context, also written by a party): " + _fence(terms)', '"AGREEMENT (context, also written by a party): " + terms', 0),
    ("document urls are fenced", '_fence(doc["url"])', 'doc["url"]', 0),
    ("criteria text is fenced", '_fence(c["text"]) for c in ordered', 'c["text"] for c in ordered', 0),
    ("script tags are stripped", '(script|style|noscript|template)', '(style|noscript|template)', 0),
    ("total prompt budget", 'share = min(DOC_CHARS, TOTAL_DOC_CHARS // max(1, readable))', 'share = DOC_CHARS', 0),
    ("phrases of any script are folded, not erased", 're.sub(r"[\\W_]+", " ", text.lower())', 're.sub(r"[^a-z0-9]+", " ", text.lower())', 0),
    ("a phrase needs a letter or digit", 'if not _alnum(arg):', 'if False:', 0),
    ("only ascii digits are a number of words", 'if not (arg.isascii() and arg.isdigit())', 'if not arg.isdigit()', 0),
    ("nothing strands the escrow", '        except Exception:\n            if created:', '        except ZeroDivisionError:\n            if created:', 0),
    ("code criteria read the deliverer only", 'verdicts[c["id"]] = _code_verdict(c, own)', 'verdicts[c["id"]] = _code_verdict(c, docs)', 0),
    ("the contest link is on top of the cap", 'if len(evidence) > MAX_EVIDENCE:', 'if len(evidence) >= MAX_EVIDENCE:', 0),
    ("evidence deadline holds after the first link", 'if not self._evidence_open(p, now):\n                _fail("the deadline has passed")', 'if False:\n                _fail("the deadline has passed")', 0),
    ("validators check claimed quotes", 'and not _quote_found(str(q.get("q", "")), corpus_alnum)', 'and False', 0),
    ("validators check link statuses", 'if [d.get("status") for d in leader["docs"]] != [d["status"] for d in mine["docs"]]:', 'if False:', 0),
    ("numeric address spellings are refused", '        if quad is None:\n            return True', '        if quad is None:\n            return False', 0),
    ("docket reports more only when there is more", 'more = True\n                break', 'more = False\n                break', 0),
    ("ampersand decoded last", '.replace("&mdash;", "-")\n          .replace("&amp;", "&"))', '.replace("&mdash;", "-"))', 0),
]


def run_suite(source_path):
    env = dict(os.environ, TESSERA_CONTRACT=source_path, PYTHONDONTWRITEBYTECODE="1")
    proc = subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", "tests", "-t", ".", "-f"],
                          cwd=ROOT, env=env, capture_output=True, text=True, timeout=180)
    return proc.returncode, proc.stderr


def main():
    with open(SOURCE, encoding="utf-8") as fh:
        original = fh.read()
    code, _ = run_suite(SOURCE)
    if code != 0:
        print("the suite fails on the unmodified contract; fix that first")
        return 2
    rows = []
    started = time.time()
    with tempfile.TemporaryDirectory() as tmp:
        for name, old, new, nth in MUTANTS:
            count = original.count(old)
            if count == 0:
                print("STALE  ", name, "(pattern not found)")
                rows.append((name, "stale", ""))
                continue
            index = -1
            for _ in range(nth + 1):
                index = original.index(old, index + 1)
            mutated = original[:index] + new + original[index + len(old):]
            path = os.path.join(tmp, "tessera_mutant.py")
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(mutated)
            code, err = run_suite(path)
            killer = ""
            if code != 0:
                for line in err.splitlines():
                    if line.startswith(("FAIL:", "ERROR:")):
                        killer = line.split()[1]
                        break
            status = "killed" if code != 0 else "SURVIVED"
            rows.append((name, status, killer))
            print("%-9s %s" % (status, name))
    killed = sum(1 for r in rows if r[1] == "killed")
    survived = [r for r in rows if r[1] == "SURVIVED"]
    stale = [r for r in rows if r[1] == "stale"]
    print("\n%d mutants, %d killed, %d survived, %d stale (%.0fs)" % (len(rows), killed, len(survived), len(stale), time.time() - started))
    if "--write" in sys.argv:
        with open(os.path.join(ROOT, "tests", "MUTATIONS.md"), "w", encoding="utf-8") as fh:
            fh.write("# Mutation testing\n\nEach row breaks one rule of `contracts/tessera.py` on purpose. "
                     "The suite must fail. Regenerate with `python3 tools/mutate.py --write`.\n\n")
            fh.write("**%d mutants, %d killed, %d survived.**\n\n" % (len(rows), killed, len(survived)))
            fh.write("| Rule broken | Result | First failing test |\n|---|---|---|\n")
            for name, status, killer in rows:
                fh.write("| %s | %s | %s |\n" % (name, status, ("`" + killer + "`") if killer else ""))
    return 1 if survived or stale else 0


if __name__ == "__main__":
    sys.exit(main())
