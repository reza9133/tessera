# Decisions

Short notes on choices that are not obvious from the code, and what each costs.

**1. Written for stable Studionet, not Studio-dev.** The user asked for Studionet (chain 61999). It runs the older runner and `from genlayer import *`; Studio-dev (61997) needs a different runner and import. A contract cannot satisfy both, so this one is Studionet-only and the header says so. *Cost:* when Studionet is promoted to the newer stack, line 1 and the import change; the logic does not.

**2. Expected failures are recorded, not raised.** A payable call that raises can strand the value it carried. So every write validates first, writes second, and on refusal returns the funds and stores `{seq, method, reason}` for the sender. The UI reads that ledger after each write. *Cost:* a refusal is a successful transaction that writes one small record.

**3. Only a closed vocabulary decides, and a validator checks what it can.** The verdicts (one of three words per criterion) are what validators must agree on. Beyond that a validator also checks that every link answered with the same HTTP status and that every quote the leader marked as found really occurs in the pages it read itself. Word counts, hashes and wording stay as the leader reported them: they are provenance for people, and markup differs between reads. *Cost:* two validators that read the same page can still disagree if a model wavers on a judged criterion; that surfaces as a rotation or `unclear`, never as a wrong payout.

**4. Judged criteria are asked twice, in opposite orders.** Order bias becomes disagreement, which becomes `unclear`, which asks for more evidence. *Cost:* two model calls per validator per hearing.

**5. A verbatim quote is shown, not required.** The judge is asked to quote the evidence and the validators check the quote against the page, but a missing or inexact quote does not change the verdict (a quote claimed as found that is not there does get the reading rejected). Making it a gate would raise the rate of `unclear` for harmless paraphrase. The check is displayed next to the verdict so a reader can weigh it.

**6. Required criteria and weights.** A failed required criterion pays nothing, regardless of other criteria. Otherwise the deliverer is paid met weight over total weight. Simple enough to state in one sentence and to compute by hand.

**7. Integers and the contract clock only.** No floats, no `datetime`, no `/`. Dates are converted by hand from the transaction's own datetime. If the clock cannot be read, deadlines are 0 and nothing expires: failing safe means not releasing money on a guess.

**8. Money moves at settlement, and settlement waits for the contest window.** A ruling is not a payout. With a contest window, either party can add one link and force a final hearing in which `unclear` counts as `unmet`.

**9. Hearings cannot be held hostage.** Only the parties may ask for a hearing until the deadline plus three days; after that anyone may.

**10. Every view returns a JSON string.** The browser never depends on how an SDK decodes maps or integers beyond 2^53. Amounts are decimal strings.

**11. The interface mirrors the arithmetic and proves it.** `rules.js` is a port of `_decide`, `_split`, `_score`, link and rubric validation. `tools/make_vectors.py` generates vectors from the contract; `npm test` runs the port against them. *Cost:* two implementations; the vectors are the leash.

**12. A sandbox that is honest about itself.** The whole product runs in the browser with the same state machine. The only difference is the judge (a keyword heuristic) and every sandbox ruling is labelled as such. It exists so the site is explorable before a contract is deployed, and so the UI can be tested end to end without a network.

**13. Receipts are for progress, state is for truth.** After each write the UI re-reads the pact and checks that what it expected happened. A transaction that finished without effect says so instead of showing success.

**14. No admin, no upgrade.** No owner, no pause, no upgrader list. If a bug is found, the fix is a new contract and a new `CONTRACT_ADDRESS`. For a contract that holds other people's escrow, an upgrade key is a larger risk than a bug.

**15. Code decides on the deliverer's links only.** `live`, `contains` and `min_words` read the links the deliverer filed. A link the other party adds when contesting goes to the judge as counter-evidence but cannot fail "every link opens" or pad a word count. *Cost:* a maker cannot use a code criterion to say "this page also exists"; that is what a judged criterion is for.

**16. Phrases are matched in any script.** Case and punctuation are ignored; letters and digits of every script are kept. A phrase with no letter or digit at all is refused when the pact is drafted, because it would match everything. Combining marks count as separators, so a phrase is diacritic-sensitive for scripts that write them as separate characters.

**17. The contest link is on top of the cap, and evidence has one deadline rule.** The deliverer may file four links; the single contest link makes a fifth, so a full record can still be contested. Links may be added until the deadline, or, once a ruling asked for more, until the grace period that ruling opened has run out; the same rule decides when an unanswered pact may expire.

## Known limits

- The judged criterion is only as good as the validators' models, and a page that changes between reads can make a ruling `unclear`.
- Evidence must be public and fetchable; links to private or local hosts are refused, including numeric spellings of an address (decimal, hex, octal). The web module's own checks come on top of this.
- One escrow per pact, one currency (GEN), no partial releases before a ruling.
- Standing counts only decided pacts as deliverer and is easy to start fresh with a new address; it is a signal, not an identity.
