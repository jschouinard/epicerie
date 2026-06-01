# RUNBOOK — Liste d'épicerie hebdomadaire (approche B : Claude Code)

Procédure du run hebdomadaire. L'étape 2 (règles métier) est faite par **Claude Code**,
pas par un script : c'est du jugement linguistique (format vrac, catégorisation).

## Procédure

```bash
cd /Users/jschouinard/Documents/Claude/Projects/Epicerie

# 1. Scrape Pinterest + extrait les recettes (autonome, ~1-2 min)
node epicerie.js scrape            # ou : node epicerie.js scrape 2026-05-30
```

**2. Transformation (Claude Code) :** lire `data/raw-<date>.json`, appliquer les
règles ci-dessous, écrire `data/<date>.json` au format `{ dateLabel, recipes, categories }`
(structure : voir `data/2026-05-30.json` comme exemple de référence).

```bash
# 3. Génère la page
node epicerie.js build <date>      # → build/index.html + build/<date>.html
open build/index.html              # vérification visuelle

# 4. Publie sur GitHub Pages (SANS archives)
node epicerie.js publish <date>    # copie vers la racine, commit, push origin main
#   (option --no-push pour committer en local sans pousser)
```

## Règles métier (étape 2)

### Normalisation des portions
- Chaque recette ≥ **4 portions**. Si `yield < 4`, multiplier les ingrédients par le facteur requis.
- Indiquer le facteur : `portions: "4 (×2 — original : 2)"`.
- **Exception** : pâtisserie comptée en unités (« 12 biscuits ») → ne pas ajuster.

### Format VRAC (comme on achète au magasin, pas la mesure de recette)
| ❌ Mesure recette | ✅ Format vrac |
|---|---|
| 2 c. à soupe de sauce soya | 1 bouteille |
| 3 gousses d'ail | 1 tête |
| 140 g d'edamame congelé | 1 sac |
| 425 g de thon en conserve | 1 boîte 425 g |
| 3/4 tasse de confiture | 1 pot |

### 12 catégories (ordre fixe)
1. 🥐 Déjeuner & Lunch — **FIXE** (9 items, toujours présents)
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
12. 🍿 Collation — **FIXE, toujours vide** (ajouts manuels)

### Section Déjeuner & Lunch (items fixes, toujours inclus, `qty: ''`)
Bananes · Fraises · Framboises · Mangues · Bleuets · Lait de soya 2 L · Pain tranché · Œufs · Yogourt

### Consolidation des doublons
Même ingrédient dans 2 recettes → **un seul item**, `recettes: ['r1','r3']` cumulé.
Les quantités s'additionnent logiquement (« 1 bouteille » reste « 1 bouteille »).

## Contraintes non négociables
- Pas de XLSX, pas de courriel, pas de localStorage.
- Pinterest : extraction batch (React Fiber), jamais pin par pin.
- Retrait de recette = option A : items partagés restent, étiquette de la recette retirée disparaît.

## Publication (Phase 4 — implémentée, SANS archives)
`node epicerie.js publish <date>` copie `build/index.html` + `build/<date>.html` vers la
racine (servie par GitHub Pages), commit « Épicerie semaine du <dateLabel> » et push `origin main`.
Ne touche PAS à `archives.html`.

Notes :
- Identité git locale déjà configurée sur ce repo (`jschouinard` / `jeansebastien.chouinard@gmail.com`).
- GitHub Pages redéploie automatiquement après le push (~1 min).
- `archives.html` reste en ligne et le lien de bas de page fonctionne, mais n'est plus mis à jour.
