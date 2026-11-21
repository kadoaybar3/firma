// Farklı genişliklerde taşma + kare kontrolü (shoot.mjs 1440/390'a sabit).
//   cd ~/.cache/jury && node <bu-dosya> http://localhost:4400/ <out-dir>
import { createRequire } from 'node:module';
import path from 'node:path';

// playwright'u cwd'den çöz (~/.cache/jury'de kurulu), betik konumundan değil.
const req = createRequire(path.join(process.cwd(), 'noop.js'));
const { chromium } = req('playwright');

const url = process.argv[2];
const out = process.argv[3];
const widths = [360, 414, 768];

const browser = await chromium.launch();
for (const width of widths) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2, isMobile: width < 768, hasTouch: width < 768 });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const m = await page.evaluate(() => {
    const de = document.documentElement;
    const offenders = [];
    if (de.scrollWidth > de.clientWidth) {
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.right > de.clientWidth + 1 || r.left < -1) {
          offenders.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]} left=${Math.round(r.left)} right=${Math.round(r.right)}`);
        }
      }
    }
    return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, overflowX: de.scrollWidth > de.clientWidth, offenders: offenders.slice(0, 8), h1: document.querySelector('h1')?.innerText || null };
  });
  console.log(width, JSON.stringify(m));
  await page.screenshot({ path: path.join(out, `w-${width}-hero.png`) });
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight * 0.45));
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(out, `w-${width}-mid.png`) });
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(out, `w-${width}-footer.png`) });
  await ctx.close();
}
await browser.close();
