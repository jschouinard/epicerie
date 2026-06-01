// Extrait, depuis la page de référence hand-made (liste_epicerie_semaine.html),
//   1. les données de la semaine -> data/2026-05-30.json
//   2. le shell HTML statique avec placeholders -> lib/template.html
// Objectif : disposer d'un template fidèle au bit près + de données structurées,
// pour valider que le générateur reproduit la page de référence.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const ref = readFileSync(join(root, 'liste_epicerie_semaine.html'), 'utf8');

// --- Isoler les littéraux de tableau dans le <script> ---
// On capture depuis « const recipes = [ » jusqu'au « ]; » qui le ferme.
function grab(label) {
  const start = ref.indexOf(`const ${label} = [`);
  if (start === -1) throw new Error(`Bloc « const ${label} » introuvable`);
  const open = ref.indexOf('[', start);
  // équilibrage des crochets pour trouver le « ] » de fermeture
  let depth = 0, i = open;
  for (; i < ref.length; i++) {
    if (ref[i] === '[') depth++;
    else if (ref[i] === ']') { depth--; if (depth === 0) break; }
  }
  const literal = ref.slice(open, i + 1);      // « [ ... ] »
  const full = ref.slice(start, i + 2);        // « const X = [ ... ]; » (inclut le ;)
  return { literal, full };
}

const recipesBlock = grab('recipes');
const categoriesBlock = grab('categories');

// Évaluer les littéraux pour obtenir les données structurées
const recipes = eval(recipesBlock.literal);
const categories = eval(categoriesBlock.literal);

mkdirSync(join(root, 'data'), { recursive: true });
writeFileSync(
  join(root, 'data', '2026-05-30.json'),
  JSON.stringify({ date: '2026-05-30', dateLabel: '30 mai 2026', recipes, categories }, null, 2) + '\n'
);

// --- Construire le template : remplacer les zones dynamiques par des placeholders ---
let template = ref
  .replace(recipesBlock.full, 'const recipes = __RECIPES_JSON__;')
  .replace(categoriesBlock.full, 'const categories = __CATEGORIES_JSON__;')
  .replace('semaine du 30 mai 2026<br>', 'semaine du __DATE_LABEL__<br>');

writeFileSync(join(root, 'lib', 'template.html'), template);

console.log(`✓ data/2026-05-30.json : ${recipes.length} recettes, ${categories.length} catégories`);
console.log(`✓ lib/template.html : ${template.length} octets`);
const remaining = ['__RECIPES_JSON__', '__CATEGORIES_JSON__', '__DATE_LABEL__']
  .filter(p => template.includes(p));
console.log(`✓ placeholders présents : ${remaining.join(', ')}`);
