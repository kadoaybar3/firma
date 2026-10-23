import { describe, expect, it } from "vitest";
import {
  analyzeImportRows,
  addressTokens,
  chunk,
  findDuplicates,
  guessMapping,
  isValidPhone,
  levenshteinRatio,
  matchCategory,
  matchCity,
  matchDistrict,
  normalizeCompanyName,
  parseDelimited,
  phoneKey,
  planCityFromStatic,
  resolveImportCategoryId,
  tokenJaccard,
  type ImportCandidate,
  type ImportField,
} from "./importLib";
import type { Category, City, Company, Actor } from "./types";
import { addDistrict, createCategory, createCity, createCompany, listCities, listCompanies, resetDB } from "./repo";

/* ——— Test referansları: en az veriyle davranışı belirleyen kurulum ——— */

const city: City = {
  id: "city-1",
  name: "Afyonkarahisar",
  slug: "afyonkarahisar",
  districts: ["Merkez", "Sandıklı", "Şuhut"],
};
const cities = [city];

const mkCategory = (name: string, slug: string): Category => ({ id: `cat-${slug}`, name, slug, icon: "🏢" });
const categories = [mkCategory("Fırınlar", "firinlar"), mkCategory("Yemek & Restoran", "yemek-restoran")];

const mkCompany = (over: Partial<Company>): Company => ({
  id: over.id ?? "co-x",
  name: over.name ?? "Test Firma",
  slug: over.slug ?? "test-firma",
  categoryId: over.categoryId ?? "cat-firinlar",
  cityId: over.cityId ?? "city-1",
  district: over.district ?? "Merkez",
  address: over.address ?? "Kazım Karabekir Cd. No:10",
  phone: over.phone ?? "05551112233",
  socials: {},
  description: "",
  images: [],
  hours: { weekday: "", saturday: "", sunday: "" },
  featured: false,
  published: true,
  createdAt: "",
  updatedAt: "",
  ...over,
});

const HEADERS = ["Firma Adı", "Telefon", "Şehir", "İlçe", "Kategori", "Adres"];
const mapAll: Partial<Record<ImportField, number>> = {
  name: 0,
  phone: 1,
  city: 2,
  district: 3,
  category: 4,
  address: 5,
};

function analyzeRaw(
  rows: string[][],
  opts = { autoCreateCategory: true, autoCreateDistrict: true, autoCreateCity: true },
) {
  return analyzeImportRows(
    rows.map((r) => ({ "Firma Adı": r[0], Telefon: r[1], Şehir: r[2], İlçe: r[3], Kategori: r[4], Adres: r[5] })),
    mapAll,
    opts,
    { cities, categories, companies: [], headers: HEADERS },
  );
}

/** O-7 yardımcı: eşsiz telefonlu tek kayıt (Record) üretir. */
let o7Counter = 700;
function buildRow(name: string, cityText: string, districtText: string): Record<string, string> {
  o7Counter += 1;
  const suffix = String(o7Counter).padStart(2, "0");
  return {
    "Firma Adı": name,
    Telefon: `0555 100 ${suffix} 33`,
    Şehir: cityText,
    İlçe: districtText,
    Kategori: "Fırınlar",
    Adres: "Test Cd. No:1",
  };
}

describe("phoneKey", () => {
  it("baş sıfır ve ülke kodu giderilir — aynı numara tek anahtarda birleşir", () => {
    const values = ["+90 555 111 22 33", "0555 111 22 33", "5551112233", "90 555 111 22 33", "+90 (555) 111-2233"];
    const keys = new Set(values.map(phoneKey));
    expect(keys.size).toBe(1);
  });

  it("farklı numaralar farklı anahtarlar üretir", () => {
    expect(phoneKey("05551112233")).not.toBe(phoneKey("05551112244"));
  });
});

describe("isValidPhone", () => {
  it("TR biçimlerini kabul eder", () => {
    for (const v of ["05551112233", "+905551112233", "5551112233"]) expect(isValidPhone(v)).toBe(true);
  });
  it("boş ve kısa değerleri reddeder", () => {
    expect(isValidPhone("")).toBe(false);
    expect(isValidPhone("123")).toBe(false);
    expect(isValidPhone("abc")).toBe(false);
  });
});

describe("parseDelimited", () => {
  it("noktalı virgül ayraçlı TR Excel çıktısını ayrıştırır", () => {
    const { headers, rows } = parseDelimited("Ad;Telefon\nAli Bakkal;05551112233\nVeli Fırın;05554445555");
    expect(headers).toEqual(["Ad", "Telefon"]);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(["Veli Fırın", "05554445555"]);
  });

  it("tırnağa alınmış alandaki ayraç ve tırnak kaçışını destekler", () => {
    const { rows } = parseDelimited('Ad,Adres\n"Şahin, Ltd","Kuzu Sk.""no 3"""');
    expect(rows[0][0]).toBe("Şahin, Ltd");
    expect(rows[0][1]).toBe('Kuzu Sk."no 3"');
  });

  it("boş girdi boş sonuç döner", () => {
    expect(parseDelimited("   ")).toEqual({ headers: [], rows: [] });
  });
});

describe("guessMapping", () => {
  it("Türkçe başlıkları doğru alanlara eşler", () => {
    const g = guessMapping(["Firma Adı", "Telefon", "Şehir", "İlçe", "Kategori", "Adres", "Web Sitesi", "E-Posta"], [
      "name",
      "phone",
      "city",
      "district",
      "category",
      "address",
      "website",
      "email",
    ]);
    expect(g).toEqual({ name: 0, phone: 1, city: 2, district: 3, category: 4, address: 5, website: 6, email: 7 });
  });
});

describe("analyzeImportRows", () => {
  it("geçerli satırı şehir/ilçe/kategori çözümüyle üretir ve sorunsuz geçer", () => {
    const { valid, issues, plannedCategories } = analyzeRaw([
      ["Ayşe Fırın", "05551112233", "Afyonkarahisar", "Merkez", "Fırınlar", "Cumhuriyet Cd. 5"],
    ]);
    expect(issues).toEqual([]);
    expect(valid).toHaveLength(1);
    expect(valid[0].city?.id).toBe("city-1");
    expect(valid[0].district).toBe("Merkez");
    expect(valid[0].categoryId).toBe("cat-firinlar");
    expect(plannedCategories.size).toBe(0);
  });

  it("otomatik kategori kapalıyken eşleşmeyen kategori hata olur", () => {
    const { valid, issues } = analyzeRaw(
      [["Yeni İş", "05551112233", "Afyonkarahisar", "Merkez", "Kuyumcular", "adres"]],
      { autoCreateCategory: false, autoCreateDistrict: true, autoCreateCity: false },
    );
    expect(valid).toHaveLength(0);
    expect(issues[0].severity).toBe("hata");
    expect(issues[0].message).toContain("Kuyumcular");
  });

  it("otomatik kategori açıkken yeni kategori planı üretilir", () => {
    const { valid, plannedCategories } = analyzeRaw([
      ["Yeni İş", "05551112233", "Afyonkarahisar", "Merkez", "Kuyumcular", "adres"],
    ]);
    expect(valid[0].categoryId).toBe("plan:kuyumcular");
    expect(plannedCategories.get("kuyumcular")).toBe("Kuyumcular");
  });

  it("kayıtlı olmayan ilçe için otomatik ekleme kapalıyken hata üretir", () => {
    const { valid, issues } = analyzeRaw(
      ["Test", "05551112233", "Afyonkarahisar", "Bolu", "Fırınlar", "adres"].map((v) => [v] as string[]) &&
        [["Test", "05551112233", "Afyonkarahisar", "Bolu", "Fırınlar", "adres"]],
      { autoCreateCategory: true, autoCreateDistrict: false, autoCreateCity: false },
    );
    expect(valid).toHaveLength(0);
    expect(issues[0].message).toContain("Bolu");
  });

  it("adresi boş satırı uyarı işaretler ama kayıttan düşürmez", () => {
    const { valid, issues } = analyzeRaw([["Test", "05551112233", "Afyonkarahisar", "Merkez", "Fırınlar", ""]]);
    expect(issues.some((i) => i.severity === "uyari" && i.message.includes("Adres alanı boş"))).toBe(true);
    expect(valid).toHaveLength(1);
  });

  it("telefonu geçersiz satır hata olur", () => {
    const { valid, issues } = analyzeRaw([["Test", "123", "Afyonkarahisar", "Merkez", "Fırınlar", "a"]]);
    expect(valid).toHaveLength(0);
    expect(issues[0].message).toContain("telefon");
  });

  it("eşleşmeyen şehir hata olur (otomatik il açma KAPALIYKEN)", () => {
    const { valid, issues } = analyzeRaw([["Test", "05551112233", "İstanbul", "Merkez", "Fırınlar", "a"]], {
      autoCreateCategory: true,
      autoCreateDistrict: true,
      autoCreateCity: false,
    });
    expect(valid).toHaveLength(0);
    expect(issues[0].message).toContain("Şehir eşleşmedi");
  });

  // ---- O-7: Şehir eşleştirme — veritabanında il kaydı yoksa statik il listesiyle planlama ----

  it("O-7: veritabanında il kaydı YOKSA 'Afyonkarahisar' hatayla DEĞİL, planla çözülür", () => {
    // canlı kaza senaryosu: cities boş — her satır hata veriyordu
    const { valid, issues, plannedCities } = analyzeImportRows(
      [buildRow("RS Oto Ekspertiz Afyonkarahisar Merkez", "Afyonkarahisar", "Merkez")],
      mapAll,
      { autoCreateCategory: true, autoCreateDistrict: true, autoCreateCity: true },
      { cities: [], categories, companies: [], headers: HEADERS },
    );
    expect(issues.filter((i) => i.severity === "hata")).toHaveLength(0);
    expect(valid).toHaveLength(1);
    expect(valid[0].city).toBeUndefined();
    expect(valid[0].cityPlanKey).toBe("afyonkarahisar");
    expect(valid[0].district).toBe("Merkez");
    expect(plannedCities.get("afyonkarahisar")).toBe("Afyonkarahisar");
  });

  it("O-7: Türkçe biçim farkları (büyük harf, İ/ı, boşluk, 'ili' eki) aynı plana iner", () => {
    for (const text of ["AFYONKARAHİSAR", " afyonkarahisar ", "Afyonkarahisar ili", "AFYONKARAHISAR"]) {
      const plan = planCityFromStatic(text);
      expect(plan?.name).toBe("Afyonkarahisar");
      expect(plan?.key).toBe("afyonkarahisar");
    }
  });

  it("O-7: ilçe metni statik ilçe listesiyle Türkçe duyarsız eşleşir", () => {
    const plan = planCityFromStatic("Afyonkarahisar", "ŞUHUT");
    expect(plan?.district).toBe("Şuhut");
    // kayıtlı olmayan ilçe adı bozulmadan döner (autoCreateDistrict ile kayıt aşamasında açılır)
    expect(planCityFromStatic("Afyonkarahisar", "Merkez Sim_sms")?.district).toBeUndefined();
  });

  it("O-7: realite dışı / talı şehir adı sessizce kabul edilmez — hata kalır", () => {
    // 'Afyon' talı ad — birebir il adı olmadığından planlanmaz
    const afyon = planCityFromStatic("Afyon");
    expect(afyon).toBeUndefined();
    const { valid, issues } = analyzeImportRows(
      [buildRow("Gölgem Kafe", "Çakmak Köyü", "Merkez")],
      mapAll,
      { autoCreateCategory: true, autoCreateDistrict: true, autoCreateCity: true },
      { cities: [], categories, companies: [], headers: HEADERS },
    );
    expect(valid).toHaveLength(0);
    expect(issues[0].message).toContain("Şehir eşleşmedi");
  });

  it("O-7: satırın kendi şehri neyse O planlanır — farklı il hedef şehre sessizce çevrilmez", () => {
    const { valid, plannedCities } = analyzeImportRows(
      [
        buildRow("Afyon Oto Ekspertiz", "Afyonkarahisar", "Merkez"),
        buildRow("İzmir Reklam Ajansı", "İzmir", "Karabağlar"),
      ],
      mapAll,
      { autoCreateCategory: true, autoCreateDistrict: true, autoCreateCity: true },
      { cities: [], categories, companies: [], headers: HEADERS },
    );
    expect(plannedCities.get("afyonkarahisar")).toBe("Afyonkarahisar");
    expect(plannedCities.get("izmir")).toBe("İzmir");
    const izmirRow = valid.find((v) => v.cityPlanKey === "izmir");
    expect(izmirRow?.district).toBe("Karabağlar"); // İzmir'e kendi statik ilçesinden gelir
    expect(izmirRow?.district).not.toBe("Merkez");
  });

  it("O-7: DB'de il VARSA mevcut kayıt kullanılır — plan oluşturulmaz", () => {
    const { valid, plannedCities } = analyzeRaw([["Test", "05551112233", "Afyonkarahisar", "Sandıklı", "Fırınlar", "a"]]);
    expect(valid[0].city?.id).toBe("city-1");
    expect(valid[0].cityPlanKey).toBeUndefined();
    expect(plannedCities.size).toBe(0);
  });

  it("dosya içinde aynı telefonu taşıyan ikinci satır atlanır", () => {
    const { valid, issues } = analyzeRaw([
      ["Birinci", "05551112233", "Afyonkarahisar", "Merkez", "Fırınlar", "Bir adres"],
      ["İkinci", "+90 555 111 22 33", "Afyonkarahisar", "Merkez", "Fırınlar", "Başka adres"],
    ]);
    expect(valid).toHaveLength(1);
    expect(issues.some((i) => i.message.includes("aynı telefon"))).toBe(true);
  });
});

describe("findDuplicates", () => {
  const existing: Company[] = [
    mkCompany({ id: "co-1", name: "Şahin Fırın", slug: "sahin-firin", phone: "05551112233", address: "Kazım Karabekir Cd 10" }),
    mkCompany({ id: "co-2", name: "Ege Yemek Evi", slug: "ege-yemek-evi", phone: "05552223344", address: "Cumhuriyet Cd 5" }),
  ];

  it("aynı telefon → kesin çakışma", () => {
    const rep = findDuplicates({ name: "Yeni Şahin", phone: "+90 555 111 22 33", address: "başka" }, existing);
    expect(rep.exact).toHaveLength(1);
    expect(rep.exact[0].company.id).toBe("co-1");
    expect(rep.suspicious).toHaveLength(0);
  });

  it("bambaşka firma temiz çıkar", () => {
    const rep = findDuplicates({ name: "Zeytin Lokantası", phone: "05559998877", address: "Bağ Cd 88" }, existing);
    expect(rep.exact).toHaveLength(0);
    expect(rep.suspicious).toHaveLength(0);
  });

  it("tip ekleri atılarak benzer ad bulunduğunda şüpheli sayılır", () => {
    const rep = findDuplicates(
      { name: "Şahin Fırın Ltd Şti", phone: "05557776655", address: "yeni adres" },
      existing,
    );
    // "ltd/sti" atılır → ad-normalize "şahin fırın" birebir; telefon/slug farklı olduğundan
    // kesin değil, şüphelidir (kullanıcı kararına sunulur).
    expect(rep.exact).toHaveLength(0);
    expect(rep.suspicious).toHaveLength(1);
    expect(rep.suspicious[0].company.id).toBe("co-1");
  });

  it("birebir aynı ad (slug) → kesin çakışma", () => {
    const rep = findDuplicates(
      { name: "Ege Yemek Evi", phone: "05558889900", address: "başka bir yer" },
      existing,
    );
    expect(rep.exact).toHaveLength(1);
    expect(rep.exact[0].company.id).toBe("co-2");
  });

  it("benzer ad + benzer adres → şüpheli, kayıt engellenmez", () => {
    const rep = findDuplicates(
      { name: "Ege Yemek Evi 2", phone: "05556667788", address: "Cumhuriyet Cd. 5/A" },
      existing,
    );
    expect(rep.exact).toHaveLength(0);
    expect(rep.suspicious).toHaveLength(1);
    expect(rep.suspicious[0].company.id).toBe("co-2");
  });

  it("mevcut firma verisi mutasyonla dönmez — salt-okunur referans", () => {
    const rep = findDuplicates({ name: "Zeytin Lokantası", phone: "05559998877", address: "a" }, existing);
    expect(rep.exact).toEqual([]);
    expect(rep.suspicious).toEqual([]);
    expect(existing).toHaveLength(2);
  });
});

describe("benzerlik yardımcıları", () => {
  it("normalizeCompanyName tip eklerini atar", () => {
    expect(normalizeCompanyName("Şahin Ltd Şti")).toBe(normalizeCompanyName("Şahin"));
  });

  it("levenshteinRatio uçlarda 0-1", () => {
    expect(levenshteinRatio("ayni", "ayni")).toBe(1);
    expect(levenshteinRatio("abc", "xyz")).toBeLessThan(0.2);
  });

  it("tokenJaccard aynı adreslerde yüksek, farklıda düşük", () => {
    expect(tokenJaccard("Cumhuriyet Cd 5 No 3", "Cumhuriyet Cd. 5")).toBeGreaterThan(0.5);
    expect(tokenJaccard("Cumhuriyet Cd 5", "Bağ Cd 88")).toBeLessThan(0.5);
  });

  it("addressTokens sokak tipi gürültüyü atar", () => {
    const t = addressTokens(" Cumhuriyet Mah. Yeni Sk. No: 9 ");
    expect(t.has("mahallesi")).toBe(false);
    expect(t.has("yeni")).toBe(true);
  });
});

describe("eşleştirme", () => {
  it("matchCity Türkçe normalizasyonla eşler", () => {
    expect(matchCity("afyonkarahisar", cities)?.id).toBe("city-1");
    expect(matchCity("AFYONKARAHİSAR", cities)?.id).toBe("city-1");
    expect(matchCity("İstanbul", cities)).toBeUndefined();
  });

  it("matchDistrict merkez ve case duyarsız", () => {
    expect(matchDistrict("", city)).toBe("Merkez");
    expect(matchDistrict("merkez", city)).toBe("Merkez");
    expect(matchDistrict("ŞUHUT", city)).toBe("Şuhut");
    expect(matchDistrict("Bolu", city)).toBeUndefined();
  });

  it("matchCategory ad veya slug eşler", () => {
    expect(matchCategory("Fırınlar", categories)?.id).toBe("cat-firinlar");
    expect(matchCategory("firinlar", categories)?.id).toBe("cat-firinlar");
    expect(matchCategory("Yemek", categories)).toBeUndefined();
  });
});

describe("chunk", () => {
  it("boyuta göre böler, son grup kalıntıyı taşır", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 10)).toEqual([]);
  });
});

/* ============ KOORDİNAT (ENLEM/BOYLAM) ============ */

const GOOGLE_HEADERS = ["Firma Adı", "Telefon", "Şehir", "İlçe", "Kategori", "Adres", "Enlem", "Boylam", "Place ID"];

const GA = "Kazım Karabekir Cd 10"; // geçerli örnek adres

function analyzeGoogle(rows: Array<Record<string, string>>) {
  return analyzeImportRows(
    rows,
    {
      name: 0,
      phone: 1,
      city: 2,
      district: 3,
      category: 4,
      address: 5,
      latitude: 6,
      longitude: 7,
      placeId: 8,
    },
    { autoCreateCategory: false, autoCreateDistrict: true, autoCreateCity: true },
    { cities, categories, companies: [], headers: GOOGLE_HEADERS },
  );
}

describe("koordinat analizleri (importLib)", () => {
  it("enlem ve boylam doğru sütunlardan doğru alana eşlenir — karışmaz", () => {
    const { valid, issues } = analyzeGoogle([
      { "Firma Adı": "A Fırın", Telefon: "05551112233", Şehir: "Afyonkarahisar", İlçe: "Merkez", Kategori: "Fırınlar", Adres: GA, Enlem: "39.912345", Boylam: "32.854321", "Place ID": "ChIJabcd1234" },
    ]);
    expect(issues).toEqual([]);
    expect(valid[0].latitude).toBe(39.912345);
    expect(valid[0].longitude).toBe(32.854321);
    expect(valid[0].placeId).toBe("ChIJabcd1234");
  });

  it("TR ondalık virgülü çözümlenir", () => {
    const { valid, issues } = analyzeGoogle([
      { "Firma Adı": "B Fırın", Telefon: "05551112233", Şehir: "Afyonkarahisar", İlçe: "Merkez", Kategori: "Fırınlar", Adres: GA, Enlem: "38,75", Boylam: "30,52", "Place ID": "" },
    ]);
    expect(issues).toEqual([]);
    expect(valid[0].latitude).toBe(38.75);
    expect(valid[0].longitude).toBe(30.52);
  });

  it("geçersiz koordinat reddedilir (satır kaydına engel olmaz)", () => {
    const { valid, issues } = analyzeGoogle([
      { "Firma Adı": "C Fırın", Telefon: "05551112233", Şehir: "Afyonkarahisar", İlçe: "Merkez", Kategori: "Fırınlar", Adres: GA, Enlem: "125", Boylam: "32.8", "Place ID": "" },
      { "Firma Adı": "D Fırın", Telefon: "05553334455", Şehir: "Afyonkarahisar", İlçe: "Merkez", Kategori: "Fırınlar", Adres: GA, Enlem: "abc", Boylam: "32.8", "Place ID": "" },
    ]);
    expect(valid).toHaveLength(2);
    expect(valid[0].latitude).toBeUndefined();
    expect(valid[1].latitude).toBeUndefined();
    expect(issues.some((i) => i.message.includes("Enlem aralık dışı"))).toBe(true);
    expect(issues.some((i) => i.message.includes("çözümlenemedi"))).toBe(true);
  });

  it("boylam aralık dışı da reddedilir", () => {
    const { valid, issues } = analyzeGoogle([
      { "Firma Adı": "E Fırın", Telefon: "05551112233", Şehir: "Afyonkarahisar", İlçe: "Merkez", Kategori: "Fırınlar", Adres: GA, Enlem: "39.9", Boylam: "-200", "Place ID": "" },
    ]);
    expect(issues.some((i) => i.message.includes("Boylam aralık dışı"))).toBe(true);
    expect(valid[0].longitude).toBeUndefined();
  });

  it("koordinatı olmayan firmalar içe aktarılabilir (sorunsuz)", () => {
    const { valid, issues } = analyzeGoogle([
      { "Firma Adı": "F Fırın", Telefon: "05551112233", Şehir: "Afyonkarahisar", İlçe: "Merkez", Kategori: "Fırınlar", Adres: GA, Enlem: "", Boylam: "", "Place ID": "" },
    ]);
    expect(issues).toEqual([]);
    expect(valid[0].latitude).toBeUndefined();
  });
});

/* ============ KATEGORİ ÇÖZÜMLEME (KAYIT ÖNCESİ ZORUNLU) ============ */

describe("resolveImportCategoryId", () => {
  const cand = (categoryId?: string): Pick<ImportCandidate, "categoryId" | "name"> => ({
    categoryId,
    name: "Test Firması",
  });

  it("gerçek DB kimliği verify ettiğinde aynen geçer — tahmin yok", () => {
    const res = resolveImportCategoryId(cand("cat-42"), new Map(), (id) => id === "cat-42");
    expect(res).toEqual({ ok: true, categoryId: "cat-42" });
  });

  it("plan anahtarı planMap'ten gerçek kimliğe eşlenir (createCategory çıktısı)", () => {
    const res = resolveImportCategoryId(cand("plan:kasaplar"), new Map([["kasaplar", "cat-real-7"]]), (id) => id === "cat-real-7");
    expect(res).toEqual({ ok: true, categoryId: "cat-real-7" });
  });

  it("plan açılamadıysa firma kaydedilmez — kategorisiz değil, hata", () => {
    const res = resolveImportCategoryId(cand("plan:yok"), new Map(), () => true);
    if (res.ok === true) throw new Error("hata beklenirdi");
    expect(res.reason).toContain("kaydedilmedi");
  });

  it("kimlık boş/eksikse kesin hata — '' ID ile kayıt engellenir", () => {
    for (const empty of [undefined, "", "  "]) {
      const res = resolveImportCategoryId(cand(empty), new Map(), () => true);
      if (res.ok === true) throw new Error("hata beklenirdi");
      expect(res.reason).toContain("kategorisiz kaydedilemez");
    }
  });

  it("kayitlar arasi kategori silinmişse verify başarısız → kayıt engellenir", () => {
    const res = resolveImportCategoryId(cand("cat-ghost"), new Map(), () => false);
    if (res.ok === true) throw new Error("hata beklenirdi");
    expect(res.reason).toContain("veritabanında yok");
  });
});

/* ============ KATEGORİ BAĞLAMA — REPO DÜZEYİ (listeleme doğrulaması) ============ */

/* ============ O-7: PLANLI ŞEHİR — REPO AKIŞI ============ */

describe("O-7: planlı şehir kayıt aşamasında gerçek kimlikle açılır (repo akışı)", () => {
  it("createCity → addDistrict → createCompany(city.id) zinciri gerçek kimlikle çalışır", () => {
    resetDB();
    const actor: Actor = { role: "admin", userId: "u1" };
    // runImport'un 1b adımı: plan şehri createCity ile veritabanından açılır
    const city = createCity("Afyonkarahisar", actor);
    expect(city.id).toBeTruthy();
    expect(city.name).toBe("Afyonkarahisar");
    expect(listCities().map((c) => c.id)).toContain(city.id);
    // yeni şehirde ilçe açma (mevcut davranış) — analizde statik listeden gelen ad
    addDistrict(city.id, "Şuhut", actor);
    const refreshed = listCities().find((c) => c.id === city.id);
    expect(refreshed?.districts).toContain("Şuhut");
    // firma kaydı planlı şehrin GERÇEK kimliğine bağlanır — tahminî kimlik yok
    const cat = createCategory("Oto Ekspertiz", "🚗", actor);
    const co = createCompany(
      {
        name: "RS Oto Ekspertiz Afyonkarahisar Merkez",
        categoryId: cat.id,
        cityId: city.id,
        district: "Merkez",
        address: "Test Cd. 1",
        phone: "05551112777",
        description: "",
        published: false,
      },
      actor,
    );
    expect(co.cityId).toBe(city.id);
  });
});

describe("içe aktarılan firmalar kategori altında listelenir (repo akışı)", () => {
  it("createCategory → createCompany(categoryId) → listCompanies({categoryId}) birebilir", () => {
    resetDB();
    const actor: Actor = { role: "admin", userId: "u1" };
    const cat = createCategory("Kasaplar", "🥩", actor);
    const co = createCompany(
      {
        name: "Mehmet Usta Kasap",
        categoryId: cat.id,
        cityId: "city-1",
        district: "Merkez",
        address: "Kazım Karabekir Cd. 5",
        phone: "05551112233",
        description: "Örnek",
        published: true,
      },
      actor,
    );
    // Kaydedilen firmanın kategori kimliği, seçilen kategorinin gerçeğidir
    expect(co.categoryId).toBe(cat.id);
    const listed = listCompanies({ categoryId: cat.id, includeUnpublished: true });
    expect(listed.map((c) => c.id)).toContain(co.id);
    // Farklı kategoride listelenmez
    expect(listCompanies({ categoryId: "cat-yok", includeUnpublished: true }).map((c) => c.id)).not.toContain(co.id);
  });

  it("kategorisiz (boş ID) kayıt repo katmanında da 'kategori eşleşmedi' gibi filtrelerde kaymaz ve motor error verir", () => {
    resetDB();
    const actor: Actor = { role: "admin", userId: "u1" };
    // Katman 1: motor çözümleyici kategorisiz adayта kilit koymuştu (yukarıdaki test)
    const res = resolveImportCategoryId({ categoryId: undefined, name: "Kategorisiz" }, new Map(), () => true);
    if (res.ok === true) throw new Error("hata beklenirdi");
    expect(res.reason.includes("kategorisiz kaydedilemez")).toBe(true);
    // Katman 2: boş ID içine sızarsa listCompanies({categoryId}) onu yanlış kategoriye düşürmez
    const co = createCompany(
      {
        name: "Boş Kategori Deneme",
        categoryId: "",
        cityId: "city-1",
        district: "Merkez",
        address: "a",
        phone: "05559990000",
        description: "",
        published: true,
      },
      actor,
    );
    expect(co.categoryId).toBe("");
    expect(listCompanies({ categoryId: "cat-firinlar", includeUnpublished: true }).map((c) => c.id)).not.toContain(co.id);
  });
});
