import { describe, expect, it } from "vitest";
import { addressSuggestions, composeAddress, parseAddress } from "./address";

describe("parseAddress", () => {
  it("cadde + kapı no + ilçe/il biçimini ayrıştırır", () => {
    expect(parseAddress(" Cumhuriyet Cad. No:41 Merkez, Afyonkarahisar", "Merkez", "Afyonkarahisar")).toEqual({
      neighborhood: "",
      street: "Cumhuriyet Cad.",
      buildingNo: "41",
      details: "",
    });
  });

  it("mahalle ve sonekisiz cadde adını ayrıştırır", () => {
    expect(parseAddress("Merkez Mah. Pazar Yeri No:1 Şuhut, Afyonkarahisar", "Şuhut", "Afyonkarahisar")).toEqual({
      neighborhood: "Merkez",
      street: "Pazar Yeri",
      buildingNo: "1",
      details: "",
    });
  });

  it("yol + km bilgisini sokak ve detay olarak ayırır", () => {
    expect(parseAddress("Ocgelik Yolu 3. Km İscehisar, Afyonkarahisar", "İscehisar", "Afyonkarahisar")).toEqual({
      neighborhood: "",
      street: "Ocgelik Yolu",
      buildingNo: "",
      details: "3. Km",
    });
  });

  it("adres yoksa boş parçalar döner", () => {
    expect(parseAddress("", "Merkez", "Afyonkarahisar")).toEqual({
      neighborhood: "",
      street: "",
      buildingNo: "",
      details: "",
    });
  });

  it("canlı adreslerde virgülle ayrılan mahalleyi tanır", () => {
    expect(
      parseAddress(
        "Güvenevler, 1. Küçük sanayi sitesi 611. Sk No:26A/A, 03030 Afyonkarahisar Merkez/Afyonkarahisar",
        "Merkez",
        "Afyonkarahisar",
      ),
    ).toEqual({
      neighborhood: "Güvenevler",
      street: "1. Küçük sanayi sitesi 611. Sk",
      buildingNo: "26A/A",
      details: "",
    });
  });

  it("sondaki posta kodu + il/ilçe ekini temizler", () => {
    expect(
      parseAddress(
        "Dumlupınar, Kadınana Cd., 03200 Afyonkarahisar Merkez/Afyonkarahisar",
        "Merkez",
        "Afyonkarahisar",
      ),
    ).toEqual({
      neighborhood: "Dumlupınar",
      street: "Kadınana Cd.",
      buildingNo: "",
      details: "",
    });
  });

  it("bitişik yazılan MAH. ekini ve CD. kısaltmasını tanır", () => {
    expect(
      parseAddress(
        "MAREŞAL FEVZİÇAKMAK MAH.ŞEHİT KADİR AYDIN CAD. 16 NOLU SAĞLIK OCAĞI KARŞISI, 03200 Afyonkarahisar",
        "Merkez",
        "Afyonkarahisar",
      ),
    ).toEqual({
      neighborhood: "MAREŞAL FEVZİÇAKMAK",
      street: "ŞEHİT KADİR AYDIN CAD.",
      buildingNo: "",
      details: "16 NOLU SAĞLIK OCAĞI KARŞISI",
    });
  });

  it("bina/apt adını mahalle sanmaz", () => {
    expect(
      parseAddress(
        "Leylak Apt, Karaman, Leylak Cd. 11A, 03200 Afyonkarahisar Merkez/Afyonkarahisar",
        "Merkez",
        "Afyonkarahisar",
      ),
    ).toEqual({
      neighborhood: "Karaman",
      street: "Leylak Cd.",
      buildingNo: "",
      details: "Leylak Apt, 11A",
    });
  });
});

describe("composeAddress", () => {
  it("Türkiye adres sırasıyla birleştirir", () => {
    expect(
      composeAddress(
        { neighborhood: "Cumhuriyet", street: "Cumhuriyet Cad.", buildingNo: "41", details: "Kat 2" },
        "Merkez",
        "Afyonkarahisar",
      ),
    ).toBe("Cumhuriyet Mah., Cumhuriyet Cad., No:41, Kat 2, Merkez, Afyonkarahisar");
  });

  it("sokak seviyesinde bilgi yoksa boş adres üretir", () => {
    expect(
      composeAddress({ neighborhood: "", street: "", buildingNo: "", details: "" }, "Merkez", "Afyonkarahisar"),
    ).toBe("");
  });

  it("zaten sonek içeren mahalle/cadde değerlerini tekrarlamaz", () => {
    expect(
      composeAddress(
        { neighborhood: "Zafer Mah.", street: "Zafer Cad.", buildingNo: "No:12", details: "" },
        "Merkez",
        "Afyonkarahisar",
      ),
    ).toBe("Zafer Mah., Zafer Cad., No:12, Merkez, Afyonkarahisar");
  });
});

describe("addressSuggestions", () => {
  const companies = [
    { cityId: "c1", district: "Merkez", address: "Cumhuriyet Cad. No:41 Merkez, Afyonkarahisar" },
    { cityId: "c1", district: "Merkez", address: "Merkez Mah. Pazar Yeri No:1 Merkez, Afyonkarahisar" },
    { cityId: "c1", district: "Şuhut", address: "Kurtuluş Yolu No:2 Şuhut, Afyonkarahisar" },
    { cityId: "c2", district: "Merkez", address: "Başka Cad. No:1 Başka, Başka" },
  ];

  it("yalnız seçili il ve ilçedeki adreslerden öneri üretir", () => {
    const result = addressSuggestions(companies, "c1", "Merkez", "Afyonkarahisar");
    expect(result.neighborhoods).toEqual(["Merkez"]);
    expect(result.allStreets).toEqual(["Cumhuriyet Cad.", "Pazar Yeri"]);
  });

  it("mahalle seçilince sokakları o mahalleye daraltır", () => {
    const result = addressSuggestions(companies, "c1", "Merkez", "Afyonkarahisar", "Merkez");
    expect(result.streets).toEqual(["Pazar Yeri"]);
    expect(result.allStreets).toEqual(["Cumhuriyet Cad.", "Pazar Yeri"]);
  });

  it("il seçilmemişse öneri üretmez", () => {
    expect(addressSuggestions(companies, "", "Merkez", "Afyonkarahisar")).toEqual({
      neighborhoods: [],
      streets: [],
      allStreets: [],
    });
  });
});
