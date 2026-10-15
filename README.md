# Cooling zone

Web app mobile (PWA) pour les vétérinaires de la zone de récupération à la fin du cross
en concours complet (réglementation FEI) : arrivée des chevaux par dossard, mesure de la
fréquence cardiaque au tap (pulsométrie), statut « En récupération » / « Libéré ».

- Fonctionne **entièrement hors ligne** après la première visite.
- Aucun backend : les données restent sur le téléphone (localStorage).
- HTML / CSS / JavaScript, sans framework ni étape de build.

## Utilisation

| Action | Comment |
| --- | --- |
| Arrivée | **Nouvelle arrivée** → dossard → Valider. L'heure est enregistrée. Un dossard déjà présent déclenche un avertissement, sans doublon. |
| Mesure | **Nouvelle mesure** (ou toucher la carte d'un cheval pour préremplir son dossard) → **Commencer la mesure**. 1er tap = 1er battement, le chrono démarre ; 2e tap = Nième battement (15 par défaut), la FC s'affiche. |
| Calcul | FC = (N − 1) × 60 / t, arrondie. Pour N = 15 : FC = 840 / t. Hors de 20–200 bpm, une confirmation est demandée. |
| Autre moyen de mesure | Lien **Saisir une valeur** sur l'écran de mesure. |
| Couleur | FC ≤ seuil (80 par défaut) : verte, le cheval est libéré. Sinon : rouge. La couleur est figée au moment de la mesure. |
| Validation manuelle / suppression | Toucher une mesure dans la liste. |
| Paramètres | Icône ⚙ : seuil, nombre de battements N, effacement des données (double confirmation, les paramètres sont conservés). |

## Lancer en local

Prérequis : [Node.js](https://nodejs.org/) 18 ou plus récent (uniquement pour le serveur
local et les tests, l'app elle-même n'en dépend pas).

```bash
npm start
```

Puis ouvrir <http://localhost:8080>. N'importe quel serveur statique convient aussi
(par exemple `npx serve`). Ouvrir `index.html` directement depuis l'explorateur de
fichiers **ne marche pas** : les modules JavaScript et le service worker exigent un
serveur HTTP.

Tests unitaires (calcul de FC, modèle de données, formatage) :

```bash
npm test
```

### Pendant le développement

Le service worker sert l'app depuis son cache. Après une modification :

- incrémenter `CACHE_VERSION` dans [sw.js](sw.js) (obligatoire avant chaque déploiement) ;
- ou, dans Chrome DevTools → Application → Service workers, cocher **Update on reload**.

Pour changer l'apparence (couleurs, tailles de police, espacements), modifier uniquement
[css/theme.css](css/theme.css).

## Déployer gratuitement et installer sur un téléphone

Le service worker exige HTTPS, ce que fournissent GitHub Pages et Netlify.
Tous les chemins sont relatifs : l'app fonctionne aussi dans un sous-dossier
(`https://utilisateur.github.io/cooling-zone/`).

### Option A : GitHub Pages

1. Créer un dépôt sur GitHub (par exemple `cooling-zone`) et y pousser le contenu du dossier :
   ```bash
   git init
   ```
   ```bash
   git add .
   ```
   ```bash
   git commit -m "Cooling zone"
   ```
   ```bash
   git branch -M main
   ```
   ```bash
   git remote add origin https://github.com/UTILISATEUR/cooling-zone.git
   ```
   ```bash
   git push -u origin main
   ```
2. Sur GitHub : **Settings → Pages → Build and deployment → Source : Deploy from a branch**,
   branche `main`, dossier `/ (root)`, puis **Save**.
3. Après une minute environ, l'app est en ligne sur `https://UTILISATEUR.github.io/cooling-zone/`.

### Option B : Netlify

- Le plus simple : se connecter sur <https://app.netlify.com/drop> et glisser-déposer le dossier du projet.
- Ou relier le dépôt GitHub : **Add new site → Import an existing project**, sans commande de
  build, dossier de publication `.` (la racine).

### Installer sur le téléphone

1. Ouvrir l'adresse HTTPS **une première fois avec du réseau** (cela met l'app en cache).
2. Android (Chrome) : menu ⋮ → **Installer l'application** (ou « Ajouter à l'écran d'accueil »).
   iPhone (Safari) : bouton Partager → **Sur l'écran d'accueil**.
3. Lancer l'app depuis son icône. Dans ⚙ Paramètres, le message
   « Application disponible hors ligne sur cet appareil » confirme que le mode hors ligne est prêt.
4. Conseil : avant le concours, passer le téléphone en mode avion et ouvrir l'app pour vérifier.

Mise à jour après un nouveau déploiement : ouvrir l'app avec du réseau, la fermer
complètement puis la rouvrir.

### Remarques sur les données

- Les données sont propres à l'appareil et au navigateur. Désinstaller l'app ou
  effacer les données du navigateur les supprime.
- Sur iPhone, Safari peut effacer les données d'un site **non installé** après 7 jours
  sans visite : installer l'app sur l'écran d'accueil.
- L'écran reste allumé pendant l'utilisation grâce à la Screen Wake Lock API (Chrome Android,
  Safari iOS 16.4+). La vibration à chaque tap n'est pas disponible sur iPhone.

## Structure

```
index.html             Page unique : liste, écrans arrivée / mesure / paramètres
manifest.webmanifest   Manifest PWA (nom, icônes, mode standalone)
sw.js                  Service worker : mise en cache pour le hors ligne
css/theme.css          TOUTES les variables d'apparence (couleurs, polices, espacements)
css/app.css            Mise en page, utilise uniquement les variables du thème
js/hr.js               Calcul de FC (fonctions pures) et constantes
js/store.js            Modèle de données et persistance localStorage
js/format.js           Formatage HH:MM:SS, mm:ss, secondes
js/app.js              Interface et interactions
icons/                 Icônes PNG (générées par `npm run icons`)
tests/                 Tests unitaires (node --test)
tools/serve.mjs        Serveur statique local
tools/make-icons.mjs   Générateur d'icônes sans dépendance
```

## Modèle de données

Deux clés localStorage :

```js
// coolingzone.settings.v1
{ threshold: 80, beats: 15 }

// coolingzone.horses.v1 : tableau dans l'ordre d'arrivée
[{
  id: "lq3k2…",
  bib: "12",                 // dossard normalisé (chiffres, sans zéro initial)
  arrivalAt: 1760541000000,  // horodatage (ms) de l'horloge de l'appareil
  measurements: [{
    id: "lq3k9…",
    at: 1760541300000,       // heure de la mesure
    bpm: 84,
    method: "tap",           // "tap" ou "manual" (Saisir une valeur)
    beats: 15,               // N utilisé (null si saisie manuelle)
    durationMs: 10000,       // temps entre les 2 taps (null si saisie manuelle)
    threshold: 80,           // seuil en vigueur au moment de la mesure
    green: false,            // couleur figée au moment de la mesure
    manuallyValidated: false // true si forcée au vert par le vétérinaire
  }]
}]
```

Le statut « Libéré » n'est pas stocké : un cheval est libéré dès qu'une de ses
mesures a `green: true`.
