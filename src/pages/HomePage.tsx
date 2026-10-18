import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SEO } from "../components/SEO";
import { FirmGrid } from "../components/FirmCard";
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

export default function HomePage() {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");

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
    const city = listCities()[0];

    // Kategori + ilçe sayaçları — tüm sayılar tek O(n) geçişte çıkar
    const categoryCounts = new Map<string, number>();
    const districtCounts = new Map<string, number>();
    for (const co of companies) {
      categoryCounts.set(co.categoryId, (categoryCounts.get(co.categoryId) ?? 0) + 1);
      if (city && co.cityId === city.id) {
        districtCounts.set(co.district, (districtCounts.get(co.district) ?? 0) + 1);
      }
    }

    const popularCats = [...categories]
      .map((c) => ({ cat: c, count: categoryCounts.get(c.id) ?? 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      categories,
      companies,
      featured,
      city,
      categoryCounts,
      districtCounts,
      popularCats,
    };
  }, []);

  const { categories, companies, featured, city, categoryCounts, districtCounts, popularCats } = data;

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
    navigate(term.trim() ? `/firmalar?q=${encodeURIComponent(term.trim())}` : "/firmalar");
  }

  return (
    <SEO
      title="Firma Rehberi — Afyonkarahisar'daki Firmaları Kolayca Bulun"
      description="Afyonkarahisar ve ilçelerindeki güvenilir firmaları kategori, ilçe ve arama ile keşfedin."
      canonicalPath="/"
      jsonLd={HOMEPAGE_JSON_LD}
    >
      {/* HERO */}
      <section className="hero">
        <div className="hero__inner">
          <span className="hero__badge">🇹🇷 Afyonkarahisar'ın yerel firma rehberi</span>
          <h1>
            Aradığınız işletmeyi <span className="hero__accent">birkaç saniyede</span> bulun
          </h1>
          <p className="hero__subtitle">
            Yemek, kuyumculuk, otomotiv, sağlık ve daha fazlası — ilçe ilçe, güvenilir firma
            bilgileri tek platformda.
          </p>
          <form className="hero-search" role="search" onSubmit={submitSearch}>
            <span className="hero-search__icon" aria-hidden="true">🔍</span>
            <input
              type="search"
              placeholder="Örn: sacuk, pastane, mermer, nakliyat…"
              aria-label="Firma arama"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
            <button className="btn btn--primary" type="submit">
              Ara
            </button>
          </form>
          <div className="hero-stats">
            <span><strong>{companies.length}</strong> firma</span>
            <span><strong>{categories.length}</strong> kategori</span>
            <span><strong>{city?.districts.length ?? 0}</strong> ilçe</span>
          </div>
        </div>
      </section>

      {/* KATEGORİLER */}
      <section className="section container" aria-labelledby="kategoriler">
        <div className="section__head">
          <div>
            <h2 className="section__title" id="kategoriler">İşletme kategorileri</h2>
            <p className="section__desc">Merkezden öndeki üstesinden dilediğiniz kaydi sıralayın.</p>
          </div>
          <Link to="/firmalar" className="text-muted small">Tümü →</Link>
        </div>
        <div className="category-grid">
          {categories.map((c) => (
            <Link key={c.id} className="category-card" to={`/kategori/${c.slug}`}>
              <span className="category-card__icon" aria-hidden="true">{c.icon}</span>
              {c.name}
              <span className="category-card__count">
                {categoryCounts.get(c.id) ?? 0} firma
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ÖNE ÇIKANLAR */}
      <section className="section container" aria-labelledby="onecikar">
        <div className="section__head">
          <div>
            <h2 className="section__title" id="onecikar">Öne çıkan işletmeler</h2>
            <p className="section__desc">Bölge sakinlerinin yoğun ilgi gösterdiği kayıtlar.</p>
          </div>
        </div>
        <FirmGrid ids={featuredIds} />
      </section>

      {/* POPÜLER KATEGORİLER */}
      <section className="section container" aria-labelledby="populer">
        <div className="section__head">
          <div>
            <h2 className="section__title" id="populer">Popüler kategoriler</h2>
            <p className="section__desc">En çok firma barındıran alanlar.</p>
          </div>
        </div>
        <div className="chip-row">
          {popularCats.map(({ cat }) => (
            <Link key={cat.id} className="chip" to={`/kategori/${cat.slug}`}>
              <span aria-hidden="true">{cat.icon}</span> {cat.name}
            </Link>
          ))}
        </div>
      </section>

      {/* ŞEHİR/İLÇE KEŞFET */}
      {city && (
        <section className="section container" aria-labelledby="kesif">
          <div className="section__head">
            <div>
              <h2 className="section__title" id="kesif">İlçe ilçe keşfedin</h2>
              <p className="section__desc">{city.name} genelinde dilediğiniz ilçedeki işletmeleri listeleyin.</p>
            </div>
          </div>
          <div className="chip-row">
            <Link className="chip" to={`/sehir/${city.slug}`}>
              <span aria-hidden="true">🏙️</span> {city.name} (tümü)
            </Link>
            {city.districts.map((d) => (
              <Link
                key={d}
                className="chip"
                to={`/sehir/${city.slug}/${encodeURIComponent(d.toLowerCase())}`}
              >
                {d}
                <span className="text-muted small">({districtCounts.get(d) ?? 0})</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* NASIL ÇALIŞIR */}
      <section className="section container" aria-labelledby="nasil">
        <div className="section__head">
          <h2 className="section__title" id="nasil">Firma Rehberi ne işe yarar?</h2>
        </div>
        <div className="how-grid">
          <div className="how-card">
            <div className="how-card__step">1</div>
            <h3>Arama veya kategori seçin</h3>
            <p>Firma adı, hizmet adı, ilçe ya da kategoriyle saniyeler içinde aradığınız işletmeyi bulun.</p>
          </div>
          <div className="how-card">
            <div className="how-card__step">2</div>
            <h3>Firmanın sayfasını inceleyin</h3>
            <p>Telefon, açık adres, çalışma saatleri ve harita bağlantısı tek yerde, güncel bilgilerle.</p>
          </div>
          <div className="how-card">
            <div className="how-card__step">3</div>
            <h3>İletişime geçin</h3>
            <p>Tek tuşla arayın, WhatsApp'tan yazın ya da haritadan yol tarifi alın.</p>
          </div>
          <div className="how-card">
            <div className="how-card__step">4</div>
            <h3>İşletmeniz mi var?</h3>
            <p>Firmanızı rehbere ekletin; internette ararken bulunmanızı sağlayan dijital sayfa size özel açılır.</p>
          </div>
        </div>
      </section>

      {/* İŞLETME CTA */}
      <section className="section container">
        <div className="partner-cta">
          <h2>İşletmeniz rehberde yer alsın 🇹🇷</h2>
          <p>
            Firmanızı kategorisi ve ilçesiyle birlikte rehbere ekletin; müşterileriniz sizi arama
            motorlarında kolayca bulsun. Yıllık üyelik sürecinde satış ekibimiz size rehberlik eder.
          </p>
          <div className="form-row">
            <Link className="btn btn--primary" to="/iletisim">
              İletişime geçin
            </Link>
            <Link className="btn btn--ghost" style={{ color: "#fff", borderColor: "rgba(255,255,255,.4)" }} to="/hakkimizda">
              Platform hakkında bilgi alın
            </Link>
          </div>
        </div>
      </section>
    </SEO>
  );
}
