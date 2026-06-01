// Orchestrateur du pipeline Épicerie — approche B (transformation par Claude Code).
//
// Le run hebdomadaire se fait en 3 temps :
//   1. node epicerie.js scrape [AAAA-MM-JJ]   → data/raw-<date>.json (Pinterest + recettes)
//   2. Claude Code lit data/raw-<date>.json, applique les RÈGLES MÉTIER (cf. RUNBOOK.md)
//      et écrit data/<date>.json  { dateLabel, recipes, categories }
//   3. node epicerie.js build   [AAAA-MM-JJ]  → build/index.html + build/<date>.html
//   4. node epicerie.js publish [AAAA-MM-JJ]  → copie vers la racine, commit, push (SANS archives)
import { writeFileSync, readFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { scrapeBoard } from './lib/scrapePinterest.js';
import { extractRecipes } from './lib/extractRecipe.js';
import { generateHtml } from './lib/generateHtml.js';

const root = dirname(fileURLToPath(import.meta.url));
const today = () => new Date().toISOString().split('T')[0];
const frDate = (iso) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' });

// --- Sous-commande : scrape (étapes 1+2, autonome) ---
async function scrape(isoDate) {
  mkdirSync(join(root, 'data'), { recursive: true });
  console.log('① Scraping Pinterest…');
  const { pins, loginWall } = await scrapeBoard({ headless: true });
  if (loginWall) throw new Error('Mur de connexion Pinterest — aucun pin extrait.');
  const sources = pins.filter((p) => p.sourceUrl);
  console.log(`   ${pins.length} pins, ${sources.length} avec source.`);

  console.log('② Extraction des recettes…');
  const raw = await extractRecipes(sources.map((p) => p.sourceUrl));
  raw.forEach((r, i) => { r.pinTitle = sources[i].title; r.domain = sources[i].domain; });
  console.log(`   ${raw.filter((r) => r.ok).length}/${raw.length} recettes extraites.`);

  const rawPath = join(root, 'data', `raw-${isoDate}.json`);
  writeFileSync(rawPath, JSON.stringify({ date: isoDate, dateLabel: frDate(isoDate), recipes: raw }, null, 2) + '\n');
  console.log(`\n✅ Extraction brute → data/raw-${isoDate}.json`);
  console.log('   Étape suivante : Claude Code transforme ce fichier en data/' + isoDate + '.json (voir RUNBOOK.md),');
  console.log('   puis : node epicerie.js build ' + isoDate);
}

// --- Sous-commande : build (étape 4, déterministe) ---
function build(isoDate) {
  mkdirSync(join(root, 'build'), { recursive: true });
  const dataPath = join(root, 'data', `${isoDate}.json`);
  let data;
  try {
    data = JSON.parse(readFileSync(dataPath, 'utf8'));
  } catch {
    throw new Error(`data/${isoDate}.json introuvable. Lance d'abord « scrape », puis fais la transformation (RUNBOOK.md).`);
  }
  if (!data.dateLabel) data.dateLabel = frDate(isoDate);
  const html = generateHtml(data);
  writeFileSync(join(root, 'build', 'index.html'), html);
  writeFileSync(join(root, 'build', `${isoDate}.html`), html);
  console.log(`✅ build/index.html + build/${isoDate}.html (${data.recipes.length} recettes)`);
}

// --- Sous-commande : publish (Phase 4, SANS archives) ---
// Copie build/ vers la racine (servie par GitHub Pages), commit et push.
// Ne touche PAS à archives.html. Passer --no-push pour committer sans pousser.
function publish(isoDate, { push = true } = {}) {
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' }).toString().trim();
  const datedSrc = join(root, 'build', `${isoDate}.html`);
  const indexSrc = join(root, 'build', 'index.html');
  if (!existsSync(indexSrc) || !existsSync(datedSrc)) {
    throw new Error(`build/index.html ou build/${isoDate}.html manquant. Lance d'abord : node epicerie.js build ${isoDate}`);
  }
  // Date d'affichage lue depuis les données curées (sinon dérivée de l'ISO)
  let dateLabel = frDate(isoDate);
  try { dateLabel = JSON.parse(readFileSync(join(root, 'data', `${isoDate}.json`), 'utf8')).dateLabel || dateLabel; } catch {}

  copyFileSync(indexSrc, join(root, 'index.html'));
  copyFileSync(datedSrc, join(root, `${isoDate}.html`));
  console.log(`   Copié → index.html + ${isoDate}.html (racine)`);

  git('add', 'index.html', `${isoDate}.html`);
  const staged = git('diff', '--cached', '--name-only');
  if (!staged) { console.log('   Rien de neuf à publier (contenu identique).'); return; }
  git('commit', '-m', `Épicerie semaine du ${dateLabel}`);
  console.log(`   Commit : « Épicerie semaine du ${dateLabel} » (${staged.split('\n').join(', ')})`);
  if (push) {
    git('push', 'origin', 'main');
    console.log('✅ Publié sur GitHub Pages.');
  } else {
    console.log('   (--no-push : commit local seulement, push non effectué)');
  }
}

const [cmd, dateArg, ...rest] = process.argv.slice(2);
const isoDate = dateArg || today();
const noPush = rest.includes('--no-push');
const run =
  cmd === 'scrape' ? scrape(isoDate) :
  cmd === 'build' ? Promise.resolve(build(isoDate)) :
  cmd === 'publish' ? Promise.resolve(publish(isoDate, { push: !noPush })) :
  Promise.reject(new Error('Usage : node epicerie.js <scrape|build|publish> [AAAA-MM-JJ] [--no-push]'));
Promise.resolve(run).catch((e) => { console.error('❌', e.message); process.exit(1); });
