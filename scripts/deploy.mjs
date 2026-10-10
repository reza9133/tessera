// Deploy contracts/tessera.py to GenLayer Studionet.
//
//   node scripts/deploy.mjs                 deploy with a fresh throwaway key (printed, never stored)
//   PRIVATE_KEY=0x... node scripts/deploy.mjs
//   node scripts/deploy.mjs --write         also put the address in wrangler.toml
//
// Needs: npm install. Network access to https://studio.genlayer.com/api.
// Not executed by the author of this repository (the build environment had no network access).

import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const key = process.env.PRIVATE_KEY || `0x${randomBytes(32).toString('hex')}`;
const account = createAccount(key);
const client = createClient({ chain: studionet, account });
const code = readFileSync(new URL('../contracts/tessera.py', import.meta.url), 'utf8');

console.log('deployer ', account.address);
try { await client.initializeConsensusSmartContract?.(); } catch { /* already initialised */ }

const hash = await client.deployContract({ code, args: [], leaderOnly: false });
console.log('deploy tx', hash, '(waiting for consensus)');
const receipt = await client.waitForTransactionReceipt({ hash, status: 'ACCEPTED', retries: 200, interval: 3000 });

const address = receipt?.data?.contract_address ?? receipt?.txDataDecoded?.contractAddress
  ?? receipt?.to_address ?? receipt?.recipient;
if (!/^0x[0-9a-fA-F]{40}$/.test(address ?? '')) {
  console.error('Deployed, but the contract address was not in the receipt. Receipt keys:', Object.keys(receipt ?? {}));
  console.error('Find the address in the explorer for', hash, 'and set CONTRACT_ADDRESS by hand.');
  process.exit(2);
}

const stats = JSON.parse(await client.readContract({ address, functionName: 'get_stats', args: [] }));
console.log('contract ', address);
console.log('stats    ', stats);

if (process.argv.includes('--write')) {
  const path = new URL('../wrangler.toml', import.meta.url);
  const toml = readFileSync(path, 'utf8').replace(/CONTRACT_ADDRESS\s*=\s*"[^"]*"/, `CONTRACT_ADDRESS = "${address}"`);
  writeFileSync(path, toml);
  console.log('wrangler.toml updated. Now run: npm run deploy');
} else {
  console.log('Set CONTRACT_ADDRESS in wrangler.toml to this address and redeploy the site.');
}
