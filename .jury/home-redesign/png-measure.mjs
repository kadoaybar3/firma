// Verilen PNG'de header şeridinde ghost kontrastını ölç; logo/metin kolonları hariç.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
const req = createRequire(path.join(process.cwd(), 'noop.js'));
const { chromium } = req('playwright');

const file = process.argv[2];
const buf = fs.readFileSync(file);
const browser = await chromium.launch();
const page = await browser.newPage();
const stats = await page.evaluate(async (u) => {
  const img = new Image();
  img.src = u;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const out = [];
  // y satırları (görsel pikseli); header yüksekliği ve cihaz faktörü dosyadan bağımsız taranır
  for (let y = 2; y < Math.min(140, img.height); y += 8) {
    const d = ctx.getImageData(0, y, img.width, 1).data;
    let min = 255, max = 0;
    for (let x = 0; x < d.length; x += 4) {
      const l = 0.2126 * d[x] + 0.7152 * d[x + 1] + 0.0722 * d[x + 2];
      if (l < min) min = l;
      if (l > max) max = l;
    }
    out.push(`y=${y} min=${min.toFixed(0)} max=${max.toFixed(0)} d=${(max - min).toFixed(1)}`);
  }
  return { w: img.width, h: img.height, rows: out };
}, `data:image/png;base64,${buf.toString('base64')}`);
console.log(JSON.stringify(stats, null, 1));
await browser.close();
