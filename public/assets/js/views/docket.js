import { h, icon, fmtGen, short, identicon, statusChip, outcomeChip, timeLeft, ago, isZero, pct, $ } from '../format.js';
import { splitBar, emptyState } from '../ui.js';
import { split } from '../rules.js';

/** One pact as a broken tablet. The left half is the money, the right half is the deal. */
export function pactCard(p, { animate = true } = {}) {
  const settled = p.status === 'settled';
  const open = p.status === 'open';
  const parties = h('div', { class: 'meta' },
    h('span', { class: 'who' }, identicon(p.maker), h('span', { class: 'addr' }, short(p.maker))),
    h('span', { 'aria-hidden': 'true' }, '→'),
    isZero(p.deliverer)
      ? h('span', null, isZero(p.counterparty) ? 'open to anyone' : `for ${short(p.counterparty)}`)
      : h('span', { class: 'who' }, identicon(p.deliverer), h('span', { class: 'addr' }, short(p.deliverer))));

  let foot;
  if (['ruled', 'settled', 'contested'].includes(p.status) && p.outcome && p.outcome !== 'needs_evidence') {
    const [d, m] = split(BigInt(p.stake), p.payout_bps);
    foot = h('div', { style: { width: '100%' } }, splitBar(p.stake, d, m, { animate }),
      h('div', { class: 'split-legend' }, h('span', null, 'Deliverer ', h('b', null, pct(p.payout_bps))), h('span', null, outcomeChip(p.outcome))));
  } else {
    foot = h('div', { class: 'pcard-foot' }, h('span', null, open || p.status === 'active' || p.status === 'needs_evidence' ? timeLeft(p.deadline_ts) : `opened ${ago(p.created_ts)}`),
      p.rounds ? h('span', null, `${p.rounds} hearing${p.rounds > 1 ? 's' : ''}`) : null);
  }

  return h('a', { class: `tablet pcard${settled ? ' joined' : open ? ' apart' : ''}`, href: `#/pact/${p.id}` },
    h('div', { class: 't-l spot' }, h('div', { class: 'amount' }, fmtGen(p.stake, 2), h('small', null, 'GEN ESCROW')), statusChip(p.status)),
    h('div', { class: 't-r spot' }, h('h3', null, p.title), parties, h('div', { style: { height: '14px' } }), foot));
}

const FILTERS = [['', 'All'], ['open', 'Open'], ['active', 'In progress'], ['delivered', 'Delivered'], ['ruled', 'Ruled'], ['settled', 'Settled']];

export async function renderDocket({ chain, query }) {
  let status = query.get('status') || '';
  let rows = [], more = false, offset = 0, text = '';
  const grid = h('div', { class: 'grid-cards' });
  const moreBtn = h('button', { class: 'btn btn-ghost', style: { marginTop: '28px' }, onclick: () => load(false) }, 'Load more');
  const wrap = h('div');
  const search = h('input', { class: 'input search', type: 'search', placeholder: 'Search title or address', 'aria-label': 'Search pacts', oninput: (e) => { text = e.target.value.trim().toLowerCase(); paint(); } });

  const chips = FILTERS.map(([v, label]) => h('button', { class: 'f', 'aria-pressed': String(v === status), onclick: () => { status = v; chips.forEach((c, i) => c.setAttribute('aria-pressed', String(FILTERS[i][0] === v))); load(true); } }, label));

  function paint() {
    const visible = rows.filter((r) => !text || r.title.toLowerCase().includes(text) || [r.maker, r.deliverer, r.counterparty].some((a) => a.toLowerCase().includes(text)) || r.id === text);
    if (!visible.length) {
      grid.replaceChildren();
      wrap.replaceChildren(emptyState(rows.length ? 'Nothing matches' : status ? 'No pacts in this state' : 'The docket is empty',
        rows.length ? 'Try a different word or clear the search.' : 'Be the first to draft a pact. It takes a minute and the escrow is yours until a ruling.',
        h('a', { class: 'btn btn-primary', href: '#/new' }, 'Draft a pact')));
      return;
    }
    grid.replaceChildren(...visible.map((r) => pactCard(r)));
    wrap.replaceChildren(grid, more ? moreBtn : '');
  }

  async function load(reset) {
    if (reset) { rows = []; offset = 0; wrap.replaceChildren(h('div', { class: 'grid-cards' }, [1, 2, 3, 4].map(() => h('div', { class: 'skel' })))); }
    moreBtn.disabled = true;
    try {
      const res = await chain.list({ offset, limit: 20, status });
      rows = rows.concat(res.pacts); offset += res.pacts.length; more = res.more;
    } catch (e) {
      wrap.replaceChildren(emptyState('Could not read the docket', 'The network did not answer. Try again in a moment.', h('button', { class: 'btn btn-ghost', onclick: () => load(true) }, 'Retry')));
      return;
    }
    moreBtn.disabled = false;
    paint();
  }

  const node = h('div', { class: 'page' }, h('div', { class: 'wrap' },
    h('div', { class: 'page-head' }, h('div', null, h('span', { class: 'eyebrow' }, 'The docket'), h('h1', null, 'Every pact, in public.')),
      h('a', { class: 'btn btn-primary', href: '#/new' }, 'Draft a pact', icon('i-arrow'))),
    h('div', { class: 'filters' }, chips, search), wrap));
  load(true);
  return { node };
}
