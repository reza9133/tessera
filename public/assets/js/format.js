// Small shared helpers. Nothing here ever writes untrusted text as HTML.

/** h('div', { class: 'x', onclick }, child, 'text', [more]) -> HTMLElement. Text is always a text node. */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v; // trusted, static markup only
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

export function svg(markup, cls) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  const el = t.content.firstElementChild;
  if (cls) el.setAttribute('class', cls);
  return el;
}

/** <svg><use href="#id"/></svg> from the sprite in index.html */
export function icon(id, cls = '') {
  return svg(`<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`);
}

// ---------- addresses, amounts, time ----------
export const ZERO = '0x0000000000000000000000000000000000000000';
export const isZero = (a) => !a || a.toLowerCase() === ZERO;
export const short = (a) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || '');
export const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function fmtGen(wei, maxDecimals = 3) {
  const v = BigInt(wei || 0);
  const whole = v / 10n ** 18n;
  let frac = (v % 10n ** 18n).toString().padStart(18, '0').slice(0, maxDecimals).replace(/0+$/, '');
  const w = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac ? `${w}.${frac}` : w;
}

/** '2.5' -> 2500000000000000000n, or null when it is not a positive decimal with up to 18 places. */
export function parseGen(text) {
  const t = String(text ?? '').trim();
  if (!/^\d+(\.\d{1,18})?$/.test(t)) return null;
  const [w, f = ''] = t.split('.');
  const v = BigInt(w) * 10n ** 18n + BigInt(f.padEnd(18, '0'));
  return v > 0n ? v : null;
}

export const nowSec = () => Math.floor(Date.now() / 1000);

export function ago(ts) {
  if (!ts) return '—';
  const d = nowSec() - ts;
  if (d < 45) return 'just now';
  if (d < 3600) return `${Math.round(d / 60)} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  if (d < 86400 * 45) return `${Math.round(d / 86400)} d ago`;
  return fmtDate(ts);
}

export function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function timeLeft(ts) {
  if (!ts) return 'no deadline';
  const d = ts - nowSec();
  if (d <= 0) return 'deadline passed';
  if (d < 3600) return `${Math.max(1, Math.round(d / 60))} min left`;
  if (d < 86400) return `${Math.round(d / 3600)} h left`;
  return `${Math.round(d / 86400)} d left`;
}

export function pct(bps) {
  const v = bps / 100;
  return `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }); ta.value = text;
    document.body.append(ta); ta.select();
    const ok = document.execCommand?.('copy'); ta.remove(); return !!ok;
  }
}

/** Only http(s) links become anchors. The contract enforces this too. */
export function safeLink(url, label, cls = 'u') {
  if (!/^https?:\/\//i.test(url)) return h('span', { class: cls }, label ?? url);
  return h('a', { class: cls, href: url, target: '_blank', rel: 'noopener noreferrer nofollow' }, label ?? url);
}

// ---------- identicon: a tessera per address, two mirrored halves ----------
export function identicon(address, cls = 'ident') {
  const a = (address || ZERO).toLowerCase();
  // FNV-1a over the whole string, then a xorshift stream: repeated bytes still give distinct faces
  let seed = 2166136261;
  for (let i = 0; i < a.length; i++) { seed ^= a.charCodeAt(i); seed = Math.imul(seed, 16777619) >>> 0; }
  const next = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed; };
  const hue = next() % 360, hue2 = (hue + 40 + (next() % 80)) % 360;
  let cells = '';
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) {
    if (next() % 5 < 3) {
      const fill = next() % 3 === 0 ? `hsl(${hue2} 80% 70%)` : `hsl(${hue} 78% 66%)`;
      cells += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
      if (x < 2) cells += `<rect x="${4 - x}" y="${y}" width="1" height="1" fill="${fill}"/>`;
    }
  }
  return svg(`<svg viewBox="0 0 5 5" shape-rendering="crispEdges" role="img" aria-label="avatar"><rect width="5" height="5" fill="hsl(${hue} 45% 16%)"/>${cells}</svg>`, cls);
}

// ---------- metadata shared by views ----------
export const STATUS = {
  open: { label: 'Open', tone: 'iris', hint: 'Funded, waiting for someone to accept.' },
  active: { label: 'In progress', tone: 'sky', hint: 'Accepted. Waiting for delivery.' },
  delivered: { label: 'Delivered', tone: 'brass', hint: 'Evidence filed. A hearing can be requested.' },
  needs_evidence: { label: 'Needs evidence', tone: 'iris', hint: 'The hearing could not settle everything. The deliverer may add evidence.' },
  ruled: { label: 'Ruled', tone: 'brass', hint: 'A ruling stands. Funds move on settlement.' },
  contested: { label: 'Contested', tone: 'coral', hint: 'Counter-evidence filed. The final hearing is pending.' },
  settled: { label: 'Settled', tone: 'mint', hint: 'Funds moved as ruled.' },
  cancelled: { label: 'Cancelled', tone: 'quiet', hint: 'The maker took the pact back before anyone accepted.' },
  expired: { label: 'Expired', tone: 'quiet', hint: 'The deadline passed. The escrow returned to the maker.' },
};

export const OUTCOME = {
  fulfilled: { label: 'Fulfilled', tone: 'mint' },
  partial: { label: 'Partial', tone: 'brass' },
  breached: { label: 'Breached', tone: 'coral' },
  needs_evidence: { label: 'Needs evidence', tone: 'iris' },
};

export const KIND = {
  live: { label: 'Link opens', code: true, blurb: 'Every evidence link answers with HTTP 200.' },
  contains: { label: 'Contains phrase', code: true, blurb: 'The evidence text contains an exact phrase.' },
  min_words: { label: 'Minimum length', code: true, blurb: 'The evidence has at least N words.' },
  judge: { label: 'Judged', code: false, blurb: 'Validators judge it in plain language.' },
};

export function statusChip(status) {
  const m = STATUS[status] || { label: status, tone: 'quiet' };
  return h('span', { class: `chip ${m.tone}`, title: m.hint }, m.label);
}

export function outcomeChip(outcome) {
  const m = OUTCOME[outcome];
  return m ? h('span', { class: `chip ${m.tone}` }, m.label) : null;
}

/** Follow the pointer on .spot elements with a soft light. One listener for the whole page. */
export function installSpotlight() {
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest?.('.spot');
    if (!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--mx', `${e.clientX - r.left}px`);
    t.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function countUp(el, to, { duration = 1200, format = (n) => String(n) } = {}) {
  if (reducedMotion() || to <= 0) { el.textContent = format(to); return; }
  const t0 = performance.now();
  const tick = (t) => {
    const p = Math.min(1, (t - t0) / duration);
    el.textContent = format(Math.round(to * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
