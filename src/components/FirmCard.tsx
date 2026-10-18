import { Link } from "react-router-dom";
import { getCityById, getCompanyById, listCategories } from "../lib/repo";
import { formatDateTime, formatShortDate } from "../lib/format";
import { isOpenNow } from "../lib/hours";

export function FirmCard({ id }: { id: string }) {
  const company = getCompanyById(id);
  if (!company) return null;
  const category = listCategories().find((c) => c.id === company.categoryId);
  const city = getCityById(company.cityId);
  const open = isOpenNow(company.hours);

  return (
    <article className="company-card">
      <div className="company-card__banner">
        {company.featured && <span className="company-card__star">⭐ Öne çıkan</span>}
        <span
          className={`company-card__status ${open ? "is-open" : "is-closed"}`}
        >
          {open ? "Şu an açık" : "Şu an kapalı"}
        </span>
        {company.images.slice(0, 1).map((img) => (
          <span key={img} className="company-card__banner-img" aria-hidden="true">
            {img}
          </span>
        ))}
      </div>
      <div className="company-card__body">
        <span className="company-card__cat">
          {category?.icon} {category?.name}
        </span>
        <h3 className="company-card__name">
          <Link to={`/firma/${company.slug}`} style={{ color: "inherit" }}>
            {company.name}
          </Link>
        </h3>
        <p className="company-card__desc">{company.description}</p>
        <div className="company-card__meta">
          <span className="company-card__row">
            <span>📍 {city?.name} / {company.district}</span>
          </span>
          <span className="company-card__row">
            <span>📞 {company.phone}</span>
            <span className="text-muted small">Yayımda: {formatShortDate(company.createdAt)}</span>
          </span>
        </div>
        <Link className="btn btn--ghost" to={`/firma/${company.slug}`}>
          Firma detayı →
        </Link>
      </div>
    </article>
  );
}

export function FirmGrid({ ids }: { ids: string[] }) {
  return (
    <div className="company-grid">
      {ids.map((id) => (
        <FirmCard key={id} id={id} />
      ))}
    </div>
  );
}

export function CompanyUpdatedAt({ company }: { company: { updatedAt: string } }) {
  return <span className="text-muted small">Son güncelleme: {formatDateTime(company.updatedAt)}</span>;
}
