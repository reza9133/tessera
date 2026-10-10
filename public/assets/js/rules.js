// The deterministic half of the contract, mirrored so the interface can preview and the
// sandbox can rule with exactly the same arithmetic. tests/vectors/rules.json is generated
// from the Python contract and this file is tested against it (npm test).

export const LIMITS = {
  maxCriteria: 5, maxTitle: 80, minTerms: 10, maxTerms: 1200, maxText: 240, maxArg: 80,
  maxUrl: 300, maxNote: 280, maxEvidence: 4, maxRounds: 2, maxWeight: 5, maxWordsArg: 20000,
  minDays: 1, maxDays: 90, contestHours: [0, 1, 6, 24, 72], graceDays: 3,
};

export const VERDICTS = ['met', 'unmet', 'unclear'];
export const CRITERIA_TYPES = ['live', 'contains', 'min_words', 'judge'];

export function decide(criteria, verdicts, finalRound) {
  let total = 0, met = 0, unclear = 0, requiredFailed = false;
  const settled = {};
  for (const c of criteria) {
    let v = verdicts[c.id] ?? 'unclear';
    if (!VERDICTS.includes(v)) v = 'unclear';
    if (finalRound && v === 'unclear') v = 'unmet';
    settled[c.id] = v;
    total += c.weight;
    if (v === 'met') met += c.weight;
    else if (v === 'unclear') unclear += c.weight;
    else if (c.required) requiredFailed = true;
  }
  let outcome, bps;
  if (requiredFailed) { outcome = 'breached'; bps = 0; }
  else if (unclear > 0) { outcome = 'needs_evidence'; bps = 0; }
  else if (met === 0) { outcome = 'breached'; bps = 0; }
  else if (met === total) { outcome = 'fulfilled'; bps = 10000; }
  else { outcome = 'partial'; bps = Math.floor((met * 10000) / total); }
  return { outcome, bps, met, total, verdicts: settled };
}

/** [to the deliverer, back to the maker] for a stake in wei. Together: exactly the stake. */
export function split(stake, bps) {
  const s = BigInt(stake);
  const toDeliverer = (s * BigInt(bps)) / 10000n;
  return [toDeliverer, s - toDeliverer];
}

export function score(fulfilled, partial, breached, expired) {
  const decided = fulfilled + partial + breached + expired;
  if (decided === 0) return -1;
  return Math.floor((fulfilled * 100 + partial * 50) / decided);
}

/** Lower-cased letters and digits of any script; runs of anything else fold to one space. */
export const alnum = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function ipv4(name) {
  const parts = name.split('.');
  if (parts.length !== 4 || !parts.every((p) => /^[0-9]{1,3}$/.test(p))) return null;
  const nums = parts.map(Number);
  return nums.every((n) => n <= 255) ? nums : null;
}

function privateHost(raw) {
  const name = raw.replace(/\.+$/, '');
  if (!name || name.startsWith('[')) return true;
  if (name === 'localhost' || ['.localhost', '.local', '.internal', '.localdomain', '.lan'].some((suffix) => name.endsWith(suffix))) return true;
  const numeric = (label) => /^[\x00-\x7f]*$/.test(label) && (/^[0-9]+$/.test(label) || label.startsWith('0x'));
  if (name.split('.').every(numeric)) {
    const quad = ipv4(name);
    if (quad === null) return true;
    const [a, b] = quad;
    return [0, 10, 127].includes(a) || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return false;
}

/** null when the link is acceptable, otherwise the reason the contract would give. */
export function checkUrl(input) {
  const url = String(input ?? '').trim();
  if (!url || url.length > LIMITS.maxUrl || /\s/.test(url)) return `a link is up to ${LIMITS.maxUrl} characters with no spaces`;
  const lowered = url.toLowerCase();
  if (!(lowered.startsWith('https://') || lowered.startsWith('http://'))) return 'a link must start with https:// or http://';
  let host = lowered.split('://')[1].split('/')[0].split('?')[0].split('#')[0];
  host = host.slice(host.lastIndexOf('@') + 1);
  const name = host.startsWith('[') ? host : host.split(':')[0];
  if (privateHost(name)) return 'links to private or local addresses are not accepted';
  if (!name.includes('.')) return 'a link needs a public host name';
  return null;
}

const clean = (s) => String(s ?? '').split(/\s+/).filter(Boolean).join(' ');

/** Normalise a rubric exactly as the contract does. { ok, criteria } or { ok: false, reason }. */
export function normalizeCriteria(list) {
  if (!Array.isArray(list) || list.length < 1 || list.length > LIMITS.maxCriteria)
    return { ok: false, reason: `a pact has 1 to ${LIMITS.maxCriteria} criteria` };
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i], n = i + 1;
    const type = String(item.type ?? 'judge').trim();
    if (!CRITERIA_TYPES.includes(type)) return { ok: false, reason: `criterion ${n}: type must be one of ${CRITERIA_TYPES.join(', ')}` };
    const weight = item.weight ?? 2;
    if (!Number.isInteger(weight) || weight < 1 || weight > LIMITS.maxWeight)
      return { ok: false, reason: `criterion ${n}: weight is a whole number from 1 to ${LIMITS.maxWeight}` };
    const required = item.required ?? false;
    if (typeof required !== 'boolean') return { ok: false, reason: `criterion ${n}: required is true or false` };
    let text = clean(item.text), arg = clean(item.arg);
    if (text.length > LIMITS.maxText || arg.length > LIMITS.maxArg) return { ok: false, reason: `criterion ${n} is too long` };
    if (type === 'judge') {
      if (text.length < 6) return { ok: false, reason: `criterion ${n}: describe what the validators should look for` };
      arg = '';
    } else if (type === 'contains') {
      if (!arg) return { ok: false, reason: `criterion ${n}: name the phrase the page must contain` };
      if (!alnum(arg)) return { ok: false, reason: `criterion ${n}: the phrase needs at least one letter or digit` };
      text = text || `The evidence mentions "${arg}"`;
    } else if (type === 'min_words') {
      if (!/^\d+$/.test(arg) || Number(arg) < 1 || Number(arg) > LIMITS.maxWordsArg)
        return { ok: false, reason: `criterion ${n}: the minimum is a whole number of words` };
      arg = String(Number(arg));
      text = text || `The evidence has at least ${arg} words`;
    } else { arg = ''; text = text || 'Every evidence link opens'; }
    out.push({ id: `c${n}`, type, text, arg, weight, required });
  }
  return { ok: true, criteria: out };
}
