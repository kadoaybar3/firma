import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "../components/SEO";
import {
  buildLocalBusinessJsonLd,
  businessSchemaType,
  openingHoursSpecs,
  parseTimeRange,
  safeExternalUrl,
} from "./seo";
import type { Company } from "./types";

describe("parseTimeRange", () => {
  it("standart aralığı ISO saatine çevirir", () => {
    expect(parseTimeRange("09:00 - 14:00")).toEqual({ opens: "09:00", closes: "14:00" });
  });

  it("türkçe-virgüllü ve kısa saat biçimlerini de destekler", () => {
    expect(parseTimeRange("8.30–19.00")).toEqual({ opens: "08:30", closes: "19:00" });
  });

  it("'kapalı' ve bozuk veri için null döner", () => {
    expect(parseTimeRange("Kapalı")).toBeNull();
    expect(parseTimeRange("")).toBeNull();
    expect(parseTimeRange("her gün")).toBeNull();
  });
});

describe("businessSchemaType", () => {
  it("bilinen kategorileri doğru alt tipe eşler", () => {
    expect(businessSchemaType("Yemek & İçecek")).toBe("FoodEstablishment");
    expect(businessSchemaType("Kuyumculuk")).toBe("JewelryStore");
    expect(businessSchemaType("Yapı & İnşaat")).toBe("HomeAndConstructionBusiness");
  });

  it("bilinmeyen kategori düz LocalBusiness olur (School/Farm gibi yanlış tip asla seçilmez)", () => {
    expect(businessSchemaType("Eğitim")).toBe("LocalBusiness");
    expect(businessSchemaType("Tarım & Hayvancılık")).toBe("LocalBusiness");
    expect(businessSchemaType("Bilinmeyen")).toBe("LocalBusiness");
  });
});

describe("openingHoursSpecs", () => {
  it("kapalı günleri hiç üretmez; parse edilebilenleri gün gruplarıyla üretir", () => {
    const specs = openingHoursSpecs({ weekday: "08:00 - 19:00", saturday: "Kapalı", sunday: "09:00 - 14:00" });
    expect(specs).toHaveLength(2);
    expect(specs[0].dayOfWeek).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
    expect(specs[0].opens).toBe("08:00");
    expect(specs[0].closes).toBe("19:00");
    expect(specs[1].dayOfWeek).toEqual(["Sunday"]);
  });
});

describe("safeExternalUrl", () => {
  it("http/https dışındaki şemaları (javascript:, ws:) reddeder", () => {
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("ws://x")).toBeNull();
    expect(safeExternalUrl("https://ornek.example")).toBe("https://ornek.example/");
    expect(safeExternalUrl(undefined)).toBeNull();
  });
});

describe("serializeJsonLd", () => {
  it("script kapanış dizisini bozar: <, >, &, U+2028/U+2029 kaçırılır — enjeksiyon imkânsız", () => {
    const json = serializeJsonLd({ name: "Örnek</script><img src=x onerror=alert(1)>" });
    expect(json).not.toContain("</script");
    expect(json).toContain("\\u003c/script\\u003e\\u003cimg src=x onerror=alert(1)\\u003e");

    const graph = serializeJsonLd({ a: "x&y", b: "satır\u2028ayırıcı" });
    expect(graph).not.toContain("&");
    expect(graph).not.toContain("\u2028");
    expect(graph).toContain("\\u0026");
  });

  it("çıktı geçerli JSON yorumlanır (escape yalnızca string içindedir)", () => {
    const parsed = JSON.parse(serializeJsonLd({ ad: "Ay<dı\r\nn" })) as { ad: string };
    expect(parsed.ad).toBe("Ay<dı\r\nn");
  });
});

describe("buildLocalBusinessJsonLd", () => {
  const base: Company = {
    id: "co-1",
    slug: "ornek-firma",
    name: "Örnek Firma</script>",
    categoryId: "cat-1",
    cityId: "city-1",
    district: "Merkez",
    address: "Cumhuriyet Cad.",
    phone: "0272 000 00 00",
    email: "",
    website: "",
    socials: {},
    description: "Test açıklaması",
    images: [],
    hours: { weekday: "08:00 - 19:00", saturday: "Kapalı", sunday: "Kapalı" },
    published: true,
    featured: false,
    createdAt: "",
    updatedAt: "",
  };

  it("doğrulanmamış alanları asla üretmez (geo, aggregateRating, image yok)", () => {
    const ld = buildLocalBusinessJsonLd({ company: base, categoryName: "Kuyumculuk", pageUrl: "https://x/firma/ornek-firma" });
    expect(ld["@type"]).toBe("JewelryStore");
    expect(ld).not.toHaveProperty("geo");
    expect(ld).not.toHaveProperty("aggregateRating");
    expect(ld).not.toHaveProperty("image");
  });

  it("['</script>'] karakterlerini metne taşır ama JSON stringde kaçırmasız çıkar (SEO.tsx'te escape edilir)", () => {
    const ld = buildLocalBusinessJsonLd({ company: base, pageUrl: "https://x/firma/ornek-firma" });
    const json = JSON.stringify(ld);
    expect(json).toContain("</script>");
    expect(ld.telephone).toBe("0272 000 00 00");
  });

  it("sosyal bağlantıları sameAs'e koyar; yoksa alan oluşmaz", () => {
    const withSocials = { ...base, socials: { instagram: "ornek" } as Company["socials"] };
    const ld = buildLocalBusinessJsonLd({ company: withSocials, pageUrl: "https://x" }) as { sameAs?: string[] };
    expect(ld.sameAs).toEqual(["https://instagram.com/ornek"]);

    const ld2 = buildLocalBusinessJsonLd({ company: base, pageUrl: "https://x" }) as { sameAs?: string[] };
    expect(ld2.sameAs).toBeUndefined();
  });

  it("sıkıştırılmış metin boşsa description koymaz", () => {
    const noDesc = { ...base, description: "   " };
    const ld = buildLocalBusinessJsonLd({ company: noDesc, pageUrl: "https://x" });
    expect(ld).not.toHaveProperty("description");
  });
});
