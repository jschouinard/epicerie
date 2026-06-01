// Générateur HTML : injecte les données structurées (recipes, categories, dateLabel)
// dans le shell statique lib/template.html. Aucune logique métier ici — seulement
// le rendu fidèle. La page reste auto-suffisante (état en mémoire JS, pas de localStorage).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = readFileSync(join(__dirname, 'template.html'), 'utf8');

/**
 * @param {{recipes: Array, categories: Array, dateLabel: string}} data
 * @returns {string} HTML complet de la liste d'épicerie
 */
export function generateHtml({ recipes, categories, dateLabel }) {
  if (!Array.isArray(recipes)) throw new Error('generateHtml: recipes manquant');
  if (!Array.isArray(categories)) throw new Error('generateHtml: categories manquant');
  if (!dateLabel) throw new Error('generateHtml: dateLabel manquant');

  // JSON est un sous-ensemble valide de JS : sûr à injecter dans le <script>.
  // Garde-fou XSS : neutraliser toute fermeture de balise script dans les données.
  const recipesJson = safeJson(recipes);
  const categoriesJson = safeJson(categories);

  return TEMPLATE
    .replace('__RECIPES_JSON__', recipesJson)
    .replace('__CATEGORIES_JSON__', categoriesJson)
    .replace('__DATE_LABEL__', dateLabel);
}

function safeJson(value) {
  return JSON.stringify(value, null, 2).replace(/<\/script/gi, '<\\/script');
}
