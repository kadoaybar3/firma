---
name: seo
description: "SEO analysis hub for Firma Rehberi. Routes to the installed SEO skills: seo-technical, seo-audit, seo-local, seo-programmatic, seo-schema, seo-sitemap, seo-content, seo-google. Use when the SEO domain is clear but the requested workflow is not, or when unsure which seo-* skill to load. Triggers: SEO, audit, technical SEO, local SEO, schema, sitemap, content, programmatic SEO, Search Console, GSC, Core Web Vitals."
license: MIT
metadata:
  author: AgriciDaniel
  version: "2.6.0"
  category: seo
---

> **OpenCode adaptasyonu (Firma Rehberi):** Bu hub, [claude-seo](https://github.com/AgriciDaniel/claude-seo)
> v2.6.0 (MIT) deposundan Faz 1'de uyarlandı. Claude Code `/seo …` slash
> komutları bu ortamda yoktur: beceriler `skill` aracıyla `seo-…` kimliğiyle
> yüklenir, komut sarmalayıcıları `/seo/…` (`.opencode/commands/seo/`) olarak
> çalışır. Python betik yolları, betikler Faz 2'de
> `.opencode/skills/seo/scripts/` altına kopyalandığında geçerli olur.

## Kurulu beceriler (yönlendirme)

| İstek | Beceri |
|---|---|
| Tam site denetimi, önceliklendirilmiş plan | `seo-audit` |
| Teknik denetim: krawl, indeks, hız, CWV, rendering | `seo-technical` |
| Yerel SEO: GBP, NAP, yorumlar, yerel şema, konum sayfaları | `seo-local` |
| Ölçekten üretilen sayfalar: şablon, URL, iç bağlantı | `seo-programmatic` |
| Schema.org JSON-LD tespit/doğrulama/üretim | `seo-schema` |
| XML sitemap analizi ve üretimi | `seo-sitemap` |
| İçerik kalitesi, E-E-A-T, ince sayfa denetimi | `seo-content` |
| Google API'leri: GSC, PageSpeed, CrUX, Indexing, GA4 | `seo-google` |

Kural: istek net bir tek alana giriyorsa doğrudan o beceriyi yükle; alan net
ama iş akışı belirsizse bu hub üzerinden yönlendir.

## Kurulu OLMAYAN upstream beceriler

Depoda olan ama bu projeye kopyalanmayanlar: `seo-page`, `seo-maps`,
`seo-geo`, `seo-agentic`, `seo-images`, `seo-backlinks`, `seo-cluster`,
`seo-sxo`, `seo-drift`, `seo-flow`, `seo-plan`, `seo-competitor-pages`,
`seo-content-brief`, `seo-hreflang`, `seo-ecommerce` ve tüm `extensions/`
(ücretli/MCP uzantıları). Bu kimlikleri yüklemeye çalışma; gerekirse kullanıcıya
Faz 2'de eklenebileceklerini söyle.

## Betik yürütme (Faz 2'den sonra)

Beceriler betikleri proje köküne göre şu yolla çağırır:

```bash
./.opencode/skills/seo/scripts/claude-seo run <script.py> <args>
```

Faz 1'de `scripts/` henüz kopyalanmadı — bu komutlar bu aşamada çalışmaz;
betik gerektiren adımlarda kullanıcıya Faz 2 (izole Python venv + betik
kopyası) gerektiğini bildir. Betikleri asla uzak kaynaktan canlı çalıştırsa;
yalnızca `.opencode/skills/seo/scripts/` altındaki kopyalanmış dosyalar.

## Referanslar

Bu hub `references/` altında paylaşılan derinlik dosyaları taşır
(E-E-A-T çerçevesi, yerel şema tipleri, yerel arama sinyalleri, Google AI
optimizasyon rehberi). Beceriler bu dosyalara proje köküne göre
`./.opencode/skills/seo/references/…` yoluyla bağlanır.

## Lisans

MIT — Copyright (c) 2026 AgriciDaniel (claude-seo). Telif bildirimleri ve
`LICENSE.txt` dosyaları korunmuştur; kaynak depo:
<https://github.com/AgriciDaniel/claude-seo>.
