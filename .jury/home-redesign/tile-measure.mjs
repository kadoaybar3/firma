// Kategori karosunda başlık kolonunun gerçek genişliğini ölç.
import { createRequire } from 'node:module';
import path from 'node:path';
const req = createRequire(path.join(process.cwd(), 'noop.js'));
const { chromium } = req('playwright');

const browser = await chromium.launch();
for (const width of [390, 360]) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2 });
  await page.goto('http://localhost:4400/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.cat-tile')];
    return tiles.slice(0, 8).map((t) => {
      const name = t.querySelector('.cat-tile__name');
      const icon = t.querySelector('.cat-tile__icon');
      const chev = t.querySelector('.cat-tile__chev');
      const body = t.querySelector('.cat-tile__body') || name.parentElement;
      const nr = name.getBoundingClientRect();
      const cs = getComputedStyle(name);
      return {
        text: name.textContent,
        tileW: Math.round(t.getBoundingClientRect().width),
        bodyW: Math.round(body.getBoundingClientRect().width),
        nameW: Math.round(nr.width),
        nameH: Math.round(nr.height),
        font: cs.fontSize,
        iconW: icon ? Math.round(icon.getBoundingClientRect().width) : null,
        chevW: chev ? Math.round(chev.getBoundingClientRect().width) : null,
        // kelimenin tek satırda ihtiyacı
      };
    });
  });
  console.log(width, JSON.stringify(info, null, 1));
  await page.close();
}
await browser.close();
