// Header bleed canlı doğrulama: kategorilere kaydır, header bölgesini kırp.
import { createRequire } from 'node:module';
import path from 'node:path';
const req = createRequire(path.join(process.cwd(), 'noop.js'));
const { chromium } = req('playwright');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:4400/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
// Kategoriler başlığı header'ın hemen altına gelecek şekilde kaydır
await page.evaluate(() => {
  document.querySelector('#kategoriler')?.scrollIntoView({ block: 'start' });
  window.scrollBy(0, -20);
});
await page.waitForTimeout(800);
await page.screenshot({ path: '/Users/kadiraybar/Documents/firma-rehberi/.jury/home-redesign/header-bleed-check.png', clip: { x: 0, y: 0, width: 390, height: 130 } });
// header'ın arkasında ne olduğunu bilinçli ölç: başlık tam header altındayken
const info = await page.evaluate(() => {
  const h = document.querySelector('.site-header');
  const cs = getComputedStyle(h);
  return { bg: cs.backgroundColor, filter: cs.backdropFilter, rect: h.getBoundingClientRect().toJSON() };
});
console.log(JSON.stringify(info));
await browser.close();
