import type { Category, City, Company } from "./types";
import { normalizeSearch, slugify } from "./slug";
import { TR_ILLER } from "../data/trCities";
import { TR_ILCELERI } from "../data/trDistricts";

/*
 * İÇE AKTARMA MOTORU — saf (UI'sız, DB'siz) fonksiyonlar.
 *
 * Tasarım kuralları:
 *  - Tüm karar fonksiyonları girdiden çıktı üretir; repo'ya dokunmaz → test edilebilir.
 *  - Mevcut veriye ASLA otomatik yazmaz: mükerrerlerin yalnız "kesin" olanı
 *    kayıt yönünü bloke eder, "şüpheli" olanlar kullanıcı kararıyla atlanır.
 *  - Mevcut firma/kategori/şehir listeleri salt-okunur referans alınır.
 */

/* ============ TELEFON NORMALİZASYONU ============ */

/**
 * Telefonu karşılaştırma anahtarına indirger: yalnız rakamlar, TR ülke kodu ve
 * baş sıfır giderilir ("+90 555 111 22 33", "0555 111 22 33", "5551112233"
 * hepsi "5551112233" olur). Uluslararası biçimlerde rakam dizesi olduğu gibi
 * kalır — karşılaştırma tutarlılığı için yeterli.
 */
export function phoneKey(raw: string): string {
  let digits = (raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 12 && digits.startsWith("90")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

/** Alan doğrulama: TR mantığında 10 rakam; yabancı numara için 10–15 rakam arası. */
export function isValidPhone(raw: string): boolean {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return false;
  if (isValidPhoneTR(digits)) return true;
  return digits.length >= 10 && digits.length <= 15;
}

function isValidPhoneTR(digits: string): boolean {
  let d = digits;
  if (d.length === 12 && d.startsWith("90")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return d.length === 10;
}

/** Görselleştirmede tutarlılık: tabloda normalizasyondan geçirilmiş biçim basılır. */
export function normalizePhoneDisplay(raw: string): string {
  const key = phoneKey(raw);
  if (key.length === 10 && !raw.startsWith("+")) return `0 ${key.slice(0, 3)} ${key.slice(3, 6)} ${key.slice(6, 8)} ${key.slice(8)}`;
  return raw.trim();
}

/* ============ CHAR/TEXT NORMALİZASYON ============ */

/** Firma adı karşılaştırmaları için ağır normalizasyon: tip ekleri atılır.
 *  normalizeSearch ş→s çözdüğü için ekler ASCII biçiminde ("%şti"→"sti") yazılır. */
const NAME_FILLER = /(?<![\p{L}])(ltd|lti|san|tic|aks|sti|inc|llc|co|ag|as)(?![\p{L}])/giu;

export function normalizeCompanyName(text: string): string {
  return normalizeSearch(text)
    .replace(/[()\[\]'".,;:!?/\\|–—-]+/g, " ")
    .replace(NAME_FILLER, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Adres benzerliği için kelime kümesi — küçük ayrım farklarına dayanıklı. */
export function addressTokens(text: string): Set<string> {
  const norm = normalizeSearch(text).replace(/[^\p{L}\p{N}]+/gu, " ");
  const stop = new Set(["mah", "mahallesi", "sokak", "sk", "cad", "cadde", "no", "km", "blv", "bulvari", "mie", "d", "apt", "apartmani"]);
  return new Set(norm.split(/\s+/).filter((w) => w.length > 1 && !stop.has(w)));
}

/* ============ BENZERLİK ============ */

/** Levenshtein oran (0–1). Küçük dizelerde hızlıdır; içe aktarım boyutunda kullanıcı aşamasında koşar. */
export function levenshteinRatio(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

/** Adres benzerliği: kelime kümesi Jaccard. */
export function tokenJaccard(a: string, b: string): number {
  const A = addressTokens(a);
  const B = addressTokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/* ============ MÜKERRER KONTROL ============ */

export type DuplicateReason = "telefon" | "ad-slug" | "ad-benzer" | "adres";

export interface DuplicateMatch {
  company: Pick<Company, "id" | "name" | "slug" | "phone" | "address" | "district" | "cityId" | "categoryId">;
  reasons: DuplicateReason[];
}

export interface DuplicateReport {
  /** Kesin çakışma: kayıt yönünü engeller (aynı telefon/slug). */
  exact: DuplicateMatch[];
  /** Şüpheli benzerlik: kullanıcı kararına sunulur (benzer ad/adres). */
  suspicious: DuplicateMatch[];
}

/**
 * Aday firma satırını mevcut firmalarla mükerrer açısından tarar.
 * Benzerlik eşiği, benzer ama farklı işletmelerin (örn. aynı zincirin iki
 * şubesi) hatalı engellenmemesi için oran + adres birleşik koşuluyla
 * dar tutulur (yanlış-pozitif düşük).
 */
export function findDuplicates(
  candidate: { name: string; phone: string; address: string },
  existing: Company[],
): DuplicateReport {
  const exact: DuplicateMatch[] = [];
  const suspicious: DuplicateMatch[] = [];
  const candPhone = phoneKey(candidate.phone);
  const candSlug = slugify(candidate.name);
  const candName = normalizeCompanyName(candidate.name);
  if (!candName && !candPhone) return { exact, suspicious };

  for (const company of existing) {
    const reasons: DuplicateReason[] = [];
    if (candPhone && phoneKey(company.phone) === candPhone) reasons.push("telefon");
    if (candSlug && company.slug === candSlug) reasons.push("ad-slug");
    if (candName.length >= 4) {
      const ratio = levenshteinRatio(candName, normalizeCompanyName(company.name));
      if (ratio >= 0.92) reasons.push("ad-benzer");
      else if (ratio >= 0.78 && tokenJaccard(candidate.address, company.address) >= 0.5) reasons.push("adres");
    }
    if (!reasons.length) continue;
    const match: DuplicateMatch = {
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        phone: company.phone,
        address: company.address,
        district: company.district,
        cityId: company.cityId,
        categoryId: company.categoryId,
      },
      reasons,
    };
    if (reasons.includes("telefon") || reasons.includes("ad-slug")) exact.push(match);
    else suspicious.push(match);
  }
  return { exact, suspicious };
}

/* ============ DELİMLİ METİN/CSV AYRIŞTIRMA ============ */

/**
 * Kaçışlu tırnak desteği olan delimiter ayırt edici CSV ayrıştırıcı.
 * Satır sonu: \n veya \r\n. Ayraç: ilk satırdaki `,` `;` `\t` sayımına göre
 * seçilir (TR Excel'ler genelde `;` üretir).
 */
export function parseDelimited(text: string): { headers: string[]; rows: string[][] } {
  const sample = text.slice(0, text.indexOf("\n") + 1 || text.length);
  const counts: Array<[string, number]> = [
    [",", (sample.match(/,/g) ?? []).length],
    [";", (sample.match(/;/g) ?? []).length],
    ["\t", (sample.match(/\t/g) ?? []).length],
  ];
  counts.sort((x, y) => y[1] - x[1]);
  const delimiter = counts[0][1] > 0 ? counts[0][0] : ",";

  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      records.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  // Sonda satır sonu yoksa kalan alanı kaydet
  if (field.length || row.length) {
    row.push(field);
    records.push(row);
  }

  const nonEmpty = records.filter((r) => r.some((f) => f.trim()));
  if (!nonEmpty.length) return { headers: [], rows: [] };
  const [headers, ...rows] = nonEmpty;
  return { headers: headers.map((h) => h.trim()), rows: rows.map((r) => r.map((f) => f.trim())) };
}

/* ============ SÜTUN EŞLEME ============ */

export type ImportField =
  | "name"
  | "phone"
  | "city"
  | "district"
  | "category"
  | "address"
  | "email"
  | "website"
  | "instagram"
  | "whatsapp"
  | "description"
  | "latitude"
  | "longitude"
  | "placeId";

export const REQUIRED_FIELDS: ImportField[] = ["name", "phone", "city", "district", "category"];

export const FIELD_LABELS: Record<ImportField, string> = {
  name: "Firma adı",
  phone: "Telefon",
  city: "Şehir",
  district: "İlçe",
  category: "Kategori",
  address: "Adres",
  email: "E-posta",
  website: "Web sitesi",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  description: "Açıklama",
  latitude: "Enlem",
  longitude: "Boylam",
  placeId: "Place ID",
};

/** Başlık metni (lower-cased) eşleyen tahmin tablosu — TR ve EN etiketler. */
const GUESS_PATTERNS: Array<[ImportField, RegExp]> = [
  ["name", /^(firma( ad[ıi]| adı)|ad[ıi]|name|unvan|işletme)/i],
  ["phone", /(telefon|tel|phone|gsm|cep|numara)/i],
  ["city", /^(şeh[ıi]r|sehir|il|city|vilayet)$/i],
  ["district", /(ilçe|ilce|district|bölge|semt)/i],
  ["category", /(kategori|sektör|sektor|category|hizmet|branş|brans)/i],
  ["address", /(adres|address|konum)/i],
  ["email", /(e-?posta|mail)/i],
  ["website", /(web ?site|site|url|internet)/i],
  ["instagram", /(instagram|ig)/i],
  ["whatsapp", /(whatsapp|wa)/i],
  ["description", /(aç[ıi]klama|aciklama|tan[ıi]t[ıi]m|description|not)/i],
  ["latitude", /^(enlem|latitude|lat)$/i],
  ["longitude", /^(boylam|longitude|lng)$/i],
  ["placeId", /(place ?id|yer ?kimli[iğ])/i],
];

export function guessMapping(headers: string[], available: ImportField[]): Partial<Record<ImportField, number>> {
  const guess: Partial<Record<ImportField, number>> = {};
  const used = new Set<number>();
  // Başlıklar Türkçe karakter normalize edilir — JS regex "İ"→"i" katlamaz (uyarlanmış eşleşme)
  const normHeaders = headers.map((h) => normalizeSearch(h));
  for (const field of available) {
    const idx = normHeaders.findIndex((h, i) => !used.has(i) && !h.startsWith("§") && GUESS_PATTERNS.find(([f]) => f === field)?.[1].test(h));
    if (idx >= 0) {
      guess[field] = idx;
      used.add(idx);
    }
  }
  return guess;
}

/* ============ SATIR DOĞRULAMA ============ */

export interface ImportCandidate {
  rowIndex: number;
  name: string;
  phone: string;
  address: string;
  email?: string;
  website?: string;
  instagram?: string;
  whatsapp?: string;
  description: string;
  cityText: string;
  districtText: string;
  categoryText: string;
  /** Eşleşme çözümü: analiz sonrası doldurulur. */
  city?: City;
  categoryId?: string;
  /**
   * Mevcut kategoriyle eşleşmeyen metin için anahtar — onay aşamasında
   * kullanıcı bu kategorilerin açılmasını onaylarsa createCategory'den gelen
   * gerçek kimlik buradaki plana göre eşlenir.
   */
  categoryPlanKey?: string;
  /**
   * Veritabanında kayıtlı olmayan AMA Türkiye il listesiyle (TR_ILLER)
   * birebir eşleşen şehir metni için plan anahtarı — kayıt aşamasında
   * createCity'den gelen gerçek kimlik buradaki plana göre eşlenir
   * (verify City O-7). Tahminî kimlik ÜRETİLMEZ; kimlik veritabanından gelir.
   */
  cityPlanKey?: string;
  district?: string;
  /** Google kaynaklı koordinat (Essentials SKU, arama sonucunda bedava döner). */
  latitude?: number;
  longitude?: number;
  placeId?: string;
}

export interface RowIssue {
  rowIndex: number;
  severity: "hata" | "uyari";
  message: string;
}

export interface ImportOptions {
  /** Olduğu eşleşmeyen kategori metnini otomatik kategori olarak açmaya izin ver. */
  autoCreateCategory: boolean;
  /** İlçe metni kayıtlı değilse şehre ilçe eklemeye izin ver (kayıt aşamasında). */
  autoCreateDistrict: boolean;
  /**
   * Şehir metni veritabanında kayıtlı DEĞİLSE ama Türkiye il listesiyle
   * birebir eşleşiyorsa (O-7) yeni şehir açmaya izin ver (kayıt aşamasında,
   * kullanıcı önizlemede gördükten sonra). Farklı/uydurma şehir adları
   * sessizce hedef şehre çevirilmez — hata olarak kalır.
   */
  autoCreateCity: boolean;
}

/**
 * Ham kayıtları doğrular; kategori/şehir çözümünü yapar. Dönen listede
 * sorunlu satırlar `issues`'ta olur, `valid` içinde yer almaz.
 */
export function analyzeImportRows(
  raws: Record<string, string>[],
  mapping: Partial<Record<ImportField, number>>,
  options: ImportOptions,
  refs: { cities: City[]; categories: Category[]; companies: Company[]; headers: string[] },
): { valid: ImportCandidate[]; issues: RowIssue[]; plannedCategories: Map<string, string>; plannedCities: Map<string, string> } {
  const valid: ImportCandidate[] = [];
  const issues: RowIssue[] = [];
  const seenNames = new Map<string, number>();
  const seenPhones = new Map<string, number>();
  /** Planlanan yeni kategoriler (anahtar → ad) — kayıt aşamasına bildirilir. */
  const plannedCategories = new Map<string, string>();
  /** Planlanan yeni şehirler (anahtar → ad) — O-7; yalnız gerçek il adları. */
  const plannedCities = new Map<string, string>();

  raws.forEach((rec, i) => {
    const rowIndex = i + 2; // 1: başlık satırı
    const at = (f: ImportField): string => (mapping[f] === undefined ? "" : rec[refs.headers[mapping[f]]] ?? "");
    const name = at("name").trim();
    const phone = at("phone").trim();
    const cityText = at("city").trim();
    const districtText = at("district").trim();
    const categoryText = at("category").trim();
    const website = at("website").trim() || undefined;
    const email = at("email").trim() || undefined;

    if (!name) {
      issues.push({ rowIndex, severity: "hata", message: "Firma adı boş." });
      return;
    }
    if (!isValidPhone(phone)) {
      issues.push({ rowIndex, severity: "hata", message: `“${name}”: Geçerli telefon numarası yok.` });
      return;
    }
    if (!cityText) {
      issues.push({ rowIndex, severity: "hata", message: `“${name}”: Şehir boş.` });
      return;
    }

    // Şehir: önce DB kayıtlarıyla eşle; yoksa statik il listesiyle PLANLA (O-7).
    // Planlama yalnız birebir (Türkçe duyarsız) il adı eşleşmesiyledir; farklı
    // veya uydurma şehir adları sessizce hedef şehre çevirilmez — hata kalır.
    const city = matchCity(cityText, refs.cities);
    let cityPlanKey: string | undefined;
    let plannedDistrict: string | undefined;
    if (!city) {
      const plan = options.autoCreateCity ? planCityFromStatic(cityText, districtText) : undefined;
      if (!plan) {
        issues.push({
          rowIndex,
          severity: "hata",
          message: `“${name}”: Şehir eşleşmedi (“${cityText}”) — kayıtlı şehirler arasında bu ad yok.`,
        });
        return;
      }
      cityPlanKey = plan.key;
      plannedDistrict = plan.district;
      plannedCities.set(plan.key, plan.name);
      if (!districtText) {
        issues.push({ rowIndex, severity: "uyari", message: `“${name}”: İlçe boş — “Merkez” kullanılacak.` });
      }
    }

    // İlçe: DB şehri varsa kayıtlı ilçelerle eşle; planlı şehirse statik ilçe
    // listesiyle eşle. Kayıtlı değilse otomatik ekleme izni varsa kayıt aşamasında açılır
    let district = city ? matchDistrict(districtText, city) : plannedDistrict;
    if (!district && !options.autoCreateDistrict) {
      issues.push({
        rowIndex,
        severity: "hata",
        message: `“${name}”: “${city?.name ?? cityText}” içinde “${districtText}” ilçesi kayıtlı değil.`,
      });
      return;
    }
    if (!district) district = districtText.trim() || "Merkez";

    // Kategori: mevcutla eşle; izin yoksa hata, izin varsa yeni kategori planla
    let categoryId = matchCategory(categoryText, refs.categories)?.id;
    if (!categoryId && !options.autoCreateCategory) {
      issues.push({
        rowIndex,
        severity: "hata",
        message: `“${name}”: Kategori eşleşmedi (“${categoryText}”).`,
      });
      return;
    }
    if (!categoryId) {
      const planKey = slugify(categoryText) || `kategori-${rowIndex}`;
      categoryId = `plan:${planKey}`;
      plannedCategories.set(planKey, categoryText);
    }

    // Koordinatlar: TR ondalık virgülü desteklenir; geçersizse SATIR değil koordinat reddedilir
    const parsed = parseCoords(at("latitude"), at("longitude"));
    let latitude: number | undefined;
    let longitude: number | undefined;
    let placeId: string | undefined;
    if (parsed.ok) {
      latitude = parsed.latitude;
      longitude = parsed.longitude;
    } else if (parsed.reason) {
      issues.push({ rowIndex, severity: "uyari", message: `“${name}”: ${parsed.reason} — konumsuz kaydedilecek.` });
    }
    const placeIdRaw = at("placeId").trim();
    if (placeIdRaw && /^[\w-]{4,255}$/.test(placeIdRaw)) placeId = placeIdRaw;

    // Yığın içi mükerrer — telefon/ad aynıysa sonraki kopya atlanır
    const dupPhone = seenPhones.get(phoneKey(phone));
    const dupName = seenNames.get(slugify(name));
    if (dupPhone !== undefined) {
      issues.push({ rowIndex, severity: "uyari", message: `${dupPhone}. satırla aynı telefonu taşıyor — tekrar atlandı.` });
      return;
    }
    if (dupName !== undefined) {
      issues.push({ rowIndex, severity: "uyari", message: `${dupName}. satırla aynı adı taşıyor — tekrar atlandı.` });
      return;
    }
    seenPhones.set(phoneKey(phone), rowIndex);
    seenNames.set(slugify(name), rowIndex);

    if (!addressTokens(at("address")).size) {
      issues.push({ rowIndex, severity: "uyari", message: `“${name}”: Adres alanı boş.` });
    }

    const candidate: ImportCandidate = {
      rowIndex,
      name,
      phone,
      address: at("address").trim(),
      email,
      website,
      instagram: at("instagram").trim() || undefined,
      whatsapp: at("whatsapp").trim() || undefined,
      description: at("description").trim(),
      cityText,
      districtText,
      categoryText,
      city,
      cityPlanKey,
      district,
      categoryId,
      latitude,
      longitude,
      placeId,
    };
    valid.push(candidate);
  });

  return { valid, issues, plannedCategories, plannedCities };
}

/**
 * Enlem/boylam çiftini ayrı sütunlardan ayrı ayrı çözümler — TR ondalık
 * virgülü desteklenir; ARALIK doğrulaması esastır (lat ±90, lng ±180).
 * Sütun başlıkları ("Enlem"/"Boylam") tek doğruluk kaynağıdır; değerler
 * birbirinin yerine analiz edilmez.
 */
function parseCoords(latText: string, lngText: string): { ok: boolean; latitude?: number; longitude?: number; reason?: string } {
  const latRaw = latText.trim();
  const lngRaw = lngText.trim();
  if (!latRaw && !lngRaw) return { ok: true };
  const toNum = (v: string): number | undefined => {
    if (!v) return undefined;
    const cleaned = v.replace(",", ".");
    // Yalnız düz ondalık kabul; boş/düzgün olmayan dizge Number("")=0 tuzağına düşmez
    if (!/^[+-]?\d+(\.\d+)?$/.test(cleaned)) return undefined;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : undefined;
  };
  const lat = toNum(latRaw);
  const lng = toNum(lngRaw);
  if (lat === undefined || lng === undefined) {
    return { ok: false, reason: "Koordinat biçimi çözümlenemedi" };
  }
  if (Math.abs(lat) > 90) return { ok: false, reason: `Enlem aralık dışı (${lat})` };
  if (Math.abs(lng) > 180) return { ok: false, reason: `Boylam aralık dışı (${lng})` };
  return { ok: true, latitude: lat, longitude: lng };
}

/** Planlanan (henüz kapatılmamış) yeni kategoriler — onay ekranında listelenir. */
export function plannedCategoryList(planned: Map<string, string>): Array<{ key: string; name: string }> {
  return [...planned.entries()].map(([key, name]) => ({ key, name }));
}

export function matchCity(text: string, cities: City[]): City | undefined {
  const n = normalizeSearch(text);
  return (
    cities.find((c) => normalizeSearch(c.name) === n) ??
    cities.find((c) => normalizeSearch(c.name).includes(n) && n.length >= 3)
  );
}

/* ============ ŞEHİR PLANLAMA — STATİK İL LİSTEMİYLE (O-7) ============ */

/**
 * Şehir metnini TÜRKİYE İL listesiyle (TR_ILLER) birebir eşler — Türkçe
 * duyarsız normalizasyonla (İ/ı, ç, ğ, ö, ş, ü ve büyük/küçük harf farkları
 * fark etmez); sonundaki " ili" / " il" ekleri sökülür. Benzer/talı adlarla
 * ("Afyon", ilçe adları) eşleşme YAPILMAZ: plan yalnız birebir gerçek il
 * adına kurulur — farklı şehir sessizce hedefe çevrilmez. İlçe metni aynı
 * mantıkla o ilin statik ilçe listesiyle (TR_ILCELERI) eşleştirilir;
 * kayıtlı olmayan ilçe adı olduğu gibi döner (kayıt aşamasında
 * autoCreateDistrict izniyle açılır).
 */
export function planCityFromStatic(
  cityText: string,
  districtText = "",
): { key: string; name: string; district?: string } | undefined {
  let n = normalizeSearch(cityText);
  if (!n) return undefined;
  n = n.replace(/\s+(ili|il)$/, "").trim();
  const il = TR_ILLER.find((name) => normalizeSearch(name) === n);
  if (!il) return undefined;
  return { key: slugify(il) || `il-${n.replace(/\s+/g, "-")}`, name: il, district: planDistrictFor(il, districtText) };
}

/** Satırdaki ilçe metnini ilgili ilin statik listesiyle Türkçe duyarsız eşler. */
function planDistrictFor(il: string, districtText: string): string | undefined {
  const list = TR_ILCELERI[il];
  if (!list || !list.length) return undefined;
  const n = normalizeSearch(districtText);
  if (!n || n === "merkez") return list.find((d) => normalizeSearch(d) === "merkez") ?? list[0];
  return list.find((d) => normalizeSearch(d) === n);
}

/** Planlanan (henüz açılmamış) yeni şehirler — onay ekranında listelenir. */
export function plannedCityList(planned: Map<string, string>): Array<{ key: string; name: string }> {
  return [...planned.entries()].map(([key, name]) => ({ key, name }));
}

export function matchDistrict(text: string, city: City): string | undefined {
  const n = normalizeSearch(text);
  if (!n || n === "merkez") return city.districts.includes("Merkez") ? "Merkez" : city.districts[0];
  return city.districts.find((d) => normalizeSearch(d) === n);
}

export function matchCategory(text: string, categories: Category[]): Category | undefined {
  const n = normalizeSearch(text);
  return categories.find((c) => normalizeSearch(c.name) === n || c.slug === slugify(text));
}

/* ============ GRUPLU İŞLEME YARDIMCI ============ */

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/* ============ KATEGORİ ÇÖZÜMLEME — KAYIT ÖNCESİ ZORUNLU DOĞRULAMA ============ */

export type CategoryResolution =
  | { ok: true; categoryId: string }
  | { ok: false; reason: string };

/**
 * Kayıt anında kategori bağlantısını kesinleştirir — TAHMİN YASAK:
 *  - `plan:` önekli aday → createCategory'den dönen gerçek kimlıkla (planMap) eşlenir;
 *    eşleşme yoksa firma kategorisiz kaydedilmez, hata üretir.
 *  - Gerçek kimlık → `verify` çağrısıyla o an DB'de var olduğu doğrulanır
 *    (analizle kayıt arasında kategori silinmiş olabilir).
 *  - Kimlık hiç yok / boş → kesin hata ("" ID ile kayıt engellenir).
 */
export function resolveImportCategoryId(
  candidate: Pick<ImportCandidate, "categoryId" | "name">,
  planMap: Map<string, string>,
  verify: (categoryId: string) => boolean,
): CategoryResolution {
  const raw = candidate.categoryId;
  if (!raw || !raw.trim()) {
    return { ok: false, reason: `Kategori belirtilmedi — “${candidate.name}” kategorisiz kaydedilemez.` };
  }
  if (raw.startsWith("plan:")) {
    const resolved = planMap.get(raw.slice(5));
    if (!resolved || !verify(resolved)) {
      return { ok: false, reason: `Planlanan kategori açılamadı — “${candidate.name}” kaydedilmedi.` };
    }
    return { ok: true, categoryId: resolved };
  }
  if (!verify(raw)) {
    return { ok: false, reason: `Kategori artık veritabanında yok — “${candidate.name}” kaydedilmedi.` };
  }
  return { ok: true, categoryId: raw };
}
