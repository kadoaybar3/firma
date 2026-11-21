// Header bölgesindeki ghost'un piksel kontrastını ölç (0.98 alpha ile ~0-3 beklenir).
import { createRequire } from 'node:module';
import path from 'node:path';
const req = createRequire(path.join(process.cwd(), 'noop.js'));
const { chromium } = req('playwright');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('http://localhost:4400/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.evaluate(() => document.querySelector('#kategoriler')?.scrollIntoView({ block: 'start' }));
await page.waitForTimeout(800);
const buf = await page.screenshot({ clip: { x: 0, y: 0, width: 390, height: 67 } });

// PNG'yi canvas'ta açıp header şeridinin luminans kontrastını ölç
const page2 = await browser.newPage();
const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
const stats = await page2.evaluate(async (u) => {
  const img = new Image();
  img.src = u;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  // 2x scale: şerit y=10..60 css => 20..120 device
  const rows = [20, 40, 60, 80, 100];
  const out = [];
  for (const y of rows) {
    const d = ctx.getImageData(0, y, img.width, 1).data;
    let min = 255, max = 0;
    for (let x = 0; x < d.length; x += 4) {
      const l = 0.2126 * d[x] + 0.7152 * d[x + 1] + 0.0722 * d[x + 2];
      if (l < min) min = l;
      if (l > max) max = l;
    }
    out.push({ yCss: y / 2, min: +min.toFixed(1), max: +max.toFixed(1), delta: +(max - min).toFixed(1) });
  }
  return { size: [img.width, img.height], rows: out };
}, dataUrl);
console.log(JSON.stringify(stats, null, 1));
await browser.close();
