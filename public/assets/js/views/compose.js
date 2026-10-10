import { h, icon, parseGen, fmtGen, pct, KIND, isZero, same } from '../format.js';
import { normalizeCriteria, checkUrl, LIMITS, decide, split } from '../rules.js';
import { txFlow, toast } from '../ui.js';
import { scenarioById, scenarioForm, evidenceUrl, DEMO_TERMS, DEMO_CRITERIA } from '../scenarios.js';

const DRAFT = 'tessera.draft';
const DAYS = [1, 3, 7, 14, 30, 60, 90];
const WEIGHTS = [[1, '1 · minor'], [2, '2 · normal'], [3, '3 · important'], [4, '4'], [5, '5 · major']];
const CONTEST = [[0, 'None. Settle right after the ruling'], [1, '1 hour'], [6, '6 hours'], [24, '24 hours'], [72, '72 hours']];

export async function renderCompose(ctx) {
  const { chain, query, go } = ctx;
  const scen = scenarioById(query.get('scenario'));
  let f;
  try { f = scen ? scenarioForm(scen) : JSON.parse(sessionStorage.getItem(DRAFT)); } catch { f = null; }
  f = { title: '', terms: '', criteria: [{ type: 'judge', text: '', weight: 2, required: false }], counterparty: '', stake: '5', days: 7, contest: 0, ...(f || {}) };
  f.criteria = f.criteria.map((c) => ({ type: 'judge', weight: 2, required: false, text: '', arg: '', ...c }));
  const hint = scen ? { evidence: evidenceUrl(scen), expect: scen.expect, title: scen.title } : null;

  const preview = h('div', { class: 'preview-col' });
  const critBox = h('div', { class: 'stack', style: { gap: '14px' } });
  const errBox = h('div', { class: 'err', role: 'alert' });
  const submit = h('button', { class: 'btn btn-brass btn-block', onclick: lockIt }, icon('i-lock'), 'Lock funds and create the pact');
  const save = () => { try { sessionStorage.setItem(DRAFT, JSON.stringify(f)); } catch { /* ignore */ } };

  // ---------------------------------------------------------------- validation
  function check() {
    const errs = [];
    const title = f.title.trim().replace(/\s+/g, ' ');
    if (title.length < 3 || title.length > LIMITS.maxTitle) errs.push(`Give it a title of 3 to ${LIMITS.maxTitle} characters.`);
    const terms = f.terms.trim();
    if (terms.length < LIMITS.minTerms || terms.length > LIMITS.maxTerms) errs.push(`The terms need ${LIMITS.minTerms} to ${LIMITS.maxTerms} characters.`);
    const n = normalizeCriteria(f.criteria.map((c) => ({ type: c.type, text: c.text, arg: c.arg, weight: c.weight, required: !!c.required })));
    if (!n.ok) errs.push(n.reason.charAt(0).toUpperCase() + n.reason.slice(1) + '.');
    const stake = parseGen(f.stake);
    if (!stake) errs.push('Enter an escrow amount in GEN, like 5 or 2.5.');
    const cp = f.counterparty.trim();
    if (cp && !/^0x[0-9a-fA-F]{40}$/.test(cp)) errs.push('The counterparty must be a full 0x address, or empty to open the pact to anyone.');
    if (cp && same(cp, chain.session?.address)) errs.push('You cannot name yourself as the counterparty.');
    return { errs, title, terms, criteria: n.ok ? n.criteria : null, stake, cp };
  }

  // ---------------------------------------------------------------- criteria editor
  function critRow(c, i) {
    const row = h('div', { class: 'crit' });
    const type = h('select', { class: 'select', 'aria-label': `Criterion ${i + 1} kind`, onchange: (e) => { c.type = e.target.value; if (c.type === 'live') { c.text = ''; c.arg = ''; } paintCrit(); update(); } },
      Object.entries(KIND).map(([k, v]) => h('option', { value: k, selected: c.type === k }, v.label)));
    const weight = h('select', { class: 'select w', 'aria-label': `Criterion ${i + 1} weight`, onchange: (e) => { c.weight = Number(e.target.value); update(); } },
      WEIGHTS.map(([v, l]) => h('option', { value: v, selected: c.weight === v }, l)));
    const rm = h('button', { class: 'rm', type: 'button', 'aria-label': `Remove criterion ${i + 1}`, disabled: f.criteria.length === 1, onclick: () => { f.criteria.splice(i, 1); paintCrit(); update(); } }, '×');
    row.append(h('div', { class: 'crit-top' }, type, weight, rm));
    if (c.type === 'judge') {
      row.append(h('input', { class: 'input', placeholder: 'What should the validators look for? e.g. The copy covers notes, search and syncing', value: c.text, maxlength: LIMITS.maxText, 'aria-label': 'Criterion text', oninput: (e) => { c.text = e.target.value; update(); } }));
    } else if (c.type === 'contains') {
      row.append(h('input', { class: 'input', placeholder: 'The exact phrase the page must contain, e.g. offline mode', value: c.arg, maxlength: LIMITS.maxArg, 'aria-label': 'Phrase', oninput: (e) => { c.arg = e.target.value; update(); } }));
    } else if (c.type === 'min_words') {
      row.append(h('input', { class: 'input', type: 'number', min: 1, max: LIMITS.maxWordsArg, placeholder: 'Minimum number of words, e.g. 120', value: c.arg, 'aria-label': 'Minimum words', oninput: (e) => { c.arg = e.target.value; update(); } }));
    } else {
      row.append(h('div', { class: 'hint' }, KIND.live.blurb));
    }
    row.append(h('div', { class: 'row', style: { justifyContent: 'space-between' } },
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!c.required, onchange: (e) => { c.required = e.target.checked; update(); } }), 'Required: if it fails, nothing is paid'),
      h('span', { class: `kind ${KIND[c.type].code ? 'code' : 'judge'}` }, KIND[c.type].code ? 'Decided by code' : 'Judged by validators')));
    return row;
  }
  function paintCrit() {
    critBox.replaceChildren(...f.criteria.map(critRow));
    add.disabled = f.criteria.length >= LIMITS.maxCriteria;
  }
  const add = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { f.criteria.push({ type: 'judge', text: '', arg: '', weight: 2, required: false }); paintCrit(); update(); } }, '+ Add a criterion');

  // ---------------------------------------------------------------- the preview document
  const testUrl = h('input', { class: 'input', placeholder: 'https://… a public page to try the rubric on', value: hint?.evidence ?? '', 'aria-label': 'Evidence link to test' });
  const testOut = h('div', { class: 'verdict-list' });
  const testBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: runTest }, 'Test the rubric');
  async function runTest() {
    const v = check();
    const bad = checkUrl(testUrl.value);
    if (!v.criteria || v.terms.length < LIMITS.minTerms) { testOut.replaceChildren(h('div', { class: 'err' }, 'Finish the terms and the rubric first.')); return; }
    if (bad) { testOut.replaceChildren(h('div', { class: 'err' }, bad.charAt(0).toUpperCase() + bad.slice(1) + '.')); return; }
    testBtn.disabled = true; testBtn.textContent = 'Reading…';
    testOut.replaceChildren(h('div', { class: 'hint' }, chain.mode === 'live' ? 'Asking the validators to read it. This simulation writes nothing and costs nothing.' : 'Reading the page with the sandbox judge.'));
    const res = await chain.preview(v.criteria.map(({ id, ...c }) => c), v.terms, testUrl.value.trim());
    testBtn.disabled = false; testBtn.textContent = 'Test the rubric';
    if (!res.ok) { testOut.replaceChildren(h('div', { class: 'err' }, res.reason)); return; }
    const r = res.ruling;
    const word = { fulfilled: 'Fulfilled', partial: `Partial · ${pct(r.bps)}`, breached: 'Breached', needs_evidence: 'Needs evidence' }[r.outcome];
    testOut.replaceChildren(
      ...v.criteria.map((c) => h('div', { class: 'verdict-row' }, h('span', null, c.text), h('span', { class: `verdict-badge ${r.verdicts[c.id]}` }, r.verdicts[c.id]))),
      h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('strong', null, 'If this were delivered: ', word),
        h('span', { class: 'hint' }, res.engine === 'sandbox' ? 'sandbox keyword judge' : "validators' models")));
  }

  function paintPreview(v) {
    const total = v.criteria ? v.criteria.reduce((a, c) => a + c.weight, 0) : 0;
    preview.replaceChildren(
      h('div', { class: `tablet stacked${v.errs.length ? ' apart' : ''}` },
        h('div', { class: 't-l spot' }, h('div', { class: 'paper' },
          h('span', { class: 'paper-h' }, 'The pact'),
          h('h3', null, v.title || 'Untitled pact'),
          h('p', { class: `terms${v.terms ? '' : ' empty-t'}` }, v.terms || 'Your terms will read like this, in plain words.'),
          h('div', { class: 'kv' }, h('div', null, h('span', { class: 'k' }, 'Escrow'), h('dd', null, v.stake ? `${fmtGen(v.stake, 4)} GEN` : '—')),
            h('div', null, h('span', { class: 'k' }, 'Deadline'), h('dd', null, `${f.days} day${f.days > 1 ? 's' : ''}`)),
            h('div', null, h('span', { class: 'k' }, 'Contest window'), h('dd', null, f.contest ? `${f.contest} h` : 'none'))))),
        h('div', { class: 't-r spot' }, h('div', { class: 'paper' }, h('span', { class: 'paper-h' }, 'The rubric'),
          h('ol', null, f.criteria.map((c, i) => {
            const n = v.criteria?.[i];
            const text = n ? n.text : (c.type === 'judge' ? c.text : c.type === 'contains' ? `Mentions "${c.arg}"` : c.type === 'min_words' ? `At least ${c.arg || '…'} words` : 'Every evidence link opens');
            return h('li', null, h('span', null, text || 'A criterion…', h('br'), h('span', { class: `kind ${KIND[c.type].code ? 'code' : 'judge'}` }, KIND[c.type].code ? 'Decided by code' : 'Judged by validators')),
              h('span', { class: 'weight' }, 'weight ', h('b', null, c.weight), c.required ? h('span', { class: 'req' }, ' · required') : null));
          })),
          h('p', { class: 'hint' }, total ? `The deliverer is paid the share of weight that is met (out of ${total}). A failed required criterion pays nothing.` : ''))))
      , h('div', { class: 'panel testbox' }, h('h4', null, 'Try the rubric before you lock any funds'),
        h('p', { class: 'hint' }, 'Paste a public link and see how the criteria would rule on it right now.'), testUrl, testBtn, testOut));
  }

  function update() {
    const v = check();
    save();
    paintPreview(v);
    errBox.textContent = '';
    submit.disabled = v.errs.length > 0;
    submit.title = v.errs[0] || '';
    return v;
  }

  // ---------------------------------------------------------------- submit
  async function lockIt() {
    const v = check();
    if (v.errs.length) { errBox.textContent = v.errs[0]; return; }
    if (!chain.session && !(await ctx.ensureSession())) return;
    try {
      const bal = await chain.balance();
      if (bal < v.stake) { toast(`This account has ${fmtGen(bal, 2)} GEN. Use the account menu to get test GEN.`, 'bad'); return; }
    } catch { /* balance is advisory */ }
    const form = { title: v.title, terms: v.terms, criteria: v.criteria.map(({ id, ...c }) => c), counterparty: v.cp, stake: v.stake, days: Number(f.days), contest: Number(f.contest) };
    let id;
    const res = await txFlow({ chain, title: 'Locking your pact', sub: `${fmtGen(v.stake, 4)} GEN goes into escrow.`,
      run: async (onPhase) => { const r = await chain.createPact(form, { onPhase }); id = r.id; return r; } });
    if (res.ok && id) {
      sessionStorage.removeItem(DRAFT);
      if (hint) localStorage.setItem(`tessera.hint.${id}`, JSON.stringify(hint));
      toast('Pact created. The funds are in escrow.', 'ok');
      go(`/pact/${id}`);
    }
  }

  // ---------------------------------------------------------------- the form
  const field = (label, control, extra, hintText) => h('label', { class: 'field' }, h('span', { class: 'lbl' }, label, extra ? h('small', null, extra) : null), control, hintText ? h('span', { class: 'hint' }, hintText) : null);
  const counter = h('small', null, '');
  const terms = h('textarea', { class: 'textarea', placeholder: 'What is wanted, in plain words. Be specific about what “done” looks like.', maxlength: LIMITS.maxTerms, 'aria-label': 'Terms', oninput: (e) => { f.terms = e.target.value; counter.textContent = `${e.target.value.length} / ${LIMITS.maxTerms}`; update(); } }, f.terms);
  counter.textContent = `${f.terms.length} / ${LIMITS.maxTerms}`;

  const form = h('div', { class: 'form' },
    h('div', { class: 'fgroup' }, h('div', { class: 'fgroup-h' }, 'The deal'),
      field('Title', h('input', { class: 'input', value: f.title, maxlength: LIMITS.maxTitle, placeholder: 'e.g. Landing page copy for the Lumen notes app', 'aria-label': 'Title', oninput: (e) => { f.title = e.target.value; update(); } })),
      h('label', { class: 'field' }, h('span', { class: 'lbl' }, 'Terms', counter), terms)),
    h('div', { class: 'fgroup' }, h('div', { class: 'fgroup-h' }, 'The rubric', h('small', null, 'Up to five criteria')),
      h('p', { class: 'hint' }, 'Prefer criteria that code can decide. Judged criteria work best when they are specific and checkable.'),
      critBox, add),
    h('div', { class: 'fgroup' }, h('div', { class: 'fgroup-h' }, 'Escrow and timing'),
      h('div', { class: 'two' },
        field('Escrow (GEN)', h('input', { class: 'input', inputmode: 'decimal', value: f.stake, 'aria-label': 'Escrow in GEN', oninput: (e) => { f.stake = e.target.value; update(); } })),
        field('Deadline', h('select', { class: 'select', 'aria-label': 'Deadline', onchange: (e) => { f.days = Number(e.target.value); update(); } }, DAYS.map((d) => h('option', { value: d, selected: f.days === d }, `${d} day${d > 1 ? 's' : ''}`))))),
      field('Contest window', h('select', { class: 'select', 'aria-label': 'Contest window', onchange: (e) => { f.contest = Number(e.target.value); update(); } },
        CONTEST.map(([v, l]) => h('option', { value: v, selected: Number(f.contest) === v }, l))), null,
        'After a ruling, either party can add one more link and ask for a final hearing, until this window closes.'),
      field('Counterparty', h('input', { class: 'input mono', value: f.counterparty, placeholder: '0x… (optional: leave empty so anyone can accept)', 'aria-label': 'Counterparty address', oninput: (e) => { f.counterparty = e.target.value; update(); } }))),
    h('div', { class: 'action-box' }, submit, errBox, h('p', { class: 'hint' }, chain.mode === 'live'
      ? 'You will sign one transaction. The escrow stays in the contract until a ruling moves it.' : 'Sandbox: no real transaction. The escrow is simulated.')));

  paintCrit();
  const node = h('div', { class: 'page' }, h('div', { class: 'wrap' },
    h('div', { class: 'page-head' }, h('div', null, h('span', { class: 'eyebrow' }, scen ? `Scenario · ${scen.title}` : 'New pact'), h('h1', null, 'Draft a pact.'))),
    scen ? h('div', { class: 'notice info', style: { marginBottom: '26px' } }, h('b', null, 'Scenario ready. '), `Lock this pact, accept it as the other party, file the delivery link we prepared, and hold the hearing. Expected: ${scen.expect}.`) : null,
    h('div', { class: 'compose' }, form, preview)));
  update();
  return { node };
}
