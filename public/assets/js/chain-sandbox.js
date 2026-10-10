// Sandbox: the whole product with no network, no wallet and no contract.
// It runs the same state machine as contracts/tessera.py, with the same rules
// (imported from rules.js) and the same data shape. The one difference is the
// judge: here a keyword heuristic stands in for the validators' models, and every
// ruling it makes says so. State lives in localStorage.

import { decide, split, score, checkUrl, normalizeCriteria, alnum, LIMITS } from './rules.js';
import { ZERO, nowSec, same, sleep } from './format.js';

const KEY = 'tessera.sandbox.v2';
const DAY = 86400;
const addr = (byte) => '0x' + byte.repeat(20);

export const PERSONAS = [
  { id: 'alice', name: 'Alice', role: 'Maker', address: addr('a1') },
  { id: 'bob', name: 'Bob', role: 'Deliverer', address: addr('b2') },
  { id: 'carol', name: 'Carol', role: 'Bystander', address: addr('c3') },
];
const SEED_PEOPLE = { dave: addr('d4'), erin: addr('e5'), frank: addr('f6'), grace: addr('17'), heidi: addr('28') };
const GEN = 10n ** 18n;

class Refusal extends Error {}
const fail = (m) => { throw new Refusal(m); };
const clean = (s) => String(s ?? '').split(/\s+/).filter(Boolean).join(' ');

// ---------------------------------------------------------------- state
function blank() {
  return { v: 2, pacts: {}, next: 1, standings: {}, refusals: {}, refusalSeq: 0, hearings: 0, volume: '0', settled: 0,
    balances: {}, actor: 'alice', offset: 0 };
}
const big = (x) => BigInt(x ?? 0);

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = JSON.parse(raw); if (s.v === 2) return s; }
  } catch { /* fall through to a fresh sandbox */ }
  return seed(blank());
}

function save(st) { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* private mode */ } }

function standingOf(st, who) {
  const k = who.toLowerCase();
  return (st.standings[k] ??= { drafted: 0, accepted: 0, fulfilled: 0, partial: 0, breached: 0, expired: 0, earned: '0', refunded: '0' });
}

function credit(st, who, amount) { const k = who.toLowerCase(); st.balances[k] = (big(st.balances[k] ?? 1000n * GEN) + amount).toString(); }
function balanceOf(st, who) { return big(st.balances[who.toLowerCase()] ?? 1000n * GEN); }

// ---------------------------------------------------------------- seed
function seed(st) {
  const now = nowSec();
  const origin = typeof location !== 'undefined' ? location.origin : '';
  const ev = (by, file, note, at, round = 1) => ({ by, url: `${origin}/demo/evidence/${file}`, note, at, round });
  const crit = (list) => normalizeCriteria(list).criteria;
  const ruling = (criteria, verdicts, round, at, by, quotes = {}) => {
    const d = decide(criteria, verdicts, round >= 2);
    return { round, outcome: d.outcome, bps: d.bps, met: d.met, total: d.total, verdicts: d.verdicts, quotes,
      docs: [], at: new Date(at * 1000).toISOString(), by, engine: 'sandbox' };
  };
  const add = (p) => {
    const id = String(st.next++);
    st.pacts[id] = { id, counterparty: ZERO, deliverer: ZERO, evidence: [], rounds: 0, rulings: [], outcome: '', payout_bps: 0,
      ruled_ts: 0, settled_ts: 0, to_deliverer: '0', to_maker: '0', contest_hours: 0, ...p };
    return st.pacts[id];
  };
  const finish = (p) => {
    const [d, m] = split(big(p.stake), p.payout_bps);
    p.to_deliverer = d.toString(); p.to_maker = m.toString(); p.status = 'settled';
  };

  const c1 = crit([{ type: 'live', weight: 1, required: true }, { type: 'contains', arg: 'offline mode', weight: 2 },
    { type: 'judge', text: 'The copy explains the benefits to a first-time visitor clearly', weight: 2 }]);
  let p = add({ maker: SEED_PEOPLE.dave, deliverer: SEED_PEOPLE.erin, title: 'Landing page copy for the Lumen notes app',
    terms: 'Write the hero, three feature blurbs and a closing call to action for the Lumen notes app. Plain, warm, no hype. It must mention offline mode.',
    criteria: c1, stake: (8n * GEN).toString(), created_ts: now - 9 * DAY, deadline_ts: now - 2 * DAY, status: 'delivered',
    evidence: [ev(SEED_PEOPLE.erin, 'clean.html', 'Final copy', now - 5 * DAY)], rounds: 1 });
  p.rulings = [ruling(c1, { c1: 'met', c2: 'met', c3: 'met' }, 1, now - 4 * DAY, SEED_PEOPLE.erin,
    { c3: { q: 'Lumen keeps your notes with you, even somewhere with no signal', ok: true } })];
  p.outcome = 'fulfilled'; p.payout_bps = 10000; p.ruled_ts = now - 4 * DAY; finish(p); p.settled_ts = now - 4 * DAY;

  const c2 = crit([{ type: 'live', weight: 1, required: true }, { type: 'min_words', arg: '250', weight: 2 },
    { type: 'judge', text: 'The tone is friendly and never pushy', weight: 2 }]);
  p = add({ maker: SEED_PEOPLE.frank, deliverer: SEED_PEOPLE.grace, title: 'Onboarding emails, three drafts',
    terms: 'Three onboarding emails for new Lumen users: welcome, first note, invite a friend. At least 250 words in total, friendly, never pushy.',
    criteria: c2, stake: (12n * GEN).toString(), created_ts: now - 12 * DAY, deadline_ts: now - 3 * DAY, status: 'delivered',
    evidence: [ev(SEED_PEOPLE.grace, 'partial.html', 'Drafts', now - 7 * DAY)], rounds: 1 });
  p.rulings = [ruling(c2, { c1: 'met', c2: 'unmet', c3: 'met' }, 1, now - 6 * DAY, SEED_PEOPLE.frank)];
  p.outcome = 'partial'; p.payout_bps = p.rulings[0].bps; p.ruled_ts = now - 6 * DAY; finish(p); p.settled_ts = now - 6 * DAY;

  p = add({ maker: SEED_PEOPLE.heidi, deliverer: SEED_PEOPLE.erin, title: 'Five launch-week tweets',
    terms: 'Five tweets for Lumen launch week, each under 240 characters, each naming one feature. Must link to the landing page.',
    criteria: c1, stake: (6n * GEN).toString(), created_ts: now - 8 * DAY, deadline_ts: now - 1 * DAY, status: 'delivered',
    evidence: [ev(SEED_PEOPLE.erin, 'spam.html', 'Tweets', now - 3 * DAY)], rounds: 1 });
  p.rulings = [ruling(c1, { c1: 'met', c2: 'unmet', c3: 'unmet' }, 1, now - 2 * DAY, SEED_PEOPLE.heidi)];
  p.outcome = 'breached'; p.payout_bps = 0; p.ruled_ts = now - 2 * DAY; finish(p); p.settled_ts = now - 2 * DAY;

  add({ maker: SEED_PEOPLE.grace, title: 'Record a 90-second product walkthrough',
    terms: 'A screen recording of the Lumen app, 90 seconds, narrated, hosted at a public link. Show creating a note, searching, and offline mode.',
    criteria: crit([{ type: 'live', weight: 1, required: true }, { type: 'judge', text: 'The walkthrough covers creating a note, searching and offline mode', weight: 3 }]),
    stake: (20n * GEN).toString(), created_ts: now - 2 * 3600, deadline_ts: now + 14 * DAY, status: 'open' });

  add({ maker: SEED_PEOPLE.dave, deliverer: SEED_PEOPLE.frank, title: 'Migrate the docs site to a static export',
    terms: 'Move the docs site to a static export that builds in under two minutes. Deliver a link to the deployed preview.',
    criteria: crit([{ type: 'live', weight: 1, required: true }, { type: 'contains', arg: 'static export', weight: 2 }]),
    stake: (15n * GEN).toString(), created_ts: now - 3 * DAY, deadline_ts: now + 4 * DAY, status: 'active' });

  p = add({ maker: SEED_PEOPLE.heidi, deliverer: SEED_PEOPLE.grace, title: 'Audit the pricing page copy',
    terms: 'Audit the pricing page copy and deliver a short report with concrete fixes.', criteria: c2, stake: (4n * GEN + GEN / 2n).toString(),
    created_ts: now - 5 * DAY, deadline_ts: now + 2 * DAY, status: 'delivered',
    evidence: [ev(SEED_PEOPLE.grace, 'clean.html', 'Report', now - 3600)] });

  p = add({ maker: SEED_PEOPLE.dave, deliverer: SEED_PEOPLE.erin, title: 'Weekly newsletter, issue 41',
    terms: 'Write issue 41 of the Lumen newsletter: one story, one tip, one link. Keep it under 400 words, friendly and plain.',
    criteria: c2, stake: (3n * GEN + GEN / 2n).toString(), created_ts: now - 6 * DAY, deadline_ts: now - 1 * DAY, status: 'ruled', contest_hours: 24,
    evidence: [ev(SEED_PEOPLE.erin, 'partial.html', 'Issue 41', now - 5 * 3600)], rounds: 1 });
  p.rulings = [ruling(c2, { c1: 'met', c2: 'unmet', c3: 'met' }, 1, now - 3 * 3600, SEED_PEOPLE.dave)];
  p.outcome = 'partial'; p.payout_bps = p.rulings[0].bps; p.ruled_ts = now - 3 * 3600;

  rebuildStandings(st);
  return st;
}

function rebuildStandings(st) {
  st.standings = {}; st.settled = 0; st.volume = '0'; st.hearings = 0;
  for (const p of Object.values(st.pacts)) {
    standingOf(st, p.maker).drafted++;
    st.hearings += p.rulings.length;
    if (p.deliverer !== ZERO) standingOf(st, p.deliverer).accepted++;
    if (p.status === 'settled') {
      const d = standingOf(st, p.deliverer);
      d[p.outcome === 'fulfilled' ? 'fulfilled' : p.outcome === 'partial' ? 'partial' : 'breached']++;
      d.earned = (big(d.earned) + big(p.to_deliverer)).toString();
      const m = standingOf(st, p.maker); m.refunded = (big(m.refunded) + big(p.to_maker)).toString();
      st.settled++; st.volume = (big(st.volume) + big(p.stake)).toString();
    }
  }
}

// ---------------------------------------------------------------- the judge (heuristic)
const STOP = new Set(['should', 'would', 'could', 'their', 'there', 'which', 'about', 'these', 'those', 'being', 'never', 'always', 'every', 'other', 'where', 'while']);

function htmlToText(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,noscript,template').forEach((n) => n.remove());
  return clean(doc.body?.textContent ?? '');
}

async function fetchDoc(url) {
  try {
    const r = await fetch(url, { mode: 'cors', cache: 'no-store' });
    if (!r.ok) return { url, status: r.status, text: '' };
    return { url, status: 200, text: htmlToText((await r.text()).slice(0, 200000)) };
  } catch { return { url, status: 0, text: '' }; }
}

const corpusOf = (docs) => docs.filter((d) => d.status === 200).map((d) => d.text).join(' ');

function codeVerdict(c, docs) {
  if (c.type === 'live') {
    if (!docs.length) return 'unmet';
    if (docs.some((d) => d.status !== 0 && d.status !== 200)) return 'unmet';
    return docs.some((d) => d.status === 0) ? 'unclear' : 'met';
  }
  const corpus = corpusOf(docs);
  if (!corpus) return docs.some((d) => d.status === 0) ? 'unclear' : 'unmet';
  if (c.type === 'contains') return alnum(corpus).includes(alnum(c.arg)) ? 'met' : 'unmet';
  return corpus.split(/\s+/).filter(Boolean).length >= Number(c.arg) ? 'met' : 'unmet';
}

function heuristicJudge(text, corpus) {
  const words = [...new Set(alnum(text).split(' ').filter((w) => w.length > 4 && !STOP.has(w)))];
  if (!words.length) return ['unclear', ''];
  const hay = ' ' + alnum(corpus) + ' ';
  const hits = words.filter((w) => hay.includes(' ' + w));
  const cover = hits.length / words.length;
  const verdict = cover >= 0.7 ? 'met' : cover <= 0.3 ? 'unmet' : 'unclear';
  let quote = '';
  if (verdict === 'met') {
    const sentence = corpus.split(/(?<=[.!?])\s+/).find((s) => hits.some((w) => alnum(s).includes(w))) ?? '';
    quote = sentence.slice(0, 200);
  }
  return [verdict, quote];
}

// `mine` marks the links the deliverer filed; criteria decided by code look at those only.
async function evaluate(criteria, urls, mine = null) {
  const docs = await Promise.all(urls.map(fetchDoc));
  const own = mine ? docs.filter((_, i) => mine[i]) : docs;
  const verdicts = {}, quotes = {};
  const corpus = corpusOf(docs);
  for (const c of criteria) {
    if (c.type !== 'judge') { verdicts[c.id] = codeVerdict(c, own); continue; }
    if (!corpus) { verdicts[c.id] = docs.some((d) => d.status === 0) ? 'unclear' : 'unmet'; continue; }
    const [v, q] = heuristicJudge(c.text, corpus);
    verdicts[c.id] = v;
    if (q) quotes[c.id] = { q, ok: true };
  }
  const summary = docs.map((d) => ({ url: d.url, status: d.status, words: d.text.split(/\s+/).filter(Boolean).length, sha: '' }));
  return { verdicts, quotes, docs: summary };
}

// Evidence may be added until the deadline; after a ruling asked for more, until the grace it opened runs out.
function evidenceOpen(p, now) {
  if (!now || !p.deadline_ts) return true;
  const limit = p.rounds >= 1 ? Math.max(p.deadline_ts, p.ruled_ts + LIMITS.graceDays * DAY) : p.deadline_ts;
  return now <= limit;
}

// ---------------------------------------------------------------- the chain
const PHASES = [['signing', 500], ['submitted', 350], ['PENDING', 700], ['PROPOSING', 1100], ['COMMITTING', 1000], ['REVEALING', 900]];

export class SandboxChain {
  constructor() {
    this.mode = 'sandbox';
    this.info = { mode: 'sandbox', label: 'Sandbox', network: 'Local sandbox', chainId: null, explorer: '', contract: '', sandbox: true };
    this.st = load();
    this.listeners = new Set();
  }

  async init() { return this; }
  now() { return nowSec() + (this.st.offset || 0); }
  persist() { save(this.st); }
  reset() { this.st = seed(blank()); this.persist(); this.emit(); }
  advance(seconds) { this.st.offset = (this.st.offset || 0) + seconds; this.persist(); this.emit(); }

  // -- session: personas instead of wallets
  get session() {
    const p = PERSONAS.find((x) => x.id === this.st.actor) ?? PERSONAS[0];
    return { address: p.address, kind: 'sandbox', label: p.name, persona: p };
  }
  get personas() { return PERSONAS; }
  onSession(cb) { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  emit() { this.listeners.forEach((cb) => cb(this.session)); }
  async connect(id) { if (id && PERSONAS.some((p) => p.id === id)) { this.st.actor = id; this.persist(); this.emit(); } return this.session; }
  async disconnect() {}
  async balance() { return balanceOf(this.st, this.session.address); }
  async faucet() { credit(this.st, this.session.address, 100n * GEN); this.persist(); this.emit(); return { ok: true }; }
  txUrl() { return ''; }
  addressUrl() { return ''; }

  // -- reads
  async stats() {
    const s = this.st;
    return { version: 'tessera/1', next_id: s.next, pacts: s.next - 1, settled: s.settled, hearings: s.hearings, volume: s.volume, refusals: s.refusalSeq };
  }
  async list({ offset = 0, limit = 50, status = '' } = {}) {
    const rows = [];
    let skipped = 0, id = this.st.next - 1;
    while (id >= 1 && rows.length < limit) {
      const p = this.st.pacts[String(id)];
      if (!status || p.status === status) {
        if (skipped < offset) skipped++;
        else rows.push({ id: p.id, title: p.title, status: p.status, outcome: p.outcome, stake: p.stake, maker: p.maker,
          deliverer: p.deliverer, counterparty: p.counterparty, deadline_ts: p.deadline_ts, created_ts: p.created_ts,
          payout_bps: p.payout_bps, rounds: p.rounds });
      }
      id--;
    }
    return { pacts: rows, more: id >= 1 };
  }
  async pact(id) { const p = this.st.pacts[String(id)]; return p ? structuredClone(p) : null; }
  async standing(who) {
    const s = standingOf(this.st, who);
    return { address: who.toLowerCase(), ...s, score: score(s.fulfilled, s.partial, s.breached, s.expired) };
  }

  // -- writes
  async write(method, args, { value = 0n, onPhase = () => {} } = {}) {
    const fast = !['request_ruling', 'create_pact'].includes(method);
    const run = PHASES.slice(0, fast ? 3 : PHASES.length);
    const actor = this.session.address;
    onPhase({ phase: 'signing' });
    for (const [phase, ms] of run) {
      await sleep(fast ? ms * 0.5 : ms);
      onPhase({ phase });
    }
    let result;
    try { result = await this.apply(method, args, value, actor); } catch (e) {
      if (!(e instanceof Refusal)) throw e;
      const st = this.st;
      st.refusalSeq++; st.refusals[actor.toLowerCase()] = { seq: st.refusalSeq, method, reason: e.message };
      if (value > 0n) credit(st, actor, value);
      result = { ok: false, reason: e.message + (value > 0n ? ' Your funds were returned.' : '') };
    }
    this.persist(); this.emit();
    onPhase({ phase: result.ok ? 'ACCEPTED' : 'failed' });
    await sleep(250);
    return { ...result, hash: '' };
  }

  pactFor(id) {
    const p = this.st.pacts[String(id).trim()];
    if (!p) fail(`there is no pact ${String(id).slice(0, 20)}`);
    return p;
  }

  async apply(method, a, value, me) {
    const st = this.st, now = this.now(), lme = me.toLowerCase();
    const isParty = (p) => same(p.maker, me) || same(p.deliverer, me);
    switch (method) {
      case 'create_pact': {
        const [titleIn, termsIn, criteriaJson, counterparty, days, contest] = a;
        const title = clean(titleIn), terms = String(termsIn).trim();
        if (title.length < 3 || title.length > LIMITS.maxTitle) fail(`a title is 3 to ${LIMITS.maxTitle} characters`);
        if (terms.length < LIMITS.minTerms || terms.length > LIMITS.maxTerms) fail(`the terms are ${LIMITS.minTerms} to ${LIMITS.maxTerms} characters`);
        const n = normalizeCriteria(JSON.parse(criteriaJson));
        if (!n.ok) fail(n.reason);
        if (value <= 0n) fail('send GEN with the call: the escrow needs funds');
        if (balanceOf(st, me) < value) fail('not enough GEN in this account');
        if (days < LIMITS.minDays || days > LIMITS.maxDays) fail(`the deadline is ${LIMITS.minDays} to ${LIMITS.maxDays} days`);
        if (!LIMITS.contestHours.includes(contest)) fail(`the contest window is one of ${LIMITS.contestHours.join(', ')} hours`);
        let cp = ZERO;
        if (String(counterparty).trim()) {
          if (!/^0x[0-9a-fA-F]{40}$/.test(String(counterparty).trim())) fail('the counterparty is not a valid address');
          cp = String(counterparty).trim();
          if (same(cp, me)) fail('the counterparty cannot be the maker');
        }
        credit(st, me, -value);
        const id = String(st.next++);
        st.pacts[id] = { id, maker: me, counterparty: cp, deliverer: ZERO, title, terms, criteria: n.criteria, stake: value.toString(),
          created_ts: now, deadline_ts: now + days * DAY, contest_hours: contest, status: 'open', evidence: [], rounds: 0, rulings: [],
          outcome: '', payout_bps: 0, ruled_ts: 0, settled_ts: 0, to_deliverer: '0', to_maker: '0' };
        standingOf(st, me).drafted++;
        return { ok: true, id };
      }
      case 'accept_pact': {
        const p = this.pactFor(a[0]);
        if (p.status !== 'open') fail('this pact is no longer open');
        if (same(p.maker, me)) fail('the maker cannot accept their own pact');
        if (p.counterparty !== ZERO && !same(p.counterparty, me)) fail('this pact is reserved for another address');
        if (p.deadline_ts && now > p.deadline_ts) fail('the deadline has passed');
        p.deliverer = me; p.status = 'active'; standingOf(st, me).accepted++;
        return { ok: true };
      }
      case 'cancel_pact': {
        const p = this.pactFor(a[0]);
        if (!same(p.maker, me)) fail('only the maker can cancel');
        if (p.status !== 'open') fail('only an open pact can be cancelled');
        p.status = 'cancelled'; p.to_maker = p.stake; p.settled_ts = now; credit(st, p.maker, big(p.stake));
        return { ok: true };
      }
      case 'submit_delivery': case 'contest_ruling': {
        const contest = method === 'contest_ruling';
        const p = this.pactFor(a[0]);
        if (contest) {
          if (p.status !== 'ruled') fail('only a standing ruling can be contested');
          if (!isParty(p)) fail('only the maker or the deliverer can contest');
          if (p.rounds >= LIMITS.maxRounds) fail('the final hearing has already been held');
          if (p.contest_hours === 0) fail('this pact was drafted without a contest window');
          if (p.ruled_ts && now >= p.ruled_ts + p.contest_hours * 3600) fail('the contest window has closed');
        } else {
          if (!['active', 'delivered', 'needs_evidence'].includes(p.status)) fail('this pact is not waiting for delivery');
          if (!same(p.deliverer, me)) fail('only the deliverer can submit evidence');
          if (!evidenceOpen(p, now)) fail('the deadline has passed');
        }
        const url = String(a[1]).trim(), bad = checkUrl(url);
        if (bad) fail(bad);
        const note = clean(a[2]);
        if (note.length > LIMITS.maxNote) fail(`a note is up to ${LIMITS.maxNote} characters`);
        // the one contest link comes on top of the deliverer's four
        if (p.evidence.length >= LIMITS.maxEvidence + (contest ? 1 : 0)) fail(`a pact holds up to ${LIMITS.maxEvidence} evidence links`);
        if (p.evidence.some((e) => e.url.toLowerCase() === url.toLowerCase())) fail('that link is already on the record');
        p.evidence.push({ by: lme, url, note, at: now, round: p.rounds + 1 });
        p.status = contest ? 'contested' : 'delivered';
        return { ok: true };
      }
      case 'request_ruling': {
        const p = this.pactFor(a[0]);
        if (!['delivered', 'contested'].includes(p.status)) fail('there is nothing to rule on yet');
        if (!p.evidence.length) fail('no evidence has been submitted');
        const late = p.deadline_ts && now > p.deadline_ts + LIMITS.graceDays * DAY;
        if (!(isParty(p) || late)) fail('only the maker or the deliverer can request the hearing');
        const round = p.rounds + 1;
        if (round > LIMITS.maxRounds) fail('the final hearing has already been held');
        const reading = await evaluate(p.criteria, p.evidence.map((e) => e.url), p.evidence.map((e) => same(e.by, p.deliverer)));
        const d = decide(p.criteria, reading.verdicts, round >= LIMITS.maxRounds);
        p.rulings.push({ round, outcome: d.outcome, bps: d.bps, met: d.met, total: d.total, verdicts: d.verdicts, quotes: reading.quotes,
          docs: reading.docs, at: new Date(now * 1000).toISOString(), by: lme, engine: 'sandbox' });
        p.rounds = round; p.outcome = d.outcome; p.payout_bps = d.bps; p.ruled_ts = now;
        p.status = d.outcome === 'needs_evidence' ? 'needs_evidence' : 'ruled';
        st.hearings++;
        return { ok: true, outcome: d.outcome, bps: d.bps };
      }
      case 'settle_pact': {
        const p = this.pactFor(a[0]);
        if (p.status !== 'ruled') fail('there is no standing ruling to settle');
        const final = p.rounds >= LIMITS.maxRounds;
        const over = p.contest_hours === 0 || (p.ruled_ts && now >= p.ruled_ts + p.contest_hours * 3600);
        if (!(final || over)) fail('the contest window is still open');
        const [toD, toM] = split(big(p.stake), p.payout_bps);
        p.status = 'settled'; p.settled_ts = now; p.to_deliverer = toD.toString(); p.to_maker = toM.toString();
        const d = standingOf(st, p.deliverer);
        d[p.outcome === 'fulfilled' ? 'fulfilled' : p.outcome === 'partial' ? 'partial' : 'breached']++;
        d.earned = (big(d.earned) + toD).toString();
        const m = standingOf(st, p.maker); m.refunded = (big(m.refunded) + toM).toString();
        st.settled++; st.volume = (big(st.volume) + big(p.stake)).toString();
        credit(st, p.deliverer, toD); credit(st, p.maker, toM);
        return { ok: true, to_deliverer: toD.toString(), to_maker: toM.toString() };
      }
      case 'expire_pact': {
        const p = this.pactFor(a[0]);
        if (!['open', 'active', 'needs_evidence'].includes(p.status)) fail('this pact cannot expire in its current state');
        if (evidenceOpen(p, now)) fail('the deadline has not passed');
        const hadD = p.deliverer !== ZERO;
        p.status = 'expired'; p.to_maker = p.stake; p.settled_ts = now;
        if (hadD) standingOf(st, p.deliverer).expired++;
        const m = standingOf(st, p.maker); m.refunded = (big(m.refunded) + big(p.stake)).toString();
        credit(st, p.maker, big(p.stake));
        return { ok: true };
      }
      default: throw new Error(`unknown method ${method}`);
    }
  }

  async preview(criteria, terms, url) {
    const bad = checkUrl(url);
    if (bad) return { ok: false, reason: bad };
    const n = normalizeCriteria(criteria);
    if (!n.ok) return { ok: false, reason: n.reason };
    await sleep(700);
    const reading = await evaluate(n.criteria, [url]);
    const d = decide(n.criteria, reading.verdicts, false);
    return { ok: true, engine: 'sandbox', ruling: { ...d, quotes: reading.quotes, docs: reading.docs } };
  }
}
