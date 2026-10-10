import { h, icon, fmtGen, short, identicon, statusChip, outcomeChip, fmtDateTime, fmtDate, timeLeft, isZero, same, pct, safeLink, copyText, KIND, STATUS, nowSec, ago } from '../format.js';
import { txFlow, toast, splitBar } from '../ui.js';
import { split, LIMITS, checkUrl } from '../rules.js';

const DAY = 86400;
const Q = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export async function renderPact(ctx) {
  const { chain, params } = ctx;
  const id = params[0];
  const p = await chain.pact(id);
  if (!p) return { node: h('div', { class: 'page' }, h('div', { class: 'wrap' }, h('div', { class: 'empty' }, h('h3', null, `There is no pact ${id}`), h('a', { class: 'btn btn-primary', href: '#/docket' }, 'Back to the docket')))) };

  const me = chain.session?.address;
  const now = (chain.now?.() ?? nowSec());
  const isMaker = same(p.maker, me), isDeliverer = same(p.deliverer, me), isParty = isMaker || isDeliverer;
  const named = !isZero(p.counterparty);
  const last = p.rulings[p.rulings.length - 1];
  const hint = (() => { try { return JSON.parse(localStorage.getItem(`tessera.hint.${p.id}`)); } catch { return null; } })();

  const [standMaker, standDel] = await Promise.all([chain.standing(p.maker).catch(() => null), isZero(p.deliverer) ? null : chain.standing(p.deliverer).catch(() => null)]);

  // ---------------------------------------------------------------- running a write
  const run = (title, call, expect, { hearing = false, sub, button } = {}) => async () => {
    if (!chain.session && !(await ctx.ensureSession())) return;
    await txFlow({ chain, title, sub, hearing,
      run: async (onPhase) => {
        const res = await call(onPhase);
        if (!res.ok) return res;
        const fresh = await chain.pact(p.id);
        if (!fresh || !expect(fresh)) return { ok: false, hash: res.hash, reason: 'The transaction finished but the pact did not change. If this was a hearing, the validators may not have agreed or the judge failed. Nothing was lost; try again in a minute.' };
        return res;
      },
      after: async () => {
        const fresh = await chain.pact(p.id);
        const r = fresh?.rulings[fresh.rulings.length - 1];
        if (hearing && r) return { outcome: r.outcome, bps: r.bps, button: 'See the ruling', message: outcomeSentence(r), caption: `5 of 5 agree · ${outcomeSentence(r)}` };
        return { message: 'Done.', button };
      } });
    await ctx.refresh();
    if (hearing) document.querySelector('.ruling')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // ---------------------------------------------------------------- tablet: terms | rubric
  const verdicts = last?.verdicts ?? {};
  const critList = h('ol', null, p.criteria.map((c) => {
    const v = verdicts[c.id];
    const q = last?.quotes?.[c.id];
    return h('li', { style: { display: 'block' } }, h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'baseline', flexWrap: 'wrap' } },
      h('span', null, c.text, h('br'), h('span', { class: `kind ${KIND[c.type].code ? 'code' : 'judge'}` }, KIND[c.type].code ? 'Decided by code' : 'Judged by validators')),
      h('span', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' } },
        v ? h('span', { class: `verdict-badge ${v}` }, v) : null,
        h('span', { class: 'weight' }, 'weight ', h('b', null, c.weight), c.required ? h('span', { class: 'req' }, ' · required') : null))),
      q?.q ? h('blockquote', { class: 'quote' }, `“${q.q}”`, h('small', null, q.ok ? '✓ found verbatim in the evidence' : 'not found verbatim in the evidence')) : null);
  }));
  const joined = ['settled'].includes(p.status) || (p.status === 'ruled' && last?.outcome === 'fulfilled');
  const tablet = h('div', { class: `tablet big-tablet wide-tablet${joined ? ' joined' : p.status === 'open' || p.status === 'cancelled' || p.status === 'expired' ? ' apart' : ''}` },
    h('div', { class: 't-l spot' }, h('div', { class: 'paper' }, h('span', { class: 'paper-h' }, 'The terms'), h('p', { class: 'terms' }, p.terms))),
    h('div', { class: 't-r spot' }, h('div', { class: 'paper' }, h('span', { class: 'paper-h' }, 'The rubric'), critList)));

  // ---------------------------------------------------------------- rulings
  const rulingPanels = [...p.rulings].reverse().map((r, i) => {
    const [d, m] = split(BigInt(p.stake), r.bps);
    const seal = r.outcome === 'partial' ? pct(r.bps) : r.outcome === 'fulfilled' ? '100%' : r.outcome === 'breached' ? '✕' : '?';
    const standing = i === 0;
    return h('div', { class: 'panel ruling' },
      h('div', { class: 'ruling-top' },
        h('div', null, h('span', { class: 'eyebrow' }, `Hearing ${r.round} of ${LIMITS.maxRounds}${r.round >= LIMITS.maxRounds ? ' · final' : ''}`),
          h('h3', { style: { marginTop: '12px' } }, outcomeSentence(r)),
          h('p', { class: 'muted', style: { marginTop: '6px', fontSize: '.9rem' } }, r.engine === 'sandbox' ? 'Sandbox keyword judge, not validators.' : 'Validators agreed on every verdict.', ` Held ${ago(Math.floor(Date.parse(r.at) / 1000))}.`)),
        h('div', { class: `seal-inline ${r.outcome}`, 'aria-hidden': 'true' }, seal)),
      r.outcome !== 'needs_evidence' ? h('div', null, splitBar(p.stake, d, m, { animate: standing }),
        h('div', { class: 'split-legend' }, h('span', null, 'Deliverer ', h('b', null, `${fmtGen(d, 3)} GEN`)), h('span', null, 'Back to maker ', h('b', null, `${fmtGen(m, 3)} GEN`)))) : h('p', { class: 'muted' }, 'Some criteria could not be settled. The deliverer may add evidence, then a final hearing rules.'),
      r.docs?.length ? h('div', { class: 'kv' }, r.docs.map((doc) => h('div', null, h('span', { class: 'k mono', style: { wordBreak: 'break-all' } }, doc.url), h('dd', { class: 'mono' }, `${doc.status || 'unreachable'}${doc.words ? ` · ${doc.words} words` : ''}${doc.sha ? ` · ${doc.sha}` : ''}`)))) : null);
  });

  // ---------------------------------------------------------------- evidence + forms
  const evidence = h('div', { class: 'panel' }, h('h4', null, `Evidence on the record (${p.evidence.length}/${LIMITS.maxEvidence})`),
    p.evidence.length ? h('div', { class: 'ev-list' }, p.evidence.map((e) => h('div', { class: 'ev' }, safeLink(e.url),
      e.note ? h('div', { class: 'n' }, `“${e.note}”`) : null,
      h('div', { class: 'hint' }, `${same(e.by, p.maker) ? 'Maker' : 'Deliverer'} · hearing ${e.round} · ${e.at ? fmtDateTime(e.at) : ''}`)))) : h('p', { class: 'muted' }, 'Nothing has been filed yet.'));

  function linkForm({ label, button, onSubmit, prefill = '' }) {
    const url = h('input', { class: 'input', placeholder: 'https://…', value: prefill, 'aria-label': `${label} link` });
    const note = h('input', { class: 'input', placeholder: 'A short note (optional)', maxlength: LIMITS.maxNote, 'aria-label': 'Note' });
    const err = h('div', { class: 'err', role: 'alert' });
    return h('div', { class: 'action-box' }, h('span', { class: 'lbl' }, label), url, note, err,
      h('div', { class: 'row' }, h('button', { class: 'btn btn-primary', onclick: () => { const bad = checkUrl(url.value); if (bad) { err.textContent = Q(bad) + '.'; return; } err.textContent = ''; onSubmit(url.value.trim(), note.value.trim()); } }, button),
        prefill ? null : null));
  }

  // ---------------------------------------------------------------- actions
  const actions = [];
  const late = p.deadline_ts && now > p.deadline_ts;
  const lateGrace = p.deadline_ts && now > p.deadline_ts + LIMITS.graceDays * DAY;
  const windowEnd = p.ruled_ts + p.contest_hours * 3600;
  const windowOpen = p.contest_hours > 0 && now < windowEnd;
  const expireOk = ['open', 'active'].includes(p.status) ? late : p.status === 'needs_evidence' ? now > Math.max(p.deadline_ts, p.ruled_ts + LIMITS.graceDays * DAY) : false;

  const connectBtn = h('button', { class: 'btn btn-primary', onclick: () => ctx.ensureSession().then((s) => s && ctx.refresh()) }, 'Connect to act');
  const doExpire = run('Returning the escrow', (onPhase) => chain.expirePact(p.id, { onPhase }), (x) => x.status === 'expired');

  if (p.status === 'open') {
    if (isMaker) actions.push(h('button', { class: 'btn btn-danger', onclick: run('Cancelling the pact', (onPhase) => chain.cancelPact(p.id, { onPhase }), (x) => x.status === 'cancelled') }, 'Cancel and take the escrow back'));
    else if (!named || same(p.counterparty, me)) actions.push(me ? h('button', { class: 'btn btn-primary', onclick: run('Accepting the pact', (onPhase) => chain.acceptPact(p.id, { onPhase }), (x) => x.status === 'active') }, 'Accept this pact') : connectBtn);
    else actions.push(h('div', { class: 'notice' }, `Reserved for ${short(p.counterparty)}.`));
  }
  if ((p.status === 'active' || p.status === 'needs_evidence') && isDeliverer) {
    actions.push(linkForm({ label: p.status === 'active' ? 'File your delivery as a public link' : 'Add evidence for the final hearing', button: 'File evidence', prefill: hint?.evidence ?? '',
      onSubmit: (u, n) => run('Filing evidence', (onPhase) => chain.submitDelivery(p.id, u, n, { onPhase }), (x) => x.evidence.length > p.evidence.length)() }));
    if (hint) actions.push(h('div', { class: 'notice info' }, `Scenario link prepared. Expected: ${hint.expect}.`));
  }
  if (p.status === 'delivered') {
    if (isParty || lateGrace) actions.push(h('button', { class: 'btn btn-brass', onclick: run('Holding the hearing', (onPhase) => chain.requestRuling(p.id, { onPhase }), (x) => x.rounds > p.rounds, { hearing: true, sub: 'Every validator fetches your evidence by itself. This can take a minute or two.' }) }, icon('i-scale'), 'Request the hearing'));
    else actions.push(me ? h('div', { class: 'notice' }, 'Only the maker or the deliverer can request the hearing for now. Anyone can once the deadline plus three days has passed.') : connectBtn);
    if (isDeliverer && p.evidence.length < LIMITS.maxEvidence) actions.push(linkForm({ label: 'Add one more link before the hearing', button: 'Add evidence', onSubmit: (u, n) => run('Filing evidence', (onPhase) => chain.submitDelivery(p.id, u, n, { onPhase }), (x) => x.evidence.length > p.evidence.length)() }));
  }
  if (p.status === 'ruled') {
    const final = p.rounds >= LIMITS.maxRounds;
    const canSettle = final || p.contest_hours === 0 || now >= windowEnd;
    if (canSettle) actions.push(h('button', { class: 'btn btn-brass', onclick: run('Settling the pact', (onPhase) => chain.settlePact(p.id, { onPhase }), (x) => x.status === 'settled', { sub: 'Funds move as the ruling says.' }) }, 'Settle: release the funds'));
    else actions.push(h('div', { class: 'notice' }, `The contest window closes ${timeLeft(windowEnd).replace(' left', '')} from now. After that, anyone can settle.`));
    if (isParty && !final && windowOpen) actions.push(linkForm({ label: 'Contest: add one more link and ask for the final hearing', button: 'Contest the ruling',
      onSubmit: (u, n) => run('Contesting the ruling', (onPhase) => chain.contestRuling(p.id, u, n, { onPhase }), (x) => x.status === 'contested')() }));
  }
  if (p.status === 'contested') {
    if (isParty) actions.push(h('button', { class: 'btn btn-brass', onclick: run('Holding the final hearing', (onPhase) => chain.requestRuling(p.id, { onPhase }), (x) => x.rounds > p.rounds, { hearing: true, sub: 'This hearing is final. Anything unclear counts as unmet.' }) }, icon('i-scale'), 'Request the final hearing'));
    else actions.push(h('div', { class: 'notice' }, 'Waiting for a party to request the final hearing.'));
  }
  if (expireOk) actions.push(h('button', { class: 'btn btn-ghost', onclick: doExpire }, 'The deadline passed: return the escrow to the maker'));
  if (['settled', 'cancelled', 'expired'].includes(p.status)) {
    actions.push(h('div', { class: 'notice' }, ({ settled: `Settled ${fmtDate(p.settled_ts)}. ${fmtGen(p.to_deliverer, 3)} GEN to the deliverer, ${fmtGen(p.to_maker, 3)} GEN back to the maker.`,
      cancelled: 'The maker cancelled before anyone accepted. The escrow returned.', expired: 'The deadline passed without a delivery. The escrow returned to the maker.' })[p.status]));
  }
  if (chain.mode === 'sandbox' && chain.session) {
    const who = isMaker ? 'the maker' : isDeliverer ? 'the deliverer' : 'a bystander';
    actions.push(h('div', { class: 'notice info' }, `Sandbox: you are ${chain.session.label}, ${who}. Switch persona in the account menu to act as the other party.`));
  }

  // ---------------------------------------------------------------- side
  const party = (role, a, st) => !a || isZero(a) ? null : h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } }, identicon(a, 'ident lg'),
    h('div', { style: { minWidth: 0 } }, h('div', { class: 'kind' }, role, same(a, me) ? ' · you' : ''),
      h('a', { class: 'addr who', href: `#/standing/${a}` }, short(a)),
      st ? h('div', { class: 'hint' }, st.score >= 0 ? `Standing ${st.score}/100 · ${st.fulfilled + st.partial + st.breached + st.expired} decided` : 'No record yet') : null));

  const steps = [
    ['Drafted and funded', p.created_ts, true],
    ['Accepted', 0, !isZero(p.deliverer)],
    ['Delivered', p.evidence[0]?.at, p.evidence.length > 0],
    ...p.rulings.map((r) => [`Hearing ${r.round}: ${Q(outcomeSentence(r).split(':')[0].toLowerCase())}`, Math.floor(Date.parse(r.at) / 1000), true]),
    ['Settled', p.settled_ts, p.status === 'settled'],
  ];
  if (['cancelled', 'expired'].includes(p.status)) steps.push([Q(p.status), p.settled_ts, true]);

  const side = h('div', { class: 'side' },
    h('div', { class: 'panel' }, h('h4', null, 'Parties'), party('Maker', p.maker, standMaker),
      party('Deliverer', p.deliverer, standDel) ?? h('div', { class: 'hint' }, named ? `Reserved for ${short(p.counterparty)}` : 'Open to anyone: the first to accept becomes the deliverer.')),
    h('div', { class: 'panel' }, h('h4', null, 'The escrow'),
      h('dl', { class: 'kv', style: { margin: 0 } }, kv('Held', `${fmtGen(p.stake, 4)} GEN`), kv('Deadline', p.deadline_ts ? `${fmtDate(p.deadline_ts)} · ${timeLeft(p.deadline_ts)}` : 'none'),
        kv('Contest window', p.contest_hours ? `${p.contest_hours} h` : 'none'), kv('Hearings', `${p.rounds} of ${LIMITS.maxRounds}`),
        chain.info.contract ? kv('Contract', h('button', { class: 'copy', title: 'Copy', onclick: () => copyText(chain.info.contract).then(() => toast('Contract address copied'))}, h('span', { class: 'addr' }, short(chain.info.contract)))) : null)),
    h('div', { class: 'panel' }, h('h4', null, 'Timeline'), h('ol', { class: 'timeline' }, steps.map(([label, ts, done]) => h('li', { class: done ? 'done' : '' }, h('b', null, label), ts ? fmtDateTime(ts) : done ? '' : 'pending')))));

  const head = h('div', { class: 'pact-head' },
    h('a', { class: 'muted', href: '#/docket', style: { textDecoration: 'none', fontSize: '.9rem' } }, '← The docket'),
    h('div', { class: 'row' }, statusChip(p.status), last && p.status !== 'open' ? outcomeChip(last.outcome) : null, h('span', { class: 'chip quiet plain mono' }, `#${p.id}`)),
    h('h1', null, p.title), h('p', { class: 'muted' }, STATUS[p.status]?.hint));

  const node = h('div', { class: 'page' }, h('div', { class: 'wrap' }, head,
    tablet,
    h('div', { class: 'pact-cols', style: { marginTop: '30px' } }, h('div', { class: 'stack' }, actions.length ? h('div', { class: 'panel action-box' }, h('h4', null, 'What you can do'), actions) : null, rulingPanels, evidence), side)));
  return { node };
}

function kv(k, v) { return v == null ? null : h('div', null, h('dt', null, k), h('dd', null, v)); }

export function outcomeSentence(r) {
  return ({ fulfilled: 'Fulfilled: the whole escrow goes to the deliverer', partial: `Partial: ${pct(r.bps)} to the deliverer, the rest back to the maker`,
    breached: 'Breached: the escrow returns to the maker', needs_evidence: 'Needs evidence: some criteria could not be settled' })[r.outcome] ?? r.outcome;
}
