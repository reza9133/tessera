# Changes from the bug review

Contract (`contracts/tessera.py`)
- Phrases are matched in any script (`_alnum` keeps letters and digits of every language); a phrase with no letter or digit is refused when drafting. A quote in a script written without spaces can now be found (`_substantial`).
- `min_words` accepts ASCII digits only, so `int()` can no longer raise out of a payable call; `create_pact` also refunds on any unexpected error before the pact is stored.
- `live`, `contains` and `min_words` read the deliverer's links only; the contest link reaches the judge but cannot fail "every link opens".
- The one contest link sits on top of the four-link cap.
- One deadline rule for evidence (`_evidence_open`): the deadline, or the grace a "needs evidence" ruling opened. Expiry uses the same rule.
- Validators now also check that link statuses match and that every quote the leader marked as found really occurs in the pages they read. Word counts and hashes are still leader-reported.
- Judge prompt: the character budget is shared between readable pages so a late link is never starved.
- Private hosts are parsed instead of prefix-matched: numeric spellings (hex, octal, decimal), trailing dot, `.localhost`, `.lan`, `.localdomain`, 100.64/10 and multicast are refused; names such as `10.example.com` are accepted.
- `list_pacts` reports `more` only when a further pact matches the filter; `&amp;` is decoded last in `_html_to_text`.

Interface
- `rules.js`, `chain-sandbox.js`: same rules as the contract (phrase folding, link checks, deliverer-only code criteria, contest cap, evidence deadline).
- `chain-live.js`: a call whose receipt shows an execution error is reported as a failure instead of success.
- Help text on the landing and rules pages updated.

Tests and tooling
- `tests/test_review_fixes.py`: 25 regression tests. 129 contract tests in total.
- `tools/make_vectors.py`: new URL, rubric and text-folding vectors; `tests/js/rules.test.mjs` checks the JS port against them.
- `tools/mutate.py`: 66 mutants (12 new), all killed.
