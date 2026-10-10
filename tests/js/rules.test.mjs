import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decide, split, score, checkUrl, normalizeCriteria, alnum } from '../../public/assets/js/rules.js';

const v = JSON.parse(readFileSync(new URL('../vectors/rules.json', import.meta.url), 'utf8'));

test('decide matches the contract on every vector', () => {
  for (const [i, c] of v.decide.entries()) {
    const got = decide(c.criteria, c.verdicts, c.final);
    assert.deepEqual(got, c.expect, `vector ${i}: ${JSON.stringify(c)}`);
  }
});

test('split matches the contract, including stakes far beyond 2^53', () => {
  for (const c of v.split) {
    const [d, m] = split(BigInt(c.stake), c.bps);
    assert.equal(d.toString(), c.deliverer);
    assert.equal(m.toString(), c.maker);
    assert.equal(d + m, BigInt(c.stake));
  }
});

test('score matches the contract', () => {
  for (const c of v.score) assert.equal(score(...c.in), c.out);
});

test('checkUrl accepts and refuses exactly what the contract does, with its reasons', () => {
  for (const c of v.urls) {
    const got = checkUrl(c.url);
    if (c.ok) assert.equal(got, null, c.url);
    else assert.equal(got, c.reason, c.url);
  }
});

test('normalizeCriteria normalises and refuses exactly as the contract does', () => {
  for (const c of v.criteria) {
    const got = normalizeCriteria(c.in);
    if (c.ok) { assert.equal(got.ok, true, JSON.stringify(c.in)); assert.deepEqual(got.criteria, c.out); }
    else { assert.equal(got.ok, false, JSON.stringify(c.in)); assert.equal(got.reason, c.reason); }
  }
});

test('alnum folds text of any script exactly as the contract does', () => {
  for (const c of v.alnum) assert.equal(alnum(c.in), c.out, JSON.stringify(c.in));
});
