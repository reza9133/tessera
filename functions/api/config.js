// GET /api/config
// Public, non-secret settings for the browser, read from Cloudflare Pages environment variables.
// Set CONTRACT_ADDRESS (and optionally the others) in wrangler.toml [vars] or in the dashboard,
// so a redeploy is not needed just to point the site at a new contract.

export const onRequestGet = ({ env }) => {
  const clean = (v, fallback = '') => (typeof v === 'string' && v.trim() ? v.trim() : fallback);
  const body = {
    network: clean(env.NETWORK_NAME, 'GenLayer Studionet'),
    chainId: Number(clean(env.CHAIN_ID, '61999')),
    rpc: clean(env.RPC_URL, 'https://studio.genlayer.com/api'),
    explorer: clean(env.EXPLORER_URL, 'https://explorer-studio.genlayer.com'),
    contract: /^0x[0-9a-fA-F]{40}$/.test(clean(env.CONTRACT_ADDRESS)) ? clean(env.CONTRACT_ADDRESS) : '',
  };
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
};
