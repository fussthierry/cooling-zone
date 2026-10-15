// Modèle de données et persistance localStorage.
//
// coolingzone.settings.v1 : { threshold, beats }
// coolingzone.horses.v1   : [ Horse ] dans l'ordre d'arrivée
//   Horse       = { id, bib, arrivalAt, measurements: [Measurement] }
//   Measurement = { id, at, bpm, method: 'tap' | 'manual', beats, durationMs,
//                   threshold, green, manuallyValidated }
// La couleur (green) et le seuil sont figés au moment de la mesure.
// Un cheval est « libéré » dès qu'il a au moins une mesure verte (valeur dérivée).

import { DEFAULT_THRESHOLD, DEFAULT_BEATS, MIN_BEATS, PLAUSIBLE_MIN, PLAUSIBLE_MAX, isGreen } from './hr.js';

export const HORSES_KEY = 'coolingzone.horses.v1';
export const SETTINGS_KEY = 'coolingzone.settings.v1';

export const MIN_THRESHOLD = PLAUSIBLE_MIN;
export const MAX_THRESHOLD = PLAUSIBLE_MAX;
export const MAX_BEATS = 60;

export const DEFAULT_SETTINGS = Object.freeze({ threshold: DEFAULT_THRESHOLD, beats: DEFAULT_BEATS });

/** Ne garde que les chiffres et supprime les zéros initiaux (« 007 » → « 7 »). */
export function normalizeBib(input) {
  const digits = String(input ?? '').replace(/\D/g, '');
  return digits.replace(/^0+(?=\d)/, '');
}

export function isValidThreshold(value) {
  return Number.isInteger(value) && value >= MIN_THRESHOLD && value <= MAX_THRESHOLD;
}

export function isValidBeats(value) {
  return Number.isInteger(value) && value >= MIN_BEATS && value <= MAX_BEATS;
}

export function sanitizeSettings(raw) {
  const threshold = Number(raw?.threshold);
  const beats = Number(raw?.beats);
  return {
    threshold: isValidThreshold(threshold) ? threshold : DEFAULT_SETTINGS.threshold,
    beats: isValidBeats(beats) ? beats : DEFAULT_SETTINGS.beats,
  };
}

export function isReleased(horse) {
  return horse.measurements.some((m) => m.green);
}

/** Heure de la dernière mesure, ou de l'arrivée s'il n'y en a pas. */
export function lastActivityAt(horse) {
  const last = horse.measurements[horse.measurements.length - 1];
  return last ? last.at : horse.arrivalAt;
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function createStore(storage, { now = () => Date.now(), onError = () => {} } = {}) {
  function read(key, fallback) {
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      onError(err);
      return false;
    }
  }

  const stored = read(HORSES_KEY, []);
  let horses = Array.isArray(stored) ? stored : [];
  let settings = sanitizeSettings(read(SETTINGS_KEY, {}));

  const saveHorses = () => write(HORSES_KEY, horses);
  const getHorse = (id) => horses.find((h) => h.id === id) ?? null;

  return {
    get horses() {
      return horses;
    },

    get settings() {
      return settings;
    },

    getHorse,

    findHorse(bib) {
      const key = normalizeBib(bib);
      return horses.find((h) => h.bib === key) ?? null;
    },

    /** → { ok: true, horse } | { ok: false, reason: 'invalid' | 'duplicate', horse? } */
    addArrival(bib) {
      const key = normalizeBib(bib);
      if (!key) return { ok: false, reason: 'invalid' };
      const existing = this.findHorse(key);
      if (existing) return { ok: false, reason: 'duplicate', horse: existing };
      const horse = { id: newId(), bib: key, arrivalAt: now(), measurements: [] };
      horses.push(horse);
      saveHorses();
      return { ok: true, horse };
    },

    addMeasurement(horseId, { bpm, method, beats = null, durationMs = null, at = now() }) {
      const horse = getHorse(horseId);
      if (!horse) return null;
      const measurement = {
        id: newId(),
        at,
        bpm,
        method,
        beats,
        durationMs,
        threshold: settings.threshold,
        green: isGreen(bpm, settings.threshold),
        manuallyValidated: false,
      };
      horse.measurements.push(measurement);
      saveHorses();
      return measurement;
    },

    /** Validation manuelle d'une mesure rouge : elle devient verte et le cheval est libéré. */
    validateMeasurement(horseId, measurementId) {
      const m = getHorse(horseId)?.measurements.find((x) => x.id === measurementId);
      if (!m || m.green) return false;
      m.green = true;
      m.manuallyValidated = true;
      saveHorses();
      return true;
    },

    deleteMeasurement(horseId, measurementId) {
      const horse = getHorse(horseId);
      if (!horse) return false;
      const before = horse.measurements.length;
      horse.measurements = horse.measurements.filter((m) => m.id !== measurementId);
      if (horse.measurements.length === before) return false;
      saveHorses();
      return true;
    },

    updateSettings(partial) {
      settings = sanitizeSettings({ ...settings, ...partial });
      write(SETTINGS_KEY, settings);
      return settings;
    },

    /** Efface chevaux et mesures. Les paramètres sont conservés. */
    clearAll() {
      horses = [];
      saveHorses();
    },
  };
}
