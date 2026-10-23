import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  ChevronRight,
  Grid2x2,
  MapPin,
  PhoneCall,
  Search,
  Store,
} from "lucide-react";
import { SEO } from "../components/SEO";
import { FirmGrid } from "../components/FirmCard";
import { CategoryGlyph } from "../components/CategoryGlyph";
import { listCategories, listCities, listCompanies } from "../lib/repo";

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

/** Ana sayfada gösterilecek kategori karosu sayısı (4 kolon × 2 satır). */
const CATEGORY_TILES = 8;

export default function HomePage() {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [heroCat, setHeroCat] = useState("");
  const [heroCity, setHeroCity] = useState("");

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
      {/* KARŞILAMA — ölçülü yükseklik; beyan değil, arama odaklı. */}
      <section className="hero">
        <div className="container hero__inner">

          <h1 className="hero__title">
            Doğru firmaya,
            <br />
            kolayca ulaşın
          </h1>
          <p className="hero__subtitle">
            İhtiyacınız olan ürün ve hizmeti sunan işletmeleri bulun; telefon, adres ve çalışma
            saatlerine tek ekrandan ulaşın.
          </p>

          <form className="search-panel" role="search" onSubmit={submitSearch}>
            <div className="search-panel__row">
              <label className="search-panel__query">
                <Search size={19} strokeWidth={1.9} aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Firma adı, hizmet veya anahtar kelime"
                  aria-label="Firma arama"
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                />
              </label>
              <span className="search-panel__divider" aria-hidden="true" />
              <label className="search-panel__select">
                <Grid2x2 size={16} strokeWidth={1.9} aria-hidden="true" />
                <select
                  aria-label="Kategori seç"
                  value={heroCat}
                  onChange={(e) => setHeroCat(e.target.value)}
                >
                  <option value="">Tüm kategoriler</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {cities.length > 0 && (
                <label className="search-panel__select">
                  <MapPin size={16} strokeWidth={1.9} aria-hidden="true" />
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
              <button className="btn btn--primary search-panel__submit" type="submit">
                <Search size={17} strokeWidth={2.1} aria-hidden="true" />
                <span>Ara</span>
              </button>
            </div>
            {/* Gerçek sayaçlar — dekoratif istatistik kutusu değil, tek satır künye. */}
            <div className="search-panel__meta">
              <span>
                <strong>{companies.length}</strong> firma
              </span>
              <span className="search-panel__sep" aria-hidden="true" />
              <span>
                <strong>{categories.length}</strong> kategori
              </span>
              {city && (
                <>
                  <span className="search-panel__sep" aria-hidden="true" />
                  <span>{city.name}</span>
                </>
              )}
            </div>
          </form>
        </div>
      </section>

      <div className="home-body">
        {/* KATEGORİLER */}
        <section className="section container" aria-labelledby="kategoriler">
          <div className="section__head">
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
            {categoryTiles.map(({ category, count }) => (
              <Link key={category.id} className="cat-tile" to={`/kategori/${category.slug}`}>
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

        {/* ÖNE ÇIKANLAR */}
        <section className="section container" aria-labelledby="onecikar">
          <div className="section__head">
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
          <FirmGrid ids={featuredIds} variant="featured" />
        </section>

        {/* NASIL ÇALIŞIR */}
        <section className="section container" aria-labelledby="nasil">
          <div className="section__head">
            <div className="section__intro">
              <span className="section__eyebrow">Rehber</span>
              <h2 className="section__title" id="nasil">
                Nasıl çalışır?
              </h2>
              <p className="section__desc">Dört adımda doğru işletmeye ulaşın.</p>
            </div>
          </div>
          <div className="how-grid">
            <div className="how-card">
              <span className="how-card__icon" aria-hidden="true">
                <Search size={18} strokeWidth={1.9} />
              </span>
              <h3>Arayın veya kategori seçin</h3>
              <p>Firma adı, hizmet ya da ilçe ile saniyeler içinde aradığınız işletmeyi bulun.</p>
            </div>
            <div className="how-card">
              <span className="how-card__icon" aria-hidden="true">
                <Building2 size={18} strokeWidth={1.9} />
              </span>
              <h3>Firma sayfasını inceleyin</h3>
              <p>Telefon, açık adres, çalışma saatleri ve harita bağlantısı tek sayfada.</p>
            </div>
            <div className="how-card">
              <span className="how-card__icon" aria-hidden="true">
                <PhoneCall size={18} strokeWidth={1.9} />
              </span>
              <h3>İletişime geçin</h3>
              <p>Tek dokunuşla arayın, WhatsApp'tan yazın veya yol tarifi alın.</p>
            </div>
            <div className="how-card">
              <span className="how-card__icon" aria-hidden="true">
                <Store size={18} strokeWidth={1.9} />
              </span>
              <h3>İşletmenizi ekleyin</h3>
              <p>Firmanız rehberde yer alsın; müşterileriniz sizi arama motorlarında bulsun.</p>
            </div>
          </div>
        </section>

        {/* İŞLETME CTA */}
        <section className="section container">
          <div className="partner-cta">
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
    </SEO>
  );
}
