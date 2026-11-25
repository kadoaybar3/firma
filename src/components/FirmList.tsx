import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { FilterX, MoreHorizontal } from "lucide-react";
import { firmInitials, firmPhoto, telHref } from "../lib/format";
import "./firmList.css";

/**
 * ORTAK FİRMA LİSTELEME STANDARDI
 *
 * Tüm firma listeleri aynı bilgi hiyerarşisini kullanır:
 *  1. Firma adı (birincil, bağlantı olabilir)
 *  2. Kategori · konum · telefon (tek satır, ikincil)
 *  3. Ekrana özel rozet/not
 *  4. Tek birincil eylem + taşma menüsündeki diğer işlemler
 *
 * Yönetim, temsilci paneli ve halka açık site aynı bileşenleri kullanır;
 * ekranlar yalnızca kendi işlemlerini ve ek bilgilerini besler.
 */

export function FirmAvatar({ name, images }: { name: string; images?: string[] }) {
  const photo = firmPhoto(images);
  return (
    <span className="fl-avatar" aria-hidden="true">
      {photo ? <img src={photo} alt="" loading="lazy" /> : firmInitials(name)}
    </span>
  );
}

export function FirmIdentity({
  name,
  href,
  images,
  category,
  place,
  phone,
  note,
  badges,
}: {
  name: string;
  href?: string;
  images?: string[];
  category?: string;
  place?: string;
  phone?: string;
  note?: ReactNode;
  badges?: ReactNode;
}) {
  const phoneHref = phone ? telHref(phone) : "";
  const hasSub = Boolean(category || place || phone);
  return (
    <span className="fl-id">
      <FirmAvatar name={name} images={images} />
      <span className="fl-id__body">
        <span className="fl-id__name" title={name}>
          {href ? <Link to={href}>{name}</Link> : <strong>{name}</strong>}
        </span>
        {hasSub && (
          <span className="fl-id__sub">
            {category && <span>{category}</span>}
            {place && <span>{place}</span>}
            {phone &&
              (phoneHref ? <a href={phoneHref}>{phone}</a> : <span>{phone}</span>)}
          </span>
        )}
        {note && <span className="fl-id__note">{note}</span>}
        {badges && <span className="fl-id__badges">{badges}</span>}
      </span>
    </span>
  );
}

/** Satır işlem menülerini dışarı tıklama ve Esc ile kapatan tek dinleyici. */
export function useFirmRowMenus(): void {
  useEffect(() => {
    function closeMenus(event: Event) {
      const target = event.target as Node | null;
      document.querySelectorAll<HTMLDetailsElement>("details.fl-menu[open]").forEach((el) => {
        if (event.type === "keydown" || !target || !el.contains(target)) el.open = false;
      });
    }
    function onKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") closeMenus(event);
    }
    document.addEventListener("click", closeMenus);
    document.addEventListener("keydown", onKeydown);
    return () => {
      document.removeEventListener("click", closeMenus);
      document.removeEventListener("keydown", onKeydown);
    };
  }, []);
}

export type FirmMenuItem = {
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  to?: string;
  tone?: "danger";
  disabled?: boolean;
};

/** Satırın ikincil işlemleri: tek taşma menüsü (klavye uyumlu details/summary). */
export function FirmMenu({ label, items }: { label: string; items: FirmMenuItem[] }) {
  if (!items.length) return null;
  return (
    <details className="rowmenu fl-menu">
      <summary aria-label={label}>
        <MoreHorizontal size={16} strokeWidth={2} aria-hidden="true" />
      </summary>
      <div className="rowmenu__panel">
        {items.map((item) =>
          item.to ? (
            <Link key={item.label} to={item.to}>
              {item.icon}
              {item.label}
            </Link>
          ) : (
            <button
              key={item.label}
              type="button"
              className={item.tone === "danger" ? "is-danger" : undefined}
              disabled={item.disabled}
              onClick={(event) => {
                event.currentTarget.closest("details")?.removeAttribute("open");
                item.onSelect?.();
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ),
        )}
      </div>
    </details>
  );
}

export function FirmList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul className="fl-list" aria-label={label}>
      {children}
    </ul>
  );
}

export function FirmListRow({
  identity,
  aside,
  footer,
  className,
}: {
  identity: ReactNode;
  aside?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <li className={`fl-row${className ? ` ${className}` : ""}`}>
      <div className="fl-row__main">{identity}</div>
      {aside && <div className="fl-row__aside">{aside}</div>}
      {footer && <div className="fl-row__footer">{footer}</div>}
    </li>
  );
}

/** Liste üstü filtref barı: alanlar + sonuç sayısı + tek "temizle" düğmesi. */
export function FirmFilters({
  children,
  total,
  shown,
  unit = "firma",
  hasFilters,
  onClear,
  extra,
  label,
  twoUp,
}: {
  children: ReactNode;
  total: number;
  shown: number;
  unit?: string;
  hasFilters?: boolean;
  onClear?: () => void;
  extra?: ReactNode;
  label?: string;
  /** Mobilde alanları iki kolona sığdır (kısa listeler). */
  twoUp?: boolean;
}) {
  const filtered = shown !== total;
  return (
    <section className="fl-filters" aria-label={label ?? "Liste filtreleri"}>
      <div className={`fl-filters__grid${twoUp ? " fl-filters__grid--two" : ""}`}>{children}</div>
      <div className="fl-filters__foot">
        <span className="fl-filters__count" aria-live="polite">
          <strong>{shown}</strong> {unit} gösteriliyor{filtered ? ` · toplam ${total}` : ""}
        </span>
        <div className="fl-filters__actions">
          {extra}
          {hasFilters && onClear && (
            <button type="button" className="fl-filters__clear" onClick={onClear}>
              <FilterX size={14} strokeWidth={1.9} aria-hidden="true" />
              Filtreleri temizle
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/** Görünür etiketli filtre alanı. `plain` içinde kendi etiketleri olan bileşenler için. */
export function FirmFilterField({
  label,
  wide,
  full,
  plain,
  children,
}: {
  label: string;
  wide?: boolean;
  full?: boolean;
  plain?: boolean;
  children: ReactNode;
}) {
  const className = `fl-field${wide ? " fl-field--wide" : ""}${full ? " fl-field--full" : ""}${
    plain ? " fl-field--plain" : ""
  }`;
  if (plain) {
    return (
      <div className={className}>
        <span className="fl-field__label">{label}</span>
        {children}
      </div>
    );
  }
  return (
    <label className={className}>
      <span className="fl-field__label">{label}</span>
      {children}
    </label>
  );
}
