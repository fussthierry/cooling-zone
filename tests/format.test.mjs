import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatClock, formatElapsed, formatSeconds, ordinal } from '../js/format.js';

test('formatClock : HH:MM:SS en heure locale', () => {
  const d = new Date(2026, 9, 15, 9, 5, 7);
  assert.equal(formatClock(d.getTime()), '09:05:07');
});

test('formatElapsed : mm:ss, minutes au-delà de 59', () => {
  assert.equal(formatElapsed(0), '00:00');
  assert.equal(formatElapsed(65_900), '01:05');
  assert.equal(formatElapsed(75 * 60_000 + 3000), '75:03');
  assert.equal(formatElapsed(-500), '00:00');
});

test('formatSeconds : une décimale avec virgule', () => {
  assert.equal(formatSeconds(10_500), '10,5 s');
  assert.equal(formatSeconds(0), '0,0 s');
});

test('ordinal en français', () => {
  assert.equal(ordinal(1), '1er');
  assert.equal(ordinal(15), '15e');
});
