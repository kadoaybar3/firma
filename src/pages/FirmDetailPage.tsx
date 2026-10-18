import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { SEO } from "../components/SEO";
import { FirmGrid } from "../components/FirmCard";
import { Lightbox } from "../components/Lightbox";
import { EmptyState } from "../components/ui";
import { getCompanyBySlug, getCityById, listCategories, listCompanies } from "../lib/repo";
import { isOpenNow, mapLink } from "../lib/hours";

/* Premium firma vitrin sayfası.
   Tasarım ilkeleri: sade katmanlar, güçlü tipografi, veri istikrarına saygı —
   eksik veri olduğunda sahte içerik üretilmez, ilgili alan gizlenir. */

/** Metin → sabit renk tonu (sırası değişmeyen, firma-bazlı pastel ton) */
function hashHue(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

const dayNames = [
  "Pazar",
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
] as const;

export default function FirmDetailPage() {
  const { slug } = useParams();
  const company = slug ? getCompanyBySlug(slug) : undefined;
  const [lightbox, setLightbox] = useState<number | null>(null);

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
  const hue = hashHue(company.slug);
  const gallery = company.images.filter(Boolean);

  // Veri koşulları — olmayan bilgi için buton/bağlantı üretilmez
  const telHref = company.phone ? `tel:${company.phone.replace(/\s/g, "")}` : null;
  const mapsHref = company.address
    ? mapLink({ name: company.name, address: company.address })
    : null;
  const waDigits = company.socials.whatsapp?.replace(/\D/g, "") ?? "";
  const waHref = waDigits ? `https://wa.me/${waDigits}` : null;
  const siteHref = company.website?.trim() || null;

  const todayIndex = new Date().getDay(); // 0=Pazar
  const hoursRows: Array<[string, string, boolean]> = [
    ["Hafta içi (Pzt–Cum)", company.hours.weekday, todayIndex >= 1 && todayIndex <= 5],
    ["Cumartesi", company.hours.saturday, todayIndex === 6],
    ["Pazar", company.hours.sunday, todayIndex === 0],
  ];

  const related = listCompanies({ categoryId: company.categoryId })
    .filter((c) => c.id !== company.id)
    .slice(0, 3);

  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  return (
    <SEO
      title={`${company.name} | Firma Rehberi`}
      description={`${company.name} — ${category?.name ?? ""}, ${
        city?.name ? `${city.name} / ${company.district}` : company.district
      }. ${open ? "Şu an açık" : "Şu an kapalı"}${company.phone ? `, telefon: ${company.phone}` : ""}`}
    >
      <div className="container profile">
        {/* Yol kırıntısı */}
        <nav className="profile-crumb breadcrumb" aria-label="Konum">
          <Link to="/">Ana sayfa</Link>
          <span>›</span>
          {city && <Link to={`/sehir/${city.slug}`}>{city.name}</Link>}
          <span>›</span>
          {category && <Link to={`/kategori/${category.slug}`}>{category.name}</Link>}
          <span>›</span>
          <span>{company.name}</span>
        </nav>

        {/* 1 — ÜST BÖLÜM: kapak + kimlik */}
        <section
          className="profile-hero"
          aria-label={`${company.name} vitrin başlığı`}
          style={{
            backgroundImage: `linear-gradient(135deg, hsl(${hue} 48% 20%) 0%, hsl(${(hue + 28) % 360} 55% 38%) 100%)`,
          }}
        >
          <span className="profile-hero__watermark" aria-hidden="true">
            {category?.icon ?? "🏢"}
          </span>
          <div className="profile-hero__inner">
            <span className="profile-avatar" aria-hidden="true">
              {gallery[0] ?? category?.icon ?? "🏢"}
            </span>
            <div className="profile-identity">
              <div className="profile-chiprow">
                {category && (
                  <span className="profile-chip">
                    {category.icon} {category.name}
                  </span>
                )}
                <span
                  className={`profile-chip ${open ? "profile-chip--solid-green" : "profile-chip--solid-gray"}`}
                  style={{ fontWeight: 800 }}
                >
                  {open ? "● Şu an açık" : "○ Şu an kapalı"}
                </span>
              </div>
              <h1>{company.name}</h1>
              {company.description && (
                <p className="profile-tagline">{firstSentence(company.description)}</p>
              )}
              <p className="profile-loc">
                📍 {city?.name ?? ""}{city ? " / " : ""}{company.district}
              </p>
            </div>
          </div>
        </section>

        {/* 2 — İLETİŞİM EYLEMLERİ (yalnızca mevcut veriler) */}
        <section className="profile-actions" aria-label="İletişim eylemleri">
          {telHref && (
            <a className="btn btn--primary profile-cta" href={telHref}>
              📞 Telefonla ara
            </a>
          )}
          {mapsHref && (
            <a className="btn profile-cta profile-cta--ghost" href={mapsHref} target="_blank" rel="noopener noreferrer">
              🧭 Yol tarifi al
            </a>
          )}
          {waHref && (
            <a className="btn profile-cta profile-cta--wa" href={waHref} target="_blank" rel="noopener noreferrer">
              💬 WhatsApp
            </a>
          )}
          {siteHref && (
            <a className="btn profile-cta profile-cta--ghost" href={siteHref} target="_blank" rel="noopener noreferrer">
              🌐 Web sitesi
            </a>
          )}
        </section>

        {/* MOBİL — sabit alt eylem çubuğu (iPhone safe-area uyumlu) */}
        {(telHref || mapsHref) && (
          <div className="profile-mbar" role="navigation" aria-label="Hızlı iletişim">
            {telHref && (
              <a className="btn btn--primary" href={telHref}>
                📞 Ara
              </a>
            )}
            {mapsHref && (
              <a className="btn btn--ghost" href={mapsHref} target="_blank" rel="noopener noreferrer">
                🧭 Yol tarifi
              </a>
            )}
          </div>
        )}

        {/* 3 — FOTOĞRAF GALERİSİ */}
        {gallery.length > 0 && (
          <section className="psection" aria-label="Firma fotoğrafları">
            <h2>Fotoğraflar</h2>
            <div className="pgallery">
              <button
                type="button"
                className="pgallery__main"
                style={{
                  backgroundImage: `linear-gradient(135deg, hsl(${hue} 62% 94%) 0%, hsl(${(hue + 30) % 360} 60% 87%) 100%)`,
                }}
                onClick={() => setLightbox(0)}
                aria-label="Fotoğrafı büyüt"
              >
                {gallery[0]}
              </button>
              {gallery.length > 1 && (
                <div className="pgallery__thumbs">
                  {gallery.map((g, i) => (
                    <button
                      type="button"
                      key={`${g}-${i}`}
                      className={`pgallery__thumb ${i === 0 ? "is-current" : ""}`}
                      style={{
                        backgroundImage: `linear-gradient(135deg, hsl(${(hue + i * 24) % 360} 55% 95%) 0%, hsl(${(hue + 30 + i * 24) % 360} 52% 88%) 100%)`,
                      }}
                      onClick={() => setLightbox(i)}
                      aria-label={`${i + 1}. fotoğrafı büyüt`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* 4 — FİRMA HAKKINDA */}
        {company.description && (
          <section className="psection" aria-label="Firma hakkında">
            <h2>Hakkında</h2>
            <div className="psection__card">
              <p className="profile-about">{company.description}</p>
            </div>
          </section>
        )}

        {/* 6 — ADRES VE ÇALIŞMA SAATLERİ */}
        <section className="psection" aria-label="Adres ve çalışma saatleri">
          <h2>Adres ve çalışma saatleri</h2>
          <div className="profile-two-col">
            {company.address && (
              <div className="psection__card">
                <h3 className="psubtitle">Adres</h3>
                <p className="profile-about profile-about--tight">{company.address}</p>
                {mapsHref && (
                  <a className="plink mt-14" href={mapsHref} target="_blank" rel="noopener noreferrer">
                    🧭 Haritada aç
                  </a>
                )}
              </div>
            )}
            <div className="psection__card">
              <h3 className="psubtitle">
                Çalışma saatleri
                <span className={`badge ${open ? "badge-green" : "badge-gray"}`}>
                  {open ? "şu an açık" : "şu an kapalı"}
                </span>
              </h3>
              <div className="phours">
                {hoursRows.map(([label, value, isToday]) => (
                  <div key={label} className={`phours__row ${isToday ? "is-today" : ""}`}>
                    <span className="phours__day">
                      {isToday && <span aria-hidden="true">🗓</span>} {label}
                      {isToday && (
                        <span className="text-muted" style={{ fontSize: ".78rem" }}>
                          (bugün — {dayNames[todayIndex]})
                        </span>
                      )}
                    </span>
                    <span>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 5+7 — KATEGORİ ve DİJİTAL BAĞLANTILAR */}
        {(category || siteHref || waHref || company.socials.instagram || company.socials.facebook) && (
          <section className="psection" aria-label="Kategori ve dijital bağlantılar">
            <h2>Hizmet alanı ve dijital bağlantılar</h2>
            <div className="psection__card">
              <div className="plinks">
                {category && (
                  <Link className="plink" to={`/kategori/${category.slug}`}>
                    {category.icon} {category.name}
                  </Link>
                )}
                {siteHref && (
                  <a className="plink" href={siteHref} target="_blank" rel="noopener noreferrer">
                    🌐 {siteHref.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                  </a>
                )}
                {company.socials.instagram && (
                  <a className="plink" href={`https://instagram.com/${company.socials.instagram}`} target="_blank" rel="noopener noreferrer">
                    📷 Instagram
                  </a>
                )}
                {company.socials.facebook && (
                  <a className="plink" href={`https://facebook.com/${company.socials.facebook}`} target="_blank" rel="noopener noreferrer">
                    📘 Facebook
                  </a>
                )}
                {waHref && (
                  <a className="plink" href={waHref} target="_blank" rel="noopener noreferrer">
                    💬 WhatsApp
                  </a>
                )}
              </div>
            </div>
          </section>
        )}

        {/* PAYLAŞIM */}
        <section className="psection" aria-label="Bu sayfayı paylaş" style={{ marginTop: 18 }}>
          <div className="psection__card" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span className="text-muted small">Bu dijital vitrini paylaş:</span>
            {waHref && (
              <a
                className="btn btn--sm"
                href={`https://wa.me/?text=${encodeURIComponent(`${company.name} — ${shareUrl}`)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp
              </a>
            )}
            <button
              type="button"
              className="btn btn--sm"
              onClick={() => navigator.clipboard?.writeText(shareUrl).catch(() => undefined)}
            >
              Bağlantıyı kopyala
            </button>
            {(typeof navigator.share === "function" ? (
              <button
                type="button"
                className="btn btn--sm"
                onClick={() =>
                  navigator
                    .share({ title: company.name, url: shareUrl })
                    .catch(() => undefined)
                }
              >
                ⤴ Paylaş
              </button>
            ) : null)}
          </div>
        </section>

        {/* BENZER FİRMALAR */}
        {related.length > 0 && (
          <section className="psection" aria-labelledby="benzer">
            <h2 id="benzer">{category?.name} kategorisindeki diğer vitrinler</h2>
            <FirmGrid ids={related.map((c) => c.id)} />
          </section>
        )}
      </div>

      {/* GALE Rİ LIGHTBOX */}
      {lightbox !== null && (
        <Lightbox
          items={gallery}
          index={lightbox}
          onClose={() => setLightbox(null)}
          onNavigate={setLightbox}
        />
      )}
    </SEO>
  );
}

/** Açıklamanın ilk cümlesi — vitrin başlığında kısa tanıtım olarak kullanılır */
function firstSentence(text: string): string {
  const s = text.trim();
  const idx = s.search(/[.!؟?]/);
  if (idx < 0) return s;
  const sentence = s.slice(0, idx + 1);
  return sentence.length >= 8 ? sentence : s.slice(0, 90);
}
