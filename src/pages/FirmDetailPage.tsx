import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { SEO } from "../components/SEO";
import { FirmGrid } from "../components/FirmCard";
import { Lightbox } from "../components/Lightbox";
import { EmptyState } from "../components/ui";
import { getCompanyBySlug, getCityById, listCategories, listCompanies } from "../lib/repo";
import { isOpenNow, mapLink } from "../lib/hours";

/*
 * FİRMA PROFİLİ — premium vitrin (v3 tasarım)
 *
 * Tasarım dili: nötr mürekkep paleti + tek marka vurgusu; saç-doku (hairline)
 * çizgilerle ayrılan tipografik bölümler; süsleme yerine hiyerarşi.
 * Veri disiplini: olmayan bilgi için buton/bağlantı/bölüm üretilmez.
 */

const dayNames = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"] as const;

/** Bölüm başlığı — küçük, harf aralıklı mikroraf (overline) */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="vsec">
      <h2 className="vlabel">{label}</h2>
      {children}
    </section>
  );
}

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
  const gallery = company.images.filter(Boolean);

  // Veri koşulları — mevcut olmayan veri için bağlantı üretilmez
  const telHref = company.phone ? `tel:${company.phone.replace(/\s/g, "")}` : null;
  const mapsHref = company.address ? mapLink({ name: company.name, address: company.address }) : null;
  const waDigits = company.socials.whatsapp?.replace(/\D/g, "") ?? "";
  const waHref = waDigits ? `https://wa.me/${waDigits}` : null;
  const siteHref = company.website?.trim() || null;
  const locationText = city ? `${city.name} / ${company.district}` : company.district;

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
  const cleanSite = siteHref?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const hasLinks = Boolean(siteHref || waHref || company.socials.instagram || company.socials.facebook);

  return (
    <SEO
      title={`${company.name} | Firma Rehberi`}
      description={`${company.name} — ${category?.name ?? ""}, ${locationText}. ${open ? "Şu an açık" : "Şu an kapalı"}${
        company.phone ? `, telefon: ${company.phone}` : ""
      }`}
    >
      <div className="container vprofile">
        <nav className="vcrumb" aria-label="Sayfa konumu">
          <Link to="/">Ana sayfa</Link>
          <span className="vc-sep" aria-hidden="true">
            /
          </span>
          {city && (
            <>
              <Link to={`/sehir/${city.slug}`}>{city.name}</Link>
              <span className="vc-sep" aria-hidden="true">
                /
              </span>
            </>
          )}
          {category && (
            <>
              <Link to={`/kategori/${category.slug}`}>{category.name}</Link>
              <span className="vc-sep" aria-hidden="true">
                /
              </span>
            </>
          )}
          <span aria-current="page">{company.name}</span>
        </nav>

        {/* 1 — HERO: kapak + kimlik */}
        <header className="vhero">
          <div className="vhero__cover" aria-hidden="true" />
          <div className="vhero__head">
            <span className="vhero__avatar" aria-hidden="true">
              {gallery[0] ?? category?.icon ?? "🏢"}
            </span>
            <div className="vhero__id">
              <div className="vhero__meta">
                {category && (
                  <Link className="vhero__cat" to={`/kategori/${category.slug}`}>
                    {category.name}
                  </Link>
                )}
                <span className={`vstatus ${open ? "vstatus--open" : "vstatus--closed"}`}>
                  <i className="vstatus__dot" aria-hidden="true" />
                  {open ? "Şu an açık" : "Şu an kapalı"}
                </span>
              </div>
              <h1 className="vhero__name">{company.name}</h1>
              {company.description && (
                <p className="vhero__tagline">{firstSentence(company.description)}</p>
              )}
              {locationText && (
                <p className="vhero__loc">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M8 14.5S3 9.9 3 6.4A5 5 0 0 1 13 6.4c0 3.5-5 8.1-5 8.1Z"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinejoin="round"
                    />
                    <circle cx="8" cy="6.4" r="1.7" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                  {locationText}
                </p>
              )}
            </div>
          </div>
        </header>

        {/* 2 — İLETİŞİM EYLEMLERİ */}
        {(telHref || mapsHref || waHref || siteHref) && (
          <div className="vactions" aria-label="İletişim eylemleri">
            {telHref && (
              <a className="vbtn vbtn--primary" href={telHref}>
                Telefonla ara
              </a>
            )}
            {mapsHref && (
              <a className="vbtn" href={mapsHref} target="_blank" rel="noopener noreferrer">
                Yol tarifi al
              </a>
            )}
            {waHref && (
              <a className="vbtn" href={waHref} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
            )}
            {siteHref && (
              <a className="vbtn" href={siteHref} target="_blank" rel="noopener noreferrer">
                Web sitesi
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path
                    d="M4 10 10 4M5.5 4H10v4.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            )}
          </div>
        )}

        {/* Mobil — yüzen kompakt alt çubuk (yalnızca eylem varsa) */}
        {(telHref || mapsHref) && (
          <div className="vmbar" role="navigation" aria-label="Hızlı iletişim">
            {telHref && (
              <a className="vbtn vbtn--primary" href={telHref}>
                Ara
              </a>
            )}
            {mapsHref && (
              <a className="vbtn" href={mapsHref} target="_blank" rel="noopener noreferrer">
                Tarif
              </a>
            )}
          </div>
        )}

        {/* 3 — FOTOĞRAF GALERİSİ */}
        {gallery.length > 0 && (
          <Row label="Fotoğraflar">
            <div className="vgal">
              <button
                type="button"
                className="vgal__main"
                onClick={() => setLightbox(0)}
                aria-label="Ana fotoğrafı büyüt"
              >
                {gallery[0]}
              </button>
              {gallery.length > 1 && (
                <div className="vgal__thumbs">
                  {gallery.map((g, i) => (
                    <button
                      type="button"
                      key={`${g}-${i}`}
                      className="vgal__thumb"
                      onClick={() => setLightbox(i)}
                      aria-label={`${i + 1}. fotoğrafı büyüt`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Row>
        )}

        {/* 4 — FİRMA HAKKINDA */}
        {company.description && (
          <Row label="Hakkında">
            <p className="vabout">{company.description}</p>
          </Row>
        )}

        {/* 5 — ADRES VE ÇALIŞMA SAATLERİ (tek panel, iki kolon) */}
        {(company.address || company.phone) && (
          <Row label="Ziyaret bilgileri">
            <div className="vpanel">
              {company.address && (
                <div className="vpanel__col">
                  <h2>Adres</h2>
                  <p className="vaddr">{company.address}</p>
                  {mapsHref && (
                    <a className="vinline" href={mapsHref} target="_blank" rel="noopener noreferrer">
                      Haritada aç
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path
                          d="M4 10 10 4M5.5 4H10v4.5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </a>
                  )}
                </div>
              )}
              {company.phone && (
                <div className="vpanel__col">
                  <h2>İletişim</h2>
                  <p className="vaddr">
                    {telHref && (
                      <a className="vinline vinline--plain" href={telHref}>
                        {company.phone}
                      </a>
                    )}
                  </p>
                </div>
              )}
              <div className="vpanel__col vpanel__col--wide">
                <h2>Çalışma saatleri</h2>
                <div className="vhours">
                  {hoursRows.map(([label, value, isToday]) => (
                    <div key={label} className={`vhours__row ${isToday ? "is-today" : ""}`}>
                      <span className="vhours__day">
                        {label}
                        {isToday && <span className="vhours__badge">Bugün · {dayNames[todayIndex]}</span>}
                      </span>
                      <span className="vhours__val">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Row>
        )}

        {/* 6 — DİJİTAL BAĞLANTILAR */}
        {hasLinks && (
          <Row label="Dijital bağlantılar">
            <div className="vlinks">
              {siteHref && (
                <a className="vchip" href={siteHref} target="_blank" rel="noopener noreferrer">
                  {cleanSite}
                </a>
              )}
              {company.socials.instagram && (
                <a
                  className="vchip"
                  href={`https://instagram.com/${company.socials.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Instagram
                </a>
              )}
              {company.socials.facebook && (
                <a
                  className="vchip"
                  href={`https://facebook.com/${company.socials.facebook}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Facebook
                </a>
              )}
              {waHref && (
                <a className="vchip" href={waHref} target="_blank" rel="noopener noreferrer">
                  WhatsApp
                </a>
              )}
            </div>
          </Row>
        )}

        {/* 7 — PAYLAŞ */}
        <Row label="Bu vitrini paylaş">
          <div className="vshare">
            {waHref && (
              <a
                className="vbtn vbtn--sm"
                href={`https://wa.me/?text=${encodeURIComponent(`${company.name} — ${shareUrl}`)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp ile paylaş
              </a>
            )}
            <button type="button" className="vbtn vbtn--sm" onClick={() => navigator.clipboard?.writeText(shareUrl).catch(() => undefined)}>
              Bağlantıyı kopyala
            </button>
            {typeof navigator.share === "function" && (
              <button
                type="button"
                className="vbtn vbtn--sm"
                onClick={() => navigator.share({ title: company.name, url: shareUrl }).catch(() => undefined)}
              >
                Paylaş
              </button>
            )}
          </div>
        </Row>

        {/* 8 — BENZER FİRMALAR */}
        {related.length > 0 && (
          <Row label="Bu kategoride ayrıca">
            <FirmGrid ids={related.map((c) => c.id)} />
          </Row>
        )}
      </div>

      {lightbox !== null && (
        <Lightbox items={gallery} index={lightbox} onClose={() => setLightbox(null)} onNavigate={setLightbox} />
      )}
    </SEO>
  );
}

/** Açıklamanın ilk cümlesi — hero tanıtım metni */
function firstSentence(text: string): string {
  const s = text.trim();
  const idx = s.search(/[.!?]/);
  if (idx < 0) return s;
  const sentence = s.slice(0, idx + 1);
  return sentence.length >= 8 ? sentence : s.slice(0, 90);
}
