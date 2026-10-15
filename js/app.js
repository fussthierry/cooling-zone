// Interface : liste des chevaux, arrivée, mesure au tap, paramètres.

import { computeHeartRate, isPlausible, PLAUSIBLE_MIN, PLAUSIBLE_MAX, MIN_BEATS } from './hr.js';
import {
  createStore, normalizeBib, isReleased, lastActivityAt,
  isValidThreshold, isValidBeats, MIN_THRESHOLD, MAX_THRESHOLD, MAX_BEATS,
} from './store.js';
import { formatClock, formatElapsed, formatSeconds, ordinal } from './format.js';

// Deux taps plus rapprochés que ceci sont ignorés (rebond du doigt).
const MIN_TAP_GAP_MS = 250;

const $ = (selector) => document.querySelector(selector);

const store = createStore(window.localStorage, {
  onError: () => toast('Échec de l’enregistrement sur l’appareil (stockage plein ?)', true),
});

const els = {
  counts: $('#counts'),
  empty: $('#empty'),
  list: $('#horse-list'),

  arrivalScreen: $('#screen-arrival'),
  arrivalForm: $('#form-arrival'),
  arrivalBib: $('#arrival-bib'),
  arrivalMsg: $('#arrival-msg'),

  measureScreen: $('#screen-measure'),
  measureBibForm: $('#form-measure-bib'),
  measureBib: $('#measure-bib'),
  measureBibMsg: $('#measure-bib-msg'),
  measureStart: $('#measure-start'),
  tapBib: $('#tap-bib'),
  tapBeats: $('#tap-beats'),
  tapBtn: $('#tap-btn'),
  tapLabel: $('#tap-label'),
  tapChrono: $('#tap-chrono'),
  manualForm: $('#form-manual'),
  manualBib: $('#manual-bib'),
  manualBpm: $('#manual-bpm'),
  manualMsg: $('#manual-msg'),
  resultCard: $('#result-card'),
  resultBib: $('#result-bib'),
  resultBpm: $('#result-bpm'),
  resultStatus: $('#result-status'),
  resultDetail: $('#result-detail'),

  settingsScreen: $('#screen-settings'),
  settingsForm: $('#form-settings'),
  setThreshold: $('#set-threshold'),
  setBeats: $('#set-beats'),
  settingsMsg: $('#settings-msg'),
  offlineStatus: $('#offline-status'),

  modal: $('#modal'),
  modalTitle: $('#modal-title'),
  modalMessage: $('#modal-message'),
  modalActions: $('#modal-actions'),
  toast: $('#toast'),
};

// ============================================================
// Petits utilitaires d'interface
// ============================================================

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value);
  }
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

let toastTimer = 0;
function toast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.classList.toggle('is-error', isError);
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, isError ? 5000 : 2500);
}

// Résolveur de la boîte de dialogue ouverte. On ne s'appuie pas sur l'événement
// `close`, asynchrone : il arriverait après l'ouverture d'une confirmation enchaînée.
let modalResolve = null;

function settleModal(value) {
  const resolve = modalResolve;
  modalResolve = null;
  if (els.modal.open) els.modal.close();
  resolve?.(value);
}

els.modal.addEventListener('cancel', (e) => {
  e.preventDefault();
  settleModal(null);
});

/**
 * Boîte de dialogue de confirmation. Résout avec la `value` du bouton choisi,
 * ou null si elle est fermée autrement (touche Échap, retour).
 */
function ask({ title, message = '', buttons }) {
  settleModal(null);
  return new Promise((resolve) => {
    modalResolve = resolve;
    els.modalTitle.textContent = title;
    els.modalMessage.textContent = message;
    els.modalActions.replaceChildren(...buttons.map((b) => {
      const btn = el('button', { type: 'button', class: `btn btn-${b.variant ?? 'secondary'}` }, b.label);
      btn.addEventListener('click', () => settleModal(b.value));
      return btn;
    }));
    els.modal.showModal();
    els.modalActions.firstElementChild?.focus();
  });
}

function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* non disponible */ }
}

function parseIntStrict(text) {
  const t = String(text).trim();
  return /^\d+$/.test(t) ? Number(t) : NaN;
}

// ============================================================
// Navigation entre écrans (le bouton retour Android ferme l'écran)
// ============================================================

let currentScreen = null;
let onScreenClosed = null;

function openScreen(screen, onClose = null) {
  if (currentScreen) {
    hideCurrentScreen();
  } else {
    history.pushState({ overlay: true }, '');
  }
  currentScreen = screen;
  onScreenClosed = onClose;
  screen.hidden = false;
  screen.scrollTop = 0;
}

function hideCurrentScreen() {
  if (!currentScreen) return;
  currentScreen.hidden = true;
  currentScreen = null;
  const callback = onScreenClosed;
  onScreenClosed = null;
  callback?.();
}

function closeScreen() {
  if (!currentScreen) return;
  hideCurrentScreen();
  if (history.state?.overlay) history.back();
}

window.addEventListener('popstate', () => {
  settleModal(null);
  hideCurrentScreen();
});

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeScreen();
});

// ============================================================
// Liste des chevaux
// ============================================================

function renderHorse(horse) {
  const released = isReleased(horse);
  const last = horse.measurements[horse.measurements.length - 1];

  const head = el('button', {
    type: 'button',
    class: 'horse-head',
    'aria-label': `Nouvelle mesure pour le dossard ${horse.bib}`,
    dataset: { action: 'measure', horseId: horse.id },
  },
  el('span', { class: 'bib' }, horse.bib),
  el('span', { class: 'horse-info' },
    el('span', { class: 'status' }, released ? 'Libéré' : 'En récupération'),
    el('span', {}, `Arrivée ${formatClock(horse.arrivalAt)}`)),
  released ? null : el('span', { class: 'elapsed' },
    el('span', { class: 'elapsed-label' }, last ? 'depuis mesure' : 'depuis arrivée'),
    el('span', { class: 'elapsed-value', dataset: { since: String(lastActivityAt(horse)) } }, '')));

  const measures = horse.measurements.length === 0 ? null : el('ul', { class: 'measures' },
    ...horse.measurements.map((m) => el('li', {},
      el('button', {
        type: 'button',
        class: `measure ${m.green ? 'is-green' : 'is-red'}`,
        'aria-label': `Mesure de ${formatClock(m.at)} : ${m.bpm} bpm, ${m.green ? 'verte' : 'rouge'}${m.manuallyValidated ? ', validée manuellement' : ''}. Options`,
        dataset: { action: 'measure-menu', horseId: horse.id, measureId: m.id },
      },
      el('span', { class: 'm-time' }, formatClock(m.at)),
      el('span', { class: 'm-bpm' }, String(m.bpm)),
      el('span', {}, 'bpm'),
      m.method === 'manual' ? el('span', { class: 'm-flag' }, 'saisie') : null,
      m.manuallyValidated ? el('span', { class: 'm-flag' }, '✓ validé manuellement') : null))));

  return el('li', {
    class: `horse ${released ? 'is-released' : 'is-recovering'}`,
    dataset: { horseId: horse.id },
  }, head, measures);
}

function render() {
  const horses = store.horses;
  els.empty.hidden = horses.length > 0;
  els.list.replaceChildren(...horses.map(renderHorse));
  const released = horses.filter(isReleased).length;
  els.counts.textContent = horses.length
    ? `${horses.length - released} en récupération · ${released} libéré${released > 1 ? 's' : ''}`
    : '';
  updateElapsed();
}

function updateElapsed() {
  const now = Date.now();
  for (const node of els.list.querySelectorAll('[data-since]')) {
    node.textContent = formatElapsed(now - Number(node.dataset.since));
  }
}

function highlightHorse(horseId) {
  const card = els.list.querySelector(`[data-horse-id="${horseId}"]`);
  if (!card) return;
  card.scrollIntoView({ block: 'center', behavior: 'smooth' });
  card.classList.add('is-highlight');
  setTimeout(() => card.classList.remove('is-highlight'), 1500);
}

els.list.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const horse = store.getHorse(target.dataset.horseId);
  if (!horse) return;
  if (target.dataset.action === 'measure') openMeasure(horse.bib);
  else if (target.dataset.action === 'measure-menu') openMeasureMenu(horse, target.dataset.measureId);
});

async function openMeasureMenu(horse, measureId) {
  const m = horse.measurements.find((x) => x.id === measureId);
  if (!m) return;
  const buttons = [];
  if (!m.green) buttons.push({ label: 'Valider manuellement (passer au vert)', value: 'validate', variant: 'green' });
  buttons.push({ label: 'Supprimer la mesure', value: 'delete', variant: 'danger' });
  buttons.push({ label: 'Fermer', value: null });

  const color = m.green ? (m.manuallyValidated ? 'verte, validée manuellement' : 'verte') : 'rouge';
  const choice = await ask({
    title: `Dossard ${horse.bib} — ${m.bpm} bpm`,
    message: `Mesure de ${formatClock(m.at)} (${color}, seuil ${m.threshold} bpm).`,
    buttons,
  });

  if (choice === 'validate') {
    const ok = await ask({
      title: 'Forcer le passage au vert ?',
      message: `La mesure de ${m.bpm} bpm sera marquée « validé manuellement » et le dossard ${horse.bib} sera libéré.`,
      buttons: [
        { label: 'Valider et libérer', value: true, variant: 'green' },
        { label: 'Annuler', value: false },
      ],
    });
    if (ok && store.validateMeasurement(horse.id, m.id)) {
      render();
      toast(`Dossard ${horse.bib} libéré (validation manuelle)`);
    }
  } else if (choice === 'delete') {
    const ok = await ask({
      title: 'Supprimer cette mesure ?',
      message: `${m.bpm} bpm à ${formatClock(m.at)} — dossard ${horse.bib}. Aucune trace ne sera conservée.`,
      buttons: [
        { label: 'Supprimer', value: true, variant: 'danger' },
        { label: 'Annuler', value: false },
      ],
    });
    if (ok && store.deleteMeasurement(horse.id, m.id)) {
      render();
      toast('Mesure supprimée');
    }
  }
}

// ============================================================
// Nouvelle arrivée
// ============================================================

$('#btn-arrival').addEventListener('click', () => {
  els.arrivalBib.value = '';
  els.arrivalMsg.textContent = '';
  openScreen(els.arrivalScreen);
  els.arrivalBib.focus();
});

els.arrivalBib.addEventListener('input', () => { els.arrivalMsg.textContent = ''; });

els.arrivalForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const result = store.addArrival(els.arrivalBib.value);
  if (!result.ok) {
    els.arrivalMsg.textContent = result.reason === 'duplicate'
      ? `⚠ Le dossard ${result.horse.bib} est déjà présent (arrivé à ${formatClock(result.horse.arrivalAt)}). Aucun doublon créé.`
      : 'Saisissez un numéro de dossard.';
    vibrate(200);
    els.arrivalBib.select();
    return;
  }
  vibrate(40);
  closeScreen();
  render();
  highlightHorse(result.horse.id);
  toast(`Dossard ${result.horse.bib} arrivé à ${formatClock(result.horse.arrivalAt)}`);
});

// ============================================================
// Nouvelle mesure
// ============================================================

const measure = {
  horseId: null,
  beats: 0,
  start: null, // performance.now() du 1er tap
  raf: 0,
  busy: false, // confirmation en cours : taps ignorés
  savedId: null, // dernière mesure enregistrée (pour « Refaire »)
};

function setStage(name) {
  for (const stage of els.measureScreen.querySelectorAll('[data-stage]')) {
    stage.hidden = stage.dataset.stage !== name;
  }
}

function stopChrono() {
  cancelAnimationFrame(measure.raf);
  measure.raf = 0;
  measure.start = null;
}

function resetMeasure() {
  stopChrono();
  measure.horseId = null;
  measure.busy = false;
  measure.savedId = null;
}

function currentHorse() {
  return store.getHorse(measure.horseId);
}

function openMeasure(prefillBib = '') {
  openScreen(els.measureScreen, resetMeasure);
  setStage('bib');
  els.measureBib.value = prefillBib;
  els.measureBibMsg.textContent = '';
  if (prefillBib) els.measureStart.focus();
  else els.measureBib.focus();
}

$('#btn-measure').addEventListener('click', () => openMeasure());
els.measureBib.addEventListener('input', () => { els.measureBibMsg.textContent = ''; });

els.measureBibForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const bib = normalizeBib(els.measureBib.value);
  if (!bib) {
    els.measureBibMsg.textContent = 'Saisissez un numéro de dossard.';
    return;
  }
  let horse = store.findHorse(bib);
  if (!horse) {
    const create = await ask({
      title: `Dossard ${bib} inconnu`,
      message: `Aucune arrivée n’est enregistrée pour le dossard ${bib}. Créer l’arrivée maintenant (heure actuelle) ?`,
      buttons: [
        { label: 'Créer l’arrivée et mesurer', value: true, variant: 'primary' },
        { label: 'Annuler', value: false },
      ],
    });
    if (!create) return;
    const result = store.addArrival(bib);
    if (!result.ok) return;
    horse = result.horse;
    render();
    toast(`Arrivée du dossard ${bib} enregistrée à ${formatClock(horse.arrivalAt)}`);
  }
  startTapStage(horse);
});

function startTapStage(horse) {
  stopChrono();
  measure.horseId = horse.id;
  measure.beats = store.settings.beats;
  measure.busy = false;
  measure.savedId = null;
  els.tapBib.textContent = horse.bib;
  els.tapBeats.textContent = `${measure.beats} battements${isReleased(horse) ? ' · déjà libéré' : ''}`;
  els.tapLabel.textContent = 'Touchez au 1er battement';
  els.tapChrono.textContent = formatSeconds(0);
  els.tapBtn.classList.remove('is-running', 'is-flash');
  setStage('tap');
  els.tapBtn.focus({ preventScroll: true });
}

function flashTapButton() {
  els.tapBtn.classList.remove('is-flash');
  void els.tapBtn.offsetWidth; // relance l'animation
  els.tapBtn.classList.add('is-flash');
  setTimeout(() => els.tapBtn.classList.remove('is-flash'), 120);
}

function tickChrono() {
  if (measure.start === null) return;
  els.tapChrono.textContent = formatSeconds(performance.now() - measure.start);
  measure.raf = requestAnimationFrame(tickChrono);
}

async function handleTap() {
  if (measure.busy || els.measureScreen.hidden) return;
  const t = performance.now();

  if (measure.start === null) {
    measure.start = t;
    vibrate(40);
    flashTapButton();
    els.tapBtn.classList.add('is-running');
    els.tapLabel.textContent = `Touchez au ${ordinal(measure.beats)} battement`;
    tickChrono();
    return;
  }

  const elapsed = t - measure.start;
  if (elapsed < MIN_TAP_GAP_MS) return;
  const at = Date.now();
  stopChrono();
  vibrate([40, 60, 40]);
  flashTapButton();
  els.tapBtn.classList.remove('is-running');
  els.tapChrono.textContent = formatSeconds(elapsed);

  const bpm = computeHeartRate(measure.beats, elapsed / 1000);
  const saved = await saveMeasurement({
    bpm, method: 'tap', beats: measure.beats, durationMs: Math.round(elapsed), at,
  });
  if (!saved && currentHorse()) startTapStage(currentHorse());
}

els.tapBtn.addEventListener('pointerdown', (e) => {
  if (e.button > 0) return;
  e.preventDefault();
  handleTap();
});
els.tapBtn.addEventListener('keydown', (e) => {
  if (e.key !== ' ' && e.key !== 'Enter') return;
  e.preventDefault();
  if (!e.repeat) handleTap();
});
els.tapBtn.addEventListener('contextmenu', (e) => e.preventDefault());

$('#tap-cancel').addEventListener('click', () => closeScreen());

$('#tap-manual').addEventListener('click', () => {
  stopChrono();
  els.manualBib.textContent = currentHorse()?.bib ?? '';
  els.manualBpm.value = '';
  els.manualMsg.textContent = '';
  setStage('manual');
  els.manualBpm.focus();
});

$('#manual-back').addEventListener('click', () => {
  const horse = currentHorse();
  if (horse) startTapStage(horse);
});

els.manualBpm.addEventListener('input', () => { els.manualMsg.textContent = ''; });

els.manualForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const bpm = parseIntStrict(els.manualBpm.value);
  if (!(bpm > 0)) {
    els.manualMsg.textContent = 'Saisissez une fréquence cardiaque en bpm (nombre entier).';
    return;
  }
  await saveMeasurement({ bpm, method: 'manual', at: Date.now() });
});

/** Demande confirmation si la valeur est hors plage, puis enregistre. → true si enregistrée. */
async function saveMeasurement(data) {
  const horse = currentHorse();
  if (!horse) return false;

  if (!isPlausible(data.bpm)) {
    measure.busy = true;
    const keep = await ask({
      title: 'Valeur inhabituelle',
      message: `FC ${data.method === 'tap' ? 'calculée' : 'saisie'} : ${data.bpm} bpm, hors de la plage ${PLAUSIBLE_MIN}–${PLAUSIBLE_MAX} bpm.`
        + (data.method === 'tap' ? '\nProbable erreur de tap.' : ''),
      buttons: [
        { label: data.method === 'tap' ? 'Refaire la mesure' : 'Corriger', value: false, variant: 'primary' },
        { label: `Enregistrer ${data.bpm} bpm quand même`, value: true },
      ],
    });
    measure.busy = false;
    if (!keep || els.measureScreen.hidden) return false;
  }

  const m = store.addMeasurement(horse.id, data);
  if (!m) return false;
  measure.savedId = m.id;
  render();
  showResult(horse, m);
  return true;
}

function showResult(horse, m) {
  els.resultCard.className = `result-card ${m.green ? 'is-green' : 'is-red'}`;
  els.resultBib.textContent = horse.bib;
  els.resultBpm.textContent = String(m.bpm);
  els.resultStatus.textContent = m.green
    ? `≤ ${m.threshold} bpm — Libéré`
    : `> ${m.threshold} bpm — Reste en récupération`;
  els.resultDetail.textContent = m.method === 'tap'
    ? `${formatClock(m.at)} · ${m.beats} battements en ${formatSeconds(m.durationMs)}`
    : `${formatClock(m.at)} · valeur saisie`;
  setStage('result');
  $('#result-done').focus();
}

$('#result-done').addEventListener('click', () => {
  const horseId = measure.horseId;
  closeScreen();
  if (horseId) highlightHorse(horseId);
});

$('#result-redo').addEventListener('click', () => {
  const horse = currentHorse();
  if (!horse) return;
  if (measure.savedId) store.deleteMeasurement(horse.id, measure.savedId);
  render();
  startTapStage(horse);
});

// ============================================================
// Paramètres
// ============================================================

$('#btn-settings').addEventListener('click', () => {
  els.setThreshold.value = String(store.settings.threshold);
  els.setBeats.value = String(store.settings.beats);
  els.settingsMsg.textContent = '';
  els.offlineStatus.textContent = navigator.serviceWorker?.controller
    ? '✓ Application disponible hors ligne sur cet appareil.'
    : 'Mode hors ligne pas encore prêt : rechargez la page une fois avec du réseau.';
  openScreen(els.settingsScreen);
});

els.settingsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const threshold = parseIntStrict(els.setThreshold.value);
  const beats = parseIntStrict(els.setBeats.value);
  if (!isValidThreshold(threshold)) {
    els.settingsMsg.textContent = `Le seuil doit être un entier entre ${MIN_THRESHOLD} et ${MAX_THRESHOLD} bpm.`;
    return;
  }
  if (!isValidBeats(beats)) {
    els.settingsMsg.textContent = `Le nombre de battements doit être un entier entre ${MIN_BEATS} et ${MAX_BEATS}.`;
    return;
  }
  store.updateSettings({ threshold, beats });
  closeScreen();
  toast(`Paramètres enregistrés : seuil ${threshold} bpm, N = ${beats}`);
});

$('#btn-clear').addEventListener('click', async () => {
  const first = await ask({
    title: 'Effacer toutes les données ?',
    message: `${store.horses.length} cheval(aux) et toutes leurs mesures seront supprimés.`,
    buttons: [
      { label: 'Continuer', value: true, variant: 'danger' },
      { label: 'Annuler', value: false },
    ],
  });
  if (!first) return;
  const second = await ask({
    title: 'Confirmer une seconde fois',
    message: 'Cette action est définitive et ne peut pas être annulée.',
    buttons: [
      { label: 'Annuler', value: false, variant: 'primary' },
      { label: 'Tout effacer définitivement', value: true, variant: 'danger' },
    ],
  });
  if (!second) return;
  store.clearAll();
  render();
  closeScreen();
  toast('Toutes les données ont été effacées');
});

// ============================================================
// Écran toujours allumé (Screen Wake Lock API)
// ============================================================

let wakeLock = null;

async function requestWakeLock() {
  if (wakeLock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch {
    wakeLock = null; // refusé (batterie faible, etc.) : on réessaiera au prochain tap
  }
}

document.addEventListener('visibilitychange', requestWakeLock);
document.addEventListener('pointerdown', requestWakeLock, { passive: true });

// ============================================================
// Démarrage
// ============================================================

render();
setInterval(updateElapsed, 500);
requestWakeLock();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* hors contexte sécurisé */ });
}
