# Mutation testing

Each row breaks one rule of `contracts/tessera.py` on purpose. The suite must fail. Regenerate with `python3 tools/mutate.py --write`.

**66 mutants, 66 killed, 0 survived.**

| Rule broken | Result | First failing test |
|---|---|---|
| min_words is inclusive | killed | `test_min_words_boundary_is_inclusive` |
| payout uses basis points | killed | `test_split_is_exact` |
| split conserves the stake | killed | `test_split_is_exact` |
| required criterion breaches | killed | `test_table` |
| final hearing: unclear is unmet | killed | `test_table` |
| unclear asks for evidence | killed | `test_table` |
| partial is proportional to weight | killed | `test_table` |
| fence replaces both brackets | killed | `test_fence_holds_against_forged_delimiters` |
| two orders must agree | killed | `test_disagreeing_orders_become_unclear` |
| second asking is really reversed | killed | `test_disagreeing_orders_become_unclear` |
| verdict words are reversed too | killed | `test_two_orders_are_really_different` |
| validator compares verdicts | killed | `test_validator_rejects_a_forged_verdict_map` |
| maker cannot accept own pact | killed | `test_open_pact_accepted_by_anyone_but_maker` |
| only maker cancels | killed | `test_cancel_refunds_only_maker_only_open` |
| only deliverer submits | killed | `test_only_deliverer_and_only_links` |
| only a standing ruling is contested | killed | `test_only_a_standing_ruling_can_be_contested` |
| only a standing ruling is settled | killed | `test_needs_evidence_then_supplement_then_final_round` |
| refusal returns funds | killed | `test_refusal_returns_funds_and_says_why` |
| no zero-value transfers | killed | `test_breach_refunds_the_maker` |
| contest window gates settlement | killed | `test_cannot_settle_twice_or_early` |
| final hearing settles at once | killed | `test_final_round_settles_without_waiting` |
| contest window closes | killed | `test_window_closes` |
| contest needs a window | killed | `test_needs_a_window` |
| deadline gates expiry | killed | `test_needs_evidence_gets_a_grace_period` |
| needs_evidence has a grace period | killed | `test_needs_evidence_gets_a_grace_period` |
| late hearings are open to anyone | killed | `test_anyone_may_ask_after_grace` |
| final hearing is final | killed | `test_the_final_hearing_cannot_be_held_twice` |
| needs_evidence keeps the pact open | killed | `test_needs_evidence_gets_a_grace_period` |
| private hosts refused | killed | `test_url_rules` |
| link-local hosts refused | killed | `test_url_rules` |
| weights must be real ints | killed | `test_rules_are_enforced` |
| duplicate links refused | killed | `test_duplicates_and_cap` |
| evidence is capped | killed | `test_duplicates_and_cap` |
| standing: partial counts half | killed | `test_score` |
| earnings recorded | killed | `test_standings_after_settlement` |
| volume recorded | killed | `test_standings_after_settlement` |
| refusal ledger counts | killed | `test_refusal_returns_funds_and_says_why` |
| list filter works | killed | `test_list_is_newest_first_filterable_and_paged` |
| accept respects the deadline | killed | `test_cannot_accept_after_deadline` |
| unreachable is not missing | killed | `test_missing_page_versus_unreachable` |
| blind judge is unclear when the net is down | killed | `test_unreachable_evidence_asks_for_more_not_breach` |
| only 200 pages are read | killed | `test_no_readable_evidence_skips_the_judge` |
| century rule in the calendar | killed | `test_leap_day_and_century_rules` |
| every fragment of a quote must occur | killed | `test_quote_check_ignores_punctuation_and_needs_fragments` |
| unreadable clock keeps evidence open | killed | `test_a_pact_drafted_without_a_readable_clock_never_closes_to_evidence` |
| cancel returns the escrow | killed | `test_cancel_refunds_only_maker_only_open` |
| expiry returns the escrow | killed | `test_open_pact_expires_and_refunds` |
| no-shows are recorded | killed | `test_no_show_counts_against_the_deliverer` |
| hearing count | killed | `test_fulfilled_ruling` |
| terms are fenced | killed | `test_terms_are_fenced_too` |
| document urls are fenced | killed | `test_links_and_criteria_are_fenced_too` |
| criteria text is fenced | killed | `test_links_and_criteria_are_fenced_too` |
| script tags are stripped | killed | `test_markup_is_stripped` |
| total prompt budget | killed | `test_only_needed_documents_reach_the_judge_within_budget` |
| phrases of any script are folded, not erased | killed | `test_a_persian_phrase_is_matched_for_real` |
| a phrase needs a letter or digit | killed | `test_a_phrase_with_no_letter_or_digit_is_refused_up_front` |
| only ascii digits are a number of words | killed | `test_only_ascii_digits_count_as_a_number_of_words` |
| nothing strands the escrow | killed | `test_an_unexpected_error_never_strands_the_escrow` |
| code criteria read the deliverer only | killed | `test_a_dead_contest_link_cannot_fail_the_live_check` |
| the contest link is on top of the cap | killed | `test_contest_works_with_four_links_already_filed` |
| evidence deadline holds after the first link | killed | `test_not_before_acceptance_or_after_deadline` |
| validators check claimed quotes | killed | `test_a_quote_the_page_does_not_contain_is_rejected_when_marked_verified` |
| validators check link statuses | killed | `test_a_different_link_status_is_rejected` |
| numeric address spellings are refused | killed | `test_numeric_spellings_of_an_address_are_refused` |
| docket reports more only when there is more | killed | `test_list_is_newest_first_filterable_and_paged` |
| ampersand decoded last | killed | `test_markup_is_stripped` |
