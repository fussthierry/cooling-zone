import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStore, normalizeBib, sanitizeSettings, isReleased, lastActivityAt,
  HORSES_KEY, SETTINGS_KEY,
} from '../js/store.js';

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    data,
  };
}

function clock(start = 1_000_000) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => { t += ms; };
  return now;
}

test('normalizeBib garde les chiffres et retire les zéros initiaux', () => {
  assert.equal(normalizeBib(' 012 '), '12');
  assert.equal(normalizeBib('0'), '0');
  assert.equal(normalizeBib('abc'), '');
  assert.equal(normalizeBib(42), '42');
});

test('sanitizeSettings applique les défauts et les bornes', () => {
  assert.deepEqual(sanitizeSettings({}), { threshold: 80, beats: 15 });
  assert.deepEqual(sanitizeSettings({ threshold: 64, beats: 10 }), { threshold: 64, beats: 10 });
  assert.deepEqual(sanitizeSettings({ threshold: 'x', beats: 1 }), { threshold: 80, beats: 15 });
  assert.deepEqual(sanitizeSettings({ beats: 2 }).beats, 2);
});

test('arrivée : heure enregistrée et doublon refusé', () => {
  const now = clock();
  const store = createStore(memoryStorage(), { now });
  const first = store.addArrival('12');
  assert.equal(first.ok, true);
  assert.equal(first.horse.arrivalAt, now());

  const dup = store.addArrival('012');
  assert.equal(dup.ok, false);
  assert.equal(dup.reason, 'duplicate');
  assert.equal(dup.horse.id, first.horse.id);
  assert.equal(store.horses.length, 1);

  assert.equal(store.addArrival('').reason, 'invalid');
});

test('la couleur est figée avec le seuil en vigueur au moment de la mesure', () => {
  const store = createStore(memoryStorage());
  const { horse } = store.addArrival('7');
  const red = store.addMeasurement(horse.id, { bpm: 81, method: 'tap' });
  assert.equal(red.green, false);
  assert.equal(red.threshold, 80);
  assert.equal(isReleased(horse), false);

  store.updateSettings({ threshold: 90 });
  assert.equal(horse.measurements[0].green, false, 'pas de recoloration');

  const green = store.addMeasurement(horse.id, { bpm: 85, method: 'manual' });
  assert.equal(green.green, true);
  assert.equal(green.threshold, 90);
  assert.equal(isReleased(horse), true);
});

test('80 bpm = vert, 81 bpm = rouge avec le seuil par défaut', () => {
  const store = createStore(memoryStorage());
  const { horse } = store.addArrival('1');
  assert.equal(store.addMeasurement(horse.id, { bpm: 80, method: 'tap' }).green, true);
  assert.equal(store.addMeasurement(horse.id, { bpm: 81, method: 'tap' }).green, false);
});

test('validation manuelle : la mesure devient verte et le cheval est libéré', () => {
  const store = createStore(memoryStorage());
  const { horse } = store.addArrival('3');
  const m = store.addMeasurement(horse.id, { bpm: 95, method: 'tap' });
  assert.equal(store.validateMeasurement(horse.id, m.id), true);
  assert.equal(m.green, true);
  assert.equal(m.manuallyValidated, true);
  assert.equal(isReleased(horse), true);
  assert.equal(store.validateMeasurement(horse.id, m.id), false, 'déjà verte');
});

test('suppression d’une mesure sans trace', () => {
  const store = createStore(memoryStorage());
  const { horse } = store.addArrival('5');
  const m = store.addMeasurement(horse.id, { bpm: 70, method: 'tap' });
  assert.equal(isReleased(horse), true);
  assert.equal(store.deleteMeasurement(horse.id, m.id), true);
  assert.equal(store.getHorse(horse.id).measurements.length, 0);
  assert.equal(isReleased(store.getHorse(horse.id)), false);
});

test('lastActivityAt : dernière mesure, sinon arrivée', () => {
  const now = clock();
  const store = createStore(memoryStorage(), { now });
  const { horse } = store.addArrival('9');
  assert.equal(lastActivityAt(horse), horse.arrivalAt);
  now.advance(60_000);
  store.addMeasurement(horse.id, { bpm: 100, method: 'tap' });
  assert.equal(lastActivityAt(horse), horse.arrivalAt + 60_000);
});

test('persistance : les données survivent à un rechargement', () => {
  const storage = memoryStorage();
  const a = createStore(storage);
  const { horse } = a.addArrival('21');
  a.addMeasurement(horse.id, { bpm: 76, method: 'tap', beats: 15, durationMs: 11000 });
  a.updateSettings({ threshold: 72, beats: 10 });

  const b = createStore(storage);
  assert.equal(b.horses.length, 1);
  assert.equal(b.horses[0].measurements[0].bpm, 76);
  assert.deepEqual(b.settings, { threshold: 72, beats: 10 });
});

test('effacer toutes les données conserve les paramètres', () => {
  const storage = memoryStorage();
  const store = createStore(storage);
  store.addArrival('1');
  store.updateSettings({ threshold: 70 });
  store.clearAll();
  assert.equal(store.horses.length, 0);
  assert.equal(createStore(storage).horses.length, 0);
  assert.equal(createStore(storage).settings.threshold, 70);
});

test('données corrompues : repart d’un état vide', () => {
  const storage = memoryStorage({ [HORSES_KEY]: '{oops', [SETTINGS_KEY]: 'null' });
  const store = createStore(storage);
  assert.deepEqual(store.horses, []);
  assert.deepEqual(store.settings, { threshold: 80, beats: 15 });
});

test('échec d’écriture signalé via onError', () => {
  let errors = 0;
  const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  const store = createStore(storage, { onError: () => { errors++; } });
  store.addArrival('4');
  assert.equal(errors, 1);
});
