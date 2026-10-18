import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { SEO } from "../components/SEO";
import { FirmGrid } from "../components/FirmCard";
import { EmptyState } from "../components/ui";
import {
  districtCompanyCount,
  getCityBySlug,
  listCategories,
  listCities,
  listCompanies,
} from "../lib/repo";
import type { Category } from "../lib/types";

/**
 * Firma arama/listeleme sayfası. Aynı bileşen;
 *  /firmalar?q=…&kategori=&sehir=&ilce=
 *  /kategori/:catSlug
 *  /sehir/:citySlug
 *  /sehir/:citySlug/:district
 * yollarını karşılar (SEO dostu URL mimarisi).
 */
export default function FirmsPage() {
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading] = useState(false); // Demo verisi anlık; gerçek API bu alanı koşullu doldurur

  // Kategori çözümü
  let selectedCategory: Category | undefined;
  if (params.catSlug) selectedCategory = listCategories().find((c) => c.slug === params.catSlug);
  const qCat = searchParams.get("kategori");
  if (!selectedCategory && qCat) selectedCategory = listCategories().find((c) => c.slug === qCat);

  // Şehir / ilçe çözümü — yol parametresi yoksa tüm şehirler gösterilir
  const cityParam = params.citySlug ?? searchParams.get("sehir") ?? undefined;
  const city = cityParam ? getCityBySlug(cityParam) : undefined;
  const districtParam =
    params.district ??
    (searchParams.get("ilce") ? decodeURIComponent(searchParams.get("ilce")!) : undefined);
  // URL'deki küçük harfli ilçe adını kanonik forma çevir (başlıkta doğru görünsün)
  const canonicalDistrict = city?.districts.find(
    (d) => d.toLocaleLowerCase("tr") === districtParam,
  );

  const queryText = searchParams.get("q") ?? "";

  const results = useMemo(() => {
    return listCompanies({
      q: queryText || undefined,
      categoryId: selectedCategory?.id,
      citySlug: city?.slug,
      district: canonicalDistrict ?? districtParam,
    });
  }, [queryText, selectedCategory, city, canonicalDistrict, districtParam]);

  const title = selectedCategory
    ? `${selectedCategory.name} — Firmalar`
    : canonicalDistrict
      ? `${city?.name ?? ""} / ${canonicalDistrict} Firmaları`
      : city
        ? `${city.name} Firmaları`
        : "Tüm Firmalar";

  function updateParam(kind: "kategori" | "sehir" | "ilce", value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(kind, kind === "ilce" ? value.toLowerCase() : value);
    else next.delete(kind);
    if (kind !== "ilce") next.delete("ilce"); // şehir/kategori değişince ilçe sıfırlanır
    setSearchParams(next, { replace: true });
  }

  return (
    <SEO title={`${title} | Firma Rehberi`} description={`${title} — telefon, adres, çalışma saatleri ve yol tarifi bilgileriyle.`}>
      {/* Yol kırıntısı */}
      <nav className="container breadcrumb" style={{ marginTop: 16 }} aria-label="Konum">
        <b>
          <Link to="/">Ana sayfa</Link>
        </b>
        <span>›</span>
        <span>{title}</span>
      </nav>

      <section className="section container" style={{ paddingTop: 12 }}>
        <div className="section__head">
          <div>
            <h2 className="section__title">{title}</h2>
            <p className="section__desc">
              Firma adı ya da hizmet adıyla arayın; kategori, şehir ve ilçe filtreleriyle daraltın.
            </p>
          </div>
          <span className="section__count">
            {loading ? "Yükleniyor…" : `${results.length} firma`}
          </span>
        </div>

        {/* Filtre çubuğu */}
        <div className="filter-bar">
          <input
            className="input"
            type="search"
            placeholder="🔍 Firma ara…"
            aria-label="Arama terimi"
            defaultValue={queryText}
            onChange={(e) => updateParamQ(e.target.value)}
          />
          <select
            className="input"
            aria-label="Kategori"
            value={selectedCategory?.slug ?? ""}
            onChange={(e) => updateParam("kategori", e.target.value)}
          >
            <option value="">Tüm kategoriler</option>
            {listCategories().map((c) => (
              <option key={c.id} value={c.slug}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            aria-label="Şehir"
            value={city?.slug ?? ""}
            onChange={(e) => {
              updateParam("sehir", e.target.value);
              const nextCity = listCities().find((c) => c.slug === e.target.value);
              if (nextCity) {
                const next = new URLSearchParams(searchParams);
                next.delete("ilce");
                setSearchParams(next, { replace: true });
              }
            }}
          >
            <option value="">Tüm şehirler</option>
            {listCities().map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            aria-label="İlçe"
            value={districtParam ?? ""}
            onChange={(e) => updateParam("ilce", e.target.value)}
            disabled={!city}
          >
            <option value="">Tüm ilçeler</option>
            {city?.districts.map((d) => (
              <option key={d} value={d.toLowerCase()}>
                {d} ({districtCompanyCount(city.id, d)})
              </option>
            ))}
          </select>
        </div>

        {/* Sonuçlar */}
        {results.length > 0 ? (
          <FirmGrid ids={results.map((c) => c.id)} />
        ) : (
          <EmptyState
            icon="🕵️"
            title="Sonuç bulunamadı"
            description="Arama teriminizi değiştirin ya da filtreleri temizleyip tüm firmaları listeleyin."
            action={
              <button
                className="btn btn--primary"
                onClick={() => setSearchParams({}, { replace: true })}
              >
                Filtreleri temizle
              </button>
            }
          />
        )}

        {/* Kategori sayfasına gelindiğinde benzer kategori önerisi */}
        {selectedCategory && (
          <div className="mt-18">
            <span className="text-muted small">
              Başka kategorilere bakın:{" "}
              {listCategories()
                .filter((c) => c.id !== selectedCategory.id)
                .slice(0, 4)
                .map((c) => (
                  <Link key={c.id} to={`/kategori/${c.slug}`} style={{ marginRight: 10 }}>
                    {c.name}
                  </Link>
                ))}
            </span>
          </div>
        )}
      </section>
    </SEO>
  );

  function updateParamQ(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value.trim()) next.set("q", value.trim());
    else next.delete("q");
    setSearchParams(next, { replace: true });
  }
}
