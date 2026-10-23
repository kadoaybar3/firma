/**
 * KOLEKSİYON SERVİSİ İSTEMCİSİ — iş-tabanlı otomatik işletme bulma (v1).
 *
 * AKIŞ (HTTP bağlantısı açık TUTULMAZ):
 *   1. startJob()        → iş açılır (aynı parametreler çalışıyorsa 409 döner)
 *   2. getJob()          → durum + yarılamayı aralıklarla sorgula
 *   3. getCandidates()   → iş "done" olduğunda adayları çek
 *   4. cancelJob()       → kullanıcı vazgeçerse işi iptal et
 *
 * SÖZLEŞME: tarayıcı → Netlify proxy (/api/collector/*) → Python servisi.
 * Servis anahtarı TARAFCIYA GİRMEZ: proxy sunucu ortamından (COLLECTOR_API_KEY)
 * ekler. Yapılandırma eksikse CollectorConfigError ile açıkça bildirilir —
 * sessiz yutma yok, sahte sonuç gösterme yok.
 */

export interface CollectorSearchInput {
  il: string;
  ilce: string;
  kategori: string;
  /** 1–20; servisin MAX_LIMIT'ine gider. NOT: maps-scraper-csv kaynağında
   * tüm geçerli satırlar yüklenir (adaptör limit'i uygulamaz) — panel bu
   * kaynakta şema üst sınırı olan 20'yi gönderir (şema şartı). */
  limit: number;
  /** Adaptör tanımlayıcısı; varsayılan google-places. */
  source?: string;
  /** Kaynağa özel parametreler (örn. maps-scraper-csv: {content: "..."}).
   * Python sözleşmesi (SearchRequest) ile birebir alan adları. */
  sourceConfig?: Record<string, unknown>;
}

export interface CollectorCandidate {
  name: string;
  source: string;
  phone?: string;
  address?: string;
  website?: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  /** Servisin etiketlediği uyarılar: mükerrer telefon, eksik bilgi vb. */
  warnings?: string[];
}

export type CollectorJobState = "queued" | "running" | "done" | "failed" | "cancelled";

export interface CollectorJobStatus {
  jobId: string;
  state: CollectorJobState;
  source: string;
  progress: { done: number; total: number };
  error?: string;
}

/** GET /health — kaynakların gerçek hazır durumunu raporlar (yetkilendirmesiz). */
export interface CollectorHealth {
  ok: boolean;
  version: string;
  /** Yüklü/kullanılabilir kaynak tanımlayıcıları. */
  adapters: string[];
  /** canlı maps-scraper kaynağının sunucu tarafı açma koşulları sağlıyor mu? */
  scraperEnabled: boolean;
}

/** Proxy/servis yapılandırılmamış — kod düzeltilemez, kurulum ister. */
export class CollectorConfigError extends Error {}

/** Kullanıcının kontrol edebileceği hata (409 aynı iş, 400 bilinmeyen kaynak vb.). */
export class CollectorJobError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const BASE = "/api/collector";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new CollectorConfigError(
      "Koleksiyon servisine ulaşılamadı. Yerel geliştirme: 'python3 services/collector/main.py' çalıştırın (http://127.0.0.1:8787); yayında: Netlify ortam değişkeni COLLECTOR_BASE_URL tanımlı olmalı.",
    );
  }
  if (res.status === 503) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new CollectorConfigError(
      body?.message ??
        "Koleksiyon servisi yapılandırılmamış. Netlify ortam değişkenlerini (COLLECTOR_BASE_URL, COLLECTOR_API_KEY) tanımlamadan bu arama yapılamaz.",
    );
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: { message?: string } | string; message?: string } | null;
    const msg =
      typeof body?.detail === "string"
        ? body.detail
        : (body?.detail?.message ?? body?.message ?? `Servis hatası (HTTP ${res.status}).`);
    throw new CollectorJobError(msg, res.status);
  }
  return (await res.json()) as T;
}

/** İş başlatır. 409 → aynı parametrelerle iş zaten çalışıyor (mesaj mevcut iş ref verir). */
export async function startJob(input: CollectorSearchInput): Promise<{ jobId: string }> {
  // Python ile birebir alan adları: il, ilce, kategori, limit, source, sourceConfig
  const body: Record<string, unknown> = {
    il: input.il,
    ilce: input.ilce,
    kategori: input.kategori,
    limit: input.limit,
    source: input.source ?? "google-places",
  };
  if (input.sourceConfig !== undefined) body.sourceConfig = input.sourceConfig;
  return request<{ jobId: string }>("/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getJob(jobId: string): Promise<CollectorJobStatus> {
  return request<CollectorJobStatus>(`/jobs/${encodeURIComponent(jobId)}`);
}

export async function getCandidates(jobId: string): Promise<CollectorCandidate[]> {
  const body = await request<{ candidates: CollectorCandidate[] }>(`/jobs/${encodeURIComponent(jobId)}/candidates`);
  return (body.candidates ?? []).filter((c) => c.name);
}

export async function cancelJob(jobId: string): Promise<void> {
  await request(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
}

/** Servisin kaynak/hazır durumunu sorgular; ulaşılamazsa null döner (uyarı yeter). */
export async function getHealth(): Promise<CollectorHealth | null> {
  try {
    const res = await fetch(`${BASE}/health`);
    if (!res.ok) return null;
    return (await res.json()) as CollectorHealth;
  } catch {
    return null;
  }
}

/** CSV/TXT dosyasını metin olarak okur (FileReader yedekli, güvenli yol). */
export async function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Dosya okunamadı."));
    reader.readAsText(file, "utf-8");
  });
}

/** CSV metnindeki veri satırı sayısı (başlık hariç; boş satırlar sayılmaz). */
export function countDataRows(csvContent: string): number {
  const lines = csvContent.split(/\r?\n/);
  if (lines.length < 2) return 0;
  return lines
    .slice(1)
    .filter((line) => {
      const bare = line.trim().replace(/^[,\t;]+|[,\t;]+$/g, "");
      return bare.length > 0 && bare.split(",").some((cell) => cell.trim() !== "");
    }).length;
}

/**
 * İş bitene kadar yoklar — bitiş durumunda dönüş; iptal/ara kural: kullanıcı
 * onCancel çağrılabilir. HTTP bağlantısı hiç açık tutulmaz (spec).
 */
export async function pollJobUntilDone(
  jobId: string,
  opts: { intervalMs?: number; onUpdate?: (s: CollectorJobStatus) => void; isCancelled?: () => boolean } = {},
): Promise<CollectorJobStatus> {
  const interval = opts.intervalMs ?? 1_500;
  // Sınırlı sayıda deneme — sonsuz bekleme yok
  for (let i = 0; i < 120; i++) {
    if (opts.isCancelled?.()) {
      await cancelJob(jobId).catch(() => undefined);
      const status = await getJob(jobId);
      return status;
    }
    const status = await getJob(jobId);
    opts.onUpdate?.(status);
    if (status.state === "done" || status.state === "failed" || status.state === "cancelled") return status;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error("İş zamanında bitmedi — durum sorgulama sınırına ulaşıldı.");
}
