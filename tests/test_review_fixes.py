"""Regression tests for the problems a code review found. One test class per problem.

    python -m unittest tests.test_review_fixes -v
"""

import json
import unittest

from tests import genlayer_stub as stub
from tests.harness import GEN, MAKER, OTHER, WORKER, World, page, words

GOOD = page("Lumen", "<p>This copy explains benefits clearly. Lumen works in offline mode on a plane. " + words(60) + "</p>")


def open_web(**pages):
    stub.env.pages.update(pages)


def judge_met(prompt):
    ids = [part.split(":")[0] for part in prompt.split("CRITERIA:", 1)[1].split("Answer each", 1)[0].split("- ")[1:]]
    return {"results": [{"id": i, "verdict": "met", "quote": "works in offline mode on a plane"} for i in ids]}


class PhraseCriteriaAnyScript(unittest.TestCase):
    """`contains` used to fold every non-ASCII phrase to '' and then match everything."""

    def test_a_persian_phrase_is_matched_for_real(self):
        m = World().mod
        crit = {"type": "contains", "arg": "قرارداد امضا شد"}
        present = [{"url": "u", "status": 200, "text": "امروز قرارداد امضا شد و کار شروع شد"}]
        absent = [{"url": "u", "status": 200, "text": "this page is only English text"}]
        self.assertEqual(m._code_verdict(crit, present), "met")
        self.assertEqual(m._code_verdict(crit, absent), "unmet")

    def test_accented_latin_is_not_mangled(self):
        m = World().mod
        self.assertEqual(m._alnum("  München, Germany! "), "münchen germany")
        self.assertEqual(m._code_verdict({"type": "contains", "arg": "München"},
                                         [{"url": "u", "status": 200, "text": "Berlin and Hamburg"}]), "unmet")

    def test_a_phrase_with_no_letter_or_digit_is_refused_up_front(self):
        m = World().mod
        for arg in ["©", "€€", "!!! ???", "-"]:
            with self.assertRaises(m._Refusal, msg=arg):
                m._criteria(json.dumps([{"type": "contains", "arg": arg}]))

    def test_a_quote_in_a_script_without_spaces_can_still_be_found(self):
        m = World().mod
        corpus = m._alnum("今日は契約書に署名しました。作業を開始します")
        self.assertTrue(m._quote_found("今日は契約書に署名しました", corpus))
        self.assertFalse(m._quote_found("存在しない引用文のテストです", corpus))
        self.assertFalse(m._quote_found("two words", m._alnum("two words here")))   # still too short to count


class DigitsAndEscrow(unittest.TestCase):
    """`'²'.isdigit()` is True but `int('²')` raises: that used to escape from a payable call."""

    def test_only_ascii_digits_count_as_a_number_of_words(self):
        m = World().mod
        for arg in ["²", "٣", "۱۰۰", "١٢"]:
            with self.assertRaises(m._Refusal, msg=arg):
                m._criteria(json.dumps([{"type": "min_words", "arg": arg}]))
        self.assertEqual(m._criteria(json.dumps([{"type": "min_words", "arg": "0120"}]))[0]["arg"], "120")

    def test_a_pact_with_such_a_number_is_refused_and_the_escrow_comes_back(self):
        w = World()
        r = w.call(MAKER, "create_pact", "Copy", "Write landing page copy for the app.",
                   json.dumps([{"type": "min_words", "arg": "²"}]), "", 7, 0, value=5 * GEN)
        self.assertFalse(r["ok"])
        self.assertEqual(w.transfers, [(MAKER, 5 * GEN)])

    def test_an_unexpected_error_never_strands_the_escrow(self):
        w = World()

        def boom(raw):
            raise ValueError("something nobody planned for")
        w.mod._criteria = boom
        r = w.call(MAKER, "create_pact", "Copy", "Write landing page copy for the app.",
                   json.dumps([{"type": "live"}]), "", 7, 0, value=5 * GEN)
        self.assertFalse(r["ok"])
        self.assertIn("returned", r["reason"])
        self.assertEqual(w.transfers, [(MAKER, 5 * GEN)])
        self.assertEqual(int(w.read("get_stats")["pacts"]), 0)


class CodeCriteriaUseTheDeliverersLinksOnly(unittest.TestCase):
    """The other party's contest link used to count towards 'every link opens'."""

    def test_a_dead_contest_link_cannot_fail_the_live_check(self):
        w = World()
        open_web(**{"https://example.com/work": GOOD, "https://example.com/dead": (404, "gone")})
        crit = [{"type": "live", "weight": 3, "required": True}, {"type": "contains", "arg": "offline mode", "weight": 2}]
        pid = w.open_pact(criteria=crit, contest=24)
        w.call(WORKER, "accept_pact", pid)
        w.call(WORKER, "submit_delivery", pid, "https://example.com/work", "done")
        w.call(WORKER, "request_ruling", pid)
        self.assertEqual(w.pact(pid)["outcome"], "fulfilled")
        self.assertTrue(w.call(MAKER, "contest_ruling", pid, "https://example.com/dead", "see this")["ok"])
        w.call(MAKER, "request_ruling", pid)
        p = w.pact(pid)
        self.assertEqual((p["outcome"], p["payout_bps"]), ("fulfilled", 10000))
        self.assertEqual(p["rulings"][1]["docs"][1]["status"], 404)       # still on the record, just not counted

    def test_a_dead_link_of_the_deliverer_still_fails_the_live_check(self):
        w = World()
        open_web(**{"https://example.com/work": GOOD, "https://example.com/dead": (404, "gone")})
        pid = w.open_pact(criteria=[{"type": "live", "weight": 1, "required": True}])
        w.call(WORKER, "accept_pact", pid)
        w.call(WORKER, "submit_delivery", pid, "https://example.com/work", "")
        w.call(WORKER, "submit_delivery", pid, "https://example.com/dead", "")
        w.call(MAKER, "request_ruling", pid)
        self.assertEqual(w.pact(pid)["outcome"], "breached")

    def test_the_judge_still_reads_the_contest_link(self):
        w = World()
        open_web(**{"https://example.com/work": GOOD, "https://example.com/counter": GOOD})
        stub.env.llm = judge_met
        pid = w.open_pact(criteria=[{"type": "judge", "text": "The copy explains the benefits clearly"}], contest=24)
        w.call(WORKER, "accept_pact", pid)
        w.call(WORKER, "submit_delivery", pid, "https://example.com/work", "")
        w.call(MAKER, "request_ruling", pid)
        w.call(MAKER, "contest_ruling", pid, "https://example.com/counter", "counter-evidence")
        stub.env.prompts.clear()
        w.call(MAKER, "request_ruling", pid)
        self.assertIn("https://example.com/counter", stub.env.prompts[0])


class ContestAlwaysPossible(unittest.TestCase):
    def test_contest_works_with_four_links_already_filed(self):
        w = World()
        urls = ["https://example.com/a%d" % i for i in range(4)]
        open_web(**{u: GOOD for u in urls}, **{"https://example.com/extra": GOOD})
        pid = w.open_pact(contest=24, criteria=[{"type": "contains", "arg": "nonexistent phrase here", "weight": 1}])
        w.call(WORKER, "accept_pact", pid)
        for u in urls:
            w.call(WORKER, "submit_delivery", pid, u, "")
        self.assertFalse(w.call(WORKER, "submit_delivery", pid, "https://example.com/extra", "")["ok"])
        w.call(WORKER, "request_ruling", pid)
        self.assertTrue(w.call(WORKER, "contest_ruling", pid, "https://example.com/extra", "new proof")["ok"])
        self.assertEqual(len(w.pact(pid)["evidence"]), 5)

    def test_the_late_link_still_reaches_the_judge(self):
        m = World().mod
        docs = [{"url": "https://example.com/%d" % i, "status": 200, "text": "x" * 9000} for i in range(5)]
        prompt = m._judge_prompt("terms", [{"id": "c1", "text": "something clear"}], docs, False)
        for doc in docs:
            self.assertIn(doc["url"], prompt)
        sections = prompt.split("[document ")[1:]
        self.assertTrue(all(len(sec) > 2000 for sec in sections))


class EvidenceDeadline(unittest.TestCase):
    def test_no_more_links_after_the_deadline_even_once_delivery_started(self):
        w = World()
        open_web(**{"https://example.com/work": GOOD, "https://example.com/late": GOOD})
        pid = w.active_pact(days=1)
        self.assertTrue(w.call(WORKER, "submit_delivery", pid, "https://example.com/work", "first")["ok"])
        w.advance(3 * 86400)
        r = w.call(WORKER, "submit_delivery", pid, "https://example.com/late", "too late")
        self.assertFalse(r["ok"])
        self.assertEqual(len(w.pact(pid)["evidence"]), 1)

    def test_after_a_request_for_more_the_grace_period_applies_to_every_link(self):
        w = World()
        open_web(**{u: GOOD for u in ["https://example.com/work", "https://example.com/m1", "https://example.com/m2",
                                      "https://example.com/m3"]})
        stub.env.llm = lambda prompt: {"results": [{"id": "c3", "verdict": "unclear", "quote": ""}]}
        pid = w.delivered_pact(days=1)
        w.advance(2 * 86400)
        w.call(MAKER, "request_ruling", pid)
        self.assertEqual(w.pact(pid)["status"], "needs_evidence")
        self.assertTrue(w.call(WORKER, "submit_delivery", pid, "https://example.com/m1", "")["ok"])
        self.assertTrue(w.call(WORKER, "submit_delivery", pid, "https://example.com/m2", "")["ok"])   # delivered again, still inside the grace
        w.advance(3 * 86400 + 1)
        self.assertFalse(w.call(WORKER, "submit_delivery", pid, "https://example.com/m3", "")["ok"])

    def test_a_pact_drafted_without_a_readable_clock_never_closes_to_evidence(self):
        w = World()
        open_web(**{"https://example.com/work": GOOD})
        w.now = "garbage"                                  # no deadline can be set while drafting
        pid = w.open_pact()
        w.now = "2026-09-29T12:00:00Z"
        self.assertEqual(w.pact(pid)["deadline_ts"], 0)
        self.assertTrue(w.call(WORKER, "accept_pact", pid)["ok"])
        self.assertTrue(w.call(WORKER, "submit_delivery", pid, "https://example.com/work", "")["ok"])

    def test_an_unreadable_clock_never_blocks_evidence(self):
        w = World()
        open_web(**{"https://example.com/work": GOOD})
        pid = w.active_pact(days=1)
        self.assertTrue(w.call(WORKER, "submit_delivery", pid, "https://example.com/work", "", at="garbage")["ok"])


class ValidatorsCheckWhatTheyCan(unittest.TestCase):
    def _hearing(self):
        w = World()
        open_web(**{"https://example.com/work": GOOD})
        pid = w.delivered_pact()
        w.call(WORKER, "request_ruling", pid)
        fn, vfn, result = stub.env.validator
        return w, json.loads(result)

    def test_an_honest_reading_is_accepted(self):
        _, honest = self._hearing()
        self.assertTrue(stub.run_validator(leader_result=json.dumps(honest, sort_keys=True)))

    def test_a_quote_the_page_does_not_contain_is_rejected_when_marked_verified(self):
        _, forged = self._hearing()
        forged["quotes"] = {"c3": {"q": "THE DELIVERABLE IS ABSOLUTELY PERFECT", "ok": True}}
        self.assertFalse(stub.run_validator(leader_result=json.dumps(forged, sort_keys=True)))

    def test_a_quote_marked_unverified_is_harmless(self):
        _, reading = self._hearing()
        reading["quotes"] = {"c3": {"q": "something the page never said at all", "ok": False}}
        self.assertTrue(stub.run_validator(leader_result=json.dumps(reading, sort_keys=True)))

    def test_a_different_link_status_is_rejected(self):
        _, reading = self._hearing()
        reading["docs"][0]["status"] = 404
        self.assertFalse(stub.run_validator(leader_result=json.dumps(reading, sort_keys=True)))

    def test_word_counts_and_hashes_are_not_compared(self):
        _, reading = self._hearing()
        reading["docs"][0]["words"] = 99999
        reading["docs"][0]["sha"] = "deadbeefdeadbeef"
        self.assertTrue(stub.run_validator(leader_result=json.dumps(reading, sort_keys=True)))


class LinksAndSmallThings(unittest.TestCase):
    def test_numeric_spellings_of_an_address_are_refused(self):
        m = World().mod
        for url in ["https://0x7f.0.0.1/", "https://2130706433/", "https://0177.0.0.1/", "https://127.1/",
                    "https://localhost./x", "https://app.localhost/x", "https://nas.lan/x", "https://100.64.0.1/",
                    "https://224.0.0.1/", "https://999.1.1.1/"]:
            with self.assertRaises(m._Refusal, msg=url):
                m._check_url(url)

    def test_real_names_that_merely_start_with_a_number_are_accepted(self):
        m = World().mod
        for url in ["https://10.example.com/x", "https://127.example.org/", "https://0.fm/x", "https://1.1.1.1/",
                    "https://100.128.0.1/", "https://example.com./x"]:
            self.assertEqual(m._check_url(url), url)

    def test_the_docket_says_there_is_more_only_when_there_is(self):
        w = World()
        a = w.open_pact()
        b = w.open_pact()
        w.call(MAKER, "cancel_pact", a)
        page1 = w.read("list_pacts", 0, 1, "open")
        self.assertEqual([r["id"] for r in page1["pacts"]], [b])
        self.assertFalse(page1["more"])                       # the only other pact is cancelled
        self.assertTrue(w.read("list_pacts", 0, 1, "")["more"])

    def test_an_escaped_entity_is_decoded_once(self):
        m = World().mod
        self.assertEqual(m._html_to_text("<p>&amp;lt;b&amp;gt; &amp; &lt;i&gt;</p>"), "&lt;b&gt; & <i>")


if __name__ == "__main__":
    unittest.main()
