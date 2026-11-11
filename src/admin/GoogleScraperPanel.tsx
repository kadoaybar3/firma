/**
 * GOOGLE MAPS SCRAPER PANELİ — /yonetim/ice-aktar kaynak adımı.
 * İl → İlçe → Kategori (+ arama kelimesi, Grid, kapsam) → iş başlat →
 * durum + bulunan sorgula → aday listesi (telefon/adres/web/kaynak +
 * mükerrer etiketleri) → seçilenler mevcut önizleme akışına gönderilir.
 * KAYIT YAPMAZ: kayıt yalnız önizleme onayıyla (runImport) meydana gelir.
 * Servis: services/google-scraper/server.py (127.0.0.1:8788).
 */

import { Fragment, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, ErrorBanner, Field, InfoBanner } from "../components/ui";
import CategorySelect from "../components/CategorySelect";
import {
  GoogleScraperConfigError,
  cancelJob,
  getCandidates,
  getHealth,
  getJob,
  listJobs,
  pollJobUntilDone,
  startJob,
  type ScraperCandidate,
  type ScraperJobListItem,
} from "../lib/googleScraper";
import { findDuplicates, matchGoogleCategory, normalizePhoneDisplay } from "../lib/importLib";
import { listCategories, listCities, listCompanies } from "../lib/repo";
import type { Company } from "../lib/types";
import { normalizeSearch } from "../lib/slug";
import { TR_ILLER } from "../data/trCities";
import { TR_ILCELERI } from "../data/trDistricts";

function dupReason(c: ScraperCandidate, companies: Company[]): string | null {
  const rep = findDuplicates({ name: c.name, phone: c.phone ?? "", address: c.address ?? "", placeId: c.placeId }, companies);
  if (rep.exact.length) return `kesin benzer: ${rep.exact[0].company.name}`;
  if (rep.suspicious.length) return `benzer: ${rep.suspicious[0].company.name}`;
  return null;
}

export function GoogleScraperPanel({
  onDone,
  onNotConfigured,
}: {
  onDone: (records: Record<string, string>[]) => void;
  onNotConfigured: (m: string) => void;
}) {
  const cities = listCities();
  const categories = listCategories();
  const companies = listCompanies({ includeUnpublished: true });
  const [il, setIl] = useState(TR_ILLER[2] ?? "");
  const [ilce, setIlce] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [arama, setArama] = useState("");
  const [gridMode, setGridMode] = useState(false);
  const [workers, setWorkers] = useState(1);
  const [maxPages, setMaxPages] = useState(3);
  const [jobState, setJobState] = useState<"idle" | "queued" | "running" | "done" | "failed" | "cancelled">("idle");
  const [found, setFound] = useState(0);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ScraperCandidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [health, setHealth] = useState<{ ok: boolean } | null>(null);
  const [history, setHistory] = useState<ScraperJobListItem[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  /** Taramanın arama bağlamı: aktarımda Kategori buradan gelir (Google kategorisi ayrı). */
  const [jobCtx, setJobCtx] = useState<{ il: string; ilce: string; categoryId: string; categoryName: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void getHealth().then((h) => { if (alive) setHealth(h); });
    void listJobs().then((list) => { if (alive) setHistory(list); }).catch((e) => { if (alive) setHistoryError(e instanceof Error ? e.message : "Geçmiş okunamadı."); });
    return () => { alive = false; };
  }, []);

  const dbCity = cities.find((c) => normalizeSearch(c.name) === normalizeSearch(il));
  const staticDistricts = TR_ILCELERI[il] ?? [];
  const districtSeen = new Set<string>();
  const districts: string[] = [];
  for (const d of [...staticDistricts, ...(dbCity?.districts ?? [])]) {
    const key = normalizeSearch(d);
    if (districtSeen.has(key)) continue;
    districtSeen.add(key);
    districts.push(d);
  }

  const keyOf = useCallback((c: ScraperCandidate): string => c.placeId || `${c.name}|${c.phone ?? ""}`, []);

  async function start() {
    if (!il) return setError("Lütfen bir il seçin.");
    if (!ilce) return setError("Lütfen bir ilçe seçin.");
    if (!categoryId && !arama.trim()) return setError("Lütfen bir kategori seçin ya da arama kelimesi girin.");
    const category = categories.find((c) => c.id === categoryId);
    if (categoryId && !category) return setError("Kategori bulunamadı — sayfayı yenileyin.");
    setError(null);
    setCandidates(null);
    setSelected(new Set());
    setLoading(true);
    setJobState("queued");
    setFound(0);
    setElapsed(null);
    try {
      const { jobId: id } = await startJob({
        il, ilce, kategori: category?.name ?? "", kategoriId: categoryId,
        arama: arama.trim(), gridMode, workers, maxPages,
        cellKm: 1.0, radiusKm: 5.0,
      });
      setJobCtx({ il, ilce, categoryId, categoryName: category?.name ?? arama.trim() });
      setJobId(id);
      const status = await pollJobUntilDone(id, {
        intervalMs: 1500,
        onUpdate: (s) => { setJobState(s.state); setFound(s.found); setElapsed(s.elapsedSec ?? null); },
      });
      if (status.state === "failed") { setJobState("failed"); setError(status.error ?? "Tarama başarısız oldu."); return; }
      if (status.state === "cancelled") { setJobState("cancelled"); setError("Tarama durduruldu."); setFound(status.found); return; }
      const list = await getCandidates(id);
      setJobState("done");
      setFound(list.length);
      if (!list.length) {
        setError(`“${il} / ${ilce}” için aday bulunamadı. Kategori/arama kelimesini değiştirip tekrar deneyin.`);
        setCandidates([]);
      } else {
        setCandidates(list);
        setSelected(new Set(list.map(keyOf)));
      }
    } catch (err) {
      setJobState("failed");
      if (err instanceof GoogleScraperConfigError) onNotConfigured(err.message);
      else setError(err instanceof Error ? err.message : "Tarama başlatılamadı.");
    } finally {
      setLoading(false);
      void listJobs().then((list) => setHistory(list)).catch(() => undefined);
    }
  }

  async function stop() {
    if (!jobId) return;
    setLoading(true);
    try { await cancelJob(jobId); setError("Durdurma isteği gönderildi."); setJobState("cancelled"); }
    catch { setError("Durdurma isteği gönderilemedi."); }
    finally { setLoading(false); }
  }

  async function loadHistoryJob(id: string) {
    setError(null);
    setHistoryError(null);
    setLoading(true);
    try {
      const status = await getJob(id);
      setJobId(id);
      setJobState(status.state);
      setFound(status.found);
      setElapsed(status.elapsedSec ?? null);
      // İş bağlamını geri yükle: kategori aktarımda buradan gelir.
      const jobKategoriId = status.kategoriId ?? "";
      let jobCategoryId = jobKategoriId;
      let jobCategoryName = status.kategori ?? "";
      if (!jobCategoryId && jobCategoryName) {
        // Merkezi eşleştirme: "Fast Food" → mevcut üst kategori (örn. Yemek & İçecek).
        const mapped = matchGoogleCategory(jobCategoryName, categories);
        if (mapped) { jobCategoryId = mapped.id; jobCategoryName = mapped.name; }
      }
      const ctxIl = status.il || il;
      const ctxIlce = status.ilce || ilce;
      setJobCtx({ il: ctxIl, ilce: ctxIlce, categoryId: jobCategoryId, categoryName: jobCategoryName });
      setIl(ctxIl); setIlce(ctxIlce); setCategoryId(jobCategoryId);
      const list = await getCandidates(id);
      if (status.state === "failed") setError(status.error ?? "Tarama hatalı.");
      if (status.state === "cancelled") setError("Tarama durdurulmuş.");
      setCandidates(list.length ? list : []);
      setSelected(new Set(list.map(keyOf)));
      if (!list.length && status.state === "done") setError("Bu taramada aday yok.");
      if (status.state === "queued" || status.state === "running") {
        const final = await pollJobUntilDone(id, {
          intervalMs: 1500,
          onUpdate: (s) => { setJobState(s.state); setFound(s.found); setElapsed(s.elapsedSec ?? null); },
        });
        setJobState(final.state);
        setFound(final.found);
        setElapsed(final.elapsedSec ?? null);
        const again = await getCandidates(id);
        setCandidates(again.length ? again : []);
        setSelected(new Set(again.map(keyOf)));
      }
    } catch (err) {
      if (err instanceof GoogleScraperConfigError) onNotConfigured(err.message);
      else setError(err instanceof Error ? err.message : "Tarama yüklenemedi.");
    } finally {
      setLoading(false);
      void listJobs().then((list) => setHistory(list)).catch(() => undefined);
    }
  }

  async function refreshHistory() {
    try {
      setHistory(await listJobs());
      setHistoryError(null);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : "Geçmiş okunamadı.");
    }
  }

  const busy = loading && (jobState === "queued" || jobState === "running");

  function toRecords(list: ScraperCandidate[]): Record<string, string>[] {
    // Doğrulama kategorisi = taramanın arama kategorisi (merkezi eşleşme sonrası).
    // Google kategorisi karışmaz (ayrı Kaynak metninde korunur).
    const ctx = jobCtx ?? { il, ilce, categoryId, categoryName: categories.find((k) => k.id === categoryId)?.name ?? "" };
    const mapped = categories.find((c) => c.id === ctx.categoryId) ?? matchGoogleCategory(ctx.categoryName, categories);
    const kategori = mapped?.name ?? "";
    return list.map((c) => ({
      "Firma Adı": c.name,
      Telefon: c.phone ?? "",
      Şehir: ctx.il,
      İlçe: ctx.ilce,
      Kategori: kategori,
      Adres: c.address ?? "",
      "Web Sitesi": c.website ?? "",
      Enlem: c.latitude !== undefined && c.latitude !== null ? String(c.latitude) : "",
      Boylam: c.longitude !== undefined && c.longitude !== null ? String(c.longitude) : "",
      "Place ID": c.placeId ?? "",
      Kaynak: c.category ? `${c.source} · Google: ${c.category}` : c.source,
    }));
  }

  const stats = candidates
    ? {
        yeni: candidates.filter((c) => !dupReason(c, companies)).length,
        mukerrer: candidates.filter((c) => dupReason(c, companies)).length,
        telefon: candidates.filter((c) => normalizePhoneDisplay(c.phone ?? "") !== "—").length,
        telefonsuz: candidates.filter((c) => normalizePhoneDisplay(c.phone ?? "") === "—").length,
        web: candidates.filter((c) => c.website).length,
      }
    : null;
  const ctxCategoryId = jobCtx?.categoryId ?? categoryId;
  const ctxCategoryName = jobCtx?.categoryName ?? categories.find((k) => k.id === categoryId)?.name ?? "";
  // Geçerlilik: arama kategorisi merkezi eşleştirmeyle mevcut ID'ye çözünmeli.
  // Google'ın satır kategorisi (c.category) bu kapıdan geçmez — ayrı gösterilir.
  const ctxMapped = matchGoogleCategory(ctxCategoryName, categories) ?? matchGoogleCategory(ctxCategoryId, categories);
  const ctxCategoryValid = Boolean(ctxMapped);

  const stateLabel: Record<string, string> = { queued: "Sırada", running: "Çalışıyor", done: "Tamamlandı", failed: "Hatalı", cancelled: "Durduruldu" };
  const stateTone: Record<string, "green" | "orange" | "red" | "gray" | "blue"> = { queued: "gray", running: "orange", done: "green", failed: "red", cancelled: "gray" };

  return (
    <>
      <InfoBanner>
        Tarama, <strong>ayrı bir Python servisi</strong> (127.0.0.1:8788) üzerinden arka planda çalışır: panel
        kapatılsa da iş servis yaşadığı sürece devam eder, durum panelden sorgulanır. Kaynak etiketi her satırda
        görünür; <strong>kayıt yalnız önizleme onayınızla</strong> yapılır.
        {health && !health.ok ? " Servis şu an kapalı." : ""}
      </InfoBanner>

      <div className="card card__pad mb-14">
        <h3 style={{ marginBottom: 10 }}>Geçmiş taramalar</h3>
        {historyError && <ErrorBanner message={historyError} />}
        {history.length === 0 ? (
          <p className="text-muted small">Henüz tarama yok.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {history.map((h) => (
              <div key={h.jobId} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                <span className="small">
                  <strong>{h.query || "bilinmeyen sorgu"}</strong> · {h.found} aday · <span className="text-muted">{h.jobId}</span>
                </span>
                <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                  <Badge tone={stateTone[h.state] ?? "gray"}>{stateLabel[h.state] ?? h.state}</Badge>
                  <button type="button" className="btn btn--sm btn--ghost" disabled={busy} onClick={() => void loadHistoryJob(h.jobId)}>
                    Sonuçları aç
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          <button type="button" className="btn btn--sm" onClick={() => void refreshHistory()}>Listeyi yenile</button>
        </div>
      </div>

      <div className="form-grid">
        <Field label="İl" required>
          <select value={il} disabled={busy} onChange={(e) => { setIl(e.target.value); setIlce(""); setCandidates(null); }}>
            {TR_ILLER.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </Field>
        <Field label="İlçe" required>
          <select value={ilce} disabled={busy} onChange={(e) => { setIlce(e.target.value); setCandidates(null); }}>
            <option value="">— seçiniz —</option>
            {districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Kategori (tüm adaylara uygulanır)">
          <CategorySelect categories={categories} value={categoryId} onChange={(id) => { setCategoryId(id); setCandidates(null); if (jobCtx) { const hit = categories.find((c) => c.id === id); setJobCtx({ ...jobCtx, categoryId: id, categoryName: hit?.name ?? "" }); } }} disabled={busy} />
        </Field>
        <Field label="Arama kelimesi (kategori boşsa)">
          <input value={arama} disabled={busy} onChange={(e) => setArama(e.target.value)} placeholder="örn. kasap" />
        </Field>
        <Field label="İşçi sayısı (1-2)">
          <select value={workers} disabled={busy} onChange={(e) => setWorkers(Number(e.target.value))}>
            <option value={1}>1 işçi (kontrollü)</option>
            <option value={2}>2 işçi</option>
          </select>
        </Field>
        <Field label="Kapsam / sayfa limiti">
          <select value={maxPages} disabled={busy} onChange={(e) => setMaxPages(Number(e.target.value))}>
            <option value={1}>1 sayfa (20 firma)</option>
            <option value={3}>3 sayfa (60 firma)</option>
            <option value={5}>5 sayfa (100 firma)</option>
          </select>
        </Field>
      </div>

      <label style={{ display: "flex", gap: 6, alignItems: "center", margin: "6px 0 12px" }}>
        <input type="checkbox" checked={gridMode} disabled={busy} onChange={(e) => setGridMode(e.target.checked)} />
        Grid Mode (ilçeyi hücrelere bölüp daha geniş kapsama; yarıçap 5km, hücre 1km)
      </label>

      {!dbCity && (
        <InfoBanner>
          “{il}” veritabanına kayıtlı değil — kayıt sırasında şehir eşleşmesi için önce{" "}
          <Link to="/yonetim/sehirler">Şehir ve ilçeler</Link> sayfasından ili ekleyin.
        </InfoBanner>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <button type="button" className="btn btn--primary" disabled={busy} onClick={start}>
          {busy ? "Taranıyor…" : "Taramayı Başlat"}
        </button>
        {busy && jobId && (
          <button type="button" className="btn" onClick={stop}>Durdur</button>
        )}
      </div>

      {(busy || jobState === "done" || jobState === "failed" || jobState === "cancelled") && (
        <p className="mb-14">
          Durum: <strong>{jobState === "done" ? "Tamamlandı" : jobState === "failed" ? "Hatalı" : jobState === "cancelled" ? "Durduruldu" : "Çalışıyor"}</strong>
          {" · "}Bulunan: <strong>{found}</strong>
          {elapsed !== null && <> · Geçen süre: <strong>{elapsed}s</strong></>}
          {gridMode && <> · Grid hücresi: 1km (yarıçap 5km)</>}
        </p>
      )}

      {error && !busy && <ErrorBanner message={error} />}

      {candidates && candidates.length > 0 && stats && (
        <>
          <p className="mb-14">
            <strong>{candidates.length} aday</strong> — yeni: {stats.yeni}, mükerrer: {stats.mukerrer},
            telefonu olan: {stats.telefon}, telefonu olmayan: {stats.telefonsuz} (telefon zorunlu olduğu için aktarıma girmez, adayda kalır),
            web sitesi olan: {stats.web}.
          </p>
          {!ctxCategoryValid && (
            <ErrorBanner message="Bu taramanın arama kategorisi mevcut kategori sistemiyle eşleşmiyor. Yeni kategori uydurulmaz: aktarım için önce yukarıdan mevcut bir kategori seçin." />
          )}
          <div className="table-wrap mb-14" style={{ maxWidth: "100%" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>
                    <input type="checkbox" checked={candidates.every((c) => selected.has(keyOf(c)))} disabled={!candidates.length} onChange={(e) => setSelected(e.target.checked ? new Set(candidates.map(keyOf)) : new Set())} aria-label="Tüm adayları seç" />
                  </th>
                  <th>İşletme</th>
                  <th>Kaynak</th>
                  <th>Telefon</th>
                  <th>Adres</th>
                  <th>Web</th>
                  <th>Uyarı</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => {
                  const duplicate = dupReason(c, companies);
                  const isOpen = openId === keyOf(c);
                  return (
                    <Fragment key={keyOf(c)}>
                      <tr key={keyOf(c)}>
                        <td>
                          <input type="checkbox" checked={selected.has(keyOf(c))} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(keyOf(c)); else n.delete(keyOf(c)); return n; })} />
                        </td>
                        <td>
                          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setOpenId(isOpen ? null : keyOf(c))} aria-expanded={isOpen}>
                            {c.name}
                          </button>
                        </td>
                        <td><Badge>{c.source}</Badge></td>
                        <td>{c.phone ? normalizePhoneDisplay(c.phone) : <Badge tone="orange">telefon yok</Badge>}</td>
                        <td>{c.address ?? "—"}</td>
                        <td>{c.website ? <a href={c.website} target="_blank" rel="noopener noreferrer" className="small">site</a> : "—"}</td>
                        <td>{duplicate && <Badge tone="orange">{duplicate}</Badge>}</td>
                      </tr>
                      {isOpen && (
                        <tr key={`${keyOf(c)}-detay`}>
                          <td colSpan={7}>
                            <div className="small">
                              {c.category && <>Google kategorisi: {c.category} · </>}
                              <>Firma Rehberi kategorisi (arama): {ctxMapped?.name ?? ctxCategoryName ?? "—"} · </>
                              {c.email && <>E-posta: {c.email} · </>}
                              {c.rating && <>Puan: {c.rating} ({c.reviewCount ?? "—"} yorum) · </>}
                              {c.hours && <>Saat: {c.hours} · </>}
                              {c.latitude !== undefined && c.latitude !== null && c.longitude != null && (
                                <a href={`https://www.google.com/maps/search/?api=1&query=${c.latitude},${c.longitude}`} target="_blank" rel="noopener noreferrer">Haritada Gör</a>
                              )}
                              {c.placeId && <> · Place ID: {c.placeId}</>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mb-14">{selected.size} aday seçildi.</p>
          <button type="button" className="btn btn--primary" disabled={!selected.size || !ctxCategoryValid} title={!ctxCategoryValid ? "Kategori eşleşmediği için gönderilemez" : undefined} onClick={() => onDone(toRecords(candidates.filter((c) => selected.has(keyOf(c)))))}>
            İçe aktarma önizlemesine gönder {!ctxCategoryValid && "(kategori gerekli)"}
          </button>
        </>
      )}
    </>
  );
}
