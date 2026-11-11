import type { Company } from "./types";
import { normalizeSearch } from "./slug";

/** Adres formunun serbest metin parçaları (mahalle/cadde önerileri bunlardan türetilir). */
export interface AddressParts {
  neighborhood: string;
  street: string;
  buildingNo: string;
  details: string;
}

export const EMPTY_ADDRESS_PARTS: AddressParts = {
  neighborhood: "",
  street: "",
  buildingNo: "",
  details: "",
};

export interface AddressSuggestions {
  neighborhoods: string[];
  /** Seçili mahalleye ait sokaklar; mahalle seçilmemişse boş. */
  streets: string[];
  /** İlçedeki tüm sokaklar (mahalle filtresi boş dönerse yedek). */
  allStreets: string[];
}

const BUILDING_NO_RE = /\bno\.?\s*:?\s*([0-9]+[a-z0-9/-]*)/i;
const NEIGHBORHOOD_RE = /([^,;]+?)\s+(mah\.?|mahallesi)(?=\s|,|;|\.|$)/i;
const STREET_RE =
  /([^,;]+?)\s+(cad\.?|caddesi|cd\.?|sok\.?|sokak|sk\.?|bul\.?|bulvarı|blv\.?|yolu|yol)(?=\s|,|$)/i;
const NEIGHBORHOOD_STOP_RE =
  /\b(?:apt|apartman|blok|blk|site|iş\s*merkezi|merkezi|no|kat|daire|mahalle|mahallesi|mahalesi|küçük\s+sanayi|sanayi\s+sitesi)\b/i;
const LANDMARK_RE =
  /(?:karşısı|karşısında|yanı|yanında|üzeri|üzerinde|yakını|yakınında|girişi|içi|içinde)$/i;
const ORDINAL_RE = /^(?:birinci|ikinci|üçüncü|dördüncü|beşinci|altıncı|yedinci|sekizinci|dokuzuncu|onuncu)$/i;

function clean(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[\s,;.]+/, "")
    .replace(/[\s,;]+$/, "")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Adres sonundaki "İlçe, İl" ve posta kodu ekini ayıklar; mahalle adıyla karışmasın. */
function stripTrailingLocality(text: string, district: string, city: string): string {
  const localities = [city.trim(), district.trim()].filter(Boolean).map(escapeRegExp);
  if (!localities.length) return clean(text);

  const suffixRe = new RegExp(
    `[,\\s/]*(?:${localities.join("|")}|\\d{5})[,\\s/]*$`,
    "i",
  );
  let out = clean(text);
  let previous = "";
  // "Merkez/Afyonkarahisar" gibi tekrar eden ekleri de temizle.
  while (out && out !== previous) {
    previous = out;
    out = clean(out.replace(suffixRe, ""));
  }
  return out;
}

/** Virgülle ayrılmış ilk mahalle benzeri parçayı bulur (ör. "Güvenevler, ..."). */
function extractCommaNeighborhood(text: string): { neighborhood: string; rest: string } {
  const segments = text.split(",");
  if (segments.length < 2) return { neighborhood: "", rest: text };

  for (let index = 0; index < segments.length; index += 1) {
    const candidate = clean(segments[index]);
    if (!candidate) continue;
    if (/\d/.test(candidate)) continue;
    if (STREET_RE.test(candidate)) continue;
    if (NEIGHBORHOOD_STOP_RE.test(candidate)) continue;
    if (LANDMARK_RE.test(candidate)) continue;
    if (ORDINAL_RE.test(candidate.toLocaleLowerCase("tr"))) continue;
    if (candidate.split(/\s+/).length > 3 || candidate.length > 32) continue;

    return {
      neighborhood: candidate,
      rest: clean([...segments.slice(0, index), ...segments.slice(index + 1)].join(",")),
    };
  }

  return { neighborhood: "", rest: text };
}

/**
 * Mevcut serbest metin adresi form alanlarına böler. Kusursuz ayrıştırma
 * hedeflenmez; alanlar kullanıcı tarafından düzeltilebilir. Adres alanlarına
 * dokunulmazsa kayıtta ORİJİNAL metin aynen korunur (bkz. AddressFields).
 */
export function parseAddress(address: string, district = "", city = ""): AddressParts {
  let rest = stripTrailingLocality(clean(address), district, city);

  let buildingNo = "";
  const noMatch = rest.match(BUILDING_NO_RE);
  if (noMatch) {
    buildingNo = clean(noMatch[1]);
    rest = clean(`${rest.slice(0, noMatch.index)} ${rest.slice((noMatch.index ?? 0) + noMatch[0].length)}`);
  }

  let neighborhood = "";
  const neighborhoodMatch = rest.match(NEIGHBORHOOD_RE);
  if (neighborhoodMatch) {
    neighborhood = clean(neighborhoodMatch[1]);
    rest = clean(
      `${rest.slice(0, neighborhoodMatch.index)} ${rest.slice((neighborhoodMatch.index ?? 0) + neighborhoodMatch[0].length)}`,
    );
  } else {
    // "Güvenevler, 611. Sk." gibi mahalle soneki olmayan yaygın biçim.
    const commaNeighborhood = extractCommaNeighborhood(rest);
    if (commaNeighborhood.neighborhood) {
      neighborhood = commaNeighborhood.neighborhood;
      rest = commaNeighborhood.rest;
    }
  }

  let street = "";
  const streetMatch = rest.match(STREET_RE);
  if (streetMatch) {
    street = clean(streetMatch[0]);
    rest = clean(`${rest.slice(0, streetMatch.index)} ${rest.slice((streetMatch.index ?? 0) + streetMatch[0].length)}`);
  } else if (rest) {
    const [first, ...remaining] = rest.split(",");
    street = clean(first);
    rest = clean(remaining.join(","));
  }

  return {
    neighborhood,
    street,
    buildingNo,
    details: clean(rest),
  };
}

/**
 * Alanları tekrar `companies.address` metnine birleştirir. İl/ilçe ayrı
 * kolonlarda tutulduğu için metnin sonuna yalnız okunabilirlik amacıyla eklenir.
 * Sokak seviyesinde hiçbir alan yoksa boş döner (adres zorunlu değildir).
 */
export function composeAddress(parts: AddressParts, district = "", city = ""): string {
  const pieces: string[] = [];

  const neighborhood = clean(parts.neighborhood);
  if (neighborhood) {
    pieces.push(/(mah\.?|mahallesi)$/i.test(neighborhood) ? neighborhood : `${neighborhood} Mah.`);
  }

  const street = clean(parts.street);
  if (street) pieces.push(street);

  const buildingNo = clean(parts.buildingNo);
  if (buildingNo) pieces.push(/^no\b/i.test(buildingNo) ? buildingNo : `No:${buildingNo}`);

  const details = clean(parts.details);
  if (details) pieces.push(details);

  if (pieces.length === 0) return "";

  const locality = [district.trim(), city.trim()].filter(Boolean).join(", ");
  if (locality) pieces.push(locality);

  return pieces.join(", ");
}

/**
 * Yedek mahalle/sokak önerileri uydurulmaz: yalnız mevcut firma adreslerinden
 * (seçili il + ilçe) türetilir. Resmî mahalle listesi olan illerde form bunu
 * tercih eder; kullanıcı listede olmayan değeri her durumda elle yazabilir.
 */
export function addressSuggestions(
  companies: Array<Pick<Company, "cityId" | "district" | "address">>,
  cityId: string,
  district: string,
  cityName = "",
  neighborhood = "",
): AddressSuggestions {
  const neighborhoods = new Set<string>();
  const streets = new Set<string>();
  const allStreets = new Set<string>();
  const neighborhoodKey = normalizeSearch(neighborhood);
  const districtKey = normalizeSearch(district);

  if (!cityId) {
    return { neighborhoods: [], streets: [], allStreets: [] };
  }

  for (const company of companies) {
    if (company.cityId !== cityId) continue;
    if (districtKey && normalizeSearch(company.district) !== districtKey) continue;
    if (!company.address.trim()) continue;

    const parsed = parseAddress(company.address, company.district, cityName);
    if (parsed.neighborhood) neighborhoods.add(parsed.neighborhood);
    if (!parsed.street) continue;

    allStreets.add(parsed.street);
    if (!neighborhoodKey || normalizeSearch(parsed.neighborhood) === neighborhoodKey) {
      streets.add(parsed.street);
    }
  }

  const sortTr = (values: Set<string>) => [...values].sort((a, b) => a.localeCompare(b, "tr"));

  return {
    neighborhoods: sortTr(neighborhoods),
    streets: sortTr(streets),
    allStreets: sortTr(allStreets),
  };
}
