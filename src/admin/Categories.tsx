import { useState } from "react";
import { PanelHead } from "./AdminLayout";
import { Badge, ErrorBanner, Field, InfoBanner } from "../components/ui";
import { useActor } from "../lib/auth";
import { categoryCompanyCount, createCategory, deleteCategory, listCategories } from "../lib/repo";
import { parseSheetFile } from "../lib/fileParse";
import { slugify, normalizeSearch } from "../lib/slug";

/*
 * TOPLU KATEGORİ EKLEME — CSV/TXT dosyası veya yapıştırılan listeden.
 * Kayıt öncesi önizleme: ad/ikon, mevcut durumu (mevcut/tekrar) işaretlenir;
 * yalnız "yeni" olanlar createCategory ile eklenir (mevcutlar dokunulmaz).
 * Satır biçimi: "Ad" veya "Ad;İkon" (ikon 1 emoji; noktalı virgül ayraç).
 */
interface CategoryPreviewRow {
  name: string;
  icon: string;
  status: "yeni" | "mevcut" | "tekrar";
}

/** Metni satır/sütun önizlemesine çevirir: mevcutsa "mevcut", listede tekrar "tekrar". */
function analyzeCategoryText(text: string, existing: { name: string; slug: string }[]): CategoryPreviewRow[] {
  const seen = new Set<string>();
  const existingKeys = new Set(existing.map((c) => slugify(c.name) || normalizeSearch(c.name)));
  const rows: CategoryPreviewRow[] = [];
  for (const raw of text.split(/\r?\n|,/)) {
    const line = raw.trim();
    if (!line) continue;
    const [namePart, iconPart] = line.includes(";") ? line.split(";") : [line, ""];
    const name = (namePart ?? "").trim();
    if (!name) continue;
    const key = slugify(name);
    let status: CategoryPreviewRow["status"] = "yeni";
    if (existingKeys.has(key)) status = "mevcut";
    else if (seen.has(key)) status = "tekrar";
    seen.add(key);
    rows.push({ name, icon: (iconPart ?? "").trim().slice(0, 4) || "", status });
  }
  return rows;
}

export default function AdminCategories() {
  const actor = useActor();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Toplu akış
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [preview, setPreview] = useState<CategoryPreviewRow[]>([]);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  function rebuildPreview(text: string) {
    setBulkText(text);
    setPreview(text.trim() ? analyzeCategoryText(text, listCategories()) : []);
    setBulkResult(null);
  }

  function applyBulk() {
    const news = preview.filter((r) => r.status === "yeni");
    const failures: string[] = [];
    let added = 0;
    for (const row of news) {
      try {
        createCategory(row.name, row.icon, actor);
        added++;
      } catch (err) {
        failures.push(`${row.name}: ${err instanceof Error ? err.message : "eklenemedi"}`);
      }
    }
    const skipped = preview.length - added - failures.length;
    setBulkResult(`${added} kategori eklendi${skipped > 0 ? `; ${skipped} satır atlandı (mevcut/tekrar)` : ""}`);
    if (failures.length) setError(failures.join(" | "));
    setPreview([]);
    setBulkText("");
  }

  return (
    <div className="panel-content">
      <PanelHead
        title="Kategoriler"
        desc="İşletme kategorilerini ve ikonlarını yönetin. Kategori silmek için önce firmaları taşımalısınız."
      />
      {error && <ErrorBanner message={error} />}

      <div className="card card__pad mb-14" style={{ maxWidth: 520 }}>
        <form
          className="form-row"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              createCategory(name, icon, actor);
              setName("");
              setIcon("");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Kategori eklenemedi.");
            }
          }}
        >
          <Field label="Kategori adı" required>
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Örn: Güzellik & Kuaför" />
          </Field>
          <Field label="İkon" hint="1 emoji">
            <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} placeholder="💅" style={{ width: 96 }} />
          </Field>
          <button className="btn btn--primary" type="submit" style={{ alignSelf: "flex-end", marginBottom: 14 }}>
            Ekle
          </button>
        </form>
      </div>

      {/* ---- TOPLU KATEGORİ EKLEME ---- */}
      <div className="card card__pad mb-14" style={{ maxWidth: 720 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Toplu kategori ekleme</h3>
          <button type="button" className="btn btn--sm" onClick={() => setBulkOpen((o) => !o)}>
            {bulkOpen ? "Kapat" : "Aç"}
          </button>
        </div>
        {bulkOpen && (
          <>
            <p className="mb-14" style={{ color: "var(--text-2)" }}>
              Her satıra bir kategori: <code>Ad</code> veya <code>Ad;İkon</code>. Virgülle de ayırabilirsiniz.
              Mevcut kategoriler ve listede tekrar edenler atlanır.
            </p>
            <div className="form-row">
              <Field label="CSV/TXT dosyası (isteğe bağlı)">
                <input
                  type="file"
                  accept=".csv,.txt,.tsv"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setError(null);
                    parseSheetFile(f)
                      .then((sheet) => {
                        const lines = sheet.records.map((r) => {
                          const [first] = Object.values(r);
                          const second = Object.values(r)[1] ?? "";
                          return second ? `${first};${second}` : first;
                        });
                        rebuildPreview(lines.join("\n"));
                      })
                      .catch((err) => setError(err instanceof Error ? err.message : "Dosya okunamadı."));
                  }}
                />
              </Field>
            </div>
            <Field label="Kategori listesi">
              <textarea
                rows={5}
                value={bulkText}
                onChange={(e) => rebuildPreview(e.target.value)}
                placeholder={"Güzellik & Kuaför;💆\nOto Tamirci;🔧\nBaklavacı;🥮"}
              />
            </Field>
            {preview.length > 0 && (
              <div className="table-wrap mb-14">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Kategori</th>
                      <th>İkon</th>
                      <th>Durum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i}>
                        <td>{r.name}</td>
                        <td>{r.icon || "🏢"}</td>
                        <td>
                          {r.status === "yeni" && <Badge tone="green">eklenecek</Badge>}
                          {r.status === "mevcut" && <Badge tone="blue">zaten mevcut</Badge>}
                          {r.status === "tekrar" && <Badge tone="orange">liste içinde tekrar</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {bulkResult && (
              <InfoBanner>
                <strong>{bulkResult}</strong>
              </InfoBanner>
            )}
            <button type="button" className="btn btn--primary" disabled={!preview.some((r) => r.status === "yeni")} onClick={applyBulk}>
              {preview.filter((r) => r.status === "yeni").length} yeni kategoriyi ekle
            </button>
          </>
        )}
      </div>

      <div className="table-wrap" style={{ maxWidth: 720 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Kategori</th>
              <th>Slug</th>
              <th>Firma sayısı</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {listCategories().map((c) => (
              <tr key={c.id}>
                <td>
                  <span aria-hidden="true">{c.icon}</span> <strong>{c.name}</strong>
                </td>
                <td className="text-muted small">/kategori/{c.slug}</td>
                <td>
                  <Badge tone="blue">{categoryCompanyCount(c.id)}</Badge>
                </td>
                <td>
                  <button
                    className="btn btn--sm btn--danger"
                    onClick={async () => {
                      setError(null);
                      try {
                        deleteCategory(c.id, actor);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Silinemedi.");
                      }
                    }}
                  >
                    Sil
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
