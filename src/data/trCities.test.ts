import { describe, expect, it } from "vitest";
import { TR_ILLER } from "./trCities";

describe("TR_ILLER", () => {
  it("81 ildir ve adlar tekrar etmez", () => {
    expect(TR_ILLER).toHaveLength(81);
    expect(new Set(TR_ILLER).size).toBe(81);
  });

  it("Afyonkarahisar listede ve boş girdi yok", () => {
    expect(TR_ILLER).toContain("Afyonkarahisar");
    expect(TR_ILLER.every((n) => n.trim() === n && n.length > 0)).toBe(true);
  });
});
