// Calcul de la fréquence cardiaque par pulsométrie — fonctions pures, sans dépendance au DOM.

export const DEFAULT_THRESHOLD = 80;
export const DEFAULT_BEATS = 15;
export const MIN_BEATS = 2;
export const PLAUSIBLE_MIN = 20;
export const PLAUSIBLE_MAX = 200;

/**
 * FC en bpm à partir du nombre de battements tapés (1er tap = 1er battement,
 * 2e tap = Nième battement) et du temps écoulé entre les deux taps.
 * Entre le 1er et le Nième battement il y a (N − 1) intervalles :
 * FC = (N − 1) × 60 / t, arrondie à l'entier.
 */
export function computeHeartRate(beats, seconds) {
  if (!Number.isInteger(beats) || beats < MIN_BEATS) {
    throw new RangeError(`Nombre de battements invalide : ${beats}`);
  }
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    throw new RangeError(`Durée invalide : ${seconds}`);
  }
  return Math.round(((beats - 1) * 60) / seconds);
}

/** Vert si la FC est inférieure ou égale au seuil, rouge sinon. */
export function isGreen(bpm, threshold) {
  return bpm <= threshold;
}

/** Hors de cette plage, on demande confirmation (probable erreur de tap). */
export function isPlausible(bpm) {
  return bpm >= PLAUSIBLE_MIN && bpm <= PLAUSIBLE_MAX;
}
