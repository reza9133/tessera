import { h, icon, svg, countUp, fmtGen, pct, $, $$ } from '../format.js';
import { mountChamber, runDemo } from '../chamber.js';
import { decide, split } from '../rules.js';
import { SCENARIOS } from '../scenarios.js';

const GL_LOGO = () => svg('<svg viewBox="0 0 385.32 91.93" role="img" aria-label="GenLayer"><use href="#gl-logo"/></svg>');

export async function renderLanding({ chain }) {
  const stopList = [];
  const root = h('div');

  // ---------------------------------------------------------------- hero
  const caption = h('div', { class: 'stage-cap' }, 'Awaiting evidence');
  const stage = h('div', { class: 'stage-wrap' });
  const chamber = mountChamber(stage);
  stage.append(caption);
  stopList.push(runDemo(chamber, caption));

  const hero = h('section', { class: 'hero' }, h('div', { class: 'wrap hero-grid' },
    h('div', null,
      h('span', { class: 'eyebrow' }, chain.mode === 'live' ? 'Live on GenLayer Studionet' : 'Agreements, adjudicated'),
      h('h1', null, 'Write the deal in plain words. Five validators decide if it was kept.'),
      h('p', { class: 'lede' }, 'Tessera holds payment in escrow, reads the evidence of delivery, and releases funds by ruling: in full, in proportion, or back to you.'),
      h('div', { class: 'hero-cta' },
        h('a', { class: 'btn btn-primary', href: '#/new' }, 'Draft a pact', icon('i-arrow')),
        h('a', { class: 'btn btn-ghost', href: '#/docket' }, 'Browse the docket')),
      h('div', { class: 'built-on' }, 'Runs on', GL_LOGO(), h('span', { class: 'sep' }), chain.mode === 'live' ? 'Studionet, consensus by validators' : 'Sandbox, nothing leaves your browser')),
    h('div', null, stage)));

  // ---------------------------------------------------------------- ledger
  const cells = [['pacts', 'Pacts drafted'], ['escrow', 'GEN settled'], ['hearings', 'Hearings held'], ['settled', 'Pacts settled']]
    .map(([k, label]) => h('div', { class: 'ledger-cell' }, h('b', { dataset: { k } }, '0'), h('span', null, label)));
  const ledger = h('section', { class: 'ledger', 'aria-label': 'Live totals' }, h('div', { class: 'wrap ledger-in' }, cells));
  chain.stats().then((s) => {
    const set = (k, n, f) => { const el = $(`[data-k="${k}"]`, ledger); if (el) countUp(el, n, { format: f }); };
    set('pacts', s.pacts); set('hearings', s.hearings); set('settled', s.settled);
    const gen = Number(BigInt(s.volume) / 10n ** 15n) / 1000;
    set('escrow', Math.round(gen), (n) => n.toLocaleString());
  }).catch(() => {});

  // ---------------------------------------------------------------- how it works
  const STEPS = [
    ['Draft', 'Terms in plain words, a short rubric.', () => [
      h('div', { class: 'mini' }, h('h4', null, 'Landing copy for Lumen'),
        h('p', { class: 'serif', style: { fontSize: '1.05rem', color: 'var(--ink-2)' } }, 'Hero, three feature blurbs and a closing call to action. Plain and warm, no hype. Mention offline mode.'),
        h('div', null,
          rubRow('live', 'Every evidence link opens', 1, true),
          rubRow('contains', 'Mentions "offline mode"', 2, true),
          rubRow('min_words', 'At least 120 words', 1, false),
          rubRow('judge', 'Covers notes, search and syncing', 2, false)))]],
    ['Fund', 'The maker locks the payment in escrow.', () => [
      h('div', { class: 'mini' }, h('div', { class: 'lockbox' }, icon('i-lock'), h('div', null, h('div', { class: 'big' }, '5 GEN'), h('span', { class: 'muted' }, 'held by the contract until a ruling'))),
        h('div', { class: 'stat-line' }, h('span', { class: 'chip brass' }, 'Open'), h('span', { class: 'chip quiet plain' }, 'Deadline in 7 days'), h('span', { class: 'chip quiet plain' }, 'Anyone can accept')))]],
    ['Deliver', 'The deliverer files a public link as evidence.', () => [
      h('div', { class: 'mini urlcard' }, h('span', { class: 'kind' }, 'Evidence · filed by the deliverer'),
        h('span', { class: 'u' }, 'https://lumen.example/launch-copy'), h('p', { class: 'serif muted' }, '"Final copy, all sections."'),
        h('div', { class: 'stat-line' }, h('span', { class: 'chip sky' }, 'Delivered')))]],
    ['Hear', 'Five validators read it, independently.', () => [
      h('div', { class: 'mini' }, h('h4', null, 'Each validator fetches the link itself'),
        h('div', { class: 'nodes-row' }, [1, 2, 3, 4, 5].map((n) => h('div', null, h('i'), `V${n}`))),
        h('p', { class: 'muted', style: { fontSize: '.92rem' } }, 'Code decides what code can. Models judge the rest, asked twice in opposite orders. Validators compare one word per criterion, exactly.'))]],
    ['Settle', 'Money moves as the ruling says.', () => {
      const [d, m] = split(5n * 10n ** 18n, 8333);
      return [h('div', { class: 'mini' }, h('h4', null, 'Ruling: partial, 83%'),
        h('div', { class: 'split' }, h('i', { class: 'to-d', style: { width: '83.33%' } }), h('i', { class: 'to-m', style: { width: '16.67%' } })),
        h('div', { class: 'split-legend' }, h('span', null, 'Deliverer ', h('b', null, `${fmtGen(d, 2)} GEN`)), h('span', null, 'Back to maker ', h('b', null, `${fmtGen(m, 2)} GEN`))))];
    }],
  ];
  const stageBox = h('div', { class: 'step-stage', 'aria-live': 'polite' });
  const buttons = STEPS.map(([name, blurb], i) => h('button', { 'aria-selected': String(i === 0), role: 'tab',
    onclick: () => select(i) }, h('strong', null, name), h('span', null, blurb)));
  function select(i) {
    buttons.forEach((b, j) => b.setAttribute('aria-selected', String(i === j)));
    stageBox.replaceChildren(...STEPS[i][2]());
  }
  select(0);
  const how = h('section', { class: 'section', id: 'how' }, h('div', { class: 'wrap' },
    h('div', { class: 'sec-head' }, h('span', { class: 'eyebrow' }, 'A hearing, start to finish'),
      h('h2', null, 'A handshake you can audit.'),
      h('p', { class: 'lede' }, 'In ancient Rome a tessera was a tablet broken in two. Each party kept a half, and the deal was proved when the halves fit. Here the halves are the terms and the evidence.')),
    h('div', { class: 'steps' }, h('div', { class: 'step-list', role: 'tablist' }, buttons), stageBox)));

  // ---------------------------------------------------------------- calculator
  const demoCrit = [
    { id: 'c1', type: 'live', text: 'Every evidence link opens', weight: 1, required: true },
    { id: 'c2', type: 'contains', text: 'Mentions "offline mode"', weight: 2, required: true },
    { id: 'c3', type: 'min_words', text: 'At least 120 words', weight: 1, required: false },
    { id: 'c4', type: 'judge', text: 'Covers notes, search and syncing', weight: 2, required: false },
  ];
  const vs = { c1: 'met', c2: 'met', c3: 'unmet', c4: 'met' };
  let finalRound = false;
  const rows = h('div'), out = h('div', { class: 'readout-card' });
  const final = h('label', { class: 'check' }, h('input', { type: 'checkbox', onchange: (e) => { finalRound = e.target.checked; paint(); } }), 'Final hearing (unclear counts as unmet)');
  function paint() {
    rows.replaceChildren(...demoCrit.map((c) => h('div', { class: 'crow' },
      h('div', { class: 'txt' }, h('strong', null, c.text), h('span', { class: 'kind ' + (c.type === 'judge' ? 'judge' : 'code') }, c.type === 'judge' ? 'Judged by validators' : 'Decided by code',
        h('span', { class: 'weight' }, ' · weight ', h('b', null, c.weight)), c.required ? h('span', { class: 'req' }, ' · required') : null)),
      h('div', { class: 'seg', role: 'group', 'aria-label': c.text }, ['met', 'unmet', 'unclear'].map((v) => h('button', { class: v, 'aria-pressed': String(vs[c.id] === v),
        onclick: () => { vs[c.id] = v; paint(); } }, v))))));
    const d = decide(demoCrit, vs, finalRound);
    const [toD, toM] = split(10n * 10n ** 18n, d.bps);
    const why = {
      fulfilled: 'Every criterion was met, so the deliverer receives the whole escrow.',
      partial: `The deliverer is paid the share of weight that was met: ${d.met} of ${d.total}.`,
      breached: demoCrit.some((c) => c.required && d.verdicts[c.id] === 'unmet') ? 'A required criterion failed. Nothing is paid and the escrow returns to the maker.' : 'Nothing was met. The escrow returns to the maker.',
      needs_evidence: 'Something could not be settled. The deliverer may add evidence, then a final hearing rules.',
    }[d.outcome];
    const label = { fulfilled: 'Fulfilled', partial: 'Partial', breached: 'Breached', needs_evidence: 'Needs evidence' }[d.outcome];
    out.replaceChildren(
      h('span', { class: 'eyebrow' }, 'The ruling'),
      h('div', { class: `verdict-big ${d.outcome}` }, d.outcome === 'partial' ? `${label} · ${pct(d.bps)}` : label),
      h('div', null, h('div', { class: 'split' }, h('i', { class: 'to-d', style: { width: `${d.bps / 100}%` } }), h('i', { class: 'to-m', style: { width: `${100 - d.bps / 100}%` } })),
        h('div', { class: 'split-legend' }, h('span', null, 'Deliverer ', h('b', null, `${fmtGen(toD, 2)} GEN`)), h('span', null, 'Back to maker ', h('b', null, `${fmtGen(toM, 2)} GEN`)))),
      h('p', { class: 'why' }, why));
  }
  paint();
  const calc = h('section', { class: 'section', style: { paddingTop: 0 }, id: 'rule' }, h('div', { class: 'wrap' },
    h('div', { class: 'sec-head' }, h('span', { class: 'eyebrow' }, 'The rule, in your hands'),
      h('h2', null, 'Every payout is arithmetic on agreed words.'),
      h('p', { class: 'lede' }, 'Validators never agree on prose. They agree on one of three words per criterion. The payout follows from those words with whole-number math, the same in the contract and in this page. Flip a verdict and see.')),
    h('div', { class: 'calc' }, h('div', { class: 'calc-card' }, rows, h('div', { style: { marginTop: '18px' } }, final)), h('div', { class: 'calc-card' }, out))));

  // ---------------------------------------------------------------- criteria kinds
  const kinds = h('section', { class: 'section', style: { paddingTop: 0 } }, h('div', { class: 'wrap' },
    h('div', { class: 'sec-head' }, h('span', { class: 'eyebrow' }, 'What a hearing checks'),
      h('h2', null, 'Code decides what code can. Models judge the rest.')),
    h('div', { class: 'kinds' },
      kindCard('i-link', 'Link opens', 'Every link the deliverer filed must answer with HTTP 200. A missing page is a failure; an unreachable one is unclear.'),
      kindCard('i-quote', 'Contains phrase', 'An exact phrase, in any language, must appear in the deliverer\'s page text. Case and punctuation are ignored.'),
      kindCard('i-length', 'Minimum length', 'The evidence must run to at least N words. No judgement involved, no model in the loop.'),
      kindCard('i-scale', 'Judged', 'A plain-language criterion, asked of each validator\'s model twice in opposite orders. If the two answers differ the verdict is unclear.', true))));

  // ---------------------------------------------------------------- scenarios
  const scen = h('section', { class: 'section', style: { paddingTop: 0 }, id: 'scenarios' }, h('div', { class: 'wrap' },
    h('div', { class: 'sec-head' }, h('span', { class: 'eyebrow' }, 'Try it'),
      h('h2', null, 'Four deliveries, four rulings.'),
      h('p', { class: 'lede' }, 'Each card drafts the same pact with a different delivery already published for validators to read. Pick one, file the evidence, and hold the hearing.')),
    h('div', { class: 'scen' }, SCENARIOS.map((s) => h('a', { class: 'scen-card spot', href: `#/new?scenario=${s.id}` },
      h('div', { style: { display: 'grid', gap: '12px' } }, h('span', { class: `chip ${s.tone}`, style: { justifySelf: 'start' } }, s.tag), h('h3', null, s.title), h('p', null, s.blurb)),
      h('span', { class: 'go' }, 'Draft this pact', icon('i-arrow')))))));

  // ---------------------------------------------------------------- straight talk
  const talk = h('section', { class: 'section', style: { paddingTop: 0 } }, h('div', { class: 'wrap' },
    h('div', { class: 'sec-head' }, h('span', { class: 'eyebrow' }, 'Straight talk'), h('h2', null, 'What Tessera is, and is not.')),
    h('div', { class: 'talk' },
      h('div', null, h('h4', null, 'A consensus of models, not a court'), h('p', null, 'A ruling is a repeatable procedure that every party can read before agreeing. It carries no legal force and it is not legal advice.')),
      h('div', null, h('h4', null, 'Evidence must be public'), h('p', null, 'Validators fetch your links themselves. A page behind a login cannot be read, and a page that changes between reads can make a ruling unclear.')),
      h('div', null, h('h4', null, 'Test funds only'), h('p', null, 'This runs on GenLayer Studionet, a test environment. GEN here has no value and the network can be reset. Do not put anything real behind it.')))));

  root.append(hero, ledger, how, calc, kinds, scen, talk);
  return { node: root, cleanup: () => { stopList.forEach((s) => s()); chamber.destroy(); } };
}

function rubRow(type, text, weight, required) {
  return h('div', { class: 'rub-row' },
    h('div', { class: 'txt' }, h('span', null, text), h('span', { class: `kind ${type === 'judge' ? 'judge' : 'code'}` }, type === 'judge' ? 'Judged by validators' : 'Decided by code')),
    h('span', { class: 'weight' }, 'weight ', h('b', null, weight), required ? h('span', { class: 'req' }, ' · required') : null));
}

function kindCard(ico, title, body, judged) {
  return h('div', { class: `kind-card${judged ? ' j' : ''}` }, icon(ico, 'ico'), h('h4', null, title), h('p', null, body),
    h('span', { class: `kind ${judged ? 'judge' : 'code'}` }, judged ? 'Judged by validators' : 'Decided by code'));
}
