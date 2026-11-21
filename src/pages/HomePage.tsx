import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Search,
} from "lucide-react";
import { SEO } from "../components/SEO";
import { FirmGrid } from "../components/FirmCard";
import { CategoryGlyph } from "../components/CategoryGlyph";
import CategorySelect from "../components/CategorySelect";
import { districtCountsByCity, listCategories, listCities, listCompanies } from "../lib/repo";
import { slugify } from "../lib/slug";
import "./home.css";

// Sitede gerçek arama hedefi (/firmalar?q=) olduğu için SearchAction güvenli.
// Modül ömrü boyunca sabit — her render'da yeniden üretilmez (gereksiz head yazımı olmasın).
const HOMEPAGE_JSON_LD: Array<Record<string, unknown>> = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Firma Rehberi",
    url: typeof location !== "undefined" ? location.origin : "",
    inLanguage: "tr",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${typeof location !== "undefined" ? location.origin : ""}/firmalar?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  },
];

const CATEGORY_TILES = 8;

/** Firma adından iki harflik monogram (not kartı künyesi). */
function initials(name: string): string {
  const words = name.split(/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü]+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => w[0] ?? "");
  return (letters.join("") || name[0] || "?").toLocaleUpperCase("tr");
}

/** Deterministik rastgele — harita dokusu her yüklemede aynı kalsın. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Dekoratif sokak dokusu — koordinat iddiası taşımaz, yalnız "şehir" hissi verir.
 * Düzensiz aralıklı + kavşak kaymalı ızgara kıvrımlı sokaklar üretir; farklı
 * genişliklerde bantlar (ara sokak/ikincil/arter) hiyerarşiyi kurar, arterlere
 * saç teli orta çizgi eklenir. Bloklar hücre içindeki küçük ayrım çizgileriyle
 * parsellere bölünür. İçerik SVG maskesiyle solda sloganın arkasında sönümlenir,
 * işaretçiler sağ tarafta toplanır. Sabit seed: ilk boyamada değişen bir şey olmaz.
 */
function MapTexture() {
  const { blocks, streets, centerlines, diagonal, markers } = useMemo(() => {
    const rnd = mulberry32(20260218);
    const colX = [0, 148, 318, 502, 694, 884, 1058, 1200];
    const rowY = [0, 116, 248, 386, 522, 700];
    // Sokak genişlikleri: 7-8 ara sokak, 11 ikincil, 16 arter
    const vGap = [8, 7, 11, 16, 7, 16, 11, 8];
    const hGap = [8, 11, 16, 7, 11, 8];

    // Her kavşakta kayma — yollar hafif kıvrımlı, kareli grafik düzeni kırık
    const vx = colX.map((x, i) =>
      rowY.map(() => x + (rnd() - 0.5) * (i === 0 || i === colX.length - 1 ? 8 : 24)),
    );
    const hy = rowY.map((y, j) =>
      colX.map(() => y + (rnd() - 0.5) * (j === 0 || j === rowY.length - 1 ? 8 : 18)),
    );

    const poly = (pts: Array<[number, number]>) =>
      pts.map(([x, y], k) => `${k ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const quad = (p: number[][]) =>
      p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

    // Sokaklar: iç dikey/yatay çizgiler (kenar çizgileri kırpılır, çerçevelemez)
    const streets: Array<{ k: string; d: string; w: number }> = [];
    for (let i = 1; i < colX.length - 1; i++)
      streets.push({ k: `v${i}`, d: poly(vx[i].map((x, j) => [x, hy[j][i]])), w: vGap[i] });
    for (let j = 1; j < rowY.length - 1; j++)
      streets.push({ k: `h${j}`, d: poly(hy[j].map((y, i) => [vx[i][j], y])), w: hGap[j] });
    const centerlines = streets.filter((s) => s.w >= 13);

    // Blok parselleri — hücrenin bir kısmı tek, bir kısmı ayrım çizgisiyle bölünmüş
    const blocks: Array<{ p: string; f: string }> = [];
    for (let i = 0; i < colX.length - 1; i++) {
      for (let j = 0; j < rowY.length - 1; j++) {
        const TL = [vx[i][j] + vGap[i] / 2, hy[j][i] + hGap[j] / 2];
        const TR = [vx[i + 1][j] - vGap[i + 1] / 2, hy[j][i + 1] + hGap[j] / 2];
        const BR = [vx[i + 1][j + 1] - vGap[i + 1] / 2, hy[j + 1][i + 1] - hGap[j + 1] / 2];
        const BL = [vx[i][j + 1] + vGap[i] / 2, hy[j + 1][i] - hGap[j + 1] / 2];
        const f = rnd() < 0.3 ? "#eef3fd" : "#e6edfa";
        const r = rnd();
        if (r < 0.38) {
          blocks.push({ p: quad([TL, TR, BR, BL]), f });
        } else if (r < 0.7) {
          const t = 0.38 + rnd() * 0.24;
          const lerp = (a: number[], b: number[]) => [
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
          ];
          const T = lerp(TL, TR);
          const B = lerp(BL, BR);
          blocks.push({ p: quad([TL, T, B, BL]), f });
          blocks.push({ p: quad([[T[0] + 5, T[1]], TR, BR, [B[0] + 5, B[1]]]), f });
        } else {
          const t = 0.38 + rnd() * 0.24;
          const lerp = (a: number[], b: number[]) => [
            a[0] + (b[0] - a[0]) * t,
            a[1] + (b[1] - a[1]) * t,
          ];
          const L = lerp(TL, BL);
          const R = lerp(TR, BR);
          blocks.push({ p: quad([TL, TR, R, L]), f });
          blocks.push({ p: quad([[L[0], L[1] + 5], [R[0], R[1] + 5], BR, BL]), f });
        }
      }
    }

    // Diyagonal bulvar — ızgarayı kesen organik eğri, en üstte boyanır
    const smooth = (pts: Array<[number, number]>) => {
      let d = `M ${pts[0][0]} ${pts[0][1]}`;
      for (let k = 1; k < pts.length - 1; k++) {
        const [x, y] = pts[k];
        const [nx, ny] = pts[k + 1];
        d += ` Q ${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`;
      }
      const [lx, ly] = pts[pts.length - 1];
      return `${d} L ${lx} ${ly}`;
    };
    const diagonal = smooth([
      [548, -24],
      [690, 140],
      [872, 336],
      [1046, 486],
      [1224, 648],
    ]);

    // İşaretçiler: sağ taraftaki kavşaklara yerleşir, slogana binmez
    const markerAt: Array<[number, number]> = [
      [4, 1],
      [6, 1],
      [5, 2],
      [6, 2],
      [4, 3],
      [6, 3],
      [4, 4],
      [5, 4],
    ];
    const markers = markerAt.map(([i, j]) => ({ x: vx[i][j], y: hy[j][i] }));

    return { blocks, streets, centerlines, diagonal, markers };
  }, []);

  return (
    <svg
      viewBox="0 0 1200 700"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* Yatay sönümleme: sloganın arkasında harita bütünüyle kaybolur */}
        <linearGradient id="hm-fade-x" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.12" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.38" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.62" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <mask id="hm-mask-x">
          <rect x="0" y="0" width="1200" height="700" fill="url(#hm-fade-x)" />
        </mask>
      </defs>
      <g mask="url(#hm-mask-x)">
        <g>
          {blocks.map((b, i) => (
            <polygon key={i} points={b.p} fill={b.f} />
          ))}
        </g>
        <g stroke="#ffffff" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {streets.map((s) => (
            <path key={s.k} d={s.d} strokeWidth={s.w} />
          ))}
          <path d={diagonal} strokeWidth="15" />
        </g>
        <g stroke="#c6d4ec" strokeWidth="1.2" fill="none" strokeLinecap="round">
          {centerlines.map((s) => (
            <path key={s.k} d={s.d} />
          ))}
          <path d={diagonal} />
        </g>
        {/* Zarif firma işaretçileri — statik, yalnız geniş ekranda görünür */}
        <g className="hm-map__pins">
          {markers.map((m, i) => (
            <g key={i}>
              <ellipse cx={m.x} cy={m.y + 1.5} rx="4.5" ry="1.6" fill="rgba(13, 27, 46, 0.1)" />
              <path
                d={`M ${m.x} ${m.y} c -4.2 -5.2 -6.3 -7.6 -6.3 -10.4 a 6.3 6.3 0 1 1 12.6 0 c 0 2.8 -2.1 5.2 -6.3 10.4 z`}
                fill="#2563eb"
              />
              <circle cx={m.x} cy={m.y - 10.6} r="2.4" fill="#ffffff" />
            </g>
          ))}
        </g>
      </g>
    </svg>
  );
}

/** Görünür olan bölümleri tek seferlik reveal ile ortaya çıkar. */
function useReveal() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = root.querySelectorAll<HTMLElement>("[data-reveal]");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      els.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.1 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return ref;
}

export default function HomePage() {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [heroCat, setHeroCat] = useState("");
  const [heroCity, setHeroCity] = useState("");
  const revealRef = useReveal();

  /*
   * Türetilmiş veriler tek seferde, tek geçişte üretilir ve useMemo ile sabitlenir.
   * Hero arama her tuş vuruşunda rerender üretir; bu memo olmadan her tuşta
   * listCompanies ×2 + kategori başına 2 sayaç + ilçe başına 1 sayaç olmak
   * üzere 30+ O(n) dizi geçişi yeniden koşardı. Memo ile yalnızca ilk
   * render'da hesaplanır (sayfa yeniden mount edilene kadar).
   */
  const data = useMemo(() => {
    const categories = listCategories();
    const companies = listCompanies();
    const featured = listCompanies({ featuredOnly: true }).slice(0, 6);
    const cities = listCities();
    const city = cities[0];

    // Kategori sayaçları — tüm sayılar tek O(n) geçişte çıkar
    const categoryCounts = new Map<string, number>();
    for (const co of companies) {
      categoryCounts.set(co.categoryId, (categoryCounts.get(co.categoryId) ?? 0) + 1);
    }

    return {
      categories,
      companies,
      featured,
      cities,
      city,
      categoryCounts,
    };
  }, []);

  const { categories, companies, featured, cities, city, categoryCounts } = data;

  /*
   * Kategori karoları: gerçek firma sayısına göre sıralanır (eşitlikte ada göre).
   * 123 kategoriyi ana sayfaya dökmek yerine en dolu 8 tanesi gösterilir;
   * tamamı "Tüm kategoriler" bağlantısında. Sayılar uydurulmaz — 0 ise 0 yazar.
   */
  const categoryTiles = useMemo(
    () =>
      categories
        .map((category) => ({ category, count: categoryCounts.get(category.id) ?? 0 }))
        .sort((a, b) => b.count - a.count || a.category.name.localeCompare(b.category.name, "tr"))
        .slice(0, CATEGORY_TILES),
    [categories, categoryCounts],
  );

  // FirmGrid id listesi de her keystroke'ta yeniden kurulmasın. Set ile
  // çift-key önlemi: featured < 3 olduğunda ilk 3 firma featured kaydı
  // tekrar içerebilir.
  const featuredIds = useMemo(
    () =>
      [
        ...new Set(
          [...featured, ...(featured.length < 3 ? companies.slice(0, 3) : [])].map((c) => c.id),
        ),
      ],
    [featured, companies],
  );

  // Harita notları: gerçekten öne çıkan ilk 3 firma (sahte içerik üretilmez).
  const notes = useMemo(
    () =>
      featuredIds
        .slice(0, 3)
        .map((id) => companies.find((c) => c.id === id))
        .filter((c): c is NonNullable<typeof c> => Boolean(c)),
    [featuredIds, companies],
  );

  // İlçe rayı: gerçek firma sayıları olan ilçeler (sıfırlar gösterilmez).
  const districts = useMemo(() => {
    if (!city) return [] as Array<[string, number]>;
    return [...districtCountsByCity(city.id).entries()]
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr"));
  }, [city]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (term.trim()) params.set("q", term.trim());
    if (heroCat) params.set("kategori", heroCat);
    // İl filtresi: gerçek şehir kayıtları (slug) — /firmalar listCompanies({ citySlug })
    // üzerinden sunucu tarafındaki şehir ilişkisiyle birebir eşleşir.
    if (heroCity) params.set("sehir", heroCity);
    const qs = params.toString();
    navigate(qs ? `/firmalar?${qs}` : "/firmalar");
  }

  return (
    <SEO
      title="Firma Rehberi — Afyonkarahisar'daki Firmaları Kolayca Bulun"
      description="Afyonkarahisar ve ilçelerindeki güvenilir firmaları kategori, ilçe ve arama ile keşfedin."
      canonicalPath="/"
      jsonLd={HOMEPAGE_JSON_LD}
    >
      <div className="page-home" ref={revealRef}>
        {/* ============ HERO — harita üzerinde arama pusulası ============ */}
        <section className="hm-hero">
          <div className="hm-hero__map" aria-hidden="true">
            <MapTexture />
          </div>

          <div className={`container hm-hero__grid${notes.length === 0 ? " hm-hero__grid--solo" : ""}`}>
            <div className="hm-hero__copy">
              {/* Bölge etiketi (hm-chip) kaldırıldı — istek gereği tamamen silindi. */}
              <h1 className="hm-hero__title">
                İşletmenizin dijital görünürlüğünü artırın.
              </h1>
              <p className="hm-hero__sub">
                İhtiyacınız olan ürün ve hizmeti sunan işletmeleri bulun; telefon, adres ve çalışma
                saatlerine tek ekrandan ulaşın.
              </p>

              <form className="hm-search" role="search" onSubmit={submitSearch}>
                <label className="hm-search__field hm-search__field--q">
                  <Search size={18} strokeWidth={1.9} aria-hidden="true" />
                  <input
                    type="search"
                    placeholder="Ne arıyorsunuz?"
                    aria-label="Firma arama"
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                  />
                </label>
                <div className="hm-search__field hm-search__field--cat">
                  <CategorySelect
                    className="hm-search__cat"
                    categories={categories.map((c) => ({ id: c.slug, name: c.name }))}
                    value={heroCat}
                    onChange={setHeroCat}
                    allLabel="Tüm kategoriler"
                    ariaLabel="Kategori seç"
                  />
                </div>
                {cities.length > 0 && (
                  <label className="hm-search__field hm-search__field--city">
                    <select
                      aria-label="İl seç"
                      value={heroCity}
                      onChange={(e) => setHeroCity(e.target.value)}
                    >
                      <option value="">Tüm iller</option>
                      {cities.map((c) => (
                        <option key={c.id} value={c.slug}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button className="hm-search__btn" type="submit">
                  <span>Ara</span>
                  <ArrowRight size={17} strokeWidth={2.2} aria-hidden="true" />
                </button>
              </form>

              {/* Gerçek sayaçlar — dekoratif istatistik kutusu değil, tek satır künye. */}
              <div className="hm-hero__stats">
                <span>
                  <strong>{companies.length}</strong> firma
                </span>
                <i aria-hidden="true" />
                <span>
                  <strong>{categories.length}</strong> kategori
                </span>
                {city && (
                  <>
                    <i aria-hidden="true" />
                    <span>{city.name}</span>
                  </>
                )}
              </div>
            </div>

            {/* İmza an: firmalar haritaya iğnelenmiş not kartları. */}
            {notes.length > 0 && (
              <div className="hm-stage">
                {notes.map((co, i) => {
                  const cat = categories.find((c) => c.id === co.categoryId);
                  return (
                    <Link
                      key={co.id}
                      className={`hm-note hm-note--${i + 1}`}
                      to={`/firma/${co.slug}`}
                    >
                      <span className="hm-note__top">
                        <span className="hm-note__mark" aria-hidden="true">
                          {initials(co.name)}
                        </span>
                        <span className="hm-note__name">{co.name}</span>
                      </span>
                      <span className="hm-note__meta">
                        <span>{cat?.name ?? "Firma"}</span>
                        <i aria-hidden="true" />
                        <span>{co.district}</span>
                      </span>
                      <ArrowUpRight className="hm-note__go" size={15} strokeWidth={2} aria-hidden="true" />
                      <span className="hm-note__pin" aria-hidden="true">
                        <i />
                        <i />
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <div className="home-body">
          {/* ============ KATEGORİLER ============ */}
          <section className="section container" aria-labelledby="kategoriler">
            <div className="section__head" data-reveal>
              <div className="section__intro">
                <span className="section__eyebrow">Keşfet</span>
                <h2 className="section__title" id="kategoriler">
                  Kategoriler
                </h2>
                <p className="section__desc">İşletmeleri alanlarına göre inceleyin.</p>
              </div>
              <Link to="/firmalar" className="section__link">
                Tüm kategoriler
                <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
              </Link>
            </div>

            <div className="catgrid">
              {categoryTiles.map(({ category, count }, i) => (
                <Link
                  key={category.id}
                  className="cat-tile"
                  to={`/kategori/${category.slug}`}
                  data-reveal
                  style={{ "--rd": i } as React.CSSProperties}
                >
                  <span className="cat-tile__icon" aria-hidden="true">
                    <CategoryGlyph name={category.name} size={18} />
                  </span>
                  <span className="cat-tile__body">
                    <span className="cat-tile__name">{category.name}</span>
                    <span className="cat-tile__count">{count} firma</span>
                  </span>
                  <ChevronRight
                    className="cat-tile__chev"
                    size={16}
                    strokeWidth={2}
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </div>
          </section>

          {/* ============ ÖNE ÇIKAN FİRMALAR (beyaz bant) ============ */}
          <div className="hm-band">
            <section className="section container" aria-labelledby="onecikar">
              <div className="section__head" data-reveal>
                <div className="section__intro">
                  <span className="section__eyebrow">Seçili işletmeler</span>
                  <h2 className="section__title" id="onecikar">
                    Öne çıkan firmalar
                  </h2>
                  <p className="section__desc">Rehberde öne çıkan işletmeler ve iletişim bilgileri.</p>
                </div>
                <Link to="/firmalar" className="section__link">
                  Tümünü gör
                  <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
                </Link>
              </div>
              <div data-reveal>
                <FirmGrid ids={featuredIds} variant="featured" />
              </div>
            </section>
          </div>

          {/* ============ İLÇELER — gerçek sayılarla keşif rayı ============ */}
          {city && districts.length > 0 && (
            <section className="section container" aria-labelledby="ilceler">
              <div className="section__head" data-reveal>
                <div className="section__intro">
                  <span className="section__eyebrow">Bölgeler</span>
                  <h2 className="section__title" id="ilceler">
                    {city.name} ilçeleri
                  </h2>
                  <p className="section__desc">İlçeye göre firmaları inceleyin.</p>
                </div>
                <Link to={`/sehir/${city.slug}`} className="section__link">
                  Şehri gör
                  <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
                </Link>
              </div>
              <div className="hm-chips" data-reveal>
                {districts.map(([district, count]) => (
                  <Link
                    key={district}
                    className="chip"
                    to={`/sehir/${city.slug}/${slugify(district)}`}
                  >
                    <span>{district}</span>
                    <span className="chip__count">{count}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* ============ NASIL ÇALIŞIR — numaralı yol çizgisi ============ */}
          <section className="section container" aria-labelledby="nasil">
            <div className="section__head" data-reveal>
              <div className="section__intro">
                <span className="section__eyebrow">Rehber</span>
                <h2 className="section__title" id="nasil">
                  Nasıl çalışır?
                </h2>
                <p className="section__desc">Dört adımda doğru işletmeye ulaşın.</p>
              </div>
            </div>
            <div className="how-grid">
              <div className="how-card" data-reveal style={{ "--rd": 0 } as React.CSSProperties}>
                <span className="how-card__num" aria-hidden="true">
                  1
                </span>
                <h3>Arayın veya kategori seçin</h3>
                <p>Firma adı, hizmet ya da ilçe ile saniyeler içinde aradığınız işletmeyi bulun.</p>
              </div>
              <div className="how-card" data-reveal style={{ "--rd": 1 } as React.CSSProperties}>
                <span className="how-card__num" aria-hidden="true">
                  2
                </span>
                <h3>Firma sayfasını inceleyin</h3>
                <p>Telefon, açık adres, çalışma saatleri ve harita bağlantısı tek sayfada.</p>
              </div>
              <div className="how-card" data-reveal style={{ "--rd": 2 } as React.CSSProperties}>
                <span className="how-card__num" aria-hidden="true">
                  3
                </span>
                <h3>İletişime geçin</h3>
                <p>Tek dokunuşla arayın, WhatsApp'tan yazın veya yol tarifi alın.</p>
              </div>
              <div className="how-card" data-reveal style={{ "--rd": 3 } as React.CSSProperties}>
                <span className="how-card__num" aria-hidden="true">
                  4
                </span>
                <h3>İşletmenizi ekleyin</h3>
                <p>Firmanız rehberde yer alsın; müşterileriniz sizi arama motorlarında bulsun.</p>
              </div>
            </div>
          </section>

          {/* ============ İŞLETME CTA ============ */}
          <section className="section container">
            <div className="partner-cta" data-reveal>
              <div className="partner-cta__copy">
                <h2>İşletmeniz rehberde yer alsın</h2>
                <p>
                  Firmanızı kategorisi ve ilçesiyle birlikte rehbere ekletin; müşterileriniz sizi
                  arama motorlarında kolayca bulsun.
                </p>
              </div>
              <div className="partner-cta__actions">
                <Link className="btn btn--light" to="/iletisim">
                  İletişime geçin
                </Link>
                <Link className="btn btn--on-dark" to="/hakkimizda">
                  Platform hakkında
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </SEO>
  );
}
