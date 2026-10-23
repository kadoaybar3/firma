import { Link } from "react-router-dom";
import { ArrowUpRight, ChevronRight, MapPin, Phone } from "lucide-react";
import { companyIndex, getCityById, listCategories } from "../lib/repo";
import { telHref, formatDateTime } from "../lib/format";
import { isOpenNow } from "../lib/hours";
import { CategoryGlyph } from "./CategoryGlyph";

/** Firma adından iki harflik monogram: "Fark Otomotiv" → "FO". */
function initials(name: string): string {
  const words = name.split(/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü]+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => w[0] ?? "");
  return (letters.join("") || name[0] || "?").toLocaleUpperCase("tr");
}

/** Yalnız gerçek http(s) görselleri kullan — emoji/demet gibi değerler çizilmez. */
function photoOf(images: string[] | undefined): string | null {
  return images?.find((src) => /^https?:\/\//i.test(src)) ?? null;
}

/**
 * Firma kartı.
 * - `featured`: ana sayfa vitrin kartı (medya alanı + künye + eylemler).
 * - `row`: arama/liste sayfaları için taranması kolay kompakt satır.
 */
export function FirmCard({ id, variant = "row" }: { id: string; variant?: "row" | "featured" }) {
  // O(1) indeks araması: 1000 firmada kart gridi O(n²) taramadan tek geçişi düşer.
  const company = companyIndex().get(id);
  if (!company) return null;
  const category = listCategories().find((c) => c.id === company.categoryId);
  const city = getCityById(company.cityId);
  const phoneHref = telHref(company.phone);
  const photo = photoOf(company.images);
  const place = [company.district, city?.name].filter(Boolean).join(", ");

  // Saat verisi hiç yoksa "Kapalı" demek yanıltıcı olur — durum rozeti gösterilmez.
  const hasHours = [company.hours?.weekday, company.hours?.saturday, company.hours?.sunday].some(
    (s) => !!s && s.trim().length > 0,
  );
  const open = hasHours ? isOpenNow(company.hours) : false;
  const href = `/firma/${company.slug}`;

  if (variant === "featured") {
    return (
      <article className="firm-card">
        <div className="firm-card__top">
          <span className="firm-card__avatar" aria-hidden="true">
            {photo ? <img src={photo} alt="" loading="lazy" /> : initials(company.name)}
          </span>
          <div className="firm-card__ids">
            <h3 className="firm-card__name">
              <Link to={href}>{company.name}</Link>
            </h3>
            {category && (
              <Link className="firm-card__cat" to={`/kategori/${category.slug}`}>
                {category.name}
              </Link>
            )}
          </div>
        </div>
        {place && (
          <p className="firm-card__loc">
            <MapPin size={14} strokeWidth={1.9} aria-hidden="true" />
            {place}
          </p>
        )}
        <div className="firm-card__foot">
          {phoneHref ? (
            <a className="firm-card__phone" href={phoneHref}>
              <Phone size={14} strokeWidth={1.9} aria-hidden="true" />
              {company.phone}
            </a>
          ) : (
            <span className="firm-card__phone is-empty">Telefon belirtilmemiş</span>
          )}
          {hasHours && (
            <span className={`firm-status ${open ? "is-open" : "is-closed"}`}>
              <span className="firm-status__dot" aria-hidden="true" />
              {open ? "Şu an açık" : "Kapalı"}
            </span>
          )}
        </div>
        <Link className="firm-card__go" to={href}>
          Profili gör
          <ArrowUpRight size={15} strokeWidth={2} aria-hidden="true" />
        </Link>
      </article>
    );
  }

  return (
    <article className="firm-row">
      <span className="firm-row__mark" aria-hidden="true">
        <CategoryGlyph name={category?.name ?? ""} size={17} />
      </span>
      <div className="firm-row__main">
        <h3 className="firm-row__name">
          <Link to={href}>{company.name}</Link>
        </h3>
        <p className="firm-row__sub">
          {category?.name ?? "Kategori belirtilmemiş"}
          {(company.district || city) && (
            <>
              {" "}
              <span className="firm-row__dot" aria-hidden="true" />{" "}
              {company.district || city?.name}
            </>
          )}
        </p>
        {/* Mobilde telefon adın altında görünür; geniş ekranda sağ sütuna taşınır */}
        {phoneHref && (
          <a className="firm-row__phone firm-row__phone--inline" href={phoneHref}>
            <Phone size={13} strokeWidth={1.9} aria-hidden="true" />
            {company.phone}
          </a>
        )}
      </div>
      <div className="firm-row__meta">
        {phoneHref && (
          <a className="firm-row__phone firm-row__phone--meta" href={phoneHref}>
            <Phone size={14} strokeWidth={1.9} aria-hidden="true" />
            {company.phone}
          </a>
        )}
        {hasHours && (
          <span className={`firm-status ${open ? "is-open" : "is-closed"}`}>
            <span className="firm-status__dot" aria-hidden="true" />
            {open ? "Açık" : "Kapalı"}
          </span>
        )}
      </div>
      <Link className="firm-row__go" to={href} aria-label={`${company.name} profili`}>
        <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
      </Link>
    </article>
  );
}

export function FirmGrid({
  ids,
  variant = "row",
}: {
  ids: string[];
  variant?: "row" | "featured";
}) {
  return (
    <div className={variant === "featured" ? "firm-grid" : "firm-list"}>
      {ids.map((id) => (
        <FirmCard key={id} id={id} variant={variant} />
      ))}
    </div>
  );
}

export function CompanyUpdatedAt({ company }: { company: { updatedAt: string } }) {
  return <span className="text-muted small">Son güncelleme: {formatDateTime(company.updatedAt)}</span>;
}
