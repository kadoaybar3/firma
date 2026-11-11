/**
 * GOOGLE SCRAPER İSTEMCİSİ — Google Maps firma toplama servisi (yerel 8788).
 *
 * Akış (bağlantı açık TUTULMAZ):
 *   1. startJob()     → iş açılır (workers 1-2, maxPages ≤5, grid kontrollü)
 *   2. getJob()       → durum + bulunan/elapsed aralıkla sorgulanır
 *   3. getCandidates()→ iş done olduğunda businesses.csv adaylarını çeker
 *   4. cancelJob()    → Durdur
 *
 * Sözleşme: tarayıcı → Vite proxy (/api/google-scraper/*) → servis (8788).
 * Anahtar yok; servis yoksa GoogleScraperConfigError ile açıkça bildirilir.
 */

export interface ScraperSearchInput {
  il: string;
  ilce: string;
  kategori: string;
  kategoriId?: string;
  arama?: string;
  gridMode?: boolean;
  workers?: number;
  maxPages?: number;
  cellKm?: number;
  radiusKm?: number;
}

export interface ScraperCandidate {
  name: string;
  source: string;
  phone?: string;
  address?: string;
  website?: string;
  email?: string;
  rating?: string;
  reviewCount?: string;
  hours?: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  category?: string;
  query?: string;
  warnings?: string[];
}

export type ScraperJobState = "queued" | "running" | "done" | "failed" | "cancelled";

export interface ScraperJobStatus {
  jobId: string;
  state: ScraperJobState;
  query: string;
  il?: string;
  ilce?: string;
  kategori?: string;
  kategoriId?: string;
  /** Canlı bulunan sayısı (CSV satırları). */
  found: number;
  elapsedSec?: number;
  error?: string;
}

export interface ScraperJobListItem {
  jobId: string;
  state: ScraperJobState;
  query: string;
  il?: string;
  ilce?: string;
  kategori?: string;
  kategoriId?: string;
  found: number;
  elapsedSec?: number;
  error?: string;
  created?: number;
}

/** Servis yapılandırılmamış — kod düzeltilemez, kurulum ister. */
export class GoogleScraperConfigError extends Error {}

/** Kullanıcının kontrol edebileceği hata (400 vb.). */
export class ScraperJobError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const BASE = "/api/google-scraper";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  } catch {
    throw new GoogleScraperConfigError(
      "Scraper servisine ulaşılamadı (127.0.0.1:8788 kapalı). Yerel geliştirme: 'services/google-scraper/.venv/bin/python services/google-scraper/server.py' komutunu çalıştırın.",
    );
  }
  const text = await res.text();
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { body = null; }
  if (!res.ok) {
    const msg = (body as { message?: string } | null)?.message
      ?? (body as { detail?: { message?: string } } | null)?.detail?.message
      ?? `Scraper servisi hatası (HTTP ${res.status}).`;
    if (res.status === 503 || res.status === 502) throw new GoogleScraperConfigError(msg);
    throw new ScraperJobError(msg, res.status);
  }
  return body as T;
}

export async function startJob(input: ScraperSearchInput): Promise<{ jobId: string }> {
  return request<{ jobId: string }>("/jobs", { method: "POST", body: JSON.stringify(input) });
}

export async function getJob(jobId: string): Promise<ScraperJobStatus> {
  return request<ScraperJobStatus>(`/jobs/${encodeURIComponent(jobId)}`);
}

export async function listJobs(): Promise<ScraperJobListItem[]> {
  const body = await request<{ jobs: ScraperJobListItem[] }>("/jobs");
  return body.jobs ?? [];
}

export async function getCandidates(jobId: string): Promise<ScraperCandidate[]> {
  const body = await request<{ candidates: ScraperCandidate[] }>(`/jobs/${encodeURIComponent(jobId)}/candidates`);
  return body.candidates ?? [];
}

export async function getHealth(): Promise<{ ok: boolean } | null> {
  try {
    const res = await fetch(BASE + "/health");
    if (!res.ok) return null;
    return (await res.json()) as { ok: boolean };
  } catch {
    return null;
  }
}

export async function cancelJob(jobId: string): Promise<void> {
  await request(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
}

export async function pollJobUntilDone(
  jobId: string,
  opts: { intervalMs?: number; onUpdate?: (s: ScraperJobStatus) => void; isCancelled?: () => boolean } = {},
): Promise<ScraperJobStatus> {
  const interval = opts.intervalMs ?? 1500;
  for (;;) {
    if (opts.isCancelled?.()) throw new GoogleScraperConfigError("İşlem iptal edildi.");
    const s = await getJob(jobId);
    opts.onUpdate?.(s);
    if (s.state === "done" || s.state === "failed" || s.state === "cancelled") return s;
    await new Promise((r) => setTimeout(r, interval));
  }
}
