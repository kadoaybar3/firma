// Mobilde not kartının dropdown'ı örttüğü noktada paint yığınını ve
// dropdown atalarının stackingContext üreten özelliklerini ölç.
import { createRequire } from 'node:module';
import path from 'node:path';
const req = createRequire(path.join(process.cwd(), 'noop.js'));
const { chromium } = req('playwright');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto('http://localhost:4400/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.locator('.hm-search .loc-btn').first().click();
await page.waitForTimeout(400);

const out = await page.evaluate(() => {
  const dd = document.querySelector('.loc-dropdown');
  const r = dd.getBoundingClientRect();
  const px = Math.round(r.left + 30);
  const py = Math.round(r.top + 140); // not kartının dropdown'ı örttüğü bölge
  const stack = document.elementsFromPoint(px, py).slice(0, 6)
    .map((e) => `${e.tagName.toLowerCase()}.${(e.className || '').toString().split(' ').join('.')}`);

  const chain = [];
  let n = dd;
  while (n && n !== document.body) {
    const cs = getComputedStyle(n);
    chain.push({
      el: `${n.tagName.toLowerCase()}.${(n.className || '').toString().split(' ').join('.')}`,
      pos: cs.position, z: cs.zIndex, transform: cs.transform !== 'none' ? cs.transform : '-',
      opacity: cs.opacity !== '1' ? cs.opacity : '-', filter: cs.filter !== 'none' ? cs.filter : '-',
      anim: cs.animationName !== 'none' ? cs.animationName : '-',
      willChange: cs.willChange, isolation: cs.isolation, contain: cs.contain,
      blend: cs.mixBlendMode,
    });
    n = n.parentElement;
  }
  // not kartının kendisi ve ataları
  const note = document.querySelector('.hm-note');
  const noteChain = [];
  n = note;
  while (n && n !== document.body) {
    const cs = getComputedStyle(n);
    noteChain.push({
      el: `${n.tagName.toLowerCase()}.${(n.className || '').toString().split(' ').join('.')}`,
      pos: cs.position, z: cs.zIndex, transform: cs.transform !== 'none' ? cs.transform : '-',
      opacity: cs.opacity !== '1' ? cs.opacity : '-', anim: cs.animationName !== 'none' ? cs.animationName : '-',
    });
    n = n.parentElement;
  }
  return { point: { px, py }, stack, ddRect: { top: Math.round(r.top), left: Math.round(r.left), bottom: Math.round(r.bottom) }, chain, noteChain };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
