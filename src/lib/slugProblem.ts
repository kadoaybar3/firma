/**
 * Tur 4: Geçersiz route-parametre tespiti — soft-404/noindex kapısı.
 *
 * Sorun: /kategori/bilbo veya /sehir/oydu gibi geçersiz slug'lar sessizce
 * "Tüm Firmalar" (filtresiz) listeleme render ediyordu; sayfa indexable
 * kalıyordu (kendine canonical basan boş içerik) → Google gözünde
 * soft-404 / çift içerik karışımı.
 *
 * Çözüm: çağıran sayfa çözümlemeyi yapıp Boolean doğrulama sinyallerini
 * verir; bu yardımcı yalnızca ÖNCELİK sırasını (kategori > şehir > ilçe)
 * ve mesaj kurmayı merkezlendirir. Geçerli yollarda null — davranış
 * hiç değişmez.
 */

export type SlugKind = "kategori" | "sehir" | "ilce";

export interface SlugProblem {
  kind: SlugKind;
  /** URL'deki ham değer (mesajda birebir kullanılır) */
  value: string;
}

export interface SlugSignals {
  /** URL'de kategori slug'ı var mı (yol veya ?kategori=) */
  catSlug?: string;
  /** URL'de şehir slug'ı var mı (yol veya ?sehir=) */
  citySlug?: string;
  /** URL'de ilçe var mı (yol veya ?ilce=) */
  district?: string;
  /** Çözümleme: kategori bulundu mu */
  hasCategory: boolean;
  /** Çözümleme: şehir bulundu mu */
  hasCity: boolean;
  /** Çözümleme: (şehri seçiliyken) ilçe şehrin ilçeleriyle eşleşti mi */
  hasDistrict: boolean;
}

export function slugProblem(inp: SlugSignals): SlugProblem | null {
  if (inp.catSlug && !inp.hasCategory) {
    return { kind: "kategori", value: inp.catSlug };
  }
  if (inp.citySlug && !inp.hasCity) {
    return { kind: "sehir", value: inp.citySlug };
  }
  if (inp.citySlug && inp.district && !inp.hasDistrict) {
    return { kind: "ilce", value: inp.district };
  }
  return null;
}

/** Kullanıcıya yönelik kısa mesaj */
export function slugProblemMessage(p: SlugProblem): string {
  const kindName = p.kind === "kategori" ? "kategori" : p.kind === "sehir" ? "şehir" : "ilçe";
  return `“${p.value}” adında bir ${kindName} rehberde yer almıyor.`;
}
