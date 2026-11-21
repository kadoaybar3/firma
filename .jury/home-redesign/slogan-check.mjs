// Sloganın satır sayısı/taşması farklı genişliklerde ölçülür.
import { createRequire } from 'node:module';
import path from 'node:path';
const req = createRequire(path.join(process.cwd(), 'noop.js'));
const { chromium } = req('playwright');

const browser = await chromium.launch();
for (const width of [1440, 1100, 960, 768, 390, 360]) {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  await page.goto('http://localhost:4400/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  const m = await page.evaluate(() => {
    const h1 = document.querySelector('.hm-hero__title');
    const cs = getComputedStyle(h1);
    const lh = parseFloat(cs.lineHeight);
    const lines = Math.round(h1.getBoundingClientRect().height / lh);
    return { lines, font: cs.fontSize, overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth, h1Right: Math.round(h1.getBoundingClientRect().right), vw: innerWidth };
  });
  console.log(width, JSON.stringify(m));
  await page.close();
}
await browser.close();
