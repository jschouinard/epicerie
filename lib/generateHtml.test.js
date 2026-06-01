// Valide que le générateur reproduit fidèlement la page de référence.
// 1. Fidélité des données : recipes/categories réinjectés == source.
// 2. Fidélité du rendu : la page générée et la référence, exécutées dans un
//    vrai navigateur (Playwright headless), produisent le même état affiché
//    (sous-titre, nb de recettes, compteurs par catégorie, total d'items).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';
import { generateHtml } from './generateHtml.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const data = JSON.parse(readFileSync(join(root, 'data', '2026-05-30.json'), 'utf8'));
const referenceHtml = readFileSync(join(root, 'liste_epicerie_semaine.html'), 'utf8');

const generated = generateHtml(data);
mkdirSync(join(root, 'build'), { recursive: true });
writeFileSync(join(root, 'build', 'index.html'), generated);

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
};

// --- 1. Fidélité des données (sans navigateur) ---
const reRecipes = generated.match(/const recipes = (\[[\s\S]*?\]);/)[1];
const reCats = generated.match(/const categories = (\[[\s\S]*?\]);\n/)[1];
check('recipes round-trip', JSON.stringify(JSON.parse(reRecipes)) === JSON.stringify(data.recipes));
check('categories round-trip', JSON.stringify(JSON.parse(reCats)) === JSON.stringify(data.categories));
check('dateLabel injecté', generated.includes('semaine du 30 mai 2026'));
check('aucun placeholder résiduel', !/__[A-Z_]+__/.test(generated));
check('pas de localStorage', !generated.includes('localStorage'));

// --- 2. Fidélité du rendu (Playwright headless) ---
async function renderState(html) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  const state = await page.evaluate(() => ({
    subtitle: document.getElementById('subtitle').innerText.replace(/\s+/g, ' ').trim(),
    progress: document.getElementById('progressText').textContent,
    recipeCards: document.querySelectorAll('.recipe-card').length,
    catCounts: Array.from(document.querySelectorAll('.category')).map(c => ({
      name: c.querySelector('.cat-name').textContent,
      count: c.querySelector('.cat-count').textContent,
    })),
  }));
  await browser.close();
  return state;
}

const [refState, genState] = await Promise.all([
  renderState(referenceHtml),
  renderState(generated),
]);

check('sous-titre identique', refState.subtitle === genState.subtitle, genState.subtitle);
check('barre de progression identique', refState.progress === genState.progress, genState.progress);
check('nb de cartes recettes identique', refState.recipeCards === genState.recipeCards, `${genState.recipeCards}`);
check('compteurs par catégorie identiques',
  JSON.stringify(refState.catCounts) === JSON.stringify(genState.catCounts),
  genState.catCounts.map(c => `${c.name}:${c.count}`).join(', '));

console.log(`\n${failures === 0 ? '✅ Générateur validé — rendu équivalent à la référence' : `❌ ${failures} écart(s)`}`);
process.exit(failures === 0 ? 0 : 1);
