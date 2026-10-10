# Tessera

**Agreements in plain words, settled by validator consensus.** Built for GenLayer Studionet.

In ancient Rome a *tessera* was a tablet broken in two. Each party kept a half, and the deal was proved when the halves fit. Tessera is that, for work done on the internet:

1. A **maker** writes a deal in plain words, adds a short rubric, and locks payment in escrow.
2. A **deliverer** accepts and files public links as evidence.
3. On request, **five validators each fetch the evidence themselves** and rule on the rubric.
4. The escrow moves **by ruling**: in full, in proportion to the weight of criteria met, or back to the maker. One contest is allowed; the second hearing is final.

Everything (terms, evidence, rulings, payouts, standing) is on-chain and readable. The contract has **no owner, no admin key and no upgrade path**: money only moves by the rules in `contracts/tessera.py`.

> A consensus of models is a repeatable procedure, not a court, and nothing here is legal advice. Studionet is a test network; GEN has no value.

## What makes it different

| | |
|---|---|
| **Only words cross consensus** | For each criterion, validators agree on one of `met` / `unmet` / `unclear`. Quotes, hashes and prose never do. A validator accepts the leader's ruling only if every verdict equals its own. |
| **Code decides what code can** | *Link opens*, *contains phrase* and *minimum length* are decided by plain code, identically on every validator. Only the *judged* criteria use a model. |
| **Asked twice, in opposite orders** | A judged criterion is put to the model twice (criteria, verdict words and evidence reordered). If the two answers differ the verdict is `unclear`, so a lean toward whatever comes first becomes a visible disagreement instead of a silent error. |
| **Evidence is fenced** | Page text, links, terms and criteria are all fenced before they reach a model; the prompt has exactly one evidence block that no page can forge a delimiter for (tested). |
| **Integer money** | Payout is `met weight × 10000 // total weight` basis points. The two parts always add up to the escrow exactly (property-tested, including stakes beyond 2^53). |
| **Refusals refund, never strand** | A refused payable call returns the funds and records why in a refusal ledger. The interface reads that ledger instead of parsing receipts. |
| **Nothing is held hostage** | Deadlines expire to a refund; after deadline + 3 days anyone may request the hearing. |

## Repository layout

```
contracts/tessera.py        the Intelligent Contract (Studionet runner, `from genlayer import *`)
public/                     the website: static files, no build step
  assets/js/rules.js        the contract's arithmetic, mirrored for previews (tested against the contract)
  assets/js/chain-live.js   genlayer-js adapter for Studionet
  assets/js/chain-sandbox.js  the whole product in the browser, same rules, keyword judge
  assets/js/chamber.js      the hearing-chamber animation (landing loop + live transaction view)
  demo/evidence/            public pages the demo scenarios ask validators to read
functions/api/              Cloudflare Pages Functions: /api/config, /api/status
tests/                      129 contract tests, a stub of the SDK, golden vectors, JS mirror tests
tools/                      mutation tester, vector generator, OG image generator
scripts/                    deploy.mjs, smoke.mjs (on-chain acceptance test), vendor-sdk.mjs
```

## Quick start

```bash
npm install            # only needed for deploy scripts and wrangler; the site itself has no build
npm test               # 129 contract tests + the JS mirror against 800+ golden vectors
npm run mutate         # 66 deliberate bugs; every one must be caught
```

The site opens in **sandbox mode** until a contract address is configured: the whole product runs in the browser with the same rules and a keyword judge standing in for the validators. Every sandbox ruling says so.

> The sandbox (like the contract) refuses `localhost` links, so the scenario evidence only works once the site is on a public origin. Deploy a preview first (below), or file any public URL by hand.

## 1. Deploy the contract to Studionet

**Option A, in the browser.** Open <https://studio.genlayer.com>, create a contract, paste `contracts/tessera.py`, choose *Studionet*, deploy (there are no constructor arguments) and copy the address.

**Option B, from the terminal.**

```bash
npm run deploy:contract      # deploys with a throwaway key and writes CONTRACT_ADDRESS into wrangler.toml
```

> **Runner header.** Line 1 of the contract is `# { "Depends": "py-genlayer:1jb45aa8…" }`. That is the runner stable Studionet (chain 61999) uses. Studio-dev (chain 61997) uses a different runner and a different SDK import; this contract is deliberately *not* written for it. If Studio ever reports the runner as invalid, copy the first line from any example contract in the Studio UI.

## 2. Deploy the site to Cloudflare Pages

```bash
npx wrangler login
# put the contract address in wrangler.toml → CONTRACT_ADDRESS = "0x…"
npx wrangler pages deploy        # first run creates the project "tessera"
```

Or connect the Git repository in the Cloudflare dashboard with **build command: none**, **output directory: `public`**. `functions/` is picked up automatically. `.github/workflows/deploy.yml` deploys on every push to `main` (needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`).

`/api/config` serves the public settings, so pointing the site at a new contract is a variable change, not a code change:

| Variable | Default | Meaning |
|---|---|---|
| `CONTRACT_ADDRESS` | *(empty = sandbox)* | the deployed Tessera contract |
| `RPC_URL` | `https://studio.genlayer.com/api` | GenLayer RPC |
| `CHAIN_ID` | `61999` | Studionet |
| `EXPLORER_URL` | `https://explorer-studio.genlayer.com` | block explorer |
| `NETWORK_NAME` | `GenLayer Studionet` | label |

Local preview with functions: `npm run dev`. A `?contract=0x…` query parameter overrides the address for one session.

## 3. Prove it on the real network

```bash
CONTRACT=0x… SITE=https://your-site.pages.dev npm run smoke
```

Two fresh accounts run a whole pact: create, accept, deliver `clean.html`, hold a real hearing, settle, check the payout. Expect a few minutes.

## Hardening (optional)

- `npm run vendor` bundles `genlayer-js` into `public/vendor/genlayer.js`; the app prefers it over esm.sh. You can then remove `https://esm.sh` from `script-src` in `public/_headers`.
- `public/_headers` ships a strict CSP and security headers. If the browser console reports a CSP violation after you change RPC or add a service, extend `connect-src` accordingly.
- The burner account's key lives in `localStorage`. It is for test funds only; the UI says so.

## What was verified, and what was not

| Verified in the build environment | How |
|---|---|
| Contract logic | 129 tests against an SDK stub; 66 of 66 mutants killed (`tests/MUTATIONS.md`) |
| Contract source rules the runtime enforces | AST tests: no floats, no `datetime`, no true division, annotated public methods returning `str`, storage types, closures never touch `self` |
| UI arithmetic = contract arithmetic | JS mirror tested on 400 decision, 200 split, 100 standing, 44 link, 25 rubric and 11 text-folding vectors generated from the contract |
| Whole UI | Driven end to end in Chromium (desktop, mobile 390px, light and dark): create, accept, deliver, hearing, settle, all four demo scenarios |
| Cloudflare function | `/api/config` exercised directly |

| **Not verified** (no network access where this was built) | What to do |
|---|---|
| Execution under the real GenVM, and real validators' models | `npm run smoke` |
| `genlayer-js@1.1.8` calls against Studionet, including `simulateWriteContract` for the free preview | `npm run smoke`, then try *Test the rubric* in the UI |
| MetaMask flow, `sim_fundAccount` faucet RPC name, explorer URL shapes | try them once; the UI degrades with a clear message |
| CSP against esm.sh in production | open the console after the first deploy |
| Webfonts (Bricolage Grotesque, Newsreader, JetBrains Mono, Instrument Sans) | load from Google Fonts in production; screenshots here used fallbacks |

## Troubleshooting

- **Site shows "Sandbox" after deploy**: `CONTRACT_ADDRESS` is empty or not a 42-character address; check `/api/config`.
- **Banner says Studionet did not answer**: the RPC or esm.sh was unreachable; *Retry Studionet* in the banner.
- **A hearing "finished but changed nothing"**: validators disagreed or the judge failed (`[LLM_ERROR]`); no state is written before consensus, so nothing is lost. Try again.
- **Deploy says the runner is invalid**: see the runner note above.

## Brand and licence

Code: MIT. The Tessera mark and wordmark are original. The GenLayer logo (`public/assets/brand/genlayer-logo-black.svg`) is GenLayer's trademark, used here only to say the project is built on GenLayer; follow their brand guidelines if you change how it is shown.
