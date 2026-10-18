import type { Company, CompanyHours } from "./types";

/*
 * SEO yapılandırılmış veri yardımcıları.
 * Kural: yalnızca doğrulanmış veri kullanılır — şemada karşılığı olmayan
 * alan (geo, aggregateRating, image gibi) asla üretilmez.
 */

const BUSINESS_TYPES: Record<string, string> = {
  "Yemek & İçecek": "FoodEstablishment",
  Kuyumculuk: "JewelryStore",
  Otomotiv: "AutoRepair",
  "Sağlık & Eczane": "Pharmacy",
  Konaklama: "LodgingBusiness",
  Nakliyat: "MovingCompany",
  "Yapı & İnşaat": "HomeAndConstructionBusiness",
};

/** Kategori adına göre uygun LocalBusiness alt tipi; eşleşme yoksa düz LocalBusiness. */export function businessSchemaType(categoryName: string): string {
  return BUSINESS_TYPES[categoryName] ?? "LocalBusiness";
}

/** "09:00 - 14:00" biçimli saat metnini ISO saat aralığına çevirir; anlaşılmazsa null. */
export function parseTimeRange(text: string): { opens: string; closes: string } | null {
  const m = text.match(/(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  const [, sh, sm, eh, em] = m;
  // Sınır dışı saat verisini şema dışı bırak (25:99 gibi bozuk veri üretilmesin)
  if (Number(sh) > 24 || Number(eh) > 24 || Number(sm) > 59 || Number(em) > 59) return null;
  const pad = (v: string) => v.padStart(2, "0");
  return { opens: `${pad(sh)}:${sm}`, closes: `${pad(eh)}:${em}` };
}

/** Firma saat verisinden openingHoursSpecification listesi; "kapalı"/bozuk günler dahil edilmez. */
export function openingHoursSpecs(hours: CompanyHours): Array<{
  "@type": "OpeningHoursSpecification";
  dayOfWeek: string[];
  opens: string;
  closes: string;
}> {
  const specs: Array<{
    "@type": "OpeningHoursSpecification";
    dayOfWeek: string[];
    opens: string;
    closes: string;
  }> = [];
  const weekday = parseTimeRange(hours.weekday);
  if (weekday) specs.push({ "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: weekday.opens, closes: weekday.closes });
  const saturday = parseTimeRange(hours.saturday);
  if (saturday) specs.push({ "@type": "OpeningHoursSpecification", dayOfWeek: ["Saturday"], opens: saturday.opens, closes: saturday.closes });
  const sunday = parseTimeRange(hours.sunday);
  if (sunday) specs.push({ "@type": "OpeningHoursSpecification", dayOfWeek: ["Sunday"], opens: sunday.opens, closes: sunday.closes });
  return specs;
}

/** Web sitesi bağlantı pozitif doğrulama: yalnızca http/https; bozuk/tehlikeli şemada null. */
export function safeExternalUrl(raw?: string | null): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const u = new URL(value);
    return /^(https?:)$/.test(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Firma için LocalBusiness JSON-LD; eksik veri alanları sessizce çıkarılır. */
export function buildLocalBusinessJsonLd(opts: {
  company: Company;
  categoryName?: string;
  cityName?: string;
  pageUrl: string;
}): Record<string, unknown> {
  const { company, pageUrl } = opts;
  const description = company.description?.replace(/\s+/g, " ").trim().slice(0, 160);

  const sameAs = [
    company.socials.instagram && `https://instagram.com/${company.socials.instagram}`,
    company.socials.facebook && `https://facebook.com/${company.socials.facebook}`,
  ].filter((v): v is string => Boolean(v));

  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": businessSchemaType(opts.categoryName ?? ""),
    name: company.name,
    url: pageUrl,
  };

  if (description) node.description = description;
  if (company.phone) node.telephone = company.phone;
  if (company.address) {
    node.address = {
      "@type": "PostalAddress",
      streetAddress: company.address,
      addressLocality: company.district,
      addressRegion: opts.cityName,
      addressCountry: "TR",
    };
  }

  const specs = openingHoursSpecs(company.hours);
  if (specs.length) node.openingHoursSpecification = specs;
  if (sameAs.length) node.sameAs = sameAs;

  return node;
}

/** Sayfa yol kırıntısı için BreadcrumbList JSON-LD. */
export function buildBreadcrumbJsonLd(items: Array<{ name: string; path?: string }>): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      ...(item.path ? { item: `${locationOriginSafe()}${item.path}` } : {}),
    })),
  };
}

/** Node ortamında (test/vite config) location yoksa kullanılabilir kök adres. */
export function locationOriginSafe(): string {
  try {
    return typeof location !== "undefined" ? location.origin : "";
  } catch {
    return "";
  }
}

