/**
 * OTOMATİK İŞLETME BULMA PANELİ (v1) — koleksiyon servisi istemcisi.
 *
 * Akış: kaynak + seçim (İl → İlçe → Kategori [+ Sayı / CSV]) → iş başlat →
 * yarılamayı sorgula (HTTP açık tutulmaz) → aday tablosu (telefon/adres/web/
 * KAYNAK + mükerrer ve eksik-bilgi etiketleri) → seçilen adaylar mevcut içe
 * aktarma önizlemesine gönderilir. KAYIT YAPMAZ: onaysız firma kaydı
 * imkânsız — kayıt mevcut runImport/doğrulama akışına, o da "Kategori →
 * gerçek DB kimliği (tahmin yok)" kilidiyle meydana gelir.
 *
 * Kaynaklar (servis registery):
 *  - google-places  : canlı resmî Places API (anahtar sunucuda; yoksa 400/503)
 *  - maps-scraper-csv: ÇEVRİMDIŞI dosya/yapıştırma — daha önce (örn. izole
 *    O-3 testi gibi) ELDE EDİLMİŞ scraper çıktısı; canlı maps-scraper kaynağı
 *    YASAK (ToS) ve panelde sunulmaz — bkz. docs/SCRAPER-DEGERLENDIRMESI.md.
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge, ErrorBanner, Field, InfoBanner } from "../components/ui";
import {
  CollectorConfigError,
  CollectorJobError,
  cancelJob,
  countDataRows,
  getCandidates,
  getHealth,
  pollJobUntilDone,
  readFileText,
  startJob,
} from "../lib/collector";
import type { CollectorCandidate, CollectorHealth } from "../lib/collector";
import { findDuplicates, normalizePhoneDisplay } from "../lib/importLib";
import { listCategories, listCities, listCompanies } from "../lib/repo";
import type { Company } from "../lib/types";
import { normalizeSearch } from "../lib/slug";
import { TR_ILLER } from "../data/trCities";
import { TR_ILCELERI } from "../data/trDistricts";

/** Sonuçta görünür mükerrer uyarısı — karar yine önizleme ekranında kesinleşir. */
function dupReason(c: CollectorCandidate, companies: Company[]): string | null {
  const rep = findDuplicates({ name: c.name, phone: c.phone ?? "", address: c.address ?? "" }, companies);
  if (rep.exact.length) return `kesin benzer: ${rep.exact[0].company.name}`;
  if (rep.suspicious.length) return `benzer: ${rep.suspicious[0].company.name}`;
  return null;
}

const LIMIT_OPTIONS = [5, 10, 15, 20];
/** Python sözleşmesindeki şema üst sınırı (SearchRequest.limit le=20). */
const SCHEMA_MAX_LIMIT = 20;

type CollectorSource = "google-places" | "maps-scraper" | "maps-scraper-csv";

export function CollectorPanel({
  onDone,
  onNotConfigured,
}: {
  onDone: (records: Record<string, string>[]) => void;
  onNotConfigured: (m: string) => void;
}) {
  const cities = listCities();
  const categories = listCategories();
  const companies = listCompanies();
  const [source, setSource] = useState<CollectorSource>("google-places");
  const [il, setIl] = useState(TR_ILLER[2] ?? "");
  const [ilce, setIlce] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [limit, setLimit] = useState(10);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvContent, setCsvContent] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [jobState, setJobState] = useState<"idle" | "queued" | "running" | "done" | "failed" | "cancelled">("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [jobId, setJobId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CollectorCandidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [csvTotalRows, setCsvTotalRows] = useState(0);
  const [kaynak, setKaynak] = useState("");
  const [health, setHealth] = useState<CollectorHealth | null>(null);

  // Sunucunun gerçek kaynak hazırlığı (bir kez sorgulanır; ulaşılamazsa sessiz —
  // gerçek hata iş başlatıldığında elden açık Türkçe iletileceği için).
  useEffect(() => {
    let alive = true;
    void getHealth().then((h) => {
      if (alive) setHealth(h);
    });
    return () => {
      alive = false;
    };
  }, []);

  const isCsvSource = source === "maps-scraper-csv";
  const isLiveScraper = source === "maps-scraper";
  /** Canlı scraper sunucuda açılmamışsa buton kilitlenmez; servis 400'ü açık mesajla verir. */
  const scraperUnavailable = isLiveScraper && health ? !health.scraperEnabled : false;
  const scraperNote =
    isLiveScraper &&
    (scraperUnavailable
      ? "Sunucu yapılandırması eksik — servis 400 döndürür ve tam eksik listesini verir. (Yerel: APP_ENV, COLLECTOR_ENABLE_SCRAPER=1, COLLECTOR_SCRAPER_PYTHON, COLLECTOR_SCRAPER_REPO)"
      : null);
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

  /** Adayın tekil anahtarı: placeId varsa o, yoksa ad+telefon özeti. */
  const keyOf = useCallback((c: CollectorCandidate): string => c.placeId || `${c.name}|${c.phone ?? ""}`, []);

  async function loadFile(file: File) {
    setCsvFileName(file.name);
    try {
      const text = await readFileText(file);
      setCsvContent(text);
      setError(null);
    } catch {
      setError(`“${file.name}” okunamadı — metin dosyası (CSV/TSV) deneyin.`);
      setCsvFileName("");
    }
  }

  /** Etkili içerik: yapıştır alanı varsa onu, yoksa dosyayı kullan. */
  const effectiveCsv = pasteText.trim() ? pasteText : csvContent;

  async function start() {
    if (!il) return setError("Lütfen bir il seçin.");
    if (!ilce) return setError("Lütfen bir ilçe seçin.");
    if (!categoryId) return setError("Lütfen bir kategori seçin.");
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return setError("Kategori bulunamadı — sayfayı yenileyin.");
    if (isCsvSource && !effectiveCsv) {
      return setError("Scraper CSV içeriği gerekli — dosya seçin ya da metni yapıştırın.");
    }

    setError(null);
    setCandidates(null);
    setSelected(new Set());
    setLoading(true);
    setJobState("queued");
    try {
      // maps-scraper-csv: tüm geçerli satırlar işlenir; şema üst sınırı 20 gönderilir
      const wantedLimit = isCsvSource ? SCHEMA_MAX_LIMIT : limit;
      const { jobId: id } = await startJob({
        il,
        ilce,
        kategori: category.name,
        limit: wantedLimit,
        source,
        sourceConfig: isCsvSource ? { content: effectiveCsv } : undefined,
      });
      setJobId(id);
      setProgress({ done: 0, total: wantedLimit });
      const status = await pollJobUntilDone(id, {
        intervalMs: 1500,
        onUpdate: (s) => {
          setJobState(s.state);
          setProgress(s.progress);
        },
      });
      if (status.state === "failed") {
        setJobState("failed");
        setError(status.error ?? "İş başarısız oldu.");
        return;
      }
      if (status.state === "cancelled") {
        setJobState("cancelled");
        setError("Arama iptal edildi.");
        return;
      }
      const list = await getCandidates(id);
      setKaynak(list[0]?.source ?? "");
      setJobState("done");
      if (!list.length) {
        setError(
          isCsvSource
            ? "CSV'de geçerli aday bulunamadı — dosyayı kontrol edin (sütun başlıkları: name, address, phone, …)."
            : `“${il} / ${ilce} / ${category.name}” için aday bulunamadı. Kategori/kaynak kombinasyonunu değiştirip tekrar deneyin.`,
        );
        setCandidates([]);
      } else {
        setCandidates(list);
        setSelected(new Set(list.map(keyOf)));
        if (isCsvSource) {
          // İstemci tarafı dürüst sayaç: gönderilen satır sayısıyla dönen aday
          // sayısındaki fark → bozuk/eksik-ad satırların atıldığını gösterir.
          setCsvTotalRows(countDataRows(effectiveCsv));
        } else {
          setCsvTotalRows(0);
        }
      }
    } catch (err) {
      setJobState("failed");
      if (err instanceof CollectorConfigError) onNotConfigured(err.message);
      else if (err instanceof CollectorJobError && err.status === 409) setError("Aynı parametrelerle bir iş zaten çalışıyor — bitmesini bekleyin ya da iptal edin.");
      else setError(err instanceof Error ? err.message : "İş başlatılamadı.");
    } finally {
      setLoading(false);
    }
  }

  async function cancel() {
    if (!jobId) return;
    setLoading(true);
    try {
      await cancelJob(jobId);
      setError("Arama iptal ediliyor…");
      setJobState("cancelled");
    } catch {
      setError("İptal isteği gönderilemedi — iş arka planda sonlanana kadar sürebilir.");
    } finally {
      setLoading(false);
    }
  }

  const busy = loading && (jobState === "queued" || jobState === "running");
  const skippedRows =
    candidates && isCsvSource && csvTotalRows > candidates.length ? csvTotalRows - candidates.length : 0;

  // Seçimleri kayıtlara çevir — mevcut doğrulama/önizleme akışına taşınır.
  function toRecords(list: CollectorCandidate[]): Record<string, string>[] {
    const categoryName = categories.find((k) => k.id === categoryId)?.name ?? "";
    return list.map((c) => ({
      "Firma Adı": c.name,
      Telefon: c.phone ?? "",
      Şehir: il,
      İlçe: ilce,
      Kategori: categoryName,
      Adres: c.address ?? "",
      "Web Sitesi": c.website ?? "",
      Enlem: c.latitude !== undefined ? String(c.latitude) : "",
      Boylam: c.longitude !== undefined ? String(c.longitude) : "",
      "Place ID": c.placeId ?? "",
      Kaynak: c.source,
    }));
  }

  return (
    <>
      <InfoBanner>
        Otomatik bulma <strong>ayrı bir Python toplama servisi</strong> üzerinden iş-tabanlı çalışır: arka plan işi
        başlar, panel durumunu sorgular (bağlantı açık tutulmaz), adaylar tabloda listelenir. Kaynak etiketi her
        satırda görünür; sunucu anahtarınız asla tarayıcıda durmaz. <strong>Kayıt yalnız önizleme onayınızla</strong>{" "}
        yapılır.
      </InfoBanner>

      <div className="form-grid">
        <Field label="Arama kaynağı" required>
          <select
            value={source}
            disabled={busy}
            onChange={(e) => {
              setSource(e.target.value as CollectorSource);
              setCandidates(null);
              setError(null);
            }}
          >
            <option value="google-places">Google Places (canlı · anahtar gerekir)</option>
            <option value="maps-scraper">
              {`Google Maps Scraper — canlı (${health ? (health.scraperEnabled ? "hazır · yerel deney" : "yapılandırma gerekir") : "durum sorgulanamadı"})`}
            </option>
            <option value="maps-scraper-csv">Scraper CSV içe aktar (çevrimdışı dosya)</option>
          </select>
        </Field>
        <Field label="İl" required>
          <select
            value={il}
            disabled={busy}
            onChange={(e) => {
              setIl(e.target.value);
              setIlce(""); // İl değişince ilçe sıfırlanır
              setCandidates(null);
            }}
          >
            {TR_ILLER.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="İlçe" required>
          <select value={ilce} disabled={busy} onChange={(e) => { setIlce(e.target.value); setCandidates(null); }}>
            <option value="">— seçiniz —</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kategori" required>
          <select value={categoryId} disabled={busy} onChange={(e) => { setCategoryId(e.target.value); setCandidates(null); }}>
            <option value="">— seçiniz —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </Field>
        {!isCsvSource && (
          <Field label="Firma sayısı" required>
            <select value={limit} disabled={busy} onChange={(e) => setLimit(Number(e.target.value))}>
              {LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} firma
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {scraperNote && (
        <InfoBanner>
          {scraperNote} Canlı scraper serviste <strong>tek sorgu · tek sayfa · tek işçi · proxy yok · TLS doğrulaması
          açık</strong> olarak çalışır; onay duvarı aşmaya çalışılmaz, engellenirse durum aynen gösterilir. Sonuç
          adayı geçici olarak servisin belleğinde tutulur; <strong>kayıt yine yalnız önizleme onayınızla</strong>{" "}
          olur.
        </InfoBanner>
      )}

      {isCsvSource && (
        <div className="card card__pad mb-14">
          <h4 style={{ marginBottom: 8 }}>Scraper CSV</h4>
          <p className="mb-14">
            Daha önce <strong>izole ortamda hazırlanmış</strong> bir Google Maps scraper çıkış dosyasını (sütunlar:
            name, address, phone, phone_intl, website, lat, lng, place_id, …) yükleyin ya da içeriğini yapıştırın.
            Canlı scraping bu panelde sunulmaz.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setPasteText("");
                  void loadFile(f);
                }
              }}
            />
            {csvFileName && !pasteText.trim() && <Badge>{csvFileName}</Badge>}
          </div>
          <Field label="Ya da CSV içeriğini yapıştırın (dosyayı geçersiz kılar)">
            <textarea
              rows={4}
              value={pasteText}
              disabled={busy}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="name,address,phone,phone_intl,website,lat,lng,place_id&#10;Örnek Kasap;Burmalı Cd.;05469716769;;38.75;30.53;ChIJ…"
            />
          </Field>
        </div>
      )}

      {!dbCity && (
        <InfoBanner>
          “{il}” veritabanına kayıtlı değil — ilçeler Türkiye ilçe listesinden listelenir; firmalar kaydedilirken şehir
          eşleşmesi gerektiğinden bu ilde içe aktarma için önce <Link to="/yonetim/sehirler">Şehir ve ilçeler</Link>{" "}
          sayfasından ili ekleyin.
        </InfoBanner>
      )}
      {staticDistricts.length === 0 && !dbCity && (
        <ErrorBanner message={`“${il}” için ilçe verisi bulunamadı — il adını kontrol edin.`} />
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <button
          type="button"
          className="btn btn--primary"
          disabled={busy || (isCsvSource && !effectiveCsv)}
          onClick={start}
        >
          {isCsvSource ? (busy ? "CSV işleniyor…" : "CSV'yi analiz et") : busy ? "Aranıyor…" : "Aramayı Başlat"}
        </button>
        {busy && jobId && (
          <button type="button" className="btn" onClick={cancel}>
            İptal Et
          </button>
        )}
      </div>

      {busy && (
        <div className="mb-14">
          <p>
            {jobState === "queued" ? "İş sıraya alındı — servis çalıştırıyor…" : "İşleniyor…"} ({progress.done}/
            {progress.total})
          </p>
          <div
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            role="progressbar"
            style={{ height: 8, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}
          >
            <div
              style={{
                height: "100%",
                width: progress.total ? `${Math.round((progress.done / progress.total) * 100)}%` : "4%",
                background: "var(--accent, #2563eb)",
                transition: "width .4s ease",
              }}
            />
          </div>
        </div>
      )}

      {error && !busy && <ErrorBanner message={error} />}

      {candidates && candidates.length > 0 && (
        <>
          <p className="mb-14">
            <strong>{candidates.length} aday işlendi</strong>
            {isCsvSource ? <> — CSV'de {csvTotalRows} veri satırı okundu.</> : <> — istenen: {limit}.</>}
            {skippedRows > 0 && (
              <>
                {" "}
                <Badge tone="orange">{skippedRows} satır atlandı (bozuk/eksik ad)</Badge>
              </>
            )}
            {kaynak && (
              <>
                {" "}
                Kaynak: <Badge>{kaynak}</Badge>
              </>
            )}{" "}
            Mükerrer ve eksik-bilgili adaylar etiketlendi; seçim size ait —{" "}
            <strong>kayıt yalnız önizleme onayınızla</strong> meydana gelir (kategori gerçek DB kimliğinden bağlanır).
          </p>
          <div className="table-wrap mb-14" style={{ maxWidth: "100%" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={candidates.every((c) => selected.has(keyOf(c)))}
                      disabled={!candidates.length}
                      onChange={(e) => setSelected(e.target.checked ? new Set(candidates.map(keyOf)) : new Set())}
                      aria-label="Tüm adayları seç"
                    />
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
                  const missing = c.warnings?.filter((w) => w.toLowerCase().includes("yok")) ?? [];
                  const inJobDup = c.warnings?.some((w) => w.includes("tekrar")) ?? false;
                  return (
                    <tr key={keyOf(c)}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(keyOf(c))}
                          onChange={(e) =>
                            setSelected((s) => {
                              const n = new Set(s);
                              if (e.target.checked) n.add(keyOf(c));
                              else n.delete(keyOf(c));
                              return n;
                            })
                          }
                        />
                      </td>
                      <td>{c.name}</td>
                      <td>
                        <Badge>{c.source}</Badge>
                      </td>
                      <td>{c.phone ? normalizePhoneDisplay(c.phone) : <Badge tone="orange">telefon yok</Badge>}</td>
                      <td>
                        {c.address ?? "—"}{" "}
                        {c.latitude !== undefined && c.longitude !== undefined && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${c.latitude},${c.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="small"
                          >
                            Haritada Gör
                          </a>
                        )}
                      </td>
                      <td>
                        {c.website ? (
                          <a href={c.website} target="_blank" rel="noopener noreferrer" className="small">
                            site
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {duplicate && <Badge tone="orange">{duplicate}</Badge>} {inJobDup && <Badge tone="orange">aynı işte tekrar</Badge>}
                        {missing.map((m) => (
                          <Badge key={m} tone="orange">
                            {m.toLowerCase()}
                          </Badge>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mb-14">{selected.size} aday seçildi.</p>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!selected.size}
            onClick={() => onDone(toRecords(candidates.filter((c) => selected.has(keyOf(c)))))}
          >
            İçe aktarma önizlemesine gönder
          </button>
        </>
      )}
    </>
  );
}
