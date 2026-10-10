// GET /api/status
// Asks the configured RPC for its chain id from the edge, so the site can tell
// "the network is down" apart from "the browser is blocked" without CORS guesswork.

export const onRequestGet = async ({ env }) => {
  const rpc = (env.RPC_URL || 'https://studio.genlayer.com/api').trim();
  const started = Date.now();
  let ok = false, chainId = null, error = null;
  try {
    const r = await fetch(rpc, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      signal: AbortSignal.timeout(6000),
    });
    const j = await r.json();
    chainId = j.result ? parseInt(j.result, 16) : null;
    ok = chainId !== null;
  } catch (e) { error = String(e.message || e).slice(0, 120); }
  return new Response(JSON.stringify({ ok, chainId, ms: Date.now() - started, error }), {
    status: ok ? 200 : 503,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
};
