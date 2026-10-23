import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Building2,
  CalendarClock,
  Camera,
  Check,
  Clock,
  Copy,
  Globe,
  Mail,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Share2,
  ThumbsUp,
} from "lucide-react";
import { SEO } from "../components/SEO";
import { FirmGrid } from "../components/FirmCard";
import { CategoryGlyph } from "../components/CategoryGlyph";
import { EmptyState } from "../components/ui";
import { getCompanyBySlug, getCityById, listCategories, listCompanies } from "../lib/repo";
import { isOpenNow, mapLink } from "../lib/hours";
import {
  buildBreadcrumbJsonLd,
  buildLocalBusinessJsonLd,
  locationOriginSafe,
  safeExternalUrl,
} from "../lib/seo";

/*
 * FİRMA PROFİLİ — profesyonel işletme profili
 *
 * Masaüstü: tam genişlikte kimlik bandı + iki kolon (içerik / iletişim).
 * Mobil: aynı sıra tek kolona iner; telefon ve yol tarifi yüzen çubuktan
 * tek dokunuşla erişilir. Veri disiplini: olmayan bilgi için satır, bağlantı
 * veya bölüm üretilmez; emoji yerine çizgi ikon kullanılır.
 */

const dayNames = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"] as const;

/** Yalnız gerçek http(s) görselleri kullan — emoji/demet değerleri çizilmez. */
function photosOf(images: string[] | undefined): string[] {
  return (images ?? []).filter((src) => /^https?:\/\//i.test(src));
}

export default function FirmDetailPage() {
  const { slug } = useParams();
  const company = slug ? getCompanyBySlug(slug) : undefined;

  const [copied, setCopied] = useState(false);

  // Hooks kuralı: tüm hook'lar erken dönüşten ÖNCE çağrılır — bulundu/bulunamadı
  // durumları arasında hook sayısı sabit kalır (rotalar arası geçişte crash olmaz).
  const category = company ? listCategories().find((c) => c.id === company.categoryId) : undefined;
  const city = company ? getCityById(company.cityId) : undefined;
  const canonicalPath = company ? `/firma/${company.slug}` : "";
  const pageUrl = canonicalPath ? `${locationOriginSafe()}${canonicalPath}` : "";

  // JSON-LD düğümleri: yalnızca doğrulanmış veri; girdi değişmedikçe yeniden üretme
  const jsonLd = useMemo(
    () => {
      if (!company || !company.published) return [];
      return [
        buildLocalBusinessJsonLd({
          company,
          categoryName: category?.name,
          cityName: city?.name,
          pageUrl,
        }),
        buildBreadcrumbJsonLd([
          { name: "Ana sayfa", path: "/" },
          ...(city ? [{ name: city.name, path: `/sehir/${city.slug}` }] : []),
          ...(category ? [{ name: category.name, path: `/kategori/${category.slug}` }] : []),
          { name: company.name, path: canonicalPath },
        ]),
      ];
    },
    [company, category, city, canonicalPath, pageUrl],
  );

  if (!company || !company.published) {
    return (
      <SEO title="Firma bulunamadı | Firma Rehberi" noindex>
        <div className="section container" style={{ padding: "48px 16px" }}>
          <EmptyState
            icon={<Building2 size={30} strokeWidth={1.5} aria-hidden="true" />}
            title="Firma sayfası bulunamadı"
            description="Aradığınız firma kaldırılmış ya da henüz yayınlanmamış olabilir."
            action={
              <Link className="btn btn--primary" to="/firmalar">
                Tüm firmalara dön
              </Link>
            }
          />
        </div>
      </SEO>
    );
  }

  const open = isOpenNow(company.hours);
  const photos = photosOf(company.images);
  const coverPhoto = photos[0];

  const waDigits = company.socials.whatsapp?.replace(/\D/g, "") ?? "";
  // Veri koşulları — mevcut olmayan veri için bağlantı üretilmez
  const telHref = company.phone ? `tel:${company.phone.replace(/\s/g, "")}` : null;
  const mapsHref = company.address
    ? mapLink({ name: company.name, address: company.address })
    : null;
  const waHref = waDigits ? `https://wa.me/${waDigits}` : null;
  const siteHref = safeExternalUrl(company.website);
  const locationText = city ? `${city.name} / ${company.district}` : company.district;
  const cleanSite = siteHref?.replace(/^https?:\/\//, "").replace(/\/$/, "");

  // Saat verisi hiç yoksa açık/kapalı iddiası gösterilmez (yanıltıcı olmasın).
  const hasHours = Boolean(
    company.hours.weekday?.trim() ||
      company.hours.saturday?.trim() ||
      company.hours.sunday?.trim(),
  );

  const todayIndex = new Date().getDay(); // 0 = Pazar
  const hoursRows: Array<[string, string, boolean]> = [
    ["Hafta içi · Pzt–Cum", company.hours.weekday, todayIndex >= 1 && todayIndex <= 5],
    ["Cumartesi", company.hours.saturday, todayIndex === 6],
    ["Pazar", company.hours.sunday, todayIndex === 0],
  ];

  const related = listCompanies({ categoryId: company.categoryId })
    .filter((c) => c.id !== company.id)
    .slice(0, 3);

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const hasSocials = Boolean(
    waHref || company.socials.instagram || company.socials.facebook || siteHref,
  );

  async function copyLink() {
    try {
      await navigator.clipboard?.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Pano erişimi yoksa sessizce geç — kullanıcıya yanlış başarı izlenimi verme */
    }
  }

  return (
    <SEO
      title={`${company.name} | Firma Rehberi`}
      description={`${company.name} — ${category?.name ?? ""}, ${locationText}.${
        hasHours ? (open ? " Şu an açık." : " Şu an kapalı.") : ""
      }${company.phone ? ` Telefon: ${company.phone}` : ""}`}
      canonicalPath={canonicalPath}
      jsonLd={jsonLd}
    >
      <div className="container firm-page">
        <nav className="firm-crumb" aria-label="Sayfa konumu">
          <Link to="/">Ana sayfa</Link>
          <span className="firm-crumb__sep" aria-hidden="true">
            /
          </span>
          {city && (
            <>
              <Link to={`/sehir/${city.slug}`}>{city.name}</Link>
              <span className="firm-crumb__sep" aria-hidden="true">
                /
              </span>
            </>
          )}
          {category && (
            <>
              <Link to={`/kategori/${category.slug}`}>{category.name}</Link>
              <span className="firm-crumb__sep" aria-hidden="true">
                /
              </span>
            </>
          )}
          <span aria-current="page">{company.name}</span>
        </nav>

        {/* KİMLİK BANDI — ad, kategori, konum ve birincil eylemler */}
        <header className="firm-hero">
          <div className="firm-hero__id">
            <span className="firm-hero__avatar" aria-hidden={coverPhoto ? undefined : true}>
              {coverPhoto ? (
                <img src={coverPhoto} alt="" loading="lazy" />
              ) : (
                <CategoryGlyph name={category?.name ?? ""} size={30} />
              )}
            </span>
            <div className="firm-hero__text">
              {category && (
                <Link className="firm-hero__cat" to={`/kategori/${category.slug}`}>
                  <CategoryGlyph name={category.name} size={13} />
                  {category.name}
                </Link>
              )}
              <h1 className="firm-hero__name">{company.name}</h1>
              <div className="firm-hero__meta">
                {locationText && (
                  <span className="firm-hero__loc">
                    <MapPin size={15} strokeWidth={1.9} aria-hidden="true" />
                    {locationText}
                  </span>
                )}
                {hasHours && (
                  <span
                    className={`firm-status ${open ? "firm-status--open" : "firm-status--closed"}`}
                  >
                    <i className="firm-status__dot" aria-hidden="true" />
                    {open ? "Şu an açık" : "Şu an kapalı"}
                  </span>
                )}
              </div>
            </div>
          </div>

          {(telHref || mapsHref) && (
            <div className="firm-hero__actions">
              {telHref && (
                <a className="btn btn--primary" href={telHref}>
                  <Phone size={17} strokeWidth={2} aria-hidden="true" />
                  Telefonla ara
                </a>
              )}
              {mapsHref && (
                <a
                  className="btn btn--secondary"
                  href={mapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Navigation size={17} strokeWidth={2} aria-hidden="true" />
                  Yol tarifi
                </a>
              )}
            </div>
          )}
        </header>

        <div className="firm-layout">
          {/* ANA İÇERİK — açıklama, galeri, çalışma saatleri */}
          <div className="firm-main">
            {company.description && (
              <section className="firm-card" aria-labelledby="firm-about">
                <h2 className="firm-card__title" id="firm-about">
                  Hakkında
                </h2>
                <p className="firm-about">{company.description}</p>
              </section>
            )}

            {photos.length > 0 && (
              <section className="firm-card" aria-labelledby="firm-photos">
                <h2 className="firm-card__title" id="firm-photos">
                  Fotoğraflar
                </h2>
                <div className="firm-gallery">
                  {photos.slice(0, 6).map((src, index) => (
                    <img
                      key={`${src}-${index}`}
                      src={src}
                      alt={`${company.name} — fotoğraf ${index + 1}`}
                      loading="lazy"
                    />
                  ))}
                </div>
              </section>
            )}

            {hasHours && (
              <section className="firm-card" aria-labelledby="firm-hours">
                <div className="firm-card__head">
                  <h2 className="firm-card__title" id="firm-hours">
                    Çalışma saatleri
                  </h2>
                  <span className="firm-card__hint">
                    <Clock size={14} strokeWidth={1.9} aria-hidden="true" />
                    {dayNames[todayIndex]}
                  </span>
                </div>
                <div className="firm-hours">
                  {hoursRows.map(([label, value, isToday]) =>
                    value?.trim() ? (
                      <div
                        key={label}
                        className={`firm-hours__row ${isToday ? "is-today" : ""}`}
                      >
                        <span className="firm-hours__day">
                          {label}
                          {isToday && <span className="firm-hours__badge">Bugün</span>}
                        </span>
                        <span className="firm-hours__val">{value}</span>
                      </div>
                    ) : null,
                  )}
                </div>
              </section>
            )}

            {!company.description && !hasHours && photos.length === 0 && (
              <section className="firm-card">
                <h2 className="firm-card__title">Firma bilgileri</h2>
                <p className="firm-about">
                  Bu firma için henüz ayrıntılı açıklama eklenmemiş. İletişim bilgileri yanda yer
                  alıyor.
                </p>
              </section>
            )}
          </div>

          {/* YAN ALAN — iletişim ve paylaşım */}
          <aside className="firm-aside" aria-label="İletişim bilgileri">
            <section className="firm-card firm-contact">
              <h2 className="firm-card__title">İletişim</h2>

              {company.phone && (
                <div className="firm-contact__phone">
                  <span className="firm-contact__label">Telefon</span>
                  <a href={telHref ?? undefined}>{company.phone}</a>
                </div>
              )}

              <div className="firm-contact__rows">
                {company.address && (
                  <div className="firm-contact__row">
                    <MapPin size={17} strokeWidth={1.9} aria-hidden="true" />
                    <div>
                      <span className="firm-contact__label">Adres</span>
                      <span className="firm-contact__value">{company.address}</span>
                      {mapsHref && (
                        <a
                          className="firm-contact__link"
                          href={mapsHref}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Haritada gör
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {company.email && (
                  <div className="firm-contact__row">
                    <Mail size={17} strokeWidth={1.9} aria-hidden="true" />
                    <div>
                      <span className="firm-contact__label">E-posta</span>
                      <a className="firm-contact__value" href={`mailto:${company.email}`}>
                        {company.email}
                      </a>
                    </div>
                  </div>
                )}

                {siteHref && (
                  <div className="firm-contact__row">
                    <Globe size={17} strokeWidth={1.9} aria-hidden="true" />
                    <div>
                      <span className="firm-contact__label">Web sitesi</span>
                      <a
                        className="firm-contact__value"
                        href={siteHref}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {cleanSite}
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {hasSocials && (
                <div className="firm-socials">
                  {waHref && (
                    <a
                      className="firm-social"
                      href={waHref}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageCircle size={16} strokeWidth={1.9} aria-hidden="true" />
                      WhatsApp
                    </a>
                  )}
                  {company.socials.instagram && (
                    <a
                      className="firm-social"
                      href={`https://instagram.com/${company.socials.instagram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Camera size={16} strokeWidth={1.9} aria-hidden="true" />
                      Instagram
                    </a>
                  )}
                  {company.socials.facebook && (
                    <a
                      className="firm-social"
                      href={`https://facebook.com/${company.socials.facebook}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ThumbsUp size={16} strokeWidth={1.9} aria-hidden="true" />
                      Facebook
                    </a>
                  )}
                </div>
              )}
            </section>

            <section className="firm-card firm-share">
              <h2 className="firm-card__title">Paylaş</h2>
              <div className="firm-share__actions">
                <a
                  className="firm-share__btn"
                  href={`https://wa.me/?text=${encodeURIComponent(`${company.name} — ${shareUrl}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle size={16} strokeWidth={1.9} aria-hidden="true" />
                  WhatsApp
                </a>
                <button type="button" className="firm-share__btn" onClick={copyLink}>
                  {copied ? (
                    <Check size={16} strokeWidth={2} aria-hidden="true" />
                  ) : (
                    <Copy size={16} strokeWidth={1.9} aria-hidden="true" />
                  )}
                  {copied ? "Kopyalandı" : "Bağlantıyı kopyala"}
                </button>
                {typeof navigator.share === "function" && (
                  <button
                    type="button"
                    className="firm-share__btn"
                    onClick={() =>
                      navigator.share({ title: company.name, url: shareUrl }).catch(() => undefined)
                    }
                  >
                    <Share2 size={16} strokeWidth={1.9} aria-hidden="true" />
                    Paylaş
                  </button>
                )}
              </div>
            </section>

            {hasHours && (
              <p className="firm-aside__note">
                <CalendarClock size={15} strokeWidth={1.9} aria-hidden="true" />
                Çalışma saatleri işletme tarafından bildirilmiştir; tatil günlerinde
                değişebilir.
              </p>
            )}
          </aside>
        </div>

        {/* Mobil — yüzen kompakt alt çubuk (yalnızca eylem varsa) */}
        {(telHref || mapsHref) && (
          <div className="firm-mbar" role="navigation" aria-label="Hızlı iletişim">
            {telHref && (
              <a className="btn btn--primary" href={telHref}>
                <Phone size={17} strokeWidth={2} aria-hidden="true" />
                Ara
              </a>
            )}
            {mapsHref && (
              <a className="btn btn--secondary" href={mapsHref} target="_blank" rel="noopener noreferrer">
                <Navigation size={17} strokeWidth={2} aria-hidden="true" />
                Yol tarifi
              </a>
            )}
          </div>
        )}

        {/* BENZER FİRMALAR (tam genişlik, grid altında) */}
        {related.length > 0 && (
          <section className="firm-related" aria-labelledby="firm-related">
            <div className="section__head">
              <div className="section__intro">
                <span className="section__eyebrow">Bu kategoride</span>
                <h2 className="section__title" id="firm-related">
                  Benzer firmalar
                </h2>
              </div>
              {category && (
                <Link className="section__link" to={`/kategori/${category.slug}`}>
                  Tümünü gör
                  <Navigation size={14} strokeWidth={2} aria-hidden="true" />
                </Link>
              )}
            </div>
            <FirmGrid ids={related.map((c) => c.id)} />
          </section>
        )}
      </div>
    </SEO>
  );
}
