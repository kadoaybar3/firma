/*
 * Faz 4F testleri — SEO yeniden build tetikleyicisi (istemci katmanı).
 * Ağ yok: supabase/dataSource mock'lanır, fetch stub'lanır.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./supabase", () => {
  const state = { configured: true };
  return {
    state,
    get isSupabaseConfigured() {
      return state.configured;
    },
    supabase: {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { access_token: "test-token" } },
        })),
      },
    },
  };
});

vi.mock("./dataSource", () => ({
  flushNow: vi.fn(async () => undefined),
}));

import {
  companySeoSnapshot,
  scheduleSeoRebuild,
  seoRelevantChange,
  triggerSeoRebuild,
} from "./seoRebuild";
import { supabase } from "./supabase";
import { flushNow } from "./dataSource";
import type { Company } from "./types";

const baseCompany: Company = {
  id: "c-1",
  name: "Öz Miras Kuyumculuk",
  slug: "oz-miras-kuyumculuk",
  categoryId: "cat-1",
  cityId: "city-1",
  district: "Merkez",
  address: "Kale Mah. 1",
  phone: "0272 212 88 03",
  socials: {},
  description: "Açıklama metni",
  images: [],
  hours: { weekday: "09:00-18:00", saturday: "", sunday: "" },
  featured: false,
  published: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
};

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(new Response("", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  if (supabase) {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { access_token: "test-token" } },
    } as never);
  }
  (flushNow as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("seoRelevantChange (filtreleme)", () => {
  it("aynı alanlar değişmediyse tetiklemez", () => {
    expect(
      seoRelevantChange(companySeoSnapshot(baseCompany), companySeoSnapshot(baseCompany)),
    ).toBe(false);
  });

  it("yayındaki firmanın SEO alanı değişince tetikler", () => {
    const after = companySeoSnapshot({ ...baseCompany, phone: "0272 000 00 00" });
    expect(seoRelevantChange(companySeoSnapshot(baseCompany), after)).toBe(true);
  });

  it("yayından kaldırma tetikler", () => {
    const after = companySeoSnapshot({ ...baseCompany, published: false });
    expect(seoRelevantChange(companySeoSnapshot(baseCompany), after)).toBe(true);
  });

  it("yayına alma tetikler", () => {
    const before = companySeoSnapshot({ ...baseCompany, published: false });
    expect(seoRelevantChange(before, companySeoSnapshot(baseCompany))).toBe(true);
  });

  it("her iki durum da yayın dışındaysa tetiklemez", () => {
    const off = { ...baseCompany, published: false };
    const before = companySeoSnapshot(off);
    const after = companySeoSnapshot({ ...off, phone: "0555 000 00 00", name: "Yeni Ad" });
    expect(seoRelevantChange(before, after)).toBe(false);
  });

  it("featured SEO çıktısını etkilemez (snapshot dışı)", () => {
    const a = companySeoSnapshot({ ...baseCompany, featured: false });
    const b = companySeoSnapshot({ ...baseCompany, featured: true });
    expect(seoRelevantChange(a, b)).toBe(false);
  });

  it("slug değişikliği tetikler (URL değişir)", () => {
    const after = companySeoSnapshot({ ...baseCompany, slug: "yeni-slug" });
    expect(seoRelevantChange(companySeoSnapshot(baseCompany), after)).toBe(true);
  });
});

describe("scheduleSeoRebuild (debounce / toplu yayınlama)", () => {
  it("art arda gelen tetiklemeler tek build'de birleşir", async () => {
    vi.useFakeTimers();
    // Toplu yayınlama: updateCompany 30 kez çağrılır → tek tetikleme yeter
    scheduleSeoRebuild();
    scheduleSeoRebuild();
    scheduleSeoRebuild();
    expect(flushNow).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(45_000);
    expect(flushNow).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/seo-rebuild");
  });

  it("pencere dışındaki yeni tetikleme ayrı build oluşturur", async () => {
    vi.useFakeTimers();
    scheduleSeoRebuild();
    await vi.advanceTimersByTimeAsync(45_000);
    scheduleSeoRebuild();
    await vi.advanceTimersByTimeAsync(45_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("triggerSeoRebuild (sıra ve hata yalıtımı)", () => {
  it("flushNow tamamlanmadan fetch atmaz (önce yaz, sonra build)", async () => {
    const order: string[] = [];
    (flushNow as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push("flush");
    });
    fetchMock.mockImplementation(async () => {
      order.push("fetch");
      return new Response("", { status: 200 });
    });

    await triggerSeoRebuild();
    expect(order).toEqual(["flush", "fetch"]);
  });

  it("flushNow hatasında build isteği göndermez", async () => {
    (flushNow as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("sync fail"));
    await expect(triggerSeoRebuild()).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ağ hatası firma akışına yansımaz (sessizce yutulur)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(triggerSeoRebuild()).resolves.toBeUndefined();
    expect(flushNow).toHaveBeenCalledTimes(1);
  });

  it("oturum yoksa fetch atmaz", async () => {
    if (supabase) {
      vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
        data: { session: null },
      } as never);
    }
    await triggerSeoRebuild();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Supabase yapılandırılmamışsa hiç denemez (demo mod)", async () => {
    const mod = (await import("./supabase")) as unknown as { state: { configured: boolean } };
    mod.state.configured = false;
    try {
      await triggerSeoRebuild();
      expect(flushNow).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      mod.state.configured = true;
    }
  });
});
