# Migration Épicerie : Cowork → Claude Code

## Contexte

Pipeline hebdomadaire qui génère automatiquement une liste d'épicerie interactive à partir du tableau Pinterest « Repas de la semaine » de Marie-Ève Poirier, et la publie sur GitHub Pages.

- **URL Pinterest** : https://ca.pinterest.com/marieevepoirier/miam/repas-de-la-semaine/
- **GitHub Pages** : https://jschouinard.github.io/epicerie/
- **Repo GitHub** : https://github.com/jschouinard/epicerie
- **Dossier local** : `/Users/jschouinard/Documents/Claude/Projects/Epicerie/`

---

## Plan de migration

### Étape 1 — Prérequis locaux (5 min)

```bash
# Vérifier que le dossier est un repo git
cd /Users/jschouinard/Documents/Claude/Projects/Epicerie/
git status

# Si ce n'est pas un repo git, le cloner
git clone https://github.com/jschouinard/epicerie.git /Users/jschouinard/Documents/Claude/Projects/Epicerie/

# Vérifier les credentials
git config user.name
git config user.email
```

### Étape 2 — Installer les dépendances Node.js (10 min)

```bash
cd /Users/jschouinard/Documents/Claude/Projects/Epicerie/
npm init -y
npm install playwright
npx playwright install chromium
```

> Playwright remplace le Chrome MCP pour scraper Pinterest et les sites de recettes.

### Étape 3 — Créer le script principal

Claude Code génère `epicerie.js` (voir prompt complet ci-dessous).

### Étape 4 — Tester en local

```bash
node epicerie.js
# Ouvre liste_epicerie_semaine.html dans le browser pour vérifier
open /Users/jschouinard/Documents/Claude/Projects/Epicerie/liste_epicerie_semaine.html
```

### Étape 5 — Publier sur GitHub Pages

```bash
cd /Users/jschouinard/Documents/Claude/Projects/Epicerie/
git add index.html archives.html $(date +%Y-%m-%d).html
git commit -m "Épicerie semaine du $(date +%d %B %Y)"
git push origin main
```

### Étape 6 — Automatiser (optionnel)

Ajouter une tâche cron sur Mac :

```bash
# Tous les samedis à 8h
crontab -e
0 8 * * 6 cd /Users/jschouinard/Documents/Claude/Projects/Epicerie && node epicerie.js && git add -A && git commit -m "Épicerie semaine du $(date '+\%d \%B \%Y')" && git push origin main
```

---

## Ce qui NE change PAS

- La structure HTML de la page (même design, même fonctionnalités)
- Les préférences utilisateur (sections fixes, format vrac, pas de XLSX)
- La logique d'archivage (AAAA-MM-JJ.html + archives.html)
- L'URL publique GitHub Pages

## Ce qui CHANGE

| Avant (Cowork) | Après (Claude Code) |
|---|---|
| Chrome MCP pour scraper Pinterest | Playwright headless |
| Chrome MCP pour extraire les recettes | Playwright ou node-fetch + cheerio |
| Browser automation pour push GitHub | `git push` en ligne de commande |
| Scheduled task Cowork | cron Mac ou lancement manuel |

---

---

# PROMPT EXACT POUR CLAUDE CODE

> **Instructions :** Ouvre Claude Code dans le terminal depuis le dossier `/Users/jschouinard/Documents/Claude/Projects/Epicerie/`, puis colle le prompt ci-dessous.

---

```
Tu es un assistant qui génère automatiquement une liste d'épicerie hebdomadaire à partir d'un tableau Pinterest, puis la publie sur GitHub Pages.

## MISSION

Crée un script Node.js (`epicerie.js`) qui :
1. Scrape le board Pinterest pour extraire les pins de la semaine
2. Visite chaque site source et extrait les recettes
3. Génère une page HTML interactive (liste d'épicerie)
4. Sauvegarde 3 fichiers : `index.html`, `AAAA-MM-JJ.html`, `archives.html`
5. Fait `git add / commit / push` vers GitHub

---

## CONFIGURATION

- **Board Pinterest** : https://ca.pinterest.com/marieevepoirier/miam/repas-de-la-semaine/
- **Repo GitHub** : github.com/jschouinard/epicerie (déjà initialisé, credentials configurés)
- **Dossier de travail** : `/Users/jschouinard/Documents/Claude/Projects/Epicerie/`

---

## ÉTAPE 1 : SCRAPING PINTEREST

Utilise Playwright (chromium) en mode headless.

### Méthode d'extraction (OBLIGATOIRE — React Fiber tree)

**NE PAS naviguer pin par pin.** Extraire tous les liens d'un coup via JavaScript :

```javascript
// Après avoir chargé la page et scrollé 3-4 fois pour tout charger :
const pins = await page.evaluate(() => {
  function getFiberData(el) {
    const fiberKey = Object.keys(el).find(k =>
      k.startsWith('__reactFiber') || k.startsWith('__reactInternals')
    );
    if (!fiberKey) return null;
    let fiber = el[fiberKey];
    let depth = 0;
    while (fiber && depth < 60) {
      const props = fiber.memoizedProps || fiber.pendingProps;
      if (props && props.pin) return props.pin;
      fiber = fiber.return;
      depth++;
    }
    return null;
  }

  return Array.from(document.querySelectorAll('[data-test-id="pin"]')).map((pin, i) => {
    const img = pin.querySelector('img');
    const anchor = pin.querySelector('a[href]');
    let pinData = getFiberData(pin) || (anchor ? getFiberData(anchor) : null);
    let sourceUrl = '';
    if (pinData?.link) {
      try {
        const u = new URL(pinData.link);
        sourceUrl = u.origin + u.pathname; // TOUJOURS stripper les query params
      } catch(e) { sourceUrl = pinData.link; }
    }
    return {
      index: i,
      title: img?.alt?.replace('Ceci contient une image de : ', '') || '',
      sourceUrl,
      domain: pinData?.domain || '',
      pinterestUrl: anchor?.href?.includes('/pin/') 
        ? 'https://ca.pinterest.com' + anchor.getAttribute('href') 
        : ''
    };
  });
});
```

Si un pin n'a pas de `sourceUrl` (upload direct), inspecte sa page Pinterest pour trouver le lien source.

---

## ÉTAPE 2 : EXTRACTION DES RECETTES

Pour chaque URL source :

### Méthode prioritaire — JSON-LD

```javascript
const recipe = await page.evaluate(() => {
  let found = null;
  document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
    try {
      const data = JSON.parse(s.textContent);
      if (data['@type'] === 'Recipe') found = data;
      if (data['@graph']) data['@graph'].forEach(item => {
        if (item['@type'] === 'Recipe') found = item;
      });
    } catch(e) {}
  });
  return found ? {
    name: found.name,
    yield: found.recipeYield,
    ingredients: found.recipeIngredient
  } : null;
});
```

### Fallback — texte de la page

Si JSON-LD échoue, utilise `page.textContent()` et parse la section ingrédients.

---

## ÉTAPE 3 : RÈGLES MÉTIER

### Normalisation des portions

- **Règle** : chaque recette doit produire au minimum 4 portions de repas
- Si `yield < 4` → multiplier tous les ingrédients par le facteur nécessaire
- Si `yield >= 4` → garder tel quel
- **Exception** : recettes de pâtisserie comptées en unités (ex. "12 biscuits") → laisser tel quel, ne pas ajuster
- Indiquer le facteur appliqué dans le champ `portions` (ex. `"4 (×2 — original : 2)"`)

### Format des quantités (OBLIGATOIRE — format vrac/paquet)

Les quantités dans la liste d'épicerie doivent être exprimées **comme on les achète au magasin**, pas comme mesures de recette.

| ❌ Ne pas écrire | ✅ Écrire plutôt |
|---|---|
| 2 c. à soupe de sauce soya | 1 bouteille |
| 3 gousses d'ail | 1 tête |
| 140 g d'edamame congelé | 1 sac |
| 425 g de thon en conserve | 1 boîte 425 g |
| 2 c. à thé d'huile de sésame | 1 bouteille |

### Catégories d'épicerie

Regrouper les ingrédients dans ces catégories (ordre fixe) :

1. 🥐 Déjeuner & Lunch ← **FIXE, toujours présent**
2. 🐟 Poissons & Viandes
3. 🥬 Fruits & Légumes
4. 🥛 Produits laitiers & Réfrigéré
5. 🫘 Conserves & Légumineuses
6. 🌾 Céréales, Farines & Pâtes
7. 🍫 Chocolat & Sucré
8. 🫒 Huiles, Sauces & Condiments
9. 🧂 Épices & Assaisonnements
10. 🥤 Boissons & Protéines
11. 🥥 Noix & Garnitures
12. 🍿 Collation ← **FIXE, toujours vide (pour ajouts manuels)**

### Section Déjeuner & Lunch (items fixes, toujours inclus)

Ces items apparaissent **toujours**, peu importe les recettes de la semaine :
- Bananes
- Fraises
- Framboises
- Mangues
- Bleuets
- Lait de soya 2 L
- Pain tranché
- Œufs
- Yogourt

### Consolidation des doublons

Si 2 recettes utilisent la même sauce soya → un seul item dans la liste, avec les deux recettes sources listées. Les quantités s'additionnent logiquement (ex. "1 bouteille" reste "1 bouteille").

Chaque item conserve un tableau `recettes: ['r1', 'r3']` pour la fonctionnalité de retrait.

---

## ÉTAPE 4 : GÉNÉRATION HTML

### Structure des données JavaScript

```javascript
const recipes = [
  {
    id: 'r1',          // identifiant stable
    name: 'Nom complet de la recette',
    portions: '4 portions',  // ou '4 (×2 — original : 2)'
    source: 'Nom du site',
    url: 'https://...',
    short: 'Nom court'  // max ~25 chars, pour les étiquettes sous les items
  },
  // ... r2, r3, etc.
];

const categories = [
  {
    emoji: '🥐',
    name: 'Déjeuner & Lunch',
    fixed: true,  // ← items fixes, jamais affectés par le retrait de recettes
    items: [
      {name: 'Bananes', qty: ''},
      {name: 'Fraises', qty: ''},
      // ... (9 items fixes)
    ]
  },
  {
    emoji: '🐟',
    name: 'Poissons & Viandes',
    items: [
      {name: 'Thon en conserve à l\'huile', qty: '1 boîte 425 g', recettes: ['r2']},
      // ...
    ]
  },
  // ... autres catégories
  {
    emoji: '🍿',
    name: 'Collation',
    fixed: true,
    items: []  // toujours vide
  }
];
```

### Fonctionnalités de la page HTML

**Header**
- Titre : `🛒 Liste d'épicerie`
- Sous-titre dynamique : `N recettes actives · M items | Quantités ajustées : minimum 4 portions par recette`

**Barre de progression**
- `X / Y items cochés` + pourcentage
- Barre verte qui se remplit au fur et à mesure

**Toolbar**
- `↕ Tout replier/déplier` — toggle toutes les catégories
- `☐ Tout décocher` — remet tous les checkboxes à zéro
- `📋 Copier la liste` — copie le texte formaté dans le presse-papiers

**Section Recettes de la semaine**
- Chaque recette : nom + portions + lien source cliquable
- Bouton `✕ Retirer` → confirmation via `confirm()` → retire la recette
  - Les items dont c'est la seule source disparaissent de la liste
  - Les items partagés restent, mais l'étiquette de la recette retirée disparaît
- Bouton `↺ Restaurer` (si retirée) → tout revient

**Catégories repliables**
- Clic sur le header → collapse/expand
- Compteur d'items actifs affiché
- Si catégorie vide après retrait de recettes → reste visible mais grisée

**Items**
- Checkbox cliquable (accent-color vert)
- Item coché → texte barré + grisé
- Sous le nom : étiquettes des recettes sources en italique (séparées par `·`)
- Items des sections fixes : pas d'étiquettes de recettes

**Ajout manuel**
- Champ `+ Ajouter un item…` dans chaque catégorie
- Entrée ou bouton "Ajouter"
- Items manuels marqués `✏️ Ajouté manuellement`
- Bouton `✕` pour supprimer un item manuel
- Les items manuels ne sont JAMAIS affectés par le retrait de recettes

**État**
- Tout en mémoire JS (variables globales, PAS localStorage)
- IDs stables basés sur `catégorie + nom` (pas des index) pour préserver les checkboxes lors des rerenders

**Design**
- Couleur principale : `#2e7d32`
- Couleur sombre : `#1b5e20`
- Background : `#e8f5e9`
- Texte : `#1b3a1e`
- Background catégories header : `#f1f8f2`
- Responsive mobile (max-width: 760px)
- Font system : `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`

**Footer**
- Texte : `Généré automatiquement à partir du tableau Pinterest « Repas de la semaine » · semaine du JJ mois AAAA`
- Lien : `📚 Voir les semaines précédentes` → `archives.html`

**AUCUN localStorage, AUCUN fichier XLSX, AUCUN envoi de courriel.**

---

## ÉTAPE 5 : FICHIERS À GÉNÉRER

### `index.html` (et `AAAA-MM-JJ.html` — copie identique)
La page HTML complète décrite ci-dessus.

### `archives.html`
Index de toutes les semaines passées. Structure :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>📚 Archives — Liste d'épicerie</title>
  <!-- même palette de couleurs verte -->
</head>
<body>
  <!-- Nouvelle semaine ajoutée EN HAUT de la liste -->
  <a class="week" href="2026-05-30.html">
    <span class="week-emoji">🛒</span>
    <span class="week-info">
      <span class="week-title">Semaine du 30 mai 2026</span>
      <span class="week-meta">5 recettes · 61 items</span>
    </span>
    <span class="week-arrow">→</span>
  </a>
  <!-- semaines précédentes en dessous -->
</body>
</html>
```

Pour mettre à jour `archives.html` : lire le fichier existant, insérer la nouvelle entrée après le premier `<a class="week"` (ou au début de la liste si c'est la première semaine).

---

## ÉTAPE 6 : PUBLICATION GITHUB

```javascript
const { execSync } = require('child_process');
const date = new Date().toISOString().split('T')[0]; // AAAA-MM-JJ
const dateLabel = new Date().toLocaleDateString('fr-CA', {day: 'numeric', month: 'long', year: 'numeric'});

const dir = '/Users/jschouinard/Documents/Claude/Projects/Epicerie/';

execSync(`git -C "${dir}" add index.html archives.html ${date}.html`);
execSync(`git -C "${dir}" commit -m "Épicerie semaine du ${dateLabel}"`);
execSync(`git -C "${dir}" push origin main`);
```

---

## RÉFÉRENCE — Exemple de page générée

Lire le fichier existant pour voir un exemple complet de la structure HTML attendue :
`/Users/jschouinard/Documents/Claude/Projects/Epicerie/liste_epicerie_semaine.html`

Ce fichier contient la semaine du 30 mai 2026 (5 recettes, 61 items) et sert de template de référence exact pour le rendu visuel et la logique JavaScript.

---

## RÉSUMÉ DES CONTRAINTES NON NÉGOCIABLES

| Contrainte | Détail |
|---|---|
| Pas de XLSX | Ne jamais générer de fichier Excel |
| Pas de courriel | Ne jamais envoyer ou créer de brouillon |
| Format vrac | Quantités en format "paquet" (1 bouteille, 1 sac, etc.) |
| Sections fixes | Déjeuner & Lunch (9 items) + Collation (vide) toujours présentes |
| Extraction batch | Pinterest : React Fiber en JS, jamais pin par pin |
| Min 4 portions | Sauf recettes de pâtisserie comptées en unités |
| État JS en mémoire | Pas localStorage |
| Retrait de recette | Option A : items partagés restent, étiquette source disparaît |

---

## DÉPENDANCES SUGGÉRÉES

```json
{
  "dependencies": {
    "playwright": "^1.40.0"
  }
}
```

Playwright gère à la fois le scraping Pinterest (React Fiber) et la récupération des recettes sur les sites sources.

Alternative légère pour les sites non-JS : `node-fetch` + `cheerio` (plus rapide pour JSON-LD simple).
```

---

*Document généré le 30 mai 2026 — pipeline Cowork vers Claude Code.*
