# Plein — suivi carburant

PWA (Progressive Web App) iOS native pour suivre ses pleins de carburant. Reprend
les 70 pleins parsés depuis un export Messenger Facebook (5 sept 2021 →
26 mars 2026, Mégane 3 gazole) et permet d'ajouter, modifier, supprimer, et
visualiser des graphiques. Pensée pour s'épingler à l'écran d'accueil iPhone.

## Contenu

```
.
├── parse_data.py           # parser HTML Messenger → JSON propre
└── app/
    ├── index.html          # UI iOS native (Settings.app/Health style)
    ├── style.css           # design system iOS (light)
    ├── app.js              # logique : pleins, véhicules, stats, charts
    ├── data.json           # 70 pleins parsés (seed initial)
    ├── manifest.json       # manifeste PWA
    ├── sw.js               # service worker (offline)
    └── icons/              # icônes iPhone
```

L'export Messenger brut (`donnees/`) n'est pas inclus dans le repo (il contient
des messages persos). Pour le re-parser, place ton `message_1.html` dans
`donnees/` puis `python3 parse_data.py`.

## Fonctionnalités

- **Onglet Ajouter** — formulaire iOS avec auto-calcul (saisis 2 champs sur 3,
  le 3ᵉ se calcule). Toggle "plein raté" pour ne pas fausser la conso.
- **Historique** — liste filtrable, badge couleur par enseigne, prix +
  L/100 km à droite. Toucher une ligne → modifier ou supprimer.
- **Stats** — 11 cartes style Apple Health : pleins, total, litres, km, km YTD
  (depuis le 1er janvier), km sur 12 mois glissants, conso moyenne par
  segments, prix moyen /L, € par an, km par an, € par km.
- **Graphiques** — 7 charts iOS-style (Chart.js) : conso, prix, coûts mensuels
  et annuels, km/mois, prix moyen et fréquence par station.
- **Véhicules** — 1 véhicule actif à la fois. Tous les pleins existants sont
  rattachés à la Mégane (par défaut). En ajouter un autre pour archiver
  l'ancien et voir ses stats consultables séparément.
- **Données** — export/import JSON et CSV. Réinitialisation depuis le seed
  initial. Stockage 100 % local (`localStorage`).
- **Hors-ligne** — service worker qui cache l'app shell.

## Lancer en local

```bash
cd app
python3 -m http.server 8000
# Ouvre http://localhost:8000 dans Safari ou Chrome
```

## Déployer sur iPhone

1. Push sur GitHub puis active **GitHub Pages** (Settings → Pages → branch
   `main` → folder `/app`). Ou utilise [Netlify Drop](https://app.netlify.com/drop)
   en glissant le dossier `app/`.
2. Ouvre l'URL publique dans **Safari** sur iPhone.
3. Touche **Partager** → **Sur l'écran d'accueil**. L'app s'installe avec son
   icône, démarre en plein écran et marche hors-ligne.

## Re-parser un nouvel export

```bash
cp ~/Downloads/messages/.../message_1.html donnees/
python3 parse_data.py     # régénère app/data.json
# Dans l'app : onglet Données → "Réinitialiser depuis l'export Messenger"
```
