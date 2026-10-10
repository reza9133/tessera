import { h, fmtGen, identicon, short, copyText, same, isZero } from '../format.js';
import { emptyState, toast } from '../ui.js';
import { pactCard } from './docket.js';

export async function renderStanding({ chain, params }) {
  const address = params[0];
  const [s, first, second] = await Promise.all([chain.standing(address), chain.list({ limit: 50 }), chain.list({ offset: 50, limit: 50 }).catch(() => ({ pacts: [] }))]);
  const mine = [...first.pacts, ...second.pacts].filter((p) => same(p.maker, address) || same(p.deliverer, address));
  const decided = s.fulfilled + s.partial + s.breached + s.expired;
  const ring = h('circle', { class: 'fg', cx: 60, cy: 60, r: 60 - 4.5 - 4 });
  const R = 60 - 4.5 - 4, C = 2 * Math.PI * R;

  const ringSvg = h('div', { class: 'ring-score', role: 'img', 'aria-label': s.score >= 0 ? `Standing ${s.score} out of 100` : 'No standing yet' });
  ringSvg.innerHTML = `<svg viewBox="0 0 120 120"><circle class="bgc" cx="60" cy="60" r="${R}"/><circle class="fg" cx="60" cy="60" r="${R}" style="stroke-dasharray:${C.toFixed(1)};stroke-dashoffset:${C.toFixed(1)}"/></svg>`;
  ringSvg.append(h('b', null, s.score >= 0 ? String(s.score) : '—'), h('small', null, s.score >= 0 ? 'standing' : 'unrated'));
  if (s.score >= 0) requestAnimationFrame(() => requestAnimationFrame(() => { ringSvg.querySelector('.fg').style.strokeDashoffset = (C * (1 - s.score / 100)).toFixed(1); }));

  const stat = (n, label) => h('div', { class: 'stat' }, h('b', null, n), h('span', null, label));
  const node = h('div', { class: 'page' }, h('div', { class: 'wrap' },
    h('div', { class: 'standing-head' }, identicon(address, 'ident lg'),
      h('div', null, h('span', { class: 'eyebrow' }, 'Standing'), h('h1', { style: { fontSize: 'clamp(1.6rem,3.4vw,2.6rem)', marginTop: '12px', wordBreak: 'break-all' } }, h('button', { class: 'copy mono', style: { fontSize: '.6em' }, onclick: () => copyText(address).then(() => toast('Address copied')) }, address)),
        h('p', { class: 'muted', style: { marginTop: '10px', maxWidth: '54ch' } }, 'Standing is the share of decided pacts, as deliverer, that were fulfilled (partial counts half). It is computed by the contract from settled rulings, never self-reported.')), ringSvg),
    h('div', { class: 'stat-grid' }, stat(s.drafted, 'Pacts drafted'), stat(s.accepted, 'Pacts accepted'), stat(`${s.fulfilled} · ${s.partial} · ${s.breached}`, 'Fulfilled · partial · breached'), stat(`${fmtGen(s.earned, 2)} GEN`, 'Earned as deliverer')),
    h('h2', { style: { fontSize: '1.6rem', marginBottom: '22px' } }, 'Pacts'),
    mine.length ? h('div', { class: 'grid-cards' }, mine.map((p) => pactCard(p, { animate: false }))) : emptyState('No pacts yet', 'When this address drafts or accepts a pact, it will appear here.', h('a', { class: 'btn btn-primary', href: '#/new' }, 'Draft a pact'))));
  return { node };
}
