// Scraping du board Pinterest « Repas de la semaine ».
// Extraction BATCH via le React Fiber tree (jamais pin par pin), comme imposé.
import { chromium } from 'playwright';

const BOARD = 'https://ca.pinterest.com/marieevepoirier/miam/repas-de-la-semaine/';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function scrapeBoard({ headless = true, scrolls = 5, storageState } = {}) {
  const browser = await chromium.launch({ headless });
  const ctx = await browser.newContext({
    userAgent: UA, locale: 'fr-CA', viewport: { width: 1280, height: 2000 },
    ...(storageState ? { storageState } : {}),
  });
  const page = await ctx.newPage();
  await page.goto(BOARD, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Détection d'un mur de connexion / bot
  const loginWall = await page
    .waitForSelector('[data-test-id="pin"], [aria-label*="connect" i], [aria-label*="connexion" i]', { timeout: 20000 })
    .then((el) => el.getAttribute('data-test-id').catch?.(() => null))
    .catch(() => null);

  // Scroll pour charger tout le board (Pinterest est en lazy-load virtuel)
  let prevCount = -1;
  for (let i = 0; i < scrolls; i++) {
    await page.mouse.wheel(0, 4000);
    await page.waitForTimeout(1500);
    const count = await page.evaluate(() => document.querySelectorAll('[data-test-id="pin"]').length);
    if (count === prevCount) break; // plus rien ne se charge
    prevCount = count;
  }

  const pins = await page.evaluate(() => {
    function getFiberData(el) {
      const fiberKey = Object.keys(el).find(
        (k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternals')
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
      const pinData = getFiberData(pin) || (anchor ? getFiberData(anchor) : null);
      let sourceUrl = '';
      if (pinData?.link) {
        try {
          const u = new URL(pinData.link);
          sourceUrl = u.origin + u.pathname; // strip query params, toujours
        } catch { sourceUrl = pinData.link; }
      }
      return {
        index: i,
        title: (img?.alt || '').replace('Ceci contient une image de : ', '').trim(),
        sourceUrl,
        domain: pinData?.domain || '',
        pinterestUrl:
          anchor?.getAttribute('href')?.includes('/pin/')
            ? 'https://ca.pinterest.com' + anchor.getAttribute('href')
            : '',
      };
    });
  });

  await browser.close();
  return { pins, sawPins: pins.length > 0, loginWall: pins.length === 0 };
}

// --- CLI : node lib/scrapePinterest.js [--headed] ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const headless = !process.argv.includes('--headed');
  console.log(`Scraping ${BOARD}\n(headless: ${headless})\n`);
  const { pins, loginWall } = await scrapeBoard({ headless });
  if (loginWall) {
    console.log('⚠️  Aucun pin extrait — mur de connexion probable ou sélecteur changé.');
    process.exit(2);
  }
  console.log(`✓ ${pins.length} pins extraits\n`);
  const withSource = pins.filter((p) => p.sourceUrl);
  console.log(`   ${withSource.length} avec URL source, ${pins.length - withSource.length} sans (upload direct)\n`);
  pins.slice(0, 12).forEach((p) => {
    console.log(`  [${p.index}] ${p.title.slice(0, 50) || '(sans titre)'}`);
    console.log(`       ${p.sourceUrl || '— pas de source —'}  ${p.domain ? '(' + p.domain + ')' : ''}`);
  });
  if (pins.length > 12) console.log(`  … +${pins.length - 12} autres`);
}
