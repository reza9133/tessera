import { h, $, sleep, icon } from './format.js';
import { mountChamber } from './chamber.js';

// ---------------------------------------------------------------- toasts
export function toast(text, tone = '', { ms = 5600 } = {}) {
  const host = $('#toasts');
  const el = h('div', { class: `toast ${tone}`, role: tone === 'bad' ? 'alert' : 'status' }, h('div', null, text),
    h('button', { 'aria-label': 'Dismiss', onclick: () => el.remove() }, '×'));
  host.append(el);
  if (ms) setTimeout(() => el.remove(), ms);
  return el;
}

// ---------------------------------------------------------------- popover anchored in the header
let closePop = null;
export function openPop(anchor, content) {
  closePop?.();
  const host = anchor.closest('.top');
  const pop = h('div', { class: 'pop', role: 'dialog' }, content);
  host.append(pop);
  const away = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const close = () => { pop.remove(); document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); closePop = null; };
  setTimeout(() => { document.addEventListener('pointerdown', away); document.addEventListener('keydown', esc); }, 0);
  closePop = close;
  return { close, el: pop };
}
export const closePopovers = () => closePop?.();

// ---------------------------------------------------------------- generic modal sheet
export function openSheet(content, { dismissible = true } = {}) {
  const prev = document.activeElement;
  const overlay = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true' }, h('div', { class: 'sheet' }, content));
  const close = () => { overlay.remove(); document.removeEventListener('keydown', esc); prev?.focus?.(); };
  const esc = (e) => { if (e.key === 'Escape' && dismissible) close(); };
  overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay && dismissible) close(); });
  document.addEventListener('keydown', esc);
  document.body.append(overlay);
  overlay.querySelector('button, input, textarea, select, a')?.focus();
  return { close, el: overlay };
}

// ---------------------------------------------------------------- the transaction overlay
const STEPS = ['Sign with your account', 'Submitted to the network', 'Validators reach agreement', 'Done'];

function stepIndex(phase) {
  switch (phase) {
    case 'signing': return 0;
    case 'submitted': case 'PENDING': case 'PROPOSING': return 1;
    case 'COMMITTING': case 'REVEALING': case 'LEADER_REVEALING': case 'APPEAL_COMMITTING': case 'APPEAL_REVEALING': return 2;
    case 'ACCEPTED': case 'FINALIZED': return 4;
    default: return -1;
  }
}

const READOUT = {
  signing: 'Waiting for your signature',
  submitted: 'Submitted. Waiting for a leader',
  PENDING: 'Queued behind earlier calls to this contract',
  PROPOSING: 'The leader is fetching the evidence',
  COMMITTING: 'Validators are reading independently',
  LEADER_REVEALING: 'The leader reveals its reading',
  REVEALING: 'Validators reveal their verdicts',
};

/**
 * Run a write with a visible, honest progress view.
 *  run(onPhase)  -> { ok, reason?, hash? }
 *  after()       -> optional async; may return { outcome, bps } so a hearing can show its seal
 */
export async function txFlow({ chain, title, sub, hearing = false, run, after }) {
  const list = h('ol', { class: 'phases', 'aria-live': 'polite' }, STEPS.map((s) => h('li', null, h('i'), s)));
  const box = h('div', { class: 'stage-wrap chamber-sm', style: { aspectRatio: '1', maxWidth: '340px' } });
  const result = h('div', { class: 'result-line' });
  const link = h('a', { class: 'mono muted', target: '_blank', rel: 'noopener noreferrer', hidden: true }, 'View transaction');
  const foot = h('div', { class: 'row' });
  const cap = h('div', { class: 'stage-cap', style: { position: 'static', marginTop: '6px' } });
  const sheet = openSheet([
    h('div', null, h('span', { class: 'eyebrow' }, chain.mode === 'sandbox' ? 'Sandbox' : 'Studionet'), h('h3', { style: { marginTop: '12px' } }, title),
      sub ? h('p', { class: 'muted', style: { marginTop: '8px' } }, sub) : null),
    hearing ? h('div', null, box, cap) : null,
    list, result, link, foot,
  ], { dismissible: false });

  const chamber = hearing ? mountChamber(box) : null;
  let current = -1;
  const paint = (idx, failed) => {
    [...list.children].forEach((li, i) => {
      li.className = failed && i === Math.max(0, current) ? 'bad' : i < idx ? 'ok' : i === idx ? 'now' : '';
    });
  };
  paint(0);

  const onPhase = ({ phase, hash }) => {
    const idx = stepIndex(phase);
    if (idx >= 0 && idx >= current) { current = idx; paint(idx); }
    if (hash) { const u = chain.txUrl(hash); if (u) { link.href = u; link.hidden = false; } }
    if (!chamber) return;
    if (READOUT[phase]) cap.textContent = READOUT[phase];
    if (phase === 'signing' || phase === 'submitted' || phase === 'PENDING') chamber.set('idle');
    if (phase === 'PROPOSING') chamber.set('intake');
    if (['COMMITTING', 'LEADER_REVEALING', 'REVEALING'].includes(phase)) { chamber.set('reading'); chamber.waiting(true); }
  };

  let res;
  try { res = await run(onPhase); } catch (e) { res = { ok: false, reason: e?.message || 'Something went wrong.' }; }

  if (chamber) chamber.waiting(false);
  if (res.ok) {
    paint(4);
    let info = null;
    try { info = after ? await after() : null; } catch { /* reading back is best-effort here */ }
    if (chamber) {
      chamber.clear();
      if (info?.outcome) {
        chamber.set('converge'); chamber.agreeAll(); await sleep(700);
        chamber.set('ruled', { outcome: info.outcome, bps: info.bps });
        cap.textContent = info.caption || '';
      } else { chamber.set('idle'); }
    }
    result.textContent = info?.message || 'Done.';
    foot.append(h('button', { class: 'btn btn-primary', onclick: () => sheet.close() }, info?.button || 'Continue'));
  } else {
    paint(current, true);
    if (chamber) { chamber.clear(); chamber.set('idle'); }
    result.textContent = res.reason || 'The call was refused.';
    result.style.color = 'var(--coral)';
    foot.append(h('button', { class: 'btn btn-ghost', onclick: () => sheet.close() }, 'Close'));
  }
  foot.querySelector('button')?.focus();
  const done = new Promise((resolve) => foot.querySelector('button').addEventListener('click', () => resolve(), { once: true }));
  await done;
  return res;
}

// ---------------------------------------------------------------- small shared widgets
export function splitBar(stake, toDeliverer, toMaker, { label = true, animate = true } = {}) {
  const s = BigInt(stake || 0) || 1n;
  const d = Number((BigInt(toDeliverer || 0) * 10000n) / s) / 100;
  const m = Math.max(0, 100 - d);
  const bar = h('div', { class: 'split' }, h('i', { class: 'to-d', style: { width: animate ? '0%' : `${d}%` } }), h('i', { class: 'to-m', style: { width: animate ? '0%' : `${m}%` } }));
  if (animate) requestAnimationFrame(() => requestAnimationFrame(() => { bar.children[0].style.width = `${d}%`; bar.children[1].style.width = `${m}%`; }));
  return bar;
}

export function emptyState(title, body, cta) {
  return h('div', { class: 'empty' }, icon('i-mark', ''), h('h3', null, title), h('p', { class: 'muted', style: { maxWidth: '44ch' } }, body), cta);
}
