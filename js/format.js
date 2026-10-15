// Formatage des heures et durées pour l'affichage.

const pad = (n) => String(n).padStart(2, '0');

/** Heure locale de l'appareil au format HH:MM:SS. */
export function formatClock(timestamp) {
  const d = new Date(timestamp);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Durée écoulée au format mm:ss (les minutes peuvent dépasser 59). */
export function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** Chrono en secondes avec une décimale, virgule française : « 10,5 s ». */
export function formatSeconds(ms) {
  return `${(Math.max(0, ms) / 1000).toFixed(1).replace('.', ',')} s`;
}

/** « 1er » puis « 2e », « 15e »… */
export function ordinal(n) {
  return n === 1 ? '1er' : `${n}e`;
}
