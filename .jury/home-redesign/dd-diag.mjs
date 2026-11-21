// Kategori dropdown açılışını iki cihazda üret; kesim/katman kaynağını ölç.
import { createRequire } from 'node:module';
import path from 'node:path';
const req = createRequire(path.join(process.cwd(), 'noop.js'));
const { chromium } = req('playwright');
const out = '/Users/kadiraybar/Documents/firma-rehberi/.jury/home-redesign';

const browser = await chromium.launch();
for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 500, hasTouch: width < 500 });
  await page.goto('http://localhost:4400/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.locator('.hm-search .loc-btn').first().click();
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const dd = document.querySelector('.loc-dropdown');
    const hero = document.querySelector('.hm-hero');
    const r = dd?.getBoundingClientRect();
    const hr = hero?.getBoundingClientRect();
    // en yakın overflow-atayan atalar
    let clipper = null, n = dd?.parentElement;
    while (n) {
      const cs = getComputedStyle(n);
      if (/hidden|clip|auto|scroll/.test(cs.overflow + cs.overflowX + cs.overflowY)) {
        clipper = `${n.tagName.toLowerCase()}.${(n.className||'').toString().split(' ').join('.')}`;
        break;
      }
      n = n.parentElement;
    }
    // gerçekten görünür mü: elemanın üstünde paint yapan üstleri probe et
    const cx = r ? r.left + r.width / 2 : 0;
    const cy = r ? Math.min(r.bottom - 10, innerHeight - 5) : 0;
    const topEl = document.elementFromPoint(cx, cy);
    return {
      dropdownRect: r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), height: Math.round(r.height) } : null,
      heroRect: hr ? { top: Math.round(hr.top), bottom: Math.round(hr.bottom) } : null,
      overflowedByHero: r && hr ? +(r.bottom - hr.bottom).toFixed(0) : null,
      nearestOverflowAncestor: clipper,
      elementAtDropdownBottom: topEl ? `${topEl.tagName.toLowerCase()}.${(topEl.className||'').toString().split(' ').slice(0,2).join('.')}` : null,
      scrollHeight: dd?.querySelector('.loc-dropdown__list')?.scrollHeight,
      clientHeight: dd?.querySelector('.loc-dropdown__list')?.clientHeight,
      items: dd ? dd.querySelectorAll('.loc-dropdown__item').length : 0,
      ddZ: dd ? getComputedStyle(dd).zIndex : null,
    };
  });
  console.log(name, JSON.stringify(m, null, 1));
  await page.screenshot({ path: `${out}/dd-${name}.png` });
  await page.close();
}
await browser.close();
