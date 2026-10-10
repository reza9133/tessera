// Live chain: talks to the deployed Tessera contract on GenLayer Studionet with genlayer-js.
//
// Design rules this file follows, because the network is not something a browser can assume:
//  - every contract view returns a JSON string, so nothing depends on how the SDK decodes maps or big ints
//  - a refused write is read back from the contract's refusal ledger, not parsed out of a receipt
//  - after every write the caller re-reads state; the receipt is only used for progress

import { sleep } from './format.js';

const SDK_VERSION = '1.1.8';
const SDK_LOCAL = '/vendor/genlayer.js';
const SDK_CDN = `https://esm.sh/genlayer-js@${SDK_VERSION}`;
const DEFAULT_RPC = 'https://studio.genlayer.com/api';
const BURNER_KEY = 'tessera.burner';
const WALLET_KEY = 'tessera.wallet';

const STATUS_NAMES = ['UNINITIALIZED', 'PENDING', 'PROPOSING', 'COMMITTING', 'REVEALING', 'ACCEPTED', 'UNDETERMINED', 'FINALIZED',
  'CANCELED', 'APPEAL_REVEALING', 'APPEAL_COMMITTING', 'VALIDATORS_TIMEOUT', 'LEADER_TIMEOUT', 'LEADER_REVEALING'];
/** True only when the receipt says the contract call ended in an error. */
function executionFailed(tx) {
  if (!tx) return false;
  const name = tx.txExecutionResultName ?? tx.tx_execution_result_name;
  if (typeof name === 'string' && name) return name === 'FINISHED_WITH_ERROR';
  const code = tx.txExecutionResult ?? tx.tx_execution_result;
  return typeof code === 'number' && code === 2;
}

const TERMINAL = new Set(['ACCEPTED', 'FINALIZED', 'UNDETERMINED', 'CANCELED', 'LEADER_TIMEOUT', 'VALIDATORS_TIMEOUT']);

export function statusOf(tx) {
  const s = tx?.statusName ?? tx?.status_name ?? tx?.status;
  if (typeof s === 'number') return STATUS_NAMES[s] ?? 'PENDING';
  if (typeof s === 'string') return /^\d+$/.test(s) ? (STATUS_NAMES[+s] ?? 'PENDING') : s.toUpperCase().replace(/[\s-]/g, '_');
  return 'PENDING';
}

async function loadSdk() {
  try {
    const m = await import(/* local, optional */ SDK_LOCAL);
    if (m.createClient && m.studionet) return m;
  } catch { /* no vendored bundle: use the CDN */ }
  const [main, chains] = await Promise.all([import(SDK_CDN), import(`${SDK_CDN}/chains`)]);
  return { createClient: main.createClient, createAccount: main.createAccount, studionet: chains.studionet };
}

function randomKey() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return '0x' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const hexChain = (id) => '0x' + Number(id).toString(16);

export class LiveChain {
  constructor(config) {
    this.config = config;
    this.mode = 'live';
    this.rpcUrl = config.rpc || DEFAULT_RPC;
    this.info = {
      mode: 'live', label: 'Studionet', network: config.network || 'GenLayer Studionet', chainId: Number(config.chainId || 61999),
      explorer: (config.explorer || 'https://explorer-studio.genlayer.com').replace(/\/$/, ''), contract: config.contract, sandbox: false,
    };
    this._session = null;
    this.listeners = new Set();
  }

  async init() {
    this.sdk = await loadSdk();
    this.chainDef = this.sdk.studionet;
    if (this.rpcUrl !== DEFAULT_RPC) this.chainDef = { ...this.chainDef, rpcUrls: { ...this.chainDef.rpcUrls, default: { http: [this.rpcUrl] } } };
    this.reader = this.sdk.createClient({ chain: this.chainDef });
    await this.stats(); // fails loudly when the network or the contract is wrong
    await this.restore();
    return this;
  }

  // ---- session
  get session() { return this._session; }
  get personas() { return null; }
  onSession(cb) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  emit() { this.listeners.forEach((cb) => cb(this._session)); }
  get hasWallet() { return typeof window !== 'undefined' && !!window.ethereum; }

  async restore() {
    try {
      if (localStorage.getItem(WALLET_KEY) && this.hasWallet) {
        const accts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accts?.[0]) return await this.useWallet(accts[0]);
      }
      if (localStorage.getItem(BURNER_KEY)) return await this.connect('burner');
    } catch { /* stay signed out */ }
    return null;
  }

  async connect(kind = 'burner') {
    if (kind === 'wallet') {
      if (!this.hasWallet) throw new Error('No browser wallet found. Install MetaMask, or use a burner account.');
      const accts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      await this.ensureChain();
      localStorage.setItem(WALLET_KEY, '1');
      return this.useWallet(accts[0]);
    }
    let key = localStorage.getItem(BURNER_KEY);
    if (!key) { key = randomKey(); localStorage.setItem(BURNER_KEY, key); }
    return this.useKey(key);
  }

  useKey(key) {
    const account = this.sdk.createAccount(key);
    this.writer = this.sdk.createClient({ chain: this.chainDef, account });
    this._session = { address: account.address, kind: 'burner', label: 'Burner account' };
    this.emit();
    return this._session;
  }

  async useWallet(address) {
    this.writer = this.sdk.createClient({ chain: this.chainDef, account: address, provider: window.ethereum });
    try { await this.writer.connect?.('studionet'); } catch { /* the explicit chain switch below is the one that matters */ }
    this._session = { address, kind: 'wallet', label: 'Wallet' };
    if (!this._bound) {
      this._bound = true;
      window.ethereum.on?.('accountsChanged', (a) => { if (a?.[0]) this.useWallet(a[0]); else this.disconnect(); });
    }
    this.emit();
    return this._session;
  }

  async ensureChain() {
    const chainId = hexChain(this.info.chainId);
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] });
    } catch (e) {
      if (e?.code !== 4902 && !/unrecognized|not added/i.test(e?.message ?? '')) throw e;
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{ chainId, chainName: this.info.network, nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
          rpcUrls: [this.rpcUrl], blockExplorerUrls: [this.info.explorer] }],
      });
    }
  }

  async disconnect() {
    localStorage.removeItem(WALLET_KEY);
    this._session = null; this.writer = null; this.emit();
  }

  exportKey() { return localStorage.getItem(BURNER_KEY); }
  importKey(key) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('A private key is 0x followed by 64 hex characters.');
    localStorage.setItem(BURNER_KEY, key); localStorage.removeItem(WALLET_KEY);
    return this.useKey(key);
  }

  // ---- raw rpc
  async rpc(method, params) {
    const r = await fetch(this.rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }) });
    const j = await r.json();
    if (j.error) throw new Error(j.error.message || 'rpc error');
    return j.result;
  }

  async balance() {
    if (!this._session) return 0n;
    return BigInt(await this.rpc('eth_getBalance', [this._session.address, 'latest']));
  }

  async faucet() {
    if (!this._session) throw new Error('Connect an account first');
    try {
      await this.rpc('sim_fundAccount', [this._session.address, 1e20]); // 100 GEN in wei; 1e20 is exact as a double
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: `The faucet did not answer (${e.message}). Open studio.genlayer.com, use the water-drop faucet for ${this._session.address}, then come back.` };
    }
  }

  txUrl(hash) { return hash ? `${this.info.explorer}/tx/${hash}` : ''; }
  addressUrl(a) { return a ? `${this.info.explorer}/address/${a}` : ''; }

  // ---- reads: every view returns a JSON string
  async call(fn, args = []) {
    let err;
    for (let i = 0; i < 3; i++) {
      try {
        const raw = await this.reader.readContract({ address: this.config.contract, functionName: fn, args });
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (e) { err = e; await sleep(350 * (i + 1)); }
    }
    throw err;
  }

  stats() { return this.call('get_stats'); }
  async list({ offset = 0, limit = 50, status = '' } = {}) { return this.call('list_pacts', [offset, limit, status]); }
  async pact(id) { const r = await this.call('get_pact', [String(id)]); return r.ok ? r.pact : null; }
  standing(address) { return this.call('get_standing', [address]); }

  // ---- writes
  async write(method, args, { value = 0n, onPhase = () => {} } = {}) {
    if (!this._session || !this.writer) throw new Error('Connect an account first');
    const me = this._session.address;
    try { await this.writer.initializeConsensusSmartContract?.(); } catch { /* already initialised */ }
    const before = (await this.call('get_refusal', [me])).seq;
    onPhase({ phase: 'signing' });
    const req = { address: this.config.contract, functionName: method, args };
    if (value > 0n) req.value = value;
    const hash = await this.writer.writeContract(req);
    onPhase({ phase: 'submitted', hash });
    const { status, tx } = await this.track(hash, onPhase);
    if (['UNDETERMINED', 'LEADER_TIMEOUT', 'VALIDATORS_TIMEOUT', 'CANCELED'].includes(status)) {
      return { ok: false, hash, status, reason: 'The validators could not reach agreement on this transaction, so nothing changed. You can try again.' };
    }
    const after = await this.call('get_refusal', [me]);
    if (after.seq > before) return { ok: false, hash, status, reason: after.reason };
    // ACCEPTED means the validators agreed on the receipt, not that the call succeeded: a call that
    // raised is accepted too. Only a clear error result is treated as failure; an unknown one is not.
    if (executionFailed(tx)) {
      return { ok: false, hash, status, reason: 'The contract call ended with an error, so nothing changed. The transaction is in the explorer if you want the details.' };
    }
    return { ok: true, hash, status };
  }

  async track(hash, onPhase, timeoutMs = 360000) {
    const t0 = Date.now();
    let last = '';
    while (Date.now() - t0 < timeoutMs) {
      let tx = null;
      try { tx = await this.reader.getTransaction({ hash }); } catch { /* not indexed yet */ }
      const s = tx ? statusOf(tx) : 'PENDING';
      if (s !== last) { last = s; onPhase({ phase: s, hash }); }
      if (TERMINAL.has(s)) return { status: s, tx };
      await sleep(2000);
    }
    throw new Error('Still processing after six minutes. Check the transaction in the explorer.');
  }

  async preview(criteria, terms, url) {
    try {
      const client = this.writer ?? this.sdk.createClient({ chain: this.chainDef, account: this.sdk.createAccount(randomKey()) });
      const raw = await client.simulateWriteContract({ address: this.config.contract, functionName: 'preview_hearing',
        args: [JSON.stringify(criteria), terms, url] });
      const out = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return out.ok ? { ok: true, engine: 'validators', ruling: out.ruling } : { ok: false, reason: out.reason };
    } catch (e) {
      return { ok: false, reason: 'The free preview is not available right now. You can still lock the pact and hold the hearing.' };
    }
  }
}
