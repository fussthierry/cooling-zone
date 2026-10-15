import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeHeartRate, isGreen, isPlausible, DEFAULT_THRESHOLD } from '../js/hr.js';

test('N = 15 et t = 10,5 s donnent 80 bpm, vert avec le seuil par défaut', () => {
  const bpm = computeHeartRate(15, 10.5);
  assert.equal(bpm, 80);
  assert.equal(isGreen(bpm, DEFAULT_THRESHOLD), true);
});

test('N = 15 et t = 12 s donnent 70 bpm', () => {
  assert.equal(computeHeartRate(15, 12), 70);
});

test('N = 15 : FC = 840 / t', () => {
  assert.equal(computeHeartRate(15, 8.4), 100);
  assert.equal(computeHeartRate(15, 21), 40);
});

test('utilise N − 1 intervalles pour d’autres valeurs de N', () => {
  assert.equal(computeHeartRate(2, 1), 60); // 1 intervalle d’une seconde
  assert.equal(computeHeartRate(11, 10), 60); // 10 intervalles en 10 s
  assert.equal(computeHeartRate(31, 20), 90);
});

test('arrondit à l’entier le plus proche', () => {
  assert.equal(computeHeartRate(15, 10.4), 81); // 80,77
  assert.equal(computeHeartRate(15, 10.6), 79); // 79,25
  assert.equal(computeHeartRate(15, 11.2), 75); // 75,0
});

test('seuil inclusif : 80 = vert, 81 = rouge', () => {
  assert.equal(isGreen(80, 80), true);
  assert.equal(isGreen(81, 80), false);
  assert.equal(isGreen(64, 64), true);
});

test('plage plausible 20–200 bpm', () => {
  assert.equal(isPlausible(20), true);
  assert.equal(isPlausible(200), true);
  assert.equal(isPlausible(19), false);
  assert.equal(isPlausible(201), false);
});

test('rejette les entrées invalides', () => {
  assert.throws(() => computeHeartRate(1, 10), RangeError);
  assert.throws(() => computeHeartRate(15.5, 10), RangeError);
  assert.throws(() => computeHeartRate(15, 0), RangeError);
  assert.throws(() => computeHeartRate(15, -3), RangeError);
  assert.throws(() => computeHeartRate(15, NaN), RangeError);
  assert.throws(() => computeHeartRate(15, Infinity), RangeError);
});
