import { h, $, $$, icon, installSpotlight, short, fmtGen, copyText, identicon } from './format.js';
import { createChain, setPreferredMode } from './chain.js';
import { toast, openPop, closePopovers, openSheet } from './ui.js';
import { renderLanding } from './views/landing.js';
import { renderDocket } from './views/docket.js';
import { renderCompose } from './views/compose.js';
import { renderPact } from './views/pact.js';
import { renderStanding } from './views/standing.js';
import { renderRules } from './views/rulespage.js';

const ROUTES = {
  '': [renderLanding, 'Agreements that rule themselves'],
  docket: [renderDocket, 'The docket'],
  new: [renderCompose, 'Draft a pact'],
  pact: [renderPact, 'Pact'],
  standing: [renderStanding, 'Standing'],
  rules: [renderRules, 'The rules'],
};

// ---------------------------------------------------------------- theme
const root = document.documentElement;
function applyTheme(t) {
  root.dataset.theme = t;
  localStorage.setItem('tessera.theme', t);
  const b = $('#theme');
  if (b) b.replaceChildren(icon(t === 'dark' ? 'i-sun' : 'i-moon'));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0A1042' : '#F3F5FF');
}
applyTheme(localStorage.getItem('tessera.theme') || 'dark'); // the chamber is designed in the dark; light is one click away

// ---------------------------------------------------------------- boot
const view = $('#view');
let ctx, current = null, token = 0;

async function boot() {
  installSpotlight();
  view.replaceChildren(h('div', { class: 'wrap', style: { padding: '120px 24px', textAlign: 'center' }, role: 'status' }, h('span', { class: 'muted' }, 'Opening the chamber…')));
  const { chain, config, notice } = await createChain();
  ctx = { chain, config, query: new URLSearchParams(), params: [],
    go: (path) => { location.hash = '#' + path; },
    refresh: () => render(true), ensureSession };
  window.tessera = ctx; // handy in the console while developing

  buildHeader(chain, notice);
  fillFooter(chain);
  addEventListener('hashchange', () => render(false));
  document.addEventListener('keydown', (e) => { if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); location.hash = '#/docket'; setTimeout(() => $('.search')?.focus(), 80); } });
  await render(false);
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  const [name = '', ...params] = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { name, params, query: new URLSearchParams(qs) };
}

async function render(keepScroll) {
  const my = ++token;
  const { name, params, query } = parseHash();
  const route = ROUTES[name] ?? ROUTES[''];
  ctx.params = params; ctx.query = query;
  closePopovers();
  $$('.nav a').forEach((a) => { if (a.dataset.route === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  $('.nav')?.classList.remove('open');
  const y = scrollY;
  current?.cleanup?.();
  let out;
  try { out = await route[0](ctx); } catch (e) {
    console.error(e);
    out = { node: h('div', { class: 'page' }, h('div', { class: 'wrap' }, h('div', { class: 'empty' }, h('h3', null, 'That did not load'), h('p', { class: 'muted' }, 'The network may be slow or unreachable. Nothing was lost.'),
      h('div', { class: 'row' }, h('button', { class: 'btn btn-primary', onclick: () => render(false) }, 'Try again'), h('a', { class: 'btn btn-ghost', href: '#/' }, 'Home'))))) };
  }
  if (my !== token) { out.cleanup?.(); return; }
  current = out;
  view.replaceChildren(out.node);
  document.title = name === 'pact' && params[0] ? `Pact #${params[0]} · Tessera` : `${route[1]} · Tessera`;
  if (keepScroll) scrollTo(0, y); else { scrollTo(0, 0); view.focus({ preventScroll: true }); }
}

// ---------------------------------------------------------------- header
function buildHeader(chain, notice) {
  const right = $('#top-r');
  const net = h('button', { class: 'net-pill', 'aria-haspopup': 'dialog', onclick: () => netMenu(net, chain) },
    h('i', { class: `dot ${chain.mode === 'live' ? 'live' : 'sand'}` }), h('span', { class: 't' }, chain.mode === 'live' ? 'Studionet' : 'Sandbox'));
  const acct = h('button', { class: 'btn btn-ghost btn-sm', id: 'acct', onclick: () => (chain.session ? acctMenu(acct, chain) : ensureSession()) });
  const theme = h('button', { class: 'icon-btn', id: 'theme', 'aria-label': 'Toggle theme', onclick: () => applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark') });
  right.replaceChildren(net, acct, theme);
  applyTheme(root.dataset.theme);
  const paintAcct = () => {
    const s = chain.session;
    acct.replaceChildren(...(s ? [identicon(s.address), h('span', null, s.kind === 'sandbox' ? s.label : short(s.address))] : ['Connect']));
  };
  paintAcct(); chain.onSession(paintAcct);

  $('#menu-btn').addEventListener('click', () => $('.nav').classList.toggle('open'));
  if (notice) {
    const b = h('div', { class: 'banner', role: 'status' }, h('div', { class: 'wrap' }, h('span', null, notice.text),
      notice.retry ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { setPreferredMode('live'); location.reload(); } }, 'Retry Studionet') : null));
    $('.top').after(b);
  }
}

function netMenu(anchor, chain) {
  const i = chain.info;
  const rows = [h('h4', null, chain.mode === 'live' ? 'GenLayer Studionet' : 'Sandbox'),
    h('p', { class: 'hint' }, chain.mode === 'live'
      ? `Chain ${i.chainId}. Every pact is a real transaction on the test network; GEN here has no value.`
      : 'Everything runs in your browser and is saved locally. It follows the same rules as the contract, with a keyword judge standing in for the validators.')];
  if (chain.mode === 'live') {
    rows.push(h('button', { class: 'btn btn-ghost btn-sm', onclick: () => copyText(i.contract).then(() => toast('Contract address copied')) }, `Contract ${short(i.contract)}`),
      h('a', { class: 'btn btn-ghost btn-sm', href: chain.addressUrl(i.contract), target: '_blank', rel: 'noopener noreferrer' }, 'View contract in the explorer'),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { setPreferredMode('sandbox'); location.reload(); } }, 'Switch to the sandbox'));
  } else if (chain.hasLive) {
    rows.push(h('button', { class: 'btn btn-primary btn-sm', onclick: () => { setPreferredMode('live'); location.reload(); } }, 'Switch to Studionet'));
  } else {
    rows.push(h('p', { class: 'hint' }, 'To go live, deploy contracts/tessera.py to Studionet and set CONTRACT_ADDRESS. See the README.'));
  }
  openPop(anchor, rows);
}

async function acctMenu(anchor, chain) {
  const s = chain.session;
  const bal = h('span', { class: 'mono' }, '…');
  chain.balance().then((b) => { bal.textContent = `${fmtGen(b, 3)} GEN`; }).catch(() => { bal.textContent = 'unknown'; });
  const rows = [h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center' } }, identicon(s.address, 'ident lg'),
    h('div', { style: { minWidth: 0 } }, h('h4', null, s.label), h('button', { class: 'copy', onclick: () => copyText(s.address).then(() => toast('Address copied')) }, h('span', { class: 'addr' }, short(s.address))), h('div', { class: 'hint' }, 'Balance ', bal)))];
  if (chain.mode === 'sandbox') {
    rows.push(h('span', { class: 'lbl' }, 'Act as'), ...chain.personas.map((p) => h('button', { class: 'persona', 'aria-pressed': String(p.id === chain.st.actor), onclick: () => { chain.connect(p.id).then(() => { closePopovers(); ctx.refresh(); }); } },
      identicon(p.address), h('span', null, p.name, h('small', null, p.role)))));
    rows.push(h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { chain.faucet().then(() => toast('+100 GEN', 'ok')); closePopovers(); } }, 'Get 100 test GEN'),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { chain.advance(86400); toast('Sandbox clock moved forward one day', 'ok'); closePopovers(); ctx.refresh(); } }, 'Fast-forward one day'),
      h('button', { class: 'btn btn-danger btn-sm', onclick: () => { chain.reset(); toast('Sandbox reset'); closePopovers(); ctx.refresh(); } }, 'Reset the sandbox'));
  } else {
    rows.push(h('a', { class: 'btn btn-ghost btn-sm', href: `#/standing/${s.address}`, onclick: closePopovers }, 'My standing'),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { const r = await chain.faucet(); toast(r.ok ? '+100 GEN requested' : r.reason, r.ok ? 'ok' : 'bad', { ms: r.ok ? 4000 : 12000 }); closePopovers(); } }, 'Get test GEN'));
    if (s.kind === 'burner') {
      rows.push(h('button', { class: 'btn btn-ghost btn-sm', onclick: () => keySheet(chain) }, 'Back up or import the key'));
    }
    rows.push(h('button', { class: 'btn btn-danger btn-sm', onclick: () => { chain.disconnect(); closePopovers(); ctx.refresh(); } }, 'Disconnect'));
  }
  openPop(anchor, rows);
}

function keySheet(chain) {
  closePopovers();
  const imp = h('input', { class: 'input mono', placeholder: '0x… private key to import', 'aria-label': 'Private key' });
  const sheet = openSheet([h('h3', null, 'Burner account key'),
    h('p', { class: 'muted' }, 'This key lives only in this browser and controls a test account. Anyone who has it controls the account. Never use a key that holds real funds.'),
    h('button', { class: 'btn btn-ghost', onclick: () => copyText(chain.exportKey()).then(() => toast('Key copied. Keep it somewhere safe.')) }, 'Copy this account\'s key'),
    imp, h('div', { class: 'row' }, h('button', { class: 'btn btn-primary', onclick: () => { try { chain.importKey(imp.value.trim()); sheet.close(); toast('Imported', 'ok'); ctx.refresh(); } catch (e) { toast(e.message, 'bad'); } } }, 'Import key'),
      h('button', { class: 'btn btn-ghost', onclick: () => sheet.close() }, 'Close'))]);
}

function ensureSession() {
  const chain = ctx.chain;
  if (chain.session) return Promise.resolve(chain.session);
  return new Promise((resolve) => {
    const pick = async (kind) => { try { await chain.connect(kind); sheet.close(); } catch (e) { toast(e.message, 'bad', { ms: 9000 }); } };
    const sheet = openSheet([h('div', null, h('span', { class: 'eyebrow' }, 'Studionet'), h('h3', { style: { marginTop: '12px' } }, 'Choose how to sign')),
      h('p', { class: 'muted' }, 'Pacts are transactions. Sign with a browser wallet, or let Tessera hold a throwaway test account for you.'),
      h('button', { class: 'btn btn-primary btn-block', disabled: !chain.hasWallet, onclick: () => pick('wallet') }, chain.hasWallet ? 'Browser wallet (MetaMask)' : 'No browser wallet detected'),
      h('button', { class: 'btn btn-ghost btn-block', onclick: () => pick('burner') }, 'Instant burner account'),
      h('p', { class: 'hint' }, 'A burner account is created in this browser and needs test GEN. You can fund it from the account menu.')]);
    const mo = new MutationObserver(() => { if (!document.body.contains(sheet.el)) { mo.disconnect(); resolve(chain.session ?? null); } });
    mo.observe(document.body, { childList: true });
  });
}

function fillFooter(chain) {
  const ex = $('#nav-explorer');
  if (ex && chain.mode === 'live' && chain.info.contract) ex.href = chain.addressUrl(chain.info.contract);
  const el = $('#foot-net');
  if (!el) return;
  el.replaceChildren(chain.mode === 'live' && chain.info.contract
    ? h('li', null, h('a', { href: chain.addressUrl(chain.info.contract), target: '_blank', rel: 'noopener noreferrer' }, `Contract ${short(chain.info.contract)}`))
    : h('li', { class: 'muted' }, 'Sandbox mode'));
}

boot();
