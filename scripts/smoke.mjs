// An end-to-end acceptance test against a deployed contract on Studionet:
// two fresh accounts run a whole pact, with real validators reading real evidence.
//
//   CONTRACT=0x... SITE=https://your-site.pages.dev node scripts/smoke.mjs
//
// SITE must be the public origin of this project, because the evidence pages under /demo/evidence
// are what the validators fetch. Expect a few minutes: a hearing takes the validators a while.
// Not executed by the author of this repository (the build environment had no network access).

import { randomBytes } from 'node:crypto';
import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const { CONTRACT, SITE } = process.env;
if (!/^0x[0-9a-fA-F]{40}$/.test(CONTRACT ?? '') || !SITE?.startsWith('https://')) {
  console.error('usage: CONTRACT=0x... SITE=https://your-site node scripts/smoke.mjs'); process.exit(1);
}
const RPC = 'https://studio.genlayer.com/api';
const GEN = 10n ** 18n;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const key = () => `0x${randomBytes(32).toString('hex')}`;
const maker = createAccount(key()), worker = createAccount(key());
const mk = (account) => createClient({ chain: studionet, account });
const [cm, cw] = [mk(maker), mk(worker)];
let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); if (!ok) failed++; };

const rpc = async (method, params) => (await (await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })).json());
const read = async (fn, args = []) => JSON.parse(await cm.readContract({ address: CONTRACT, functionName: fn, args }));
const send = async (client, functionName, args, value) => {
  const req = { address: CONTRACT, functionName, args }; if (value) req.value = value;
  const hash = await client.writeContract(req);
  await client.waitForTransactionReceipt({ hash, status: 'ACCEPTED', retries: 240, interval: 3000 });
  return hash;
};
const balance = async (a) => BigInt((await rpc('eth_getBalance', [a, 'latest'])).result);

for (const a of [maker.address, worker.address]) await rpc('sim_fundAccount', [a, 1e20]);
for (const c of [cm, cw]) { try { await c.initializeConsensusSmartContract?.(); } catch { /* ok */ } }

const criteria = [
  { type: 'live', weight: 1, required: true },
  { type: 'contains', arg: 'offline mode', weight: 2, required: true },
  { type: 'min_words', arg: '120', weight: 1 },
  { type: 'judge', text: 'The copy covers notes, search and syncing', weight: 2 },
];
const before = await read('get_stats');
await send(cm, 'create_pact', ['Smoke: Lumen landing copy', 'Write landing copy for the Lumen notes app. It must mention offline mode.', JSON.stringify(criteria), '', 3, 0], GEN);
const id = String((await read('get_stats')).next_id - 1);
check('pact created', (await read('get_stats')).pacts === before.pacts + 1, `#${id}`);

await send(cw, 'accept_pact', [id]);
check('accepted', (await read('get_pact', [id])).pact.status === 'active');

await send(cw, 'submit_delivery', [id, `${SITE.replace(/\/$/, '')}/demo/evidence/clean.html`, 'smoke test']);
check('delivered', (await read('get_pact', [id])).pact.status === 'delivered');

console.log('...holding the hearing (this is the slow part)');
await send(cm, 'request_ruling', [id]);
const ruled = (await read('get_pact', [id])).pact;
console.log('verdicts', ruled.rulings.at(-1)?.verdicts, 'outcome', ruled.outcome, 'bps', ruled.payout_bps);
check('a ruling was recorded', ruled.rounds === 1);
check('clean delivery is fulfilled', ruled.outcome === 'fulfilled' && ruled.payout_bps === 10000);

const w0 = await balance(worker.address);
await send(cm, 'settle_pact', [id]);
check('settled', (await read('get_pact', [id])).pact.status === 'settled');
await sleep(15000); // external transfers are emitted on finalization
check('worker was paid', (await balance(worker.address)) > w0, '(may need to wait for finalization)');

const r = await read('get_refusal', [maker.address]);
console.log('refusal ledger', r);
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
