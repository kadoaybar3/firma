import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PanelHead } from "./AdminLayout";
import { Badge, ErrorBanner, InfoBanner } from "../components/ui";
import { useActor } from "../lib/auth";
import {
  analyzeImportRows,
  chunk,
  findDuplicates,
  guessMapping,
  normalizePhoneDisplay,
  resolveImportCategoryId,
  REQUIRED_FIELDS,
  type DuplicateMatch,
  type ImportCandidate,
  type ImportField,
  type ImportOptions,
  type RowIssue,
} from "../lib/importLib";
import { GoogleScraperPanel } from "./GoogleScraperPanel";
import { addDistrict, createCategory, createCity, createScraperCompany, getCategoryById, getCityById, listCategories, listCities, listCompanies } from "../lib/repo";
import type { CompanyDraft } from "../lib/repo";

/*
 * İÇE AKTARMA SAYFASI (admin) — Google Maps Scraper adayları,
 * doğrulama önizleme, mükerrer karar ekranı ve gruplu kayıt.
 *
 * Kamu kuralları:
 *  - Kayıt yalnız admin (AdminLayout rolü) altındadır; RLS rep self-read dışarıda bırakır.
 *  - Mevcut firmalar ASLA otomatik güncellenmez: kesin mükerrer engellenir,
 *    şüpheliler varsayılan atlanır (kullanıcı tek tek barındırabilir).
 *  - Gruplu işleme: her grup 25 kayıt; gruplar arasında karanlık çağ dönmesi
 *    (yield) UI donmasını önler; hata başına-satır listelenir — kısmi başarı raporu.
 */

type Step = "kaynak" | "onizle" | "al" | "sonuc";

interface ImportRowView {
  candidate: ImportCandidate;
  exact: DuplicateMatch[];
  suspicious: DuplicateMatch[];
  /** Şüpheli eşleşme görüldüğünde kullanıcı bu satırı kayır/atlar. */
  include: boolean;
}

interface RunResult {
  created: number;
  /** Kayda girmeyen: kesin mükerrer + şüpheli-atlanan + doğrulama hatası satırları. */
  skipped: number;
  failed: Array<{ rowIndex: number; name: string; message: string }>;
}

const GROUP_SIZE = 25;

function yieldToUI(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

export default function AdminImport() {
  const actor = useActor();
  const [step, setStep] = useState<Step>("kaynak");
  const [error, setError] = useState<string | null>(null);

  // Kaynak (Google Maps Scraper)
  const [rawRecords, setRawRecords] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);

  // Önizleme seçenekleri (Google akışında sabit; dosya eşleme ekranı kaldırıldı)
  const [mapping, setMapping] = useState<Partial<Record<ImportField, number>>>({});
  const options: ImportOptions = { autoCreateCategory: false, autoCreateDistrict: true, autoCreateCity: true };
  const [publish, setPublish] = useState(false);

  // Önizleme
  const [rowViews, setRowViews] = useState<ImportRowView[]>([]);
  const [issues, setIssues] = useState<RowIssue[]>([]);
  const [plannedCategories, setPlannedCategories] = useState<Array<{ key: string; name: string }>>([]);
  const [plannedCities, setPlannedCities] = useState<Array<{ key: string; name: string }>>([]);

  // Çalışma + sonuç
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<RunResult | null>(null);

  const cities = listCities();
  const categories = listCategories();

  /* ---------- KAYNAK ---------- */

  /**
   * Google Maps Scraper aday akışı: panelden gelen kayıtlar mevcut önizleme
   * akışına doğrudan girer (başlıklar sabit, eşleme otomatik).
   */
  function loadGoogleCandidates(records: Record<string, string>[]) {
    const mappingGuess = guessMapping(googleHeaders, [...REQUIRED_FIELDS, "address", "email", "website", "instagram", "whatsapp", "description", "latitude", "longitude", "placeId"]);
    setHeaders(googleHeaders);
    setRawRecords(records);
    setMapping(mappingGuess);
    setError(null);
    setIssues([]);
    setRowViews([]);
    setPlannedCategories([]);
    setPlannedCities([]);
    setResult(null);
    analyze({ records, headers: googleHeaders, mapping: mappingGuess, options: { autoCreateCategory: false, autoCreateDistrict: true, autoCreateCity: true } });
  }

  /* ---------- EŞLEME → ONİZLEME ---------- */

  function analyze(
    over?: Partial<{
      records: Record<string, string>[];
      headers: string[];
      mapping: Partial<Record<ImportField, number>>;
      options: ImportOptions;
    }>,
  ) {
    const deps = {
      records: over?.records ?? rawRecords,
      headers: over?.headers ?? headers,
      mapping: over?.mapping ?? mapping,
      options: over?.options ?? options,
    };
    const missing = REQUIRED_FIELDS.filter((f) => deps.mapping[f] === undefined);
    if (missing.length) {
      setError(`Zorunlu sütunlar eşlenmedi: ${missing.join(", ")}`);
      setStep("kaynak");
      return;
    }
    const analysis = analyzeImportRows(deps.records, deps.mapping, deps.options, { cities, categories, companies: listCompanies({ includeUnpublished: true }), headers: deps.headers });

    const views: ImportRowView[] = analysis.valid.map((candidate) => {
      const dup = findDuplicates({ ...candidate, placeId: candidate.placeId }, listCompanies({ includeUnpublished: true }));
      // Kesin mükerrerli satır hiç kaydırılamaz; şüpheliler varsayılan atlanır.
      return {
        candidate,
        exact: dup.exact,
        suspicious: dup.suspicious,
        include: dup.exact.length === 0 && dup.suspicious.length === 0,
      };
    });

    setRowViews(views);
    setIssues(analysis.issues);
    setPlannedCategories(
      [...analysis.plannedCategories.entries()].map(([key, name]) => ({ key, name })),
    );
    setPlannedCities([...analysis.plannedCities.entries()].map(([key, name]) => ({ key, name })));
    setError(null);
    setStep("onizle");
  }

  const includedRows = rowViews.filter((r) => r.include);
  /* ---------- KAYIT ---------- */

  async function runImport() {
    const rows = includedRows;
    if (!rows.length) return;
    const skipped = rowViews.length - rows.length;
    setStep("al");
    setProgress({ done: 0, total: rows.length });
    const failed: RunResult["failed"] = [];
    let created = 0;

    try {
      // 1) Planlanan yeni kategorileri aç — yalnız kayda girecek satırların ihtiyacı
      const planToName = new Map<string, string>();
      for (const row of rows) {
        if (row.candidate.categoryId?.startsWith("plan:")) {
          planToName.set(row.candidate.categoryId.slice(5), row.candidate.categoryText);
        }
      }
      const planMap = new Map<string, string>();
      for (const [key, name] of planToName) {
        const cat = createCategory(name, "🏢", actor);
        planMap.set(key, cat.id);
      }

      // 1b) Planlanan yeni şehirleri aç (O-7) — analizde yalnız Türkiye il
      //     listesiyle birebir eşleşen adlar planlanır; kimlik createCity'den
      //     (veritabanından) gelir, tahminî kimlik üretilmez.
      const createdCities = new Map<string, ReturnType<typeof createCity>>();
      for (const [key, name] of plannedCities.map((p) => [p.key, p.name] as const)) {
        try {
          const city = createCity(name, actor);
          createdCities.set(key, city);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Şehir açılamadı.";
          for (const row of rows) {
            if (row.candidate.cityPlanKey === key) {
              failed.push({ rowIndex: row.candidate.rowIndex, name: row.candidate.name, message: `Şehir açılamadı: ${msg}` });
            }
          }
        }
      }
      for (const row of rows) {
        const c = row.candidate;
        if (!c.city && c.cityPlanKey) c.city = createdCities.get(c.cityPlanKey);
      }

      // 2) İlçeler: analiz sonrası şehir kaydı güncel kontrol; eksikse aç (izinliyse)
      const districtDone = new Set<string>();
      for (const row of rows) {
        const c = row.candidate;
        const district = c.district ?? "";
        const key = `${c.city?.id}|${district}`;
        const city = district ? getCityById(c.city?.id ?? "") : undefined;
        if (!district || !city || districtDone.has(key)) continue;
        if (!city.districts.includes(district)) {
          if (!options.autoCreateDistrict) {
            failed.push({ rowIndex: c.rowIndex, name: c.name, message: `İlçe açılamadı: ${district}` });
            continue;
          }
          try {
            addDistrict(city.id, district, actor);
          } catch (err) {
            failed.push({
              rowIndex: c.rowIndex,
              name: c.name,
              message: err instanceof Error ? err.message : "İlçe açılamadı.",
            });
            continue;
          }
        }
        districtDone.add(key);
      }

      // 3) Gruplu firma kaydı — kategori bağlantısı ZORUNLU doğrulanır:
      //    çözümlemesi bozulan satır kategorisiz kaydedilmez, hata listesine girer.
      //    Şehir/kategori hatası alan satırlar kayıt listesinden çıkar (O-7).
      const failedRows = new Set(failed.map((f) => f.rowIndex));
      for (const group of chunk(
        rows.filter((r) => r.candidate.district && !failedRows.has(r.candidate.rowIndex)),
        GROUP_SIZE,
      )) {
        for (const row of group) {
          const c = row.candidate;
          const catRes = resolveImportCategoryId(c, planMap, (id) => Boolean(getCategoryById(id)));
          if (!catRes.ok) {
            failed.push({ rowIndex: c.rowIndex, name: c.name, message: catRes.reason });
            continue;
          }
          const draft: CompanyDraft = {
            name: c.name,
            categoryId: catRes.categoryId,
            cityId: c.city?.id ?? "",
            district: c.district ?? "Merkez",
            address: c.address,
            phone: c.phone,
            email: c.email,
            website: c.website,
            socials: {
              instagram: c.instagram,
              whatsapp: c.whatsapp,
              placeId: c.placeId,
              source: "google-maps-scraper",
            },
            description: c.description,
            published: publish,
          };
          try {
            createScraperCompany(draft, actor);
            created++;
          } catch (err) {
            failed.push({
              rowIndex: c.rowIndex,
              name: c.name,
              message: err instanceof Error ? err.message : "Kayıt başarısız.",
            });
          }
        }
        setProgress((p) => ({ done: p.done + group.length, total: rows.length }));
        await yieldToUI();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beklenmeyen hata — içe aktarma yarıda kesildi.");
    }

    setProgress({ done: rows.length - failed.length, total: rows.length });
    setResult({ created, skipped, failed });
    setStep("sonuc");
  }

  /* ---------- SIFIRLAMA ---------- */

  function reset() {
    setStep("kaynak");
    setRawRecords([]);
    setHeaders([]);
    setRowViews([]);
    setIssues([]);
    setPlannedCategories([]);
    setPlannedCities([]);
    setResult(null);
    setError(null);
  }

  const counts = useMemo(() => {
    const exact = rowViews.filter((r) => r.exact.length).length;
    const suspicious = rowViews.filter((r) => !r.exact.length && r.suspicious.length).length;
    const clean = rowViews.length - exact - suspicious;
    return { exact, suspicious, clean, issues: issues.length };
  }, [rowViews, issues]);

  return (
    <div className="panel-content">
      <PanelHead
        title="Google Maps Firma Toplama"
        desc="İl, ilçe ve kategori seçerek Google Maps üzerinden otomatik firma topla. Kayıt öncesi doğrulama ve mükerrer kontrolü yapılır; mevcut firmalar hiçbir koşulda otomatik güncellenmez."
      />
      {error && <ErrorBanner message={error} />}

      {step !== "al" && (
        <ol className="import-steps" aria-label="Adımlar">
          {(["kaynak", "onizle", "sonuc"] as Step[]).map((s, i) => (
            <li key={s} className={step === s ? "is-active" : ""} aria-current={step === s ? "step" : undefined}>
              {i + 1}. {sourceLabels[s]}
            </li>
          ))}
        </ol>
      )}

      {/* ---- KAYNAK: GOOGLE MAPS SCRAPER PANELİ ---- */}
      {step === "kaynak" && (
        <div className="card card__pad">
          <h3 style={{ marginBottom: 10 }}>Firma Bul</h3>
          <label style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 12 }}>
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
            Aktarılan firmalar yayında olsun
          </label>
          <GoogleScraperPanel
            onDone={(records) => loadGoogleCandidates(records)}
            onNotConfigured={(m) => setError(m)}
          />
        </div>
      )}

      {/* ---- 3. ADIM: ÖNİZLEME / MÜKERRER KARAR ---- */}
      {step === "onizle" && (
        <PreviewStep
          rows={rowViews}
          issues={issues}
          plannedCategories={plannedCategories}
          plannedCities={plannedCities}
          counts={counts}
          onToggle={(view, include) =>
            setRowViews((rows) => rows.map((r) => (r === view ? { ...r, include } : r)))
          }
          onBack={() => setStep("kaynak")}
          onConfirm={runImport}
          publish={publish}
        />
      )}

      {/* ---- ÇALIŞMA ---- */}
      {step === "al" && (
        <div className="card card__pad">
          <p className="mb-14">
            Gruplu kayıt sürüyor — sayfayı kapatmayın. {progress.total} kayıttan {progress.done} tamamlandı.
          </p>
          <progress value={progress.done} max={progress.total || 1} style={{ width: "100%" }} />
        </div>
      )}

      {/* ---- 5. ADIM: SONUÇ ---- */}
      {step === "sonuc" && result && (
        <div className="card card__pad">
          <h2 className="h2" style={{ fontSize: 18 }}>İçe aktarma tamamlandı</h2>
          <div className="form-row">
            <Badge tone="green">✓ {result.created} firma eklendi</Badge>
            <Badge tone="orange">⏭ {result.skipped} kayıt atlandı (mükerrer/karar)</Badge>
            {result.failed.length > 0 && <Badge tone="red">✗ {result.failed.length} kayıt başarısız</Badge>}
          </div>
          {result.failed.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Satır</th>
                    <th>Firma</th>
                    <th>Neden</th>
                  </tr>
                </thead>
                <tbody>
                  {result.failed.map((f, i) => (
                    <tr key={i}>
                      <td>{f.rowIndex}</td>
                      <td>{f.name}</td>
                      <td>{f.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <SyncNote />
          <div style={{ display: "flex", gap: 10 }}>
            <Link className="btn" to="/yonetim/firmalar">
              Firma kayıtlarına git
            </Link>
            <button type="button" className="btn btn--primary" onClick={reset}>
              Yeni içe aktarma
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============ KAYNAK ADIMI ============ */

const sourceLabels: Record<Step, string> = {
  kaynak: "Tarama ve aday seçimi",
  onizle: "Doğrulama ve mükerrer",
  al: "Kayıt",
  sonuc: "Sonuç",
};

/** Scraper adaylarında standart sütun başlıkları — eşleme bunları otomatik bulur. */
const googleHeaders = ["Firma Adı", "Telefon", "Şehir", "İlçe", "Kategori", "Adres", "Web Sitesi", "Enlem", "Boylam", "Place ID"];


/* ============ ÖNİZLEME PANELİ ============ */

function reasonText(m: DuplicateMatch): string {
  const labels: Record<string, string> = {
    telefon: "telefon aynı",
    "ad-slug": "ad aynı",
    "ad-benzer": "ad benzer",
    adres: "adres benzer",
    "place-id": "aynı Place ID",
  };
  return m.reasons.map((r) => labels[r] ?? r).join(" + ");
}

function PreviewStep({
  rows,
  issues,
  plannedCategories,
  plannedCities,
  counts,
  onToggle,
  onBack,
  onConfirm,
  publish,
}: {
  rows: ImportRowView[];
  issues: RowIssue[];
  plannedCategories: Array<{ key: string; name: string }>;
  plannedCities: Array<{ key: string; name: string }>;
  counts: { exact: number; suspicious: number; clean: number; issues: number };
  onToggle: (row: ImportRowView, include: boolean) => void;
  onBack: () => void;
  onConfirm: () => void;
  publish: boolean;
}) {
  const includedCount = rows.filter((r) => r.include).length;
  const hatali = issues.filter((i) => i.severity === "hata").length;

  return (
    <>
      {counts.exact + counts.suspicious + hatali > 0 && (
        <InfoBanner>
          <strong>Karar gerekli.</strong> {counts.exact} kesin mükerrer kayıttan engellendi
          (mevcut firma bilgileri otomatik güncellenmez). {counts.suspicious} şüpheli satır
          varsayılan atlandı — tablodan geri alabilirsiniz.
        </InfoBanner>
      )}
      <div className="form-row mb-14">
        <Badge tone="green">Temiz: {counts.clean}</Badge>
        <Badge tone="red">Kesin mükerrer: {counts.exact}</Badge>
        <Badge tone="orange">Şüpheli: {counts.suspicious}</Badge>
        <Badge tone="red">Hatalı satır: {hatali}</Badge>
        <Badge>Uyarı: {counts.issues - hatali}</Badge>
        {plannedCategories.length > 0 && <Badge tone="blue">Yeni kategori: {plannedCategories.length}</Badge>}
        {plannedCities.length > 0 && <Badge tone="blue">Yeni şehir: {plannedCities.length}</Badge>}
      </div>

      {plannedCities.length > 0 && (
        <div className="card card__pad mb-14">
          <strong>Açılacak yeni şehirler:</strong> {plannedCities.map((c) => c.name).join(", ")}{" "}
          <span style={{ color: "var(--muted)" }}>(kayıt aşamasında “Şehir ve ilçeler”e gerçek kayıtla eklenir)</span>
        </div>
      )}

      {plannedCategories.length > 0 && (
        <div className="card card__pad mb-14">
          <strong>Açılacak yeni kategoriler:</strong> {plannedCategories.map((c) => c.name).join(", ")}
        </div>
      )}

      {rows.length > 0 && (
        <div className="table-wrap mb-14">
          <table className="table">
            <thead>
              <tr>
                <th> </th>
                <th>Satır</th>
                <th>Firma</th>
                <th>Telefon</th>
                <th>Yer</th>
                <th>Adres / Konum</th>
                <th>Kategori</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((view) => {
                const c = view.candidate;
                const blocked = view.exact.length > 0;
                const coordOk = c.latitude !== undefined && c.longitude !== undefined;
                return (
                  <tr key={c.rowIndex}>
                    <td>
                      <input
                        type="checkbox"
                        checked={view.include}
                        disabled={blocked}
                        onChange={(e) => onToggle(view, e.target.checked)}
                      />
                    </td>
                    <td>{c.rowIndex}</td>
                    <td>{c.name}</td>
                    <td>{normalizePhoneDisplay(c.phone)}</td>
                    <td>
                      {c.city?.name} / {c.district}
                    </td>
                    <td>
                      {c.address ? (
                        <>
                          {c.address}
                          {coordOk && (
                            <>
                              {" "}
                              <code className="small">
                                {c.latitude!.toFixed(5)}, {c.longitude!.toFixed(5)}
                              </code>{" "}
                              <Badge tone="green">Konum</Badge>
                            </>
                          )}
                          {c.placeId && <span className="small text-muted"> · place:{c.placeId}</span>}{" "}
                          <a
                            href={
                              coordOk
                                ? `https://www.google.com/maps/search/?api=1&query=${c.latitude},${c.longitude}`
                                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.name + " " + c.address)}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="small"
                          >
                            Haritada Gör
                          </a>
                        </>
                      ) : (
                        <Badge tone="orange">adres yok</Badge>
                      )}
                    </td>
                    <td>{c.categoryText}</td>
                    <td>
                      {blocked ? (
                        <Badge tone="red">Kesin mükerrer — {reasonText(view.exact[0])}</Badge>
                      ) : view.suspicious.length > 0 ? (
                        <Badge tone="orange">Şüpheli: {reasonText(view.suspicious[0])}</Badge>
                      ) : (
                        <Badge tone="green">Tamam</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {issues.length > 0 && (
        <details className="card card__pad mb-14">
          <summary style={{ cursor: "pointer" }}>Doğrulama raporu ({issues.length} satır)</summary>
          <ul>
            {issues.slice(0, 100).map((i, k) => (
              <li key={k} style={{ color: i.severity === "hata" ? "var(--danger, #b42318)" : undefined }}>
                Satır {i.rowIndex}: {i.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" className="btn" onClick={onBack}>
          ← Aramaya dön
        </button>
        <button type="button" className="btn btn--primary" disabled={!includedCount} onClick={onConfirm}>
          İçe Aktar — {includedCount} kaydı {publish ? "yayınlı" : "taslak"} olarak kaydet
        </button>
      </div>
    </>
  );
}

function SyncNote() {
  return (
    <InfoBanner>
      Kayıtlar arka planda Supabase'e senkronize edilir. Üstteki "Değişiklik henüz sunucuya kaydedilemedi"
      pengueni görürseniz "Tekrar dene"ye basın — kısmi başarısızlıklar burada korunur.
    </InfoBanner>
  );
}
