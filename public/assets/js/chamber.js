// The hearing chamber: evidence comes in, five validators read it independently,
// their verdicts converge, the two halves of the tablet fit, a seal is struck.
// One component, two uses: a looping demo on the landing page, and a live view
// driven by real transaction phases while a hearing runs on the network.

import { svg, sleep, reducedMotion } from './format.js';

const L = 'M14 12H33L29 21L36 29L28 38L34 46L30 52H14a8 8 0 0 1-8-8V20a8 8 0 0 1 8-8Z';
const R = 'M36 12H50a8 8 0 0 1 8 8V44a8 8 0 0 1-8 8H33L37 46L31 38L39 29L32 21Z';
const C = 320, RAD = 252;

const SEAL = { fulfilled: '100%', partial: '', breached: '✕', needs_evidence: '?' };

export function mountChamber(container) {
  const pos = (i) => {
    const a = ((-90 + i * 72) * Math.PI) / 180;
    return [C + RAD * Math.cos(a), C + RAD * Math.sin(a), Math.cos(a), Math.sin(a)];
  };
  const nodes = [0, 1, 2, 3, 4].map((i) => {
    const [x, y] = pos(i);
    return `<g class="v" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
      <circle class="halo" r="40"/><circle class="vring" r="24"/><circle class="core" r="7"/>
      <path class="tick" d="M-8 0 L-2.5 5.5 L8.5 -6.5"/></g>`;
  }).join('');
  const beams = [0, 1, 2, 3, 4].map((i) => {
    const [x, y, cx, cy] = pos(i);
    return `<line class="beam" x1="${(x - cx * 30).toFixed(1)}" y1="${(y - cy * 30).toFixed(1)}" x2="${(C + cx * 118).toFixed(1)}" y2="${(C + cy * 118).toFixed(1)}"/>`;
  }).join('');
  const doc = (dy) => `<g class="doc" style="--dy:${dy}px"><rect x="-19" y="-24" width="38" height="48" rx="6"/>
      <line x1="-10" y1="-10" x2="10" y2="-10"/><line x1="-10" y1="0" x2="10" y2="0"/><line x1="-10" y1="10" x2="3" y2="10"/></g>`;

  const root = svg(`<svg class="chamber" viewBox="0 0 640 640" data-phase="idle" data-outcome="fulfilled" aria-hidden="true" focusable="false">
    <defs><radialGradient id="aura-grad"><stop offset="0" stop-color="#8C9BFF" stop-opacity=".55"/><stop offset=".55" stop-color="#4F63FF" stop-opacity=".16"/><stop offset="1" stop-color="#4F63FF" stop-opacity="0"/></radialGradient></defs>
    <circle class="aura" cx="${C}" cy="${C}" r="230"/>
    <g class="rings"><circle class="ring r1" cx="${C}" cy="${C}" r="126"/><circle class="ring r2" cx="${C}" cy="${C}" r="188" stroke-dasharray="2 9"/>
      <circle class="ring r3" cx="${C}" cy="${C}" r="252" stroke-dasharray="1 13"/></g>
    <g class="beams">${beams}</g>
    <g transform="translate(${C} ${C})"><g class="docs">${doc(-78)}${doc(0)}${doc(78)}</g></g>
    <g transform="translate(${C} ${C})">
      <g class="half half-l"><path class="ml" transform="translate(-147.2 -147.2) scale(4.6)" d="${L}"/></g>
      <g class="half half-r"><path class="mr" transform="translate(-147.2 -147.2) scale(4.6)" d="${R}"/></g>
    </g>
    <circle class="pulse" cx="${C}" cy="${C}" r="130"/>
    <g class="nodes">${nodes}</g>
    <g class="seal"><circle class="seal-disc" cx="452" cy="428" r="40"/><circle class="seal-ring" cx="452" cy="428" r="33"/>
      <text class="seal-text" x="452" y="429">100%</text></g>
    <text class="readout" x="${C}" y="622"></text>
  </svg>`);
  container.append(root);

  const vs = [...root.querySelectorAll('.v')];
  const bs = [...root.querySelectorAll('.beam')];
  const sealText = root.querySelector('.seal-text');
  const readout = root.querySelector('.readout');
  let waitTimer = null;

  const api = {
    el: root,
    set(phase, { outcome, bps, readoutText } = {}) {
      root.dataset.phase = phase;
      if (outcome) {
        root.dataset.outcome = outcome;
        sealText.textContent = outcome === 'partial' ? `${Math.round((bps ?? 0) / 100)}%` : outcome === 'fulfilled' ? '100%' : SEAL[outcome] ?? '';
      }
      if (readoutText !== undefined) readout.textContent = readoutText;
    },
    node(i, on, agree = false) {
      vs[i].classList.toggle('on', on);
      vs[i].classList.toggle('agree', on && agree);
      bs[i].classList.toggle('on', on);
    },
    clear() { vs.forEach((_, i) => api.node(i, false)); },
    agreeAll() { vs.forEach((_, i) => api.node(i, true, true)); },
    /** While the network works, keep the nodes breathing so the wait feels alive. */
    waiting(on) {
      clearInterval(waitTimer);
      if (!on) return;
      let i = 0;
      waitTimer = setInterval(() => { api.node(i % 5, true); if (i >= 5) api.node((i - 5) % 5, false); i++; }, 650);
    },
    destroy() { clearInterval(waitTimer); root.remove(); },
  };
  return api;
}

const OUTCOMES = [
  { outcome: 'fulfilled', bps: 10000, text: 'Ruling: fulfilled. 100% to the deliverer.' },
  { outcome: 'partial', bps: 6000, text: 'Ruling: partial. 60% to the deliverer, 40% back.' },
  { outcome: 'breached', bps: 0, text: 'Ruling: breached. The escrow returns to the maker.' },
];

/** Loop the demo until stop() is called. Pauses off-screen and in background tabs. */
export function runDemo(chamber, caption) {
  let alive = true, visible = true;
  const say = (html) => { if (caption) caption.innerHTML = html; };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.15 });
  io.observe(chamber.el);
  const idle = async (ms) => { let waited = 0; while (alive && waited < ms) { await sleep(120); if (visible && !document.hidden) waited += 120; } };

  if (reducedMotion()) {
    chamber.agreeAll(); chamber.set('ruled', { outcome: 'fulfilled', bps: 10000 });
    say('<b>5 of 5 agree</b> · Ruling: fulfilled. 100% to the deliverer.');
    return () => { alive = false; io.disconnect(); };
  }

  (async () => {
    let n = 0;
    while (alive) {
      const o = OUTCOMES[n++ % OUTCOMES.length];
      chamber.clear(); chamber.set('idle', { outcome: o.outcome, bps: o.bps });
      say('Awaiting evidence'); await idle(1100); if (!alive) break;
      chamber.set('intake'); say('<b>Evidence filed</b> · 3 links'); await idle(1700); if (!alive) break;
      chamber.set('reading'); say('<b>5 validators</b> reading independently');
      for (let i = 0; i < 5 && alive; i++) { chamber.node(i, true); await idle(420); }
      await idle(700); if (!alive) break;
      say('Comparing verdicts, word for word'); chamber.set('converge'); await idle(1000); if (!alive) break;
      chamber.agreeAll(); chamber.set('ruled', { outcome: o.outcome, bps: o.bps });
      say(`<b>5 of 5 agree</b> · ${o.text}`);
      await idle(3600);
    }
  })();
  return () => { alive = false; io.disconnect(); };
}
