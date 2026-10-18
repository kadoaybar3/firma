import { Link, useParams } from "react-router-dom";
import { SEO } from "../components/SEO";
import { FirmGrid } from "../components/FirmCard";
import { EmptyState } from "../components/ui";
import { getCompanyBySlug, getCityById, listCategories, listCompanies } from "../lib/repo";
import { isOpenNow, mapLink } from "../lib/hours";

export default function FirmDetailPage() {
  const { slug } = useParams();
  const company = slug ? getCompanyBySlug(slug) : undefined;

  if (!company || !company.published) {
    return (
      <SEO title="Firma bulunamadı | Firma Rehberi">
        <div className="section container" style={{ padding: "48px 16px" }}>
          <EmptyState
            icon="🚧"
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

  const category = listCategories().find((c) => c.id === company.categoryId);
  const city = getCityById(company.cityId);
  const open = isOpenNow(company.hours);
  const related = listCompanies({ categoryId: company.categoryId })
    .filter((c) => c.id !== company.id)
    .slice(0, 3);

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";
  const waPhone = company.socials.whatsapp?.replace(/\D/g, "") ?? "";

  return (
    <SEO
      title={`${company.name} | Firma Rehberi`}
      description={`${company.name} — ${category?.name}, ${city?.name} / ${company.district}. ${
        open ? "Şu an açık" : "Şu an kapalı"
      }, telefon: ${company.phone}`}
    >
      <div className="container" style={{ paddingTop: 16, paddingBottom: 36 }}>
        {/* Yol kırıntısı */}
        <nav className="breadcrumb" aria-label="Konum">
          <Link to="/">Ana sayfa</Link>
          <span>›</span>
          {city && <Link to={`/sehir/${city.slug}`}>{city.name}</Link>}
          <span>›</span>
          {category && <Link to={`/kategori/${category.slug}`}>{category.name}</Link>}
          <span>›</span>
          <span>{company.name}</span>
        </nav>

        <div className="detail-grid">
          {/* SOL — ana içerik */}
          <div>
            <div className="detail-banner" role="img" aria-label={`${company.name} görseli`}>
              {company.images.map((img) => (
                <span
                  key={img}
                  style={{
                    width: 72,
                    height: 72,
                    background: "#fff",
                    borderRadius: 18,
                    display: "grid",
                    placeItems: "center",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  {img}
                </span>
              ))}
            </div>

            <div className="flex-between mt-14">
              <span className="company-card__cat" style={{ alignSelf: "auto" }}>
                {category?.icon} {category?.name}
              </span>
              <span className={`badge ${open ? "badge-green" : "badge-gray"}`}>
                {open ? "Şu an açık" : "Şu an kapalı"}
              </span>
            </div>

            <h1 style={{ fontSize: "1.65rem", margin: "10px 0 6px" }}>{company.name}</h1>
            <p className="text-muted small">
              {city?.name} / {company.district} • Kayıt tarihi:{" "}
              {new Date(company.createdAt).toLocaleDateString("tr-TR")}
            </p>

            <div className="card card__pad mt-14">
              <h2 style={{ fontSize: "1.05rem", fontWeight: 800, marginBottom: 8 }}>
                İşletme hakkında
              </h2>
              <p className="text-muted" style={{ lineHeight: 1.65 }}>
                {company.description}
              </p>
            </div>

            <div className="card card__pad mt-14">
              <h2 style={{ fontSize: "1.05rem", fontWeight: 800, marginBottom: 8 }}>
                Firma fotoğrafları <span className="text-muted small">(örnek görsel rozetleri)</span>
              </h2>
              <div className="detail-images">
                {company.images.map((img, i) => (
                  <div key={`${img}-${i}`} className="detail-images__item" aria-hidden="true">
                    {img}
                  </div>
                ))}
              </div>
            </div>

            <div className="card card__pad mt-14">
              <h2 style={{ fontSize: "1.05rem", fontWeight: 800, marginBottom: 10 }}>
                Çalışma saatleri
              </h2>
              <table className="table" style={{ minWidth: 380 }}>
                <tbody>
                  <tr>
                    <td>Hafta içi</td>
                    <td style={{ fontWeight: 700 }}>{company.hours.weekday}</td>
                  </tr>
                  <tr>
                    <td>Cumartesi</td>
                    <td style={{ fontWeight: 700 }}>{company.hours.saturday}</td>
                  </tr>
                  <tr>
                    <td>Pazar</td>
                    <td style={{ fontWeight: 700 }}>{company.hours.sunday}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* SAĞ — iletişim kartı */}
          <aside>
            <div className="card card__pad" style={{ position: "sticky", top: 88 }}>
              <h2 style={{ fontSize: "1.05rem", fontWeight: 800, marginBottom: 12 }}>
                İletişim bilgileri
              </h2>
              <div className="kv-list">
                <div className="kv-list__row">
                  <span className="kv-list__label">Telefon</span>
                  <a href={`tel:${company.phone.replace(/\s/g, "")}`}>{company.phone}</a>
                </div>
                <div className="kv-list__row">
                  <span className="kv-list__label">Adres</span>
                  <span>{company.address}</span>
                </div>
                <div className="kv-list__row">
                  <span className="kv-list__label">E-posta</span>
                  <span>
                    {company.email ? (
                      <a href={`mailto:${company.email}`}>{company.email}</a>
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
                <div className="kv-list__row">
                  <span className="kv-list__label">Web sitesi</span>
                  <span>
                    {company.website ? (
                      <a href={company.website} target="_blank" rel="noopener noreferrer">
                        {company.website.replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
                <div className="kv-list__row">
                  <span className="kv-list__label">Sosyal</span>
                  <span className="form-row" style={{ gap: 6 }}>
                    {company.socials.instagram && (
                      <a className="chip" href={`https://instagram.com/${company.socials.instagram}`} target="_blank" rel="noopener noreferrer">
                        Instagram
                      </a>
                    )}
                    {company.socials.facebook && (
                      <a className="chip" href={`https://facebook.com/${company.socials.facebook}`} target="_blank" rel="noopener noreferrer">
                        Facebook
                      </a>
                    )}
                    {waPhone && (
                      <a className="chip" href={`https://wa.me/${waPhone}`} target="_blank" rel="noopener noreferrer">
                        WhatsApp
                      </a>
                    )}
                    {!company.socials.instagram && !company.socials.facebook && !waPhone && "—"}
                  </span>
                </div>
              </div>

              <div className="map-cta mt-14">
                <a
                  className="btn btn--primary btn--block"
                  href={`tel:${company.phone.replace(/\s/g, "")}`}
                >
                  📞 Şimdi ara
                </a>
                <a
                  className="btn btn--ghost btn--block"
                  href={mapLink({ name: company.name, address: company.address })}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  🗺️ Yol tarifi al
                </a>
              </div>
            </div>

            <div className="card card__pad mt-14">
              <h2 style={{ fontSize: "0.98rem", fontWeight: 800, marginBottom: 8 }}>
                Bu sayfayı paylaşın
              </h2>
              <div className="form-row">
                <a
                  className="btn btn--sm"
                  href={`https://wa.me/?text=${encodeURIComponent(`${company.name} — ${shareUrl}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  WhatsApp
                </a>
                <button
                  className="btn btn--sm"
                  onClick={() => navigator.clipboard?.writeText(shareUrl).catch(() => undefined)}
                  type="button"
                >
                  Bağlantıyı kopyala
                </button>
              </div>
            </div>
          </aside>
        </div>

        {/* Benzer firmalar */}
        {related.length > 0 && (
          <section className="mt-18" aria-labelledby="benzer">
            <h2 className="section__title" id="benzer">
              {category?.name} kategorisindeki diğer firmalar
            </h2>
            <FirmGrid ids={related.map((c) => c.id)} />
          </section>
        )}
      </div>
    </SEO>
  );
}
