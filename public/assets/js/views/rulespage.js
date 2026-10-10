import { h, statusChip, icon } from '../format.js';
import { LIMITS } from '../rules.js';

const FLOW = ['open', 'active', 'delivered', 'ruled', 'settled'];

export async function renderRules() {
  const chips = (list) => h('div', { class: 'flow' }, list.flatMap((s, i) => [statusChip(s), i < list.length - 1 ? h('span', { class: 'arrow' }, '→') : null]));
  const table = (head, rows) => h('div', { class: 'table-wrap' }, h('table', null, h('thead', null, h('tr', null, head.map((c) => h('th', null, c)))), h('tbody', null, rows.map((r) => h('tr', null, r.map((c) => h('td', null, c)))))));
  const node = h('div', { class: 'page' }, h('div', { class: 'wrap' },
    h('div', { class: 'page-head' }, h('div', null, h('span', { class: 'eyebrow' }, 'The rules'), h('h1', null, 'How a ruling is made.'))),
    h('div', { class: 'prose' },
      h('p', { class: 'lede', style: { maxWidth: 'none' } }, 'Everything below is enforced by the contract, not by this website. The interface only mirrors the arithmetic so it can preview a ruling.'),
      h('h2', null, 'The life of a pact'), chips(FLOW),
      h('p', null, 'A pact can also be ', statusChip('cancelled'), ' by its maker before anyone accepts, ', statusChip('expired'), ' if nobody delivers by the deadline, ', statusChip('needs_evidence'), ' when a hearing cannot settle a criterion, and ', statusChip('contested'), ' when a party asks for the final hearing.'),
      h('h2', null, 'What validators agree on'),
      h('p', null, 'For every criterion, one word: ', h('code', null, 'met'), ', ', h('code', null, 'unmet'), ' or ', h('code', null, 'unclear'), '. Each validator fetches the evidence itself and reaches its own verdicts. A validator votes to accept the leader\'s ruling only if every verdict matches its own, exactly. Quotes, hashes and wording never cross consensus.'),
      table(['Criterion', 'Decided by', 'Verdict rules'], [
        ['Link opens', 'Code', 'All of the deliverer\'s links answer 200: met. Any 4xx or 5xx: unmet. Only network failures: unclear.'],
        ['Contains phrase', 'Code', 'The phrase (any script) occurs in the deliverer\'s page text, ignoring case and punctuation: met.'],
        ['Minimum length', 'Code', 'The page text has at least N words: met.'],
        ['Judged', 'Each validator\'s model', 'Asked twice, in opposite orders. If the two askings differ the verdict is unclear. A quote is requested and checked against the evidence, and shown next to the verdict.'],
      ]),
      h('h2', null, 'From verdicts to money'),
      h('ul', null,
        h('li', null, 'A required criterion that is unmet ends the pact in breach. Nothing is paid.'),
        h('li', null, 'Otherwise, if anything is unclear, the deliverer may add evidence and a second hearing follows. In the final hearing, unclear counts as unmet.'),
        h('li', null, 'Otherwise the deliverer is paid met weight divided by total weight, in basis points, with whole-number math. The remainder returns to the maker. The two parts always add up to the escrow exactly.')),
      h('h2', null, 'Limits'),
      table(['Rule', 'Value'], [
        ['Criteria per pact', `1 to ${LIMITS.maxCriteria}`], ['Weight of a criterion', `1 to ${LIMITS.maxWeight}`], ['Evidence links', `up to ${LIMITS.maxEvidence}`],
        ['Hearings', `${LIMITS.maxRounds}: a hearing and one contest. The second is final.`], ['Deadline', `${LIMITS.minDays} to ${LIMITS.maxDays} days`],
        ['Contest window', LIMITS.contestHours.map((x) => (x ? `${x} h` : 'none')).join(', ')], ['Open hearings', `Anyone may request one ${LIMITS.graceDays} days after the deadline, so a finished job is never held hostage.`],
      ]),
      h('h2', null, 'What it does not do'),
      h('p', null, 'It does not read private pages, judge what it cannot fetch, or settle anything beyond the rubric you wrote. It is a procedure, written down before the work begins, that every party can read and check. It is not a court and it is not legal advice.'))));
  return { node };
}
