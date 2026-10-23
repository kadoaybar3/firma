import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PanelHead } from "./AdminLayout";
import { Badge, ErrorBanner, Field, InfoBanner } from "../components/ui";
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
import { downloadTemplate, parseSheetFile, parseTextBlock } from "../lib/fileParse";
import { searchPlaceCandidates, PlacesConfigError, type PlaceCandidate } from "../lib/places";
import { CollectorPanel } from "./CollectorPanel";
import { addDistrict, createCategory, createCity, createCompany, getCategoryById, getCityById, listCategories, listCities, listCompanies } from "../lib/repo";
import type { CompanyDraft } from "../lib/repo";
import { TR_ILLER } from "../data/trCities";
import { TR_ILCELERI } from "../data/trDistricts";
import { mapLink } from "../lib/hours";
import { normalizeSearch } from "../lib/slug";
import type { Company } from "../lib/types";

/*
 * İÇE AKTARMA SAYFASI (admin) — üç kaynak (CSV/Excel/yapıştırma/Google adayları),
 * sütun eşleme, doğrulama önizleme, mükerrer karar ekranı ve gruplu kayıt.
 *
 * Kamu kuralları:
 *  - Kayıt yalnız admin (AdminLayout rolü) altındadır; RLS rep self-read dışarıda bırakır.
 *  - Mevcut firmalar ASLA otomatik güncellenmez: kesin mükerrer engellenir,
 *    şüpheliler varsayılan atlanır (kullanıcı tek tek barındırabilir).
 *  - Gruplu işleme: her grup 25 kayıt; gruplar arasında karanlık çağ dönmesi
 *    (yield) UI donmasını önler; hata başına-satır listelenir — kısmi başarı raporu.
 */

type Step = "kaynak" | "esle" | "onizle" | "al" | "sonuc";

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

  // Kaynak
  const [rawRecords, setRawRecords] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [sourceLabel, setSourceLabel] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [fileName, setFileName] = useState("");

  // Eşleme + seçenekler
  const [mapping, setMapping] = useState<Partial<Record<ImportField, number>>>({});
  const [options, setOptions] = useState<ImportOptions>({ autoCreateCategory: true, autoCreateDistrict: true, autoCreateCity: true });
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
  const companies = listCompanies();

  /* ---------- KAYNAK ---------- */

  function loadSheet(parsed: { headers: string[]; records: Record<string, string>[] }, label: string) {
    if (!parsed.headers.length || !parsed.records.length) {
      setError("Dosya boş görünüyor veya başlık satırı okunamadı.");
      return;
    }
    setHeaders(parsed.headers);
    setRawRecords(parsed.records);
    setMapping(guessMapping(parsed.headers, [...REQUIRED_FIELDS, "address", "email", "website", "instagram", "whatsapp", "description", "latitude", "longitude", "placeId"]));
    setSourceLabel(label);
    setError(null);
    setIssues([]);
    setRowViews([]);
    setPlannedCategories([]);
    setPlannedCities([]);
    setResult(null);
    setStep("esle");
  }

  /**
   * Google aday akışı: seçim + İçe Aktar tek ekranda → şablon başlıklarını
   * doğrudan analizleyerek önizlemeye atla (sütun eşleme ekranı yalnız dosya
   * kaynaklı akışta görünür; Google başlıkları sabittir).
   */
  function loadGoogleCandidates(records: Record<string, string>[]) {
    const mappingGuess = guessMapping(googleHeaders, [...REQUIRED_FIELDS, "address", "email", "website", "instagram", "whatsapp", "description", "latitude", "longitude", "placeId"]);
    setHeaders(googleHeaders);
    setRawRecords(records);
    setMapping(mappingGuess);
    setSourceLabel("Google adayları");
    setError(null);
    setIssues([]);
    setRowViews([]);
    setPlannedCategories([]);
    setPlannedCities([]);
    setResult(null);
    analyze({ records, headers: googleHeaders, mapping: mappingGuess, options: { autoCreateCategory: false, autoCreateDistrict: true, autoCreateCity: true } });
  }

  function loadFile(file: File) {
    setError(null);
    parseSheetFile(file)
      .then((parsed) => loadSheet(parsed, file.name))
      .catch((err) => setError(err instanceof Error ? err.message : "Dosya okunamadı."));
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
      setStep("esle");
      return;
    }
    const analysis = analyzeImportRows(deps.records, deps.mapping, deps.options, { cities, categories, companies, headers: deps.headers });

    const views: ImportRowView[] = analysis.valid.map((candidate) => {
      const dup = findDuplicates(candidate, companies);
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
            },
            description: c.description,
            published: publish,
          };
          try {
            createCompany(draft, actor);
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
    setPasteText("");
    setFileName("");
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
        title="İçe aktarma"
        desc="CSV/Excel dosyası veya Google adaylarından toplu firma içe aktar. Kayıt öncesi doğrulama ve mükerrer kontrolü yapılır; mevcut firmalar hiçbir koşulda otomatik güncellenmez."
      />
      {error && <ErrorBanner message={error} />}

      {step !== "al" && (
        <ol className="import-steps" aria-label="Adımlar">
          {(["kaynak", "esle", "onizle", "sonuc"] as Step[]).map((s, i) => (
            <li key={s} className={step === s ? "is-active" : ""} aria-current={step === s ? "step" : undefined}>
              {i + 1}. {sourceLabels[s]}
            </li>
          ))}
        </ol>
      )}

      {/* ---- 1. ADIM: KAYNAK SEÇİMİ ---- */}
      {step === "kaynak" && (
        <SourceStep
          fileName={fileName}
          pasteText={pasteText}
          setPasteText={setPasteText}
          setFileName={setFileName}
          loadFile={loadFile}
          onLoadPaste={() => {
            try {
              loadSheet(parseTextBlock(pasteText), "yapıştırılan metin");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Metin okunamadı.");
            }
          }}
          onGoogle={(records) => loadGoogleCandidates(records)}
          setGoogleError={setError}
        />
      )}

      {/* ---- 2. ADIM: SÜTUN EŞLEME ---- */}
      {step === "esle" && (
        <div className="card card__pad">
          <p className="mb-14">
            <strong>{sourceLabel}</strong> — {rawRecords.length} kayıt, {headers.length} sütun bulundu.
            Zorunlu alanlar: firma adı, telefon, şehir, ilçe, kategori.
          </p>
          <div className="form-row">
            {(Object.keys(fieldLabels) as ImportField[]).map((field) => (
              <Field
                key={field}
                label={`${fieldLabels[field]}${REQUIRED_FIELDS.includes(field) ? " (zorunlu)" : ""}`}
              >
                <select
                  value={mapping[field] ?? ""}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [field]: e.target.value === "" ? undefined : Number(e.target.value) }))
                  }
                >
                  <option value="">— kullanma —</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <div className="form-row">
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={options.autoCreateCategory}
                onChange={(e) => setOptions({ ...options, autoCreateCategory: e.target.checked })}
              />
              Eşleşmeyen kategorileri otomatik oluştur
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={options.autoCreateDistrict}
                onChange={(e) => setOptions({ ...options, autoCreateDistrict: e.target.checked })}
              />
              Kayıtlı olmayan ilçeleri otomatik ekle
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={options.autoCreateCity}
                onChange={(e) => setOptions({ ...options, autoCreateCity: e.target.checked })}
              />
              Kayıtlı olmayan illeri otomatik aç (yalnız Türkiye il listesiyle eşleşirse)
            </label>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
              İçe aktarılan firmalar yayında olsun
            </label>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="btn" onClick={reset}>
              ← Kaynak değiştir
            </button>
            <button type="button" className="btn btn--primary" onClick={() => analyze()}>
              Doğrula ve önizle
            </button>
          </div>
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
          onBack={() => setStep("esle")}
          onConfirm={runImport}
          publish={publish}
        />
      )}

      {/* ---- 4. ADIM: ÇALIŞMA ---- */}
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
  kaynak: "Dosya / aday seçimi",
  esle: "Sütun eşleme",
  onizle: "Doğrulama ve mükerrer",
  al: "Kayıt",
  sonuc: "Sonuç",
};

const fieldLabels: Record<ImportField, string> = {
  name: "Firma adı",
  phone: "Telefon",
  city: "Şehir",
  district: "İlçe",
  category: "Kategori",
  address: "Adres",
  email: "E-posta",
  website: "Web sitesi",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  description: "Açıklama",
  latitude: "Enlem",
  longitude: "Boylam",
  placeId: "Place ID",
};

/** Google adaylarında standart sütun başlıkları — eşleme bunları otomatik bulur. */
const googleHeaders = ["Firma Adı", "Telefon", "Şehir", "İlçe", "Kategori", "Adres", "Web Sitesi", "Enlem", "Boylam", "Place ID"];

/** Sayı kuralı: Places API Text Search sayfa boyutu üst sınırı 20'dir. */
const LIMIT_OPTIONS = [5, 10, 15, 20];

/* ============ KAYNAK SEÇİMİ PANELİ ============ */

function SourceStep({
  fileName,
  pasteText,
  setPasteText,
  setFileName,
  loadFile,
  onLoadPaste,
  onGoogle,
  setGoogleError,
}: {
  fileName: string;
  pasteText: string;
  setPasteText: (t: string) => void;
  setFileName: (t: string) => void;
  loadFile: (f: File) => void;
  onLoadPaste: () => void;
  onGoogle: (records: Record<string, string>[]) => void;
  setGoogleError: (msg: string | null) => void;
}) {
  const [placesOpen, setPlacesOpen] = useState(false);
  const [collectorOpen, setCollectorOpen] = useState(false);
  return (
    <>
      <div className="card card__pad mb-14">
        <h3 style={{ marginBottom: 10 }}>Dosyadan yükle</h3>
        <p className="mb-14">
          CSV, TSV veya Excel (.xlsx/.xls). Sütun sırası önemli değil — sonraki adımda eşleyeceksiniz.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm"
            onChange={(e) => {
              setFileName(e.target.files?.[0]?.name ?? "");
              const f = e.target.files?.[0];
              if (f) loadFile(f);
            }}
          />
          <button type="button" className="btn" onClick={downloadTemplate}>
            Örnek şablonu indir
          </button>
          {fileName && <Badge>{fileName}</Badge>}
        </div>
      </div>

      <div className="card card__pad mb-14">
        <h3 style={{ marginBottom: 10 }}>Metni yapıştır</h3>
        <p className="mb-14">Başlık satırı ilk satır olabilir; ayraç (virgül / noktalı virgül / sekme) otomatik algılanır.</p>
        <Field label="Metin bloğu">
          <textarea rows={5} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Firma Adı;Telefon;Şehir;İlçe;Kategori;Adres&#10;Örnek Fırın;05551112233;Afyonkarahisar;Merkez;Fırınlar;Cumhuriyet Cd. 5" />
        </Field>
        <button type="button" className="btn" disabled={!pasteText.trim()} onClick={onLoadPaste}>
          Metni analiz et
        </button>
      </div>

      <div className="card card__pad">
        <h3 style={{ marginBottom: 10 }}>Google işletme adayları <Badge>deneysel</Badge></h3>
        <InfoBanner>
          Aday arama Places&nbsp;API (New) üzerinden yapılır — anahtar sunucuda tutulur ve{" "}
          <strong>istekte ücretlidir</strong>. Anahtar tanımlı değilse arama açılmaz (aşağıda bildirilir).
        </InfoBanner>
        {!placesOpen ? (
          <button type="button" className="btn" onClick={() => setPlacesOpen(true)}>
            Google aday aramasını aç
          </button>
        ) : (
          <PlacesPanel onDone={onGoogle} onNotConfigured={(m) => setGoogleError(m)} />
        )}
      </div>

      <div className="card card__pad">
        <h3 style={{ marginBottom: 10 }}>Otomatik işletme bulma <Badge>v1</Badge></h3>
        <InfoBanner>
          Arama, <strong>ayrı bir Python toplama servisi</strong>'nde iş-tabanlı yürür (bağlantı açık tutulmaz):
          Google Places veya <strong>önceden hazırlanmış bir Scraper CSV dosyasını</strong> kaynak olarak
          kullanabilirsiniz. Adaylar tabloda Kaynak/telefon/adres/web ile listelenir, mükerrer ve eksik-bilgili
          adaylar etiketlenir. Kayıt yalnızca önizleme onayınızla meydana gelir.
        </InfoBanner>
        {!collectorOpen ? (
          <button type="button" className="btn" onClick={() => setCollectorOpen(true)}>
            Otomatik bulma panelini aç
          </button>
        ) : (
          <CollectorPanel onDone={onGoogle} onNotConfigured={(m) => setGoogleError(m)} />
        )}
      </div>
    </>
  );
}

/* ============ GOOGLE ADAY PANELİ — SEÇİM EKRANI ============ */

/**
 * Seçim ekranı sırası (spec 1): İl → İlçe → Kategori → Sayı.
 * İl değişince ilçe sıfırlanır; alanlar eksikse arama başlamaz.
 * İlçe listesi veritabanındaki şehir kaydından gelir — DB'de olmayan ilde
 * kullanıcı önce "Şehir ve ilçeler" sayfasından ili eklemelidir (uyarı gösterilir).
 */
function PlacesPanel({ onDone, onNotConfigured }: { onDone: (records: Record<string, string>[]) => void; onNotConfigured: (m: string) => void }) {
  const cities = listCities();
  const categories = listCategories();
  const companies = listCompanies();
  const [il, setIl] = useState(cities[0]?.name ?? TR_ILLER[2] ?? "");
  const [ilce, setIlce] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<PlaceCandidate[] | null>(null);
  const [requestedLimit, setRequestedLimit] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const dbCity = cities.find((c) => normalizeSearch(c.name) === normalizeSearch(il));
  /**
   * İlçe listesi = statik Türkiye seti (TR_ILCELERI, 81 il/973 ilçe) ∪ DB
   * şehir kaydının ilçeleri. DB'de il/ilçe hiç olmasa da liste dolu gelir —
   * DB kaydı yalnız İÇE AKTARMADA gerekir (doğrulama aşaması şehir eşler).
   */
  const staticDistricts = TR_ILCELERI[il] ?? [];
  const districtSeen = new Set<string>();
  const districts: string[] = [];
  for (const d of [...staticDistricts, ...(dbCity?.districts ?? [])]) {
    const key = normalizeSearch(d);
    if (districtSeen.has(key)) continue;
    districtSeen.add(key);
    districts.push(d);
  }

  async function search() {
    if (!il) return setError("Lütfen bir il seçin.");
    if (!ilce) return setError("Lütfen bir ilçe seçin.");
    if (!categoryId) return setError("Lütfen bir kategori seçin.");
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return setError("Kategori bulunamadı — sayfayı yenileyin.");
    const wanted = limit;
    setRequestedLimit(wanted);
    setLoading(true);
    setError(null);
    setCandidates(null);
    try {
      const list = (await searchPlaceCandidates({ il, ilce, sektor: category.name, limit: wanted })).slice(0, wanted);
      if (!list.length) {
        setError(
          `“${il} / ${ilce} / ${category.name}” için aday bulunamadı. Kategori adını harita terimine yakın deneyin (örn. “Oto Elektrik” → “oto elektrik tamiri”).`,
        );
        setCandidates([]);
      } else {
        setCandidates(list);
        // Varsayılan: tümü seçili; mükerrer uyarılılar da seçili kalır (kesin karar önizleme ekranında engellenir)
        setSelected(new Set(list.map((c) => c.placeId)));
      }
    } catch (err) {
      setCandidates([]);
      if (err instanceof PlacesConfigError) onNotConfigured(err.message);
      else setError(err instanceof Error ? err.message : "Arama başarısız.");
    } finally {
      setLoading(false);
    }
  }

  const allSelected = candidates !== null && candidates.length > 0 && candidates.every((c) => selected.has(c.placeId));

  return (
    <>
      {/* --- 1) SEÇİM: il / ilçe / kategori / sayı --- */}
      <div className="form-grid">
        <Field label="İl" required>
          <select
            value={il}
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
          <select value={ilce} onChange={(e) => { setIlce(e.target.value); setCandidates(null); }}>
            <option value="">— seçiniz —</option>
            {districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Kategori" required>
          <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setCandidates(null); }}>
            <option value="">— seçiniz —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Firma sayısı" required>
          <select value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
            {LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} firma
              </option>
            ))}
          </select>
        </Field>
      </div>
      {!dbCity && (
        <InfoBanner>
          “{il}” veritabanına kayıtlı değil — ilçeler Türkiye ilçe listesinden listelenir; ancak firmalar
          kaydedilirken şehir eşleşmesi gerektiğinden bu ilde içe aktarma yapabilmek için önce{" "}
          <Link to="/yonetim/sehirler">Şehir ve ilçeler</Link> sayfasından ili ekleyin.
        </InfoBanner>
      )}
      {staticDistricts.length === 0 && !dbCity && (
        <ErrorBanner message={`“${il}” için ilçe verisi bulunamadı — lütfen il adını kontrol edin veya destek için iletişime geçin.`} />
      )}
      <button type="button" className="btn btn--primary" disabled={loading} onClick={search} style={{ marginBottom: 14 }}>
        {loading ? "Aranıyor…" : "Firmaları Bul"}
      </button>

      {error && <ErrorBanner message={error} />}

      {/* --- 2) SONUÇLAR --- */}
      {candidates && candidates.length > 0 && (
        <>
          <p className="mb-14">
            <strong>{candidates.length} uygun firma bulundu</strong> — istenen: {requestedLimit}. İstenen sayıdan fazlası
            gösterilmez, bulunmayan kayıt uydurulmaz. Kaynak: Google Places API (New).
          </p>
          <div className="table-wrap mb-14" style={{ maxWidth: "100%" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) =>
                        setSelected(e.target.checked ? new Set(candidates.map((c) => c.placeId)) : new Set())
                      }
                      aria-label="Tüm adayları seç"
                    />
                  </th>
                  <th>İşletme</th>
                  <th>Adres</th>
                  <th>Telefon</th>
                  <th>Web</th>
                  <th>Konum</th>
                  <th>Uyarı</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => {
                  const dup = dupReason(c, companies);
                  return (
                    <tr key={c.placeId}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(c.placeId)}
                          onChange={(e) =>
                            setSelected((s) => {
                              const n = new Set(s);
                              if (e.target.checked) n.add(c.placeId);
                              else n.delete(c.placeId);
                              return n;
                            })
                          }
                        />
                      </td>
                      <td>{c.name}</td>
                      <td>
                        {c.address ?? "—"}{" "}
                        {mapsCandidateUrl(c) !== null && (
                          <a href={mapsCandidateUrl(c)!} target="_blank" rel="noopener noreferrer" className="small">
                            Haritada Gör
                          </a>
                        )}
                      </td>
                      <td>{c.phone ? normalizePhoneDisplay(c.phone) : "—"}</td>
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
                        {c.latitude !== undefined ? (
                          <code className="small">
                            {c.latitude.toFixed(5)}, {c.longitude!.toFixed(5)}
                          </code>
                        ) : (
                          <Badge tone="orange">konumsuz</Badge>
                        )}
                      </td>
                      <td>{dup && <Badge tone="orange">{dup}</Badge>}</td>
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
            onClick={() =>
              onDone(
                candidates
                  .filter((c) => selected.has(c.placeId))
                  .map((c) => ({
                    "Firma Adı": c.name,
                    Telefon: c.phone ?? "",
                    Şehir: il,
                    İlçe: ilce,
                    Kategori: categories.find((k) => k.id === categoryId)?.name ?? "",
                    Adres: c.address ?? "",
                    "Web Sitesi": c.website ?? "",
                    Enlem: c.latitude !== undefined ? String(c.latitude) : "",
                    Boylam: c.longitude !== undefined ? String(c.longitude) : "",
                    "Place ID": c.placeId,
                  })),
              )
            }
          >
            İçe Aktar
          </button>
        </>
      )}
    </>
  );
}

/** Sonuçta görünür mükerrer uyarısı — kayıt kararı yine doğrulama ekranında kesinleşir. */
function dupReason(c: PlaceCandidate, companies: Company[]): string | null {
  const rep = findDuplicates({ name: c.name, phone: c.phone ?? "", address: c.address ?? "" }, companies);
  if (rep.exact.length) return `Mevcut kayıtla kesin benzer: ${rep.exact[0].company.name}`;
  if (rep.suspicious.length) return `Mevcut kayıtla benzer olabilir: ${rep.suspicious[0].company.name}`;
  return null;
}

/** Harita bağlantısı: koordinat varsa koordinata, yoksa adrese göre. */
function mapsCandidateUrl(c: PlaceCandidate): string | null {
  if (c.latitude !== undefined && c.longitude !== undefined) {
    return `https://www.google.com/maps/search/?api=1&query=${c.latitude},${c.longitude}`;
  }
  if (c.address) return mapLink({ name: c.name, address: c.address });
  return null;
}

/* ============ ÖNİZLEME PANELİ ============ */

function reasonText(m: DuplicateMatch): string {
  const labels: Record<string, string> = {
    telefon: "telefon aynı",
    "ad-slug": "ad aynı",
    "ad-benzer": "ad benzer",
    adres: "adres benzer",
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
                                : mapLink({ name: c.name, address: c.address })
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
          ← Eşlemeye dön
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
