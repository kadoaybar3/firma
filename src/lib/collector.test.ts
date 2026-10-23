import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CollectorConfigError,
  CollectorJobError,
  cancelJob,
  getCandidates,
  getJob,
  pollJobUntilDone,
  readFileText,
  startJob,
  countDataRows,
  getHealth,
} from "./collector";

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("collector istemcisi", () => {
  it("startJob POST atar ve jobId döner; kaynak alanı taşınır", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("/api/collector/jobs");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({ il: "Afyonkarahisar", ilce: "Merkez", kategori: "Kasap", limit: 5, source: "fake" });
      return reply(201, { jobId: "abc123", state: "queued" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await startJob({ il: "Afyonkarahisar", ilce: "Merkez", kategori: "Kasap", limit: 5, source: "fake" });
    expect(res.jobId).toBe("abc123");
  });

  it("varsayılan kaynak google-places", async () => {
    const fetchMock = vi.fn(async (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.source).toBe("google-places");
      expect(body.sourceConfig).toBeUndefined(); // tanımsızsa gönderilmez
      return reply(201, { jobId: "j", state: "queued" });
    });
    vi.stubGlobal("fetch", fetchMock);
    await startJob({ il: "Konya", ilce: "Meram", kategori: "Fırıncı", limit: 10 });
  });

  it("sourceConfig gönderimi — Python sözleşmesi (SearchRequest) alan adlarıyla birebir", async () => {
    const content = "name,address,phone,lat,lng,place_id\nA Kasap,Burmalı Cd.,05469716769,38.75,30.53,ChIJx";
    const fetchMock = vi.fn(async (_u: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.source).toBe("maps-scraper-csv");
      expect(body.sourceConfig).toEqual({ content });
      // sözleşme sütunları: il/ilce/kategori/limit/source/sourceConfig — fazlası yok
      expect(Object.keys(body).sort()).toEqual(["il", "ilce", "kategori", "limit", "source", "sourceConfig"]);
      return reply(201, { jobId: "j2", state: "queued" });
    });
    vi.stubGlobal("fetch", fetchMock);
    await startJob({ il: "Afyonkarahisar", ilce: "Merkez", kategori: "Kasap", limit: 20, source: "maps-scraper-csv", sourceConfig: { content } });
  });

  it("countDataRows — tam boş satırlar sayılmaz, diğer veri satırları döner", () => {
    const csv = "name,place_id\nA,p1\n\n,p2\nB,p3\n";
    // ",p2" satırı adı boş: adaptör bunu atlar → istemci farkı "atlandı" gösterir.
    // Tam boş satır (eklenen 3.) sayılmaz.
    expect(countDataRows(csv)).toBe(3);
    expect(countDataRows("sadece_baslık")).toBe(0);
    expect(countDataRows("")).toBe(0);
    expect(countDataRows("a,b\n\t\n  \nc,d\n")).toBe(1); // a,b başlık; boş satırlar hariç yalnız c,d
  });

  it("health — /health (yetkilendirmesiz) doğrudan fetch yoklaması; hata olursa null", async () => {
    const fetchMock = vi.fn(async (u: string) => {
      expect(u.endsWith("/health")).toBe(true);
      return reply(200, { ok: true, version: "v1", adapters: ["fake", "maps-scraper-csv"], scraperEnabled: false });
    });
    vi.stubGlobal("fetch", fetchMock);
    const health = await getHealth();
    expect(health?.scraperEnabled).toBe(false);

    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("kapalı"); }));
    expect(await getHealth()).toBeNull();
  });

  it("okumadan geçen dosya metni — readFileText (tarayıcı File.text yolu)", async () => {
    const file = new File(["name,place_id\nA,ChIJ1\n"], "gms-afyon.csv", { type: "text/csv" });
    const text = await readFileText(file);
    expect(text).toContain("name,place_id");
    expect(text).toContain("ChIJ1");
  });

  it("503 → CollectorConfigError: yapılandırma eksik açıkça bildirilir", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(503, { message: "vekil yok" })));
    await expect(startJob({ il: "Adana", ilce: "Seyhan", kategori: "Kasap", limit: 5 })).rejects.toThrow(CollectorConfigError);
  });

  it("ağ hatası → CollectorConfigError (yerel servis çalışmıyor)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("failed to fetch");
    }));
    await expect(getJob("x")).rejects.toThrow(CollectorConfigError);
  });

  it("409 aynı iş → CollectorJobError (durum koduyla)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(409, { jobId: "mevcut", message: "Aynı parametrelerle çalışan bir iş zaten var." })));
    try {
      await startJob({ il: "A", ilce: "B", kategori: "C", limit: 5 });
      throw new Error("hata beklenirdi");
    } catch (err) {
      expect(err instanceof CollectorJobError).toBe(true);
      expect((err as CollectorJobError).status).toBe(409);
      expect((err as CollectorJobError).message).toContain("zaten var");
    }
  });

  it("400 bilinmeyen kaynak → CollectorJobError + Türkçe mesaj", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(400, { detail: { message: "Bilinmeyen kaynak: x" } })));
    await expect(getCandidates("j1")).rejects.toThrow("Bilinmeyen kaynak");
  });

  it("getCandidates adları boş olmayanları döndürür", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply(200, {
          state: "done",
          candidates: [
            { name: "A", source: "fake", phone: "05551112233", warnings: ["Telefon yok"] },
            { name: "", source: "fake" },
          ],
        }),
      ),
    );
    const list = await getCandidates("j1");
    expect(list).toHaveLength(1);
    expect(list[0].warnings).toContain("Telefon yok");
  });

  it("pollJobUntilDone bitişte durur ve onUpdate yarılamayı taşır", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        expect(String(url)).toContain("/api/collector/jobs/j9");
        call++;
        if (call === 1) return reply(200, { jobId: "j9", state: "running", source: "fake", progress: { done: 1, total: 2 } });
        return reply(200, { jobId: "j9", state: "done", source: "fake", progress: { done: 2, total: 2 } });
      }),
    );
    const updates: string[] = [];
    const status = await pollJobUntilDone("j9", { intervalMs: 1, onUpdate: (s) => updates.push(s.state) });
    expect(status.state).toBe("done");
    expect(updates).toEqual(["running", "done"]);
  });

  it("pollJobUntilDone isCancelled → cancel gönderir ve iptal durumunu döndürür", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        if (String(url).endsWith("/cancel")) return reply(200, { ok: true });
        return reply(200, { jobId: "j9", state: "running", source: "fake", progress: { done: 0, total: 5 } });
      }),
    );
    const status = await pollJobUntilDone("j9", { intervalMs: 1, isCancelled: () => true });
    expect(status.state).toBe("running"); // isCancelled → durum sorgulanır, iptal isteği gitti
    expect(calls.some((c) => c.endsWith("/cancel"))).toBe(true);
  });

  it("cancelJob POST /cancel", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("/api/collector/jobs/j2/cancel");
      expect(init?.method).toBe("POST");
      return reply(200, { ok: true });
    }));
    await expect(cancelJob("j2")).resolves.toBeUndefined();
  });
});
