// Chain selection and the action layer shared by the live chain and the sandbox.

import { SandboxChain } from './chain-sandbox.js';
import { LiveChain } from './chain-live.js';

const DEFAULTS = {
  network: 'GenLayer Studionet', chainId: 61999, rpc: 'https://studio.genlayer.com/api',
  explorer: 'https://explorer-studio.genlayer.com', contract: '',
};
const MODE_KEY = 'tessera.mode';

async function loadConfig() {
  for (const url of ['/api/config', '/config.json']) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) return { ...DEFAULTS, ...(await r.json()) };
    } catch { /* try the next source */ }
  }
  return { ...DEFAULTS };
}

const isAddress = (a) => /^0x[0-9a-fA-F]{40}$/.test(a || '');

/** Picks live or sandbox. Returns { chain, config, notice }. Never throws: the sandbox is always there. */
export async function createChain() {
  const config = await loadConfig();
  const q = new URLSearchParams(location.search);
  if (isAddress(q.get('contract'))) config.contract = q.get('contract');
  const wanted = q.get('mode') || localStorage.getItem(MODE_KEY) || (isAddress(config.contract) ? 'live' : 'sandbox');
  let notice = null;

  if (wanted === 'live') {
    if (!isAddress(config.contract)) {
      notice = { tone: 'info', text: 'No contract address is configured yet, so this is running in the sandbox. Deploy contracts/tessera.py to Studionet and set CONTRACT_ADDRESS.' };
    } else {
      try {
        const live = await new LiveChain(config).init();
        return finish(live, config, null);
      } catch (e) {
        console.warn('live chain unavailable', e);
        notice = { tone: 'warn', text: 'Studionet did not answer, so you are in the sandbox. Nothing here touches the network.', retry: true };
      }
    }
  }
  return finish(await new SandboxChain().init(), config, notice);
}

export function setPreferredMode(mode) { localStorage.setItem(MODE_KEY, mode); }

function finish(chain, config, notice) {
  attachActions(chain);
  chain.hasLive = isAddress(config.contract);
  return { chain, config, notice };
}

/** Friendly wrappers. Each returns { ok, reason?, id?, hash? } and reports phases through opts.onPhase. */
function attachActions(chain) {
  const w = (method, args, opts) => chain.write(method, args, opts);
  chain.createPact = async (f, opts = {}) => {
    const res = await w('create_pact', [f.title, f.terms, JSON.stringify(f.criteria), f.counterparty || '', f.days, f.contest], { ...opts, value: f.stake });
    if (res.ok && !res.id) {
      const s = await chain.stats();
      res.id = String(s.next_id - 1);
    }
    return res;
  };
  chain.acceptPact = (id, o) => w('accept_pact', [String(id)], o);
  chain.cancelPact = (id, o) => w('cancel_pact', [String(id)], o);
  chain.submitDelivery = (id, url, note, o) => w('submit_delivery', [String(id), url, note || ''], o);
  chain.requestRuling = (id, o) => w('request_ruling', [String(id)], o);
  chain.contestRuling = (id, url, note, o) => w('contest_ruling', [String(id), url, note || ''], o);
  chain.settlePact = (id, o) => w('settle_pact', [String(id)], o);
  chain.expirePact = (id, o) => w('expire_pact', [String(id)], o);
}
