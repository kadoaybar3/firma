import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Eye,
  EyeOff,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  StarOff,
  Store,
  Trash2,
} from "lucide-react";
import { PanelHead } from "./AdminLayout";
import { Badge, EmptyState, ErrorBanner, Field, InfoBanner } from "../components/ui";
import { useActor } from "../lib/auth";
import { formatDateTime } from "../lib/format";
import {
  createCompany,
  deleteCompany,
  listCategories,
  listCities,
  listCompanies,
  listReps,
  updateCompany,
} from "../lib/repo";
import type { CompanyDraft } from "../lib/repo";

export default function AdminCompanies() {
  const actor = useActor();
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[]; label: string } | null>(null);
  /** Toplu işlem seçimi — yalnız GÖRÜNEN (filtrelenmiş) satırlar işaretlenebilir. */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(0);

  /**
   * Satır işlem menüsü <details> ile JS'siz açılır; dışarı tıklama ve Esc ile
   * kapanması için küçük bir yardımcı dinleyici ekleniyor.
   */
  useEffect(() => {
    function closeOpenMenus(event: Event) {
      const target = event.target as Node | null;
      document.querySelectorAll<HTMLDetailsElement>("details.rowmenu[open]").forEach((el) => {
        if (event.type === "keydown" || !target || !el.contains(target)) el.open = false;
      });
    }
    function onKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") closeOpenMenus(event);
    }
    document.addEventListener("click", closeOpenMenus);
    document.addEventListener("keydown", onKeydown);
    return () => {
      document.removeEventListener("click", closeOpenMenus);
      document.removeEventListener("keydown", onKeydown);
    };
  }, []);

  const categories = listCategories();
  const cities = listCities();
  const reps = listReps(actor);

  const companies = useMemo(
    () =>
      listCompanies({ includeUnpublished: true }).filter((c) => {
        if (catFilter && c.categoryId !== catFilter) return false;
        if (!q.trim()) return true;
        return `${c.name} ${c.district} ${c.address} ${c.phone}`
          .toLocaleLowerCase("tr")
          .includes(q.toLocaleLowerCase("tr").replace(/İ/g, "i").replace(/ı/g, "i"));
      }),
    [q, catFilter, tick],
  );

  function refresh() {
    setTick((t) => t + 1);
  }

  async function handleAction(fn: () => void) {
    setError(null);
    setNotice(null);
    try {
      fn();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem başarısız.");
    }
  }

  /* ------- Toplu işlemler (O-8 sonrası canlığrafik tur) ------- */

  const selectedRows = companies.filter((c) => selected.has(c.id));
  const unpublishedRows = companies.filter((c) => !c.published);
  const allSelected = companies.length > 0 && selectedRows.length === companies.length;
  /** Tek şehirli kurulumda konum sütununda yalnız ilçe gösterilir. */
  const singleCity = new Set(companies.map((c) => c.cityId)).size === 1;

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(companies.map((c) => c.id)));
  }

  /** Toplu değişiklik — yalnız durumun gerçekten değiştiği satırlara dokunulur. */
  function bulkSetPublished(published: boolean) {
    const targets = selectedRows.filter((c) => c.published !== published);
    if (!targets.length) {
      setNotice(published ? `Seçili ${selectedRows.length} firma zaten yayında.` : `Seçili ${selectedRows.length} firma zaten yayın dışında.`);
      return;
    }
    handleAction(() => {
      for (const c of targets) updateCompany(c.id, { published }, actor);
      setSelected(new Set());
      setNotice(`${targets.length} firma ${published ? "yayına alındı" : "yayından kaldırıldı"}.`);
    });
  }

  /** HEPSİNİ YAYINA AL — görüntülenen (filtrelenmiş) listedeki yayın-dışı firmalar. */
  function publishAllVisible() {
    if (!unpublishedRows.length) {
      setNotice("Listede yayın dışı firma yok — her şey zaten yayında.");
      return;
    }
    handleAction(() => {
      for (const c of unpublishedRows) updateCompany(c.id, { published: true }, actor);
      setSelected(new Set());
      setNotice(`${unpublishedRows.length} firma tek hamlede yayına alındı.`);
    });
  }

  function bulkDelete() {
    if (!selectedRows.length) return;
    setDeleteTarget({
      ids: selectedRows.map((c) => c.id),
      label: `${selectedRows.length} firma`,
    });
  }

  /** Modal onayı sonrası tek veya toplu silme — her satır ayrı denenir, sonuç raporlanır. */
  function performDelete(target: { ids: string[]; label: string }) {
    const failed: Array<{ name: string; reason: string }> = [];
    let ok = 0;
    for (const id of target.ids) {
      const row = companies.find((c) => c.id === id);
      try {
        deleteCompany(id, actor);
        ok += 1;
      } catch (err) {
        failed.push({
          name: row?.name ?? id,
          reason: err instanceof Error ? err.message : "bilinmeyen hata",
        });
      }
    }
    setSelected(new Set());
    setDeleteTarget(null);
    setError(null);
    if (failed.length) {
      setNotice(ok ? `${ok} firma silindi.` : null);
      setError(
        `${ok ? `${ok} firma silindi; ` : ""}${failed.length} firma silinemedi → ${failed
          .map((f) => `${f.name} (${f.reason})`)
          .join("; ")}`,
      );
    } else {
      setNotice(`${ok} firma silindi.`);
    }
    refresh();
  }

  return (
    <div className="panel-content">
      <PanelHead
        title="Firma kayıtları"
        desc="Rehberdeki tüm firmalar; yayında/pasif durumu, öne çıkarma, düzenleme ve toplu işlemler (seçimle yayına al / yayından al / sil)."
        action={
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn" onClick={publishAllVisible} disabled={creating || unpublishedRows.length === 0}>
              <ArrowUpCircle size={16} strokeWidth={1.9} aria-hidden="true" />
              Hepsini yayına al{!creating && unpublishedRows.length ? ` (${unpublishedRows.length})` : ""}
            </button>
            <button className="btn btn--primary" onClick={() => setCreating((c) => !c)}>
              {creating ? (
                "Kapat"
              ) : (
                <>
                  <Plus size={16} strokeWidth={2.1} aria-hidden="true" />
                  Yeni firma
                </>
              )}
            </button>
          </div>
        }
      />

      {error && <ErrorBanner message={error} />}
      {!error && notice && <InfoBanner>{notice}</InfoBanner>}

      {creating ? (
        <CompanyForm
          categories={categories}
          cities={cities}
          reps={reps}
          onCancel={() => setCreating(false)}
          onSubmit={(draft) =>
            handleAction(() => {
              createCompany(draft, actor);
              setCreating(false);
            })
          }
        />
      ) : (
        <div className="filter-bar" style={{ gridTemplateColumns: "1fr 1fr", maxWidth: 560 }}>
          <input
            className="input"
            placeholder="Firma adı / telefon ara…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="input"
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
          >
            <option value="">Tüm kategoriler</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {!creating && companies.length === 0 ? (
        <EmptyState
          icon={<Store size={30} strokeWidth={1.5} aria-hidden="true" />}
          title="Firma bulunamadı"
          description="Arama/filtre kriterlerinizi değiştirin."
        />
      ) : null}

      {!creating && selectedRows.length > 0 && (
        <div className="card card__pad mb-14" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <strong>{selectedRows.length} firma seçili</strong>
          <button className="btn btn--sm" onClick={() => bulkSetPublished(true)}>
            <ArrowUpCircle size={15} strokeWidth={1.9} aria-hidden="true" />
            Yayına al ({selectedRows.filter((c) => !c.published).length})
          </button>
          <button className="btn btn--sm" onClick={() => bulkSetPublished(false)}>
            <ArrowDownCircle size={15} strokeWidth={1.9} aria-hidden="true" />
            Yayından al ({selectedRows.filter((c) => c.published).length})
          </button>
          <button className="btn btn--sm btn--danger" onClick={bulkDelete}>
            <Trash2 size={15} strokeWidth={1.9} aria-hidden="true" />
            Sil ({selectedRows.length})
          </button>
          <button className="btn btn--sm btn--ghost" onClick={() => setSelected(new Set())}>
            Seçimi bırak
          </button>
        </div>
      )}

      {!creating && companies.length > 0 && (
        <div className="table-wrap table-wrap--cards">
          <table className="table table--rows">
            <thead>
              <tr>
                <th style={{ width: 34 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Tümünü seç / bırak"
                  />
                </th>
                <th>Firma</th>
                <th>Durum</th>
                <th>Kategori</th>
                <th>Konum</th>
                <th>Telefon</th>
                <th>Tarih</th>
                <th style={{ width: 54 }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((co) => {
                const category = categories.find((c) => c.id === co.categoryId);
                return (
                  <tr key={co.id}>
                    <td data-label="" className="cell-check">
                      <input
                        type="checkbox"
                        checked={selected.has(co.id)}
                        onChange={() => toggleRow(co.id)}
                        aria-label={`${co.name} seç`}
                      />
                    </td>
                    <td data-label="Firma">
                      <span className="cell-name">
                        <strong className="cell-title" title={co.address || undefined}>{co.name}</strong>
                        {co.featured && (
                          <span className="cell-flag" title="Öne çıkan firma">
                            <Star size={13} strokeWidth={2} fill="currentColor" aria-hidden="true" />
                            <span className="sr-only">Öne çıkan</span>
                          </span>
                        )}
                      </span>
                    </td>
                    <td data-label="Durum">
                      <div className="badge-stack">
                        <Badge tone={co.published ? "green" : "gray"}>
                          {co.published ? "Yayında" : "Yayın dışı"}
                        </Badge>
                      </div>
                    </td>
                    <td data-label="Kategori"><Badge tone="blue">{category?.name ?? "Kategorisiz"}</Badge></td>
                    <td data-label="Konum" className="nowrap" title={locationLabel(co, cities)}>
                      {locationLabel(co, cities, singleCity)}
                    </td>
                    <td data-label="Telefon" className="nowrap"><a href={`tel:${co.phone}`}>{co.phone || "—"}</a></td>
                    <td data-label="Tarih" className="small text-muted nowrap">
                      {new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(new Date(co.createdAt))}
                    </td>
                    <td data-label="İşlem">
                      <details className="rowmenu">
                        <summary aria-label={`${co.name} işlemleri`}>
                          <MoreHorizontal size={16} strokeWidth={2} aria-hidden="true" />
                        </summary>
                        <div className="rowmenu__panel">
                          <button
                            type="button"
                            onClick={() =>
                              handleAction(() => updateCompany(co.id, { published: !co.published }, actor))
                            }
                          >
                            {co.published ? (
                              <EyeOff size={15} strokeWidth={1.9} aria-hidden="true" />
                            ) : (
                              <Eye size={15} strokeWidth={1.9} aria-hidden="true" />
                            )}
                            {co.published ? "Yayından al" : "Yayına al"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleAction(() => updateCompany(co.id, { featured: !co.featured }, actor))
                            }
                          >
                            {co.featured ? (
                              <StarOff size={15} strokeWidth={1.9} aria-hidden="true" />
                            ) : (
                              <Star size={15} strokeWidth={1.9} aria-hidden="true" />
                            )}
                            {co.featured ? "Öne çıkarmayı bırak" : "Öne çıkar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(editingId === co.id ? null : co.id)}
                          >
                            <Pencil size={15} strokeWidth={1.9} aria-hidden="true" />
                            {editingId === co.id ? "Düzenlemeyi kapat" : "Düzenle"}
                          </button>
                          <button
                            type="button"
                            className="is-danger"
                            onClick={() => setDeleteTarget({ ids: [co.id], label: co.name })}
                          >
                            <Trash2 size={15} strokeWidth={1.9} aria-hidden="true" />
                            Sil
                          </button>
                        </div>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editingId && !creating && (
        <EditCompany
          key={editingId}
          companyId={editingId}
          categories={categories}
          cities={cities}
          reps={reps}
          onCancel={() => setEditingId(null)}
        />
      )}
      {deleteTarget && (
        <div
          role="presentation"
          onClick={() => setDeleteTarget(null)}
          className="modal-backdrop"
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-company-title"
            className="card card__pad"
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(100%,460px)" }}
          >
            <h3 id="delete-company-title">
              {deleteTarget.ids.length > 1 ? "Firmalar silinsin mi?" : "Firma silinsin mi?"}
            </h3>
            <p className="text-muted">
              <strong>{deleteTarget.label}</strong> kalıcı olarak silinecek. Bu işlem geri alınamaz.
            </p>
            {error && <ErrorBanner message={error} />}
            <div className="form-row mt-14">
              <button className="btn btn--danger" onClick={() => performDelete(deleteTarget)}>
                {deleteTarget.ids.length > 1 ? `${deleteTarget.ids.length} firmayı sil` : "Kalıcı sil"}
              </button>
              <button className="btn" onClick={() => setDeleteTarget(null)}>
                Vazgeç
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/**
 * Konum etiketi. Tek şehirli kurulumda (tüm firmalar aynı şehirde) sütunu
 * daraltmak için yalnız ilçe gösterilir; şehir bilgisi title'da kalır.
 */
function locationLabel(
  co: { cityId: string; district: string },
  cities: ReturnType<typeof listCities>,
  districtOnly = false,
) {
  const city = cities.find((c) => c.id === co.cityId);
  if (!city) return co.district;
  return districtOnly ? co.district : `${city.name} / ${co.district}`;
}

/* ---------- Firma ekleme/düzenleme formu (initial verilmezse boş başlar) ---------- */
export function CompanyForm({
  categories,
  cities,
  reps,
  onSubmit,
  onCancel,
  initial,
  title = "Yeni firma ekle",
}: {
  categories: ReturnType<typeof listCategories>;
  cities: ReturnType<typeof listCities>;
  reps: ReturnType<typeof listReps>;
  onSubmit: (draft: CompanyDraft) => void;
  onCancel: () => void;
  /** Önceden dolu taslak (firma düzenleme, aday→firma dönüşümü). Verilmezse boş başlar. */
  initial?: CompanyDraft;
  title?: string;
}) {
  const [draft, setDraft] = useState<CompanyDraft>(
    initial ?? {
      name: "",
      categoryId: categories[0]?.id ?? "",
      cityId: cities[0]?.id ?? "",
      district: "Merkez",
      address: "",
      phone: "",
      email: "",
      website: "",
      socials: {},
      description: "",
      featured: false,
      published: true,
    },
  );
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string,string>>({});

  const city = cities.find((c) => c.id === draft.cityId);

  return (
    <div className="card card__pad mb-14">
      <h3 style={{ fontWeight: 800, marginBottom: 14 }}>{title}</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const next: Record<string,string> = {};
          if (!draft.name.trim()) next.name = "Firma adı zorunludur.";
          if (!draft.categoryId) next.categoryId = "Kategori seçin.";
          if (!draft.cityId) next.cityId = "Şehir seçin.";
          if (!draft.district.trim()) next.district = "İlçe zorunludur.";
          if (!draft.phone.trim()) next.phone = "Telefon zorunludur.";
          if (!draft.description.trim()) next.description = "Açıklama zorunludur.";
          setFieldErrors(next);
          if (Object.keys(next).length) return;
          try {
            onSubmit(draft);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Kayıt başarısız.");
          }
        }}
      >
        <div className="form-grid">
          <div className="form-section">Kimlik ve konum</div>
          <Field label="Firma adı" required error={fieldErrors.name}>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
            />
          </Field>
          <Field label="Kategori" required error={fieldErrors.categoryId}>
            <select
              value={draft.categoryId}
              onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Şehir" required error={fieldErrors.cityId}>
            <select
              value={draft.cityId}
              onChange={(e) => setDraft({ ...draft, cityId: e.target.value })}
            >
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="İlçe" required error={fieldErrors.district}>
            <select
              value={draft.district}
              onChange={(e) => setDraft({ ...draft, district: e.target.value })}
            >
              {(city?.districts ?? []).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </Field>
          <div className="form-section">İletişim bilgileri</div>
          <Field label="Telefon" required error={fieldErrors.phone}>
            <input
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              placeholder="0272 000 00 00"
            />
          </Field>
          <Field label="E-posta">
            <input
              type="email"
              value={draft.email ?? ""}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
            />
          </Field>
          <Field label="Web sitesi">
            <input
              value={draft.website ?? ""}
              onChange={(e) => setDraft({ ...draft, website: e.target.value })}
              placeholder="https://"
            />
          </Field>
          <Field label="Instagram kullanıcı adı">
            <input
              value={draft.socials?.instagram ?? ""}
              onChange={(e) => setDraft({ ...draft, socials: { ...draft.socials, instagram: e.target.value } })}
            />
          </Field>
          <Field label="WhatsApp numarası" hint="Örn. 90555XXXXXXX">
            <input
              value={draft.socials?.whatsapp ?? ""}
              onChange={(e) => setDraft({ ...draft, socials: { ...draft.socials, whatsapp: e.target.value } })}
            />
          </Field>
          <div className="form-section">Firma açıklaması</div>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Açıklama" required error={fieldErrors.description}>
              <textarea
                rows={3}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="Firmanın hizmet ve ayırt edici özelliklerini kısaca yazın…"
              />
            </Field>
          </div>
          <div className="form-section">Çalışma saatleri ve atama</div>
          <Field label="Hafta içi saatleri">
            <input
              value={draft.hours?.weekday ?? ""}
              onChange={(e) => setDraft({ ...draft, hours: { ...draft.hours, weekday: e.target.value, saturday: draft.hours?.saturday ?? "", sunday: draft.hours?.sunday ?? "" } })}
              placeholder="09:00 - 18:00"
            />
          </Field>
          <Field label="Cumartesi">
            <input
              value={draft.hours?.saturday ?? ""}
              onChange={(e) => setDraft({ ...draft, hours: { ...draft.hours, weekday: draft.hours?.weekday ?? "", saturday: e.target.value, sunday: draft.hours?.sunday ?? "" } })}
            />
          </Field>
          <Field label="Pazar">
            <input
              value={draft.hours?.sunday ?? ""}
              onChange={(e) => setDraft({ ...draft, hours: { ...draft.hours, weekday: draft.hours?.weekday ?? "", saturday: draft.hours?.saturday ?? "", sunday: e.target.value } })}
            />
          </Field>
          <Field label="Satış temsilcisi">
            <select
              value={draft.repId ?? ""}
              onChange={(e) => setDraft({ ...draft, repId: e.target.value || null })}
            >
              <option value="">— atanmadı —</option>
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.code})
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-row">
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.9rem" }}>
            <input
              type="checkbox"
              checked={draft.published ?? true}
              onChange={(e) => setDraft({ ...draft, published: e.target.checked })}
            />
            Doğrudan yayına al
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.9rem" }}>
            <input
              type="checkbox"
              checked={draft.featured ?? false}
              onChange={(e) => setDraft({ ...draft, featured: e.target.checked })}
            />
            Öne çıkar
          </label>
        </div>
        {error && <div className="error-banner mt-14">{error}</div>}
        <div className="form-row mt-14">
          <button className="btn btn--primary" type="submit">
            Firmayı kaydet
          </button>
          <button className="btn" type="button" onClick={onCancel}>
            Vazgeç
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------- Firma düzenleme formu (satır içi) ---------- */
function EditCompany({
  companyId,
  categories,
  cities,
  reps,
  onCancel,
}: {
  companyId: string;
  categories: ReturnType<typeof listCategories>;
  cities: ReturnType<typeof listCities>;
  reps: ReturnType<typeof listReps>;
  onCancel: () => void;
}) {
  const actor = useActor();
  const company = listCompanies({ includeUnpublished: true }).find((c) => c.id === companyId);
  const [error, setError] = useState<string | null>(null);

  if (!company) return null;

  // Mevcut firma verisinden taslak eşlemesi — admin 14 alanı baştan yazmasın
  const draft: CompanyDraft = {
    name: company.name,
    categoryId: company.categoryId,
    cityId: company.cityId,
    district: company.district,
    address: company.address,
    phone: company.phone,
    email: company.email ?? "",
    website: company.website ?? "",
    socials: company.socials ?? {},
    description: company.description,
    hours: company.hours,
    featured: company.featured,
    published: company.published,
    repId: company.repId ?? null,
  };

  return (
    <div className="card card__pad mb-14" style={{ paddingLeft: 16 }}>
      <h3 style={{ fontWeight: 800, marginBottom: 14 }}>Firmayı düzenle: {company.name}</h3>
      {error && <div className="error-banner mb-14">{error}</div>}
      <CompanyForm
        categories={categories}
        cities={cities}
        reps={reps}
        initial={draft}
        title="Firma bilgileri"
        onCancel={onCancel}
        onSubmit={(draft) => {
          setError(null);
          try {
            updateCompany(companyId, draft, actor);
            onCancel();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Güncelleme başarısız.");
          }
        }}
      />
      <p className="text-muted small">Son güncelleme: {formatDateTime(company.updatedAt)}</p>
    </div>
  );
}
