// Kategori bölümüne odaklanmış kare (kırılma kontrolü).
import { createRequire } from 'node:module';
import path from 'node:path';
const req = createRequire(path.join(process.cwd(), 'noop.js'));
const { chromium } = req('playwright');
const out = '/Users/kadiraybar/Documents/firma-rehberi/.jury/home-redesign';

const browser = await chromium.launch();
for (const width of [360, 390, 768]) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2 });
  await page.goto('http://localhost:4400/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const grid = document.querySelector('.catgrid');
    if (grid) {
      const r = grid.getBoundingClientRect();
      window.scrollBy(0, r.top - 90);
    }
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/cat-${width}.png` });
  await page.close();
}
await browser.close();
