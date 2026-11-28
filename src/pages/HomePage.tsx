import { useEffect, useMemo, useRef, useState, type FocusEventHandler } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";
import { SEO } from "../components/SEO";
import { FirmGrid } from "../components/FirmCard";
import { CategoryGlyph } from "../components/CategoryGlyph";
import CategorySelect from "../components/CategorySelect";
import { districtCountsByCity, listCategories, listCities, listCompanies } from "../lib/repo";
import { firmInitials, firmPhoto } from "../lib/format";
import { slugify } from "../lib/slug";
import "./home.css";

// Sitede gerçek arama hedefi (/firmalar?q=) olduğu için SearchAction güvenli.
// Modül ömrü boyunca sabit — her render'da yeniden üretilmez (gereksiz head yazımı olmasın).
const HOMEPAGE_JSON_LD: Array<Record<string, unknown>> = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "RehberiX",
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

/** Üç adımlı akış — ana sayfayı uzatmamak için tek satır açıklama. */
const STEPS = [
  { title: "Arayın", text: "Firma adı, hizmet, kategori veya ilçe ile arayın." },
  { title: "İnceleyin", text: "Telefon, adres ve çalışma saatlerini tek sayfada görün." },
  { title: "İletişime geçin", text: "Tek dokunuşla arayın, yazın veya yol tarifi alın." },
];

/**
 * Hero başlığındaki dönen kelime havuzu.
 * Her ifade, sistemde var olan bir kategoriyle eşleşirse gösterilir; karşılığı
 * olmayan sektörler (ör. avukat, mali müşavir, kuaför) listeye hiç girmez.
 * `match` kategori adının tr küçük harfe çevrilmiş hali üzerinde çalışır.
 */
const HERO_WORD_POOL: Array<{ word: string; match: RegExp }> = [
  { word: "firmayı", match: /./ },
  { word: "ustayı", match: /yapı|yapi|inşaat|insaat|tamir|tadilat|montaj|oto/ },
  { word: "oto servisini", match: /oto|servis/ },
  { word: "doktoru", match: /sağlık|saglik|doktor|hastane|klinik|eczane|tıp|tip/ },
  { word: "avukatı", match: /avukat|hukuk/ },
  { word: "restoranı", match: /yemek|restoran|lokanta|kafe|içecek|icecek/ },
  { word: "emlakçıyı", match: /emlak|gayrimenkul/ },
  { word: "kuaförü", match: /kuaför|kuafor|güzellik|guzellik|berber/ },
  { word: "diş hekimini", match: /diş|dis|ağız|agiz|sağlık|saglik/ },
  { word: "mali müşaviri", match: /mali|müşavir|musavir|muhasebe/ },
  { word: "veterineri", match: /veteriner|tarım|tarim|hayvan/ },
  { word: "oteli", match: /konaklama|otel|pansiyon/ },
  { word: "tesisatçıyı", match: /tesisat|yapı|yapi|inşaat|insaat|tamir/ },
  { word: "elektrikçiyi", match: /elektrik|yapı|yapi|inşaat|insaat/ },
  { word: "mobilyacıyı", match: /mobilya|dekorasyon/ },
  { word: "nakliyeciyi", match: /nakliye|lojistik|taşıma|tasima/ },
  { word: "galeriyi", match: /galeri|oto/ },
  { word: "pastaneyi", match: /pasta|tatlı|tatli|fırın|firin|yemek|içecek|icecek/ },
  { word: "danışmanı", match: /danışman|danisman/ },
  { word: "mağazayı", match: /mağaza|magaza|perakende|ticaret|alışveriş|alisveris/ },
];

/** Kelime değişim aralığı (ms). */
const HERO_WORD_INTERVAL = 1500;
/** Çıkan kelimenin animasyon süresiyle aynı; iki kelime bu süre üst üste kalır. */
const HERO_WORD_SWAP = 440;

/** İşletim sistemi "hareketi azalt" tercihini canlı izler. */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Hero başlığı. Dönen kelime kendi satırında durur ve giren/çıkan kelime
 * aynı ızgara hücresinde üst üste biner; böylece kelime değişirken başlığın
 * yüksekliği ve altındaki arama panelinin konumu değişmez.
 * Hareket azaltma tercihinde dönme tamamen durur, tek kelime sabit kalır.
 */
function HeroTitle({ words }: { words: string[] }) {
  const reduced = usePrefersReducedMotion();
  const [rot, setRot] = useState({ current: 0, leaving: -1 });

  useEffect(() => {
    if (reduced || words.length < 2) return;
    let swap = 0;
    const timer = window.setInterval(() => {
      // Sekme arka plandayken kelime değiştirmenin anlamı yok.
      if (document.hidden) return;
      setRot((s) => ({ current: (s.current + 1) % words.length, leaving: s.current }));
      window.clearTimeout(swap);
      swap = window.setTimeout(
        () => setRot((s) => (s.leaving === -1 ? s : { ...s, leaving: -1 })),
        HERO_WORD_SWAP,
      );
    }, HERO_WORD_INTERVAL);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(swap);
    };
  }, [reduced, words.length]);

  // Tercih sonradan açılırsa yarım kalan geçiş temizlenir.
  useEffect(() => {
    if (reduced) setRot((s) => (s.leaving === -1 ? s : { ...s, leaving: -1 }));
  }, [reduced]);

  const current = words.length ? rot.current % words.length : 0;
  const currentWord = words[current] ?? "firmayı";
  const leavingWord = rot.leaving >= 0 ? words[rot.leaving % words.length] : null;

  return (
    <h1 className="hm-hero__title" id="ana-baslik">
      <span className="hm-hero__line">Aradığın en iyi</span>{" "}
      <span className="hm-hero__rotor">
        {leavingWord !== null && leavingWord !== currentWord && (
          <span
            key={`out-${rot.leaving}`}
            className="hm-hero__word hm-hero__word--out"
            aria-hidden="true"
          >
            {leavingWord}
            <WordSmile />
          </span>
        )}
        <span key={`in-${current}`} className="hm-hero__word hm-hero__word--in">
          {currentWord}
          <WordSmile />
        </span>
      </span>{" "}
      <span className="hm-hero__line">hemen bul.</span>
    </h1>
  );
}

/**
 * Dönen kelimenin altındaki gülümseme çizgisi.
 * Amazon logosundaki yaya benzer; kelime genişliğine göre esner.
 */
function WordSmile() {
  return (
    <svg
      className="hm-hero__smile"
      viewBox="0 0 100 10"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2 2.4C26 8.6 74 8.6 98 2.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Hero vitrin kartının ihtiyaç duyduğu alanlar — kart yalnız bunları taşır. */
type ShowcaseItem = {
  id: string;
  slug: string;
  name: string;
  photo: string | null;
  initials: string;
  categoryName: string;
};

/**
 * Hero'nun tamamını kaplayan dekoratif harita deseni: ince sokak çizgileri
 * ve nokta dokusu. Yalnız çizimdir — harita altyapısı, döşeme veya etkileşim
 * yoktur. Çizgiler non-scaling-stroke ile her genişlikte ince kalır.
 */
function HeroMap() {
  return (
    <div className="hm-map" aria-hidden="true">
      <svg
        className="hm-map__lines"
        viewBox="0 0 1200 720"
        preserveAspectRatio="none"
        focusable="false"
      >
        <g fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
          <path d="M-20 118 L 330 118 L 430 58 L 1240 58" />
          <path d="M-20 300 L 250 300 L 372 402 L 1240 402" />
          <path d="M-20 552 L 300 552 L 452 486 L 1240 486" />
          <path d="M-20 668 L 520 668 L 640 726 L 1240 726" />
          <path d="M148 -20 L 148 258 L 84 328 L 84 760" />
          <path d="M690 -20 L 690 190 L 806 316 L 806 760" />
          <path d="M972 -20 L 972 254 L 1052 338 L 1052 760" />
          <path d="M330 118 L 330 300" />
          <path d="M430 58 L 430 118" />
          <path d="M300 552 L 300 668" />
          <path d="M1160 58 L 1160 254" strokeDasharray="4 8" />
        </g>
      </svg>
      <span className="hm-map__fade" />
    </div>
  );
}

/**
 * Hero'nun sağ vitrini: harita deseni üzerinde gerçek öne çıkan firmalar.
 * Kartlar masaüstünde desenin üzerine serpiştirilir, mobilde kompakt listeye döner.
 */
function HeroShowcase({ items }: { items: ShowcaseItem[] }) {
  return (
    <aside className="hm-showcase" aria-labelledby="hm-vitrin">
      <p className="hm-showcase__label" id="hm-vitrin">
        Öne çıkan firmalar
      </p>

      <div className="hm-showcase__cards">
        {items.map((item, i) => (
          <Link key={item.id} className={`hm-mcard hm-mcard--${i + 1}`} to={`/firma/${item.slug}`}>
            <span className="hm-mcard__avatar" aria-hidden="true">
              {item.photo ? <img src={item.photo} alt="" loading="lazy" /> : item.initials}
            </span>
            <span className="hm-mcard__body">
              <span className="hm-mcard__name">{item.name}</span>
              <span className="hm-mcard__cat">{item.categoryName}</span>
            </span>
          </Link>
        ))}
      </div>
    </aside>
  );
}

/** Görünür olan bölümleri tek seferlik reveal ile ortaya çıkarır. */
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
   * Türetilmiş veriler tek geçişte üretilir ve useMemo ile sabitlenir.
   * Hero araması her tuş vuruşunda rerender üretir; memo olmadan her tuşta
   * listCompanies ×2 + kategori başına 2 sayaç + ilçe başına 1 sayaç yeniden
   * koşardı. Memo ile yalnızca ilk render'da hesaplanır.
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
   * 100+ kategoriyi ana sayfaya dökmek yerine en dolu 8 tanesi gösterilir;
   * tamamı "Tüm kategoriler" bağlantısında. Sayılar uydurulmaz — 0 ise 0 yazar.
   */
  // Gerçek firma sayısına göre sıralı tüm kategoriler (şerit ve karolar bunu kullanır).
  const sortedCategories = useMemo(
    () =>
      categories
        .map((category) => ({ category, count: categoryCounts.get(category.id) ?? 0 }))
        .sort((a, b) => b.count - a.count || a.category.name.localeCompare(b.category.name, "tr")),
    [categories, categoryCounts],
  );

  const categoryTiles = useMemo(
    () => sortedCategories.slice(0, CATEGORY_TILES),
    [sortedCategories],
  );

  // Hero: en çok firmaya sahip ilk dört kategori (sayaçlar veriden gelir).
  const heroCategories = useMemo(() => sortedCategories.slice(0, 4), [sortedCategories]);

  /*
   * Sağ vitrin: yalnız yayında, öne çıkan ve kategorisi bulunan firmalar.
   * Görseli olmayan firma mevcut monogram avatarıyla gösterilir; eksik
   * kayıtlar (kategori/ad/slug yok) listeye hiç girmez. Sabit firma yok.
   */
  const showcase = useMemo(() => {
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const seen = new Set<string>();
    const items: ShowcaseItem[] = [];
    for (const co of featured) {
      if (items.length === 5) break;
      if (!co.published || !co.featured) continue;
      if (!co.name.trim() || !co.slug || seen.has(co.id)) continue;
      const category = categoryById.get(co.categoryId);
      if (!category) continue;
      seen.add(co.id);
      items.push({
        id: co.id,
        slug: co.slug,
        name: co.name,
        photo: firmPhoto(co.images),
        initials: firmInitials(co.name),
        categoryName: category.name,
      });
    }
    return items;
  }, [featured, categories]);

  /*
   * Şerit çipleri. Marquee iki kopyayla dikişsiz döner; ikinci kopya
   * ekran okuyucudan ve sekme sırasından çıkarılır.
   */
  const stripChips = (duplicate: boolean) =>
    sortedCategories.map(({ category }) => (
      <Link
        key={category.id}
        className="hm-chip"
        to={`/kategori/${category.slug}`}
        tabIndex={duplicate ? -1 : undefined}
      >
        <span className="hm-chip__icon" aria-hidden="true">
          <CategoryGlyph name={category.name} size={18} />
        </span>
        {category.name}
      </Link>
    ));

  // Klavye odağı şeritten çıkınca tarayıcının odak için kaydırdığı konumu geri
  // al: aksi hâlde animasyon döngü sonunda boş alan gösterir.
  const resetStripScroll: FocusEventHandler<HTMLDivElement> = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      event.currentTarget.scrollLeft = 0;
    }
  };

  // FirmGrid id listesi her keystroke'ta yeniden kurulmasın. Set ile
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

  /*
   * Hero kelime listesi: havuzdaki ifadeler yalnız sistemde karşılığı olan
   * kategorilerle eşleşiyorsa gösterilir. Kategori listesi veriden geldiği
   * için eşleşme çalışma anında yapılır.
   */
  const heroWords = useMemo(() => {
    const names = categories.map((c) => c.name.toLocaleLowerCase("tr"));
    const matched = HERO_WORD_POOL.filter(({ match }) =>
      names.some((name) => match.test(name)),
    ).map(({ word }) => word);
    return matched.length > 1 ? matched : ["firmayı"];
  }, [categories]);

  // İlçe rayı: gerçekten firması olan ilçeler (sıfırlar gösterilmez).
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
      title="RehberiX — Afyonkarahisar'daki Firmaları Kolayca Bulun"
      description="Afyonkarahisar ve ilçelerindeki güvenilir firmaları kategori, ilçe ve arama ile keşfedin."
      canonicalPath="/"
      jsonLd={HOMEPAGE_JSON_LD}
    >
      <div className="page-home" ref={revealRef}>
        {/* ============ HERO — arama merkezli, haritasız ============ */}
        <section className="hm-hero" aria-labelledby="ana-baslik">
          <div className="hm-hero__glow" aria-hidden="true" />
          <HeroMap />
          <div className="container hm-hero__inner">
            <HeroTitle words={heroWords} />

            {/* Kategori kartları: sayılar ve sıra veritabanındaki güncel firmalardan. */}
            <div className="hm-pick">
              <p className="hm-pick__eyebrow">Hangisine bakalım?</p>
              <div className="hm-cats">
                {heroCategories.map(({ category, count }) => (
                  <Link key={category.id} className="hm-cat" to={`/kategori/${category.slug}`}>
                    <span className="hm-cat__icon" aria-hidden="true">
                      <CategoryGlyph name={category.name} size={20} />
                    </span>
                    <span className="hm-cat__body">
                      <span className="hm-cat__name">{category.name}</span>
                      <span className="hm-cat__count">{count} firma</span>
                    </span>
                    <ArrowRight className="hm-cat__go" size={17} strokeWidth={2} aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </div>

            <form className="hm-search" role="search" onSubmit={submitSearch}>
              <label className="hm-search__field hm-search__field--q">
                <Search size={18} strokeWidth={2} aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Firma adı, hizmet veya ilçe ara"
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

            <div className="hm-hero__meta">
              {/* Gerçek sayaçlar — dekoratif istatistik kutusu değil, tek satır künye. */}
              <p className="hm-hero__stats">
                <span>
                  <strong>{companies.length}</strong> firma
                </span>
                <span className="hm-hero__dot" aria-hidden="true" />
                <span>
                  <strong>{categories.length}</strong> kategori
                </span>
              </p>
              <Link className="hm-hero__add" to="/iletisim">
                İşletmenizi rehbere ekleyin
                <ArrowRight size={14} strokeWidth={2.2} aria-hidden="true" />
              </Link>
            </div>

            {showcase.length > 0 && <HeroShowcase items={showcase} />}
          </div>

          {/* Kategoriler şeridi: hero'nun en altında kesintisiz sağdan sola akar. */}
          {sortedCategories.length > 0 && (
            <div
              className="hm-strip"
              role="region"
              aria-label="Kategoriler"
              onBlur={resetStripScroll}
            >
              <div className="hm-strip__track">
                <div className="hm-strip__group">{stripChips(false)}</div>
                <div className="hm-strip__group" aria-hidden="true">
                  {stripChips(true)}
                </div>
              </div>
            </div>
          )}
        </section>

        <div className="home-body">
          {/* ============ KATEGORİLER ============ */}
          <section className="section container" aria-labelledby="kategoriler">
            <div className="section__head" data-reveal>
              <div className="section__intro">
                <h2 className="section__title" id="kategoriler">
                  Kategorilere göz atın
                </h2>
                <p className="section__desc">Aradığınız hizmeti seçin, o alandaki firmaları görün.</p>
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
                    <CategoryGlyph name={category.name} size={19} />
                  </span>
                  <span className="cat-tile__body">
                    <span className="cat-tile__name">{category.name}</span>
                    <span className="cat-tile__count">{count} firma</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {/* ============ ÖNE ÇIKAN FİRMALAR (beyaz bant) ============ */}
          <div className="hm-band">
            <section className="section container" aria-labelledby="onecikar">
              <div className="section__head" data-reveal>
                <div className="section__intro">
                  <h2 className="section__title" id="onecikar">
                    Öne çıkan firmalar
                  </h2>
                  <p className="section__desc">
                    Rehberde öne çıkan işletmeler ve iletişim bilgileri.
                  </p>
                </div>
                <Link to="/firmalar" className="section__link">
                  Tümünü gör
                  <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
                </Link>
              </div>
              <div className="hm-band__grid" data-reveal>
                <FirmGrid ids={featuredIds} variant="featured" />
              </div>
            </section>
          </div>

          {/* ============ BÖLGELER — tek satırlık kompakt şerit ============ */}
          {city && districts.length > 0 && (
            <section className="section container" aria-labelledby="bolgeler">
              <div className="hm-regions" data-reveal>
                <div className="hm-regions__lead">
                  <h2 className="hm-regions__title" id="bolgeler">
                    İlçeye göre keşfedin
                  </h2>
                  <p className="hm-regions__desc">{city.name} genelinde firmalar</p>
                </div>
                <div className="hm-regions__chips">
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
                <Link to={`/sehir/${city.slug}`} className="section__link hm-regions__all">
                  Şehri gör
                  <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
                </Link>
              </div>
            </section>
          )}

          {/* ============ NASIL ÇALIŞIR — üç kısa adım ============ */}
          <section className="section container" aria-labelledby="nasil">
            <div className="section__head" data-reveal>
              <div className="section__intro">
                <h2 className="section__title" id="nasil">
                  Nasıl çalışır?
                </h2>
                <p className="section__desc">Üç adımda doğru işletmeye ulaşın.</p>
              </div>
            </div>
            <ol className="hm-steps">
              {STEPS.map((step, i) => (
                <li
                  className="hm-step"
                  key={step.title}
                  data-reveal
                  style={{ "--rd": i } as React.CSSProperties}
                >
                  <span className="hm-step__num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div className="hm-step__body">
                    <h3>{step.title}</h3>
                    <p>{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* ============ İŞLETME CTA ============ */}
          <section className="section container">
            <div className="partner-cta" data-reveal>
              <div className="partner-cta__copy">
                <h2>İşletmenizi rehbere ekleyin</h2>
                <p>
                  Firmanızı kategorisi ve ilçesiyle birlikte rehbere ekletin; müşterileriniz sizi
                  kolayca bulsun.
                </p>
              </div>
              <div className="partner-cta__actions">
                <Link className="btn btn--light" to="/iletisim">
                  İletişime geçin
                  <ArrowRight size={16} strokeWidth={2.2} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </SEO>
  );
}
