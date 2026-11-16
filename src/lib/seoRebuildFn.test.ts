/*
 * Faz 4F testleri — /api/seo-rebuild Netlify Function (sunucu katmanı).
 * Gerçek Supabase/Build Hook ÇAĞRILMAZ: verifyAdmin ve fetch enjekte edilir.
 * Her yanıtta hook URL'i sızıntısı ayrıca doğrulanır.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleSeoRebuild } from "../../netlify/functions/seo-rebuild.mts";
import type { SeoRebuildDeps } from "../../netlify/functions/seo-rebuild.mts";

const HOOK_URL = "https://api.netlify.com/build_hooks/SECRET-HOOK-ID-DEGERI";
const TOKEN = "admin-access-token-degeri";

const fullEnv: Record<string, string | undefined> = {
  NETLIFY_BUILD_HOOK_URL: HOOK_URL,
  SUPABASE_URL: "https://project.supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-DEGERI",
  VITE_SUPABASE_ANON_KEY: "anon-key-DEGERI",
};

const okVerify = vi.fn(async () => null);

function deps(over: Partial<SeoRebuildDeps> = {}): SeoRebuildDeps {
  return {
    env: fullEnv,
    fetchImpl: vi.fn<typeof fetch>(async () => new Response("", { status: 200 })),
    verifyAdmin: okVerify,
    ...over,
  };
}

function postReq(headers: Record<string, string> = { Authorization: `Bearer ${TOKEN}` }): Request {
  return new Request("https://firma5.netlify.app/api/seo-rebuild", { method: "POST", headers });
}

/** Her yanıt gövdesinde hook URL'i ve sunucu anahtarları sızmamalı. */
function expectNoLeak(raw: string): void {
  expect(raw).not.toContain(HOOK_URL);
  expect(raw).not.toContain("SECRET-HOOK-ID");
  expect(raw).not.toContain("service-role-key");
  expect(raw).not.toContain("anon-key");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("seo-rebuild handler", () => {
  it("POST olmayan isteği 405 ile reddeder", async () => {
    const res = await handleSeoRebuild(
      new Request("https://firma5.netlify.app/api/seo-rebuild", { method: "GET" }),
      deps(),
    );
    expect(res.status).toBe(405);
    expectNoLeak(await res.text());
  });

  it("ortam değişkeni eksikse 503 döner (yalnız değişken adları)", async () => {
    const res = await handleSeoRebuild(
      postReq(),
      deps({ env: { ...fullEnv, NETLIFY_BUILD_HOOK_URL: undefined } }),
    );
    expect(res.status).toBe(503);
    const raw = await res.text();
    expectNoLeak(raw);
    expect((JSON.parse(raw) as { message: string }).message).toContain("NETLIFY_BUILD_HOOK_URL");
  });

  it("access_token yoksa 401 döner ve hook'u çağırmaz", async () => {
    const d = deps();
    const res = await handleSeoRebuild(
      new Request("https://firma5.netlify.app/api/seo-rebuild", { method: "POST" }),
      d,
    );
    expect(res.status).toBe(401);
    expect(d.verifyAdmin).not.toHaveBeenCalled();
    expect(d.fetchImpl).not.toHaveBeenCalled();
    expectNoLeak(await res.text());
  });

  it("yetkisiz (admin olmayan) isteği 403 ile reddeder", async () => {
    const d = deps({
      verifyAdmin: vi.fn(async () => ({
        status: 403,
        message: "Bu işlem yalnızca yönetici tarafından yapılabilir.",
      })),
    });
    const res = await handleSeoRebuild(postReq(), d);
    expect(res.status).toBe(403);
    expect(d.fetchImpl).not.toHaveBeenCalled();
    expectNoLeak(await res.text());
  });

  it("doğrulama servis hatasında 500 döner", async () => {
    const res = await handleSeoRebuild(
      postReq(),
      deps({ verifyAdmin: vi.fn(async () => ({ status: 500, message: "Profil okunamadı." })) }),
    );
    expect(res.status).toBe(500);
    expectNoLeak(await res.text());
  });

  it("yetkili istekte hook'u POST ile çağırır (timeout signal'i taşır) ve 200 döner", async () => {
    const d = deps();
    const res = await handleSeoRebuild(postReq(), d);
    expect(res.status).toBe(200);
    expect(d.verifyAdmin).toHaveBeenCalledWith(TOKEN, fullEnv);
    expect(d.fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(d.fetchImpl).mock.calls[0];
    expect(url).toBe(HOOK_URL); // hook yalnızca sunucu çağrısında geçer
    expect(init?.method).toBe("POST");
    expect(init?.signal).toBeTruthy(); // ~15 sn timeout zorunlu
    expectNoLeak(await res.text());
  });

  it("hook HTTP hatasında 502 döner, URL dahil etmez", async () => {
    const d = deps({
      fetchImpl: vi.fn<typeof fetch>(async () => new Response("", { status: 500 })),
    });
    const res = await handleSeoRebuild(postReq(), d);
    expect(res.status).toBe(502);
    const raw = await res.text();
    expectNoLeak(raw);
    expect((JSON.parse(raw) as { message: string }).message).toContain("HTTP 500");
  });

  it("ağ/zaman aşımı hatasında 502 döner, yalnız hata adını gösterir", async () => {
    const err = new Error("connect ETIMEDOUT " + HOOK_URL);
    err.name = "TimeoutError";
    const d = deps({ fetchImpl: vi.fn<typeof fetch>(async () => Promise.reject(err)) });
    const res = await handleSeoRebuild(postReq(), d);
    expect(res.status).toBe(502);
    const raw = await res.text();
    expectNoLeak(raw); // hata metninde hook URL'i de sızmaz
    expect((JSON.parse(raw) as { message: string }).message).toContain("TimeoutError");
  });
});
