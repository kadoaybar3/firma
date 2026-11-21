# Firma Rehberi — Ana Sayfa Yeniden Tasarımı (DESIGN.md)

Awwwards becerisi /awwwards ile üretilen plan. Yalnızca ana sayfa kapsamı:
`src/pages/HomePage.tsx`, `src/pages/home.css`, `public/fonts/`, küçük ortak
a11y/düzeltmeler (`src/index.css`, `src/components/SiteLayout.tsx`).

## Phase 0 — Brief

- **Konu:** Firma Rehberi — Afyonkarahisar'da başlayan, Türkiye'ye açılan dijital firma rehberi.
- **İki kitle:** (1) aradığı işletmeyi hızlı bulan ziyaretçi, (2) dijital görünürlük isteyen işletme sahibi.
- **İş:** aramaya yönlendirmek + firmayı rehbere ekletmek.
- **Dil:** Türkçe. **Altyapı:** React 19 + Vite + TS + Supabase + Netlify (korunur).
- **Sabitler:** arama/kategori/filtre mantığı, URL'ler, SEO (title/description testleri ile kilitli),
  gerçek veri (84 firma, 123 kategori, ilçe sayıları). Sahte puan/yorum/foto YOK.
- **Var sayım:** firma fotoğrafları yok → monogram/kategori ikonlu yer tutucu; harita doku
  dekoratiftir (koordinat iddiası taşımaz); yükleme altyapısı (BootGate) olduğu gibi kalır.

## Phase 1 — Üç konsept

| | A. Şehrin haritası (yer/kültür) | B. Vitrin (malzeme) | C. Rehber indeksi (biçim) |
|---|---|---|---|
| Fikir | Sayfa, şehir planı üzerine not düşülmüş bir keşif haritası: arama pusula, firmalar harita notları | Sayfa bir vitrin camı: firmalar aydınlatılmış paneller, kaydırma ışık süpürmesi | Sayfa bir dizin: cetvelli satırlar, tabular sayılar, editoryal grotesk |
| İmza an | Not kartlarının haritaya "iğne düşer gibi" oturması + nabız atan pin halkaları | Panellerin üzerinde gezen ışık bantı | Dizin satırlarının çekmece kayması |
| Duygu | "Şehir okunabilir, her şeyi bulabilirim" | "İşletmem burada gururla duruyor" | "Her şey düzenli, güvenilir" |
| Çapa | Ürünün kendisi bir yer bulma aracı; ilçe/şehir verisi gerçek | Dizin = vitrin demek | "Rehber" kelimesinin kendisi = dizin |
| O / U / F / P | 4 / 5 / 5 / 2 | 3 / 4 / 3 / 3 | 3 / 4 / 5 / 2 |

**Seçim: A — Şehrin haritası.** Arama yolculuğuna birebir oturur, Citywise referansını
kopyalamadan (notasyon kartları + editoryal asimetrik kompozisyon) dönüştürür, tek günde
kodlanabilir ve 404'e kadar taşınabilir (404 kapsam dışı — bu turda ana sayfa).

### Konsept Kartı

```
Idea:        Afyon'un üzerine not düşülmüş bir keşif haritası: arama pusulayı tutar,
             firmalar haritanın kenarına iğnelenmiş not kartlarıdır.
Metaphor:    şehir planı + saha notları (wayfinding tabelası disiplini)
Signature:   hero'da not kartlarının haritaya "drop and settle" ile oturması,
             pin uçlarında nabız atan halkalar (CSS + IntersectionObserver)
Emotion:     ilk 3 saniye: ferah, düzenli, "burada her şey bulunur"
Motion verb: iğne düşer ve yerleşir (settle) — her şey hafif aşımla yerine oturur
Screenshot:  büyük Archivo başlık + soluk şehir planı dokusu + sağda gerçek firma not kartları
```

Genericness testi: "şehir haritası zeminli hero" klişesi; bizim farkımız: (a) kartlar
fotoğraf değil **gerçek firma notları** (kuyruklu pin kuyruğu + nabız), (b) sol hizalı
editoryal başlık + segmentli arama, (c) ilçe rayı gerçek sayılarla. Aynı prompt jenerik
modele verilseydi ortada yüzen stock fotoğraflı kartlar çıkardı; burada çıkmaz.

## Phase 2 — Art direction sistemi

- **Palet (marka korunur, konsept tonlanır):**
  `ground #ffffff`, `page #f4f7fc`, `map-line #d8e2f2` / `map-block #eef3fc` (harita dokusu),
  `ink #0d1b2e`, `muted #5a6678` (AA), `line #e3e8f1`, `accent #2563eb` (+`#1d4ed8`),
  `curtain #0d1b2e→#16294a` (CTA bandı). Yeni renk yok: marka kimliği korunur.
- **Tipografi:** Display = **Archivo** (Google, self-host, wght 500–800, latin+latin-ext,
  67 KB, `font-display: swap`, yalnız `.page-home` başlıklarında). Metin/UI = mevcut sistem
  yığını. Ölçek: h1 `clamp(2.3rem, 5.6vw, 3.9rem)` / lh 1.02 / tracking -0.035em;
  h2 `clamp(1.5rem, 3vw, 2.1rem)`; rakamlar `tabular-nums`. Neden Archivo: tabela/grotesk
  sesi (wayfinding), Türkçe glifler tam, tek aile iki kişilik (500 etiket / 800 başlık).
- **Grid & ritim:** mevcut 1160px container korunur; hero masaüstü 7/5 asimetrik iki sütun;
  bölüm ritmi sıkı (32px) / normal (48px) / havadar (72px, CTA öncesi) olarak değişir.
- **Şekil:** tek radius ailesi (12/16px, panel pill değil yuvarlak köşe) — mevcut token'lar.
- **Motion:** tek easing `cubic-bezier(.22,1,.36,1)` (settle), büyük hareket 500–700ms,
  küçük 150–250ms, stagger 60ms. Yalnız `transform/opacity`. `prefers-reduced-motion`
  ile tümü kapanır. **GSAP/Lenis YOK** (yeni runtime bağımlılığı yok; reveal + idle +
  intro CSS/IO ile taşınır — paket bütçesi ve LCP korunur, bilinçli karar).
- **Idle sistem:** pin halkaları nabız atar (2.6s), not kartları yavaşça süzülür (7–9s),
  harita dokusu sabit kalır. Duruyan sayfa değil; dekoratif zıplama yok.

### Bölüm kompozisyonları (ASCII)

```
1 HERO (asimetrik çift)          2 KATEGORİ (ızgara)      3 FİRMALAR (galeri duvarı)
┌──────────────┬─────────────┐   ┌────┬────┬────┬────┐    ┌────┬────┬────┐
│ chip         │  ┌─not──┐   │   │ tile×8 (4 kolon) │    │ firm-card ×6 (3 kolon)│
│ h1 (display) │  │ kart │   │   └────┴────┴────┴────┘    └────┴────┴────┘
│ sub          │  └pin~~~┘   │   başlık + "Tümü →"        başlık + "Tümü →"
│ [arama panel]│  ┌─not┐     │
│ sayaç künyesi│  └pin~┘      │   4 İLÇE (çip rayı)       5 NASIL (yol çizgisi)
└──────────────┴─────────────┘   [çip×n, sayı rozetli]     ①───②───③───④  (numaralı)
6 CTA (curtain bandı, harita dokusu zeminde, display başlık + 2 buton)
```

Mobil (390): hero tek kolon → metin, arama, altında **yatay snap not kartları**
(imza anın uyarlanmış hâli), harita dokusu arkada soluk; kategoriler 2 kolon; ilçe
çipleri yatay kaydırır; nasıl çalışır 1 kolon + dikey çizgi; CTA tam genişlik.

## Bilinen sınırlar (bu turda dokunulmaz)

- BootGate: sayfa veri hydrasyonu gelmeden render olmuyor → mobil LCP ~4.7s (prerender +
  auth katmanı = kapsam dışı).
- Statik HTML'de `<h1>/<main>` yok (head-only prerender altyapısı) — SEO testleri korunur.
- 404 sayfası tasarımı, OG görseli, sayfa geçişleri: kapsam dışı (sonraki tur).
