// Extraction de recette depuis une URL source.
// Méthode prioritaire : JSON-LD (schema.org/Recipe). Fallback : heuristique texte.
// Retourne { url, ok, method, name, yield, ingredients[], note }.
import { chromium } from 'playwright';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Extrait une recette sur une page Playwright déjà ouverte. */
export async function extractRecipeOnPage(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });

  // --- Méthode prioritaire : JSON-LD ---
  const jsonld = await page.evaluate(() => {
    const toArr = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);
    const typeOf = (n) => toArr(n && n['@type']).map((t) => String(t).toLowerCase());
    const recipes = [];
    document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      let data;
      try { data = JSON.parse(s.textContent); } catch { return; }
      const nodes = [];
      const walk = (n) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) return n.forEach(walk);
        nodes.push(n);
        if (n['@graph']) walk(n['@graph']);
      };
      walk(data);
      nodes.forEach((n) => { if (typeOf(n).includes('recipe')) recipes.push(n); });
    });
    if (!recipes.length) return null;
    const r = recipes[0];
    const yieldVal = Array.isArray(r.recipeYield) ? r.recipeYield[0] : r.recipeYield;
    const ingredients = toArr(r.recipeIngredient).map((s) => String(s).trim()).filter(Boolean);
    return { name: r.name || '', yield: yieldVal ? String(yieldVal) : '', ingredients };
  });

  if (jsonld && jsonld.ingredients.length) {
    return { url, ok: true, method: 'json-ld', ...jsonld, note: '' };
  }

  // --- Fallback : heuristique texte sur les listes d'ingrédients ---
  const fallback = await page.evaluate(() => {
    // Cherche un conteneur dont la classe/itemprop évoque « ingredient »,
    // sinon la <ul> la plus dense en lignes courtes mesurées (g, ml, c. à...).
    const measure = /\b(\d|tasse|c\. à|c\.à|cuill|g\b|kg|ml\b|l\b|oz|lb|gousse|pincée|cup|tbsp|tsp)/i;
    const cands = Array.from(document.querySelectorAll('[class*="ingredient" i], [itemprop="recipeIngredient"]'))
      .map((el) => el.innerText.trim()).filter(Boolean);
    let lines = cands;
    if (!lines.length) {
      const best = Array.from(document.querySelectorAll('ul'))
        .map((ul) => Array.from(ul.querySelectorAll('li')).map((li) => li.innerText.trim()))
        .filter((arr) => arr.length >= 3 && arr.filter((t) => measure.test(t)).length >= Math.ceil(arr.length / 2))
        .sort((a, b) => b.length - a.length)[0];
      lines = best || [];
    }
    const ingredients = [...new Set(lines.flatMap((t) => t.split('\n')).map((s) => s.trim()).filter(Boolean))];
    const h1 = document.querySelector('h1');
    return { name: h1 ? h1.innerText.trim() : document.title, ingredients };
  });

  return {
    url, ok: fallback.ingredients.length > 0, method: 'fallback-texte',
    name: fallback.name, yield: '', ingredients: fallback.ingredients,
    note: fallback.ingredients.length ? 'JSON-LD absent — extraction heuristique à vérifier' : 'Aucun ingrédient trouvé',
  };
}

/** Ouvre un navigateur et extrait plusieurs recettes en série. */
export async function extractRecipes(urls, { headless = true } = {}) {
  const browser = await chromium.launch({ headless });
  const ctx = await browser.newContext({ userAgent: UA, locale: 'fr-CA' });
  const page = await ctx.newPage();
  const out = [];
  for (const url of urls) {
    try {
      out.push(await extractRecipeOnPage(page, url));
    } catch (e) {
      out.push({ url, ok: false, method: 'erreur', name: '', yield: '', ingredients: [], note: String(e.message || e) });
    }
  }
  await browser.close();
  return out;
}

// --- CLI : node lib/extractRecipe.js <url> [url...] ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const urls = process.argv.slice(2);
  if (!urls.length) { console.error('Usage: node lib/extractRecipe.js <url> [url...]'); process.exit(1); }
  const results = await extractRecipes(urls, { headless: true });
  for (const r of results) {
    console.log(`\n${r.ok ? '✓' : '✗'} [${r.method}] ${r.name || r.url}`);
    console.log(`   url: ${r.url}`);
    if (r.yield) console.log(`   yield: ${r.yield}`);
    console.log(`   ${r.ingredients.length} ingrédients${r.note ? ' — ' + r.note : ''}`);
    r.ingredients.slice(0, 4).forEach((i) => console.log(`     · ${i}`));
    if (r.ingredients.length > 4) console.log(`     … +${r.ingredients.length - 4}`);
  }
}
