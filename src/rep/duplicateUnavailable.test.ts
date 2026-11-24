import { describe, expect, it, vi } from "vitest";

/**
 * Canlı modda API/ağ hatası: checkDuplicate ASLA throw etmez; `unavailable`
 * döner ve form kayıt akışı kilitlemez.
 */
vi.mock("../lib/supabase", () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "test-token" } } }),
    },
  },
}));

describe("checkDuplicate — kontrol hatası", () => {
  it("ağ hatasında unavailable döner, throw etmez", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    const { checkDuplicate } = await import("./duplicate");

    const result = await checkDuplicate("Bir Evim Katılım");
    expect(result.status).toBe("unavailable");
    expect(result.matches).toEqual([]);
  });

  it("HTTP hatasında (500) unavailable döner", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    const { checkDuplicate } = await import("./duplicate");

    await expect(checkDuplicate("Bir Evim Katılım")).resolves.toEqual({
      status: "unavailable",
      matches: [],
    });
  });
});
