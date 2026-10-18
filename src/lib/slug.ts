const TR_MAP: Record<string, string> = {
  ç: "c",
  Ç: "c",
  ğ: "g",
  Ğ: "g",
  ı: "i",
  I: "i",
  İ: "i",
  ö: "o",
  Ö: "o",
  ş: "s",
  Ş: "s",
  ü: "u",
  Ü: "u",
};

/** Türkçe karakterleri sadeleştirip URL uyumlu slug üretir. */
export function slugify(text: string): string {
  return text
    .trim()
    .replace(/[çÇğĞıIİöÖşŞüÜ]/g, (m) => TR_MAP[m] ?? m)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Adı mevcut slug'larla çakışmayan benzersiz slug üretir. */
export function uniqueSlug(name: string, existing: string[]): string {
  const base = slugify(name) || "firma";
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** Türkçe duyarlı arama normalizasyonu: İ/ı birleşik nokta sorunlarını giderir. */
export function normalizeSearch(text: string): string {
  return text
    .trim()
    .replace(/[İIıi]/g, (m) => ({ İ: "i", I: "i", ı: "i", i: "i" })[m] ?? m)
    .replace(/[çÇ]/g, "c")
    .replace(/[ğĞ]/g, "g")
    .replace(/[öÖ]/g, "o")
    .replace(/[şŞ]/g, "s")
    .replace(/[üÜ]/g, "u")
    .toLocaleLowerCase("tr");
}
