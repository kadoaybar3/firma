import { useEffect, useMemo, useRef, useState } from "react";
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
import LocationSelect from "../components/LocationSelect";
import { useActor } from "../lib/auth";
import { useLiveDataRevision } from "../lib/liveData";
import { formatDateTime } from "../lib/format";
import { findCityByName } from "../lib/location";
import {
  addDistrict,
  createCity,
  createCompany,
  deleteCompany,
  listCategories,
  listCities,
  listCompanies,
  listReps,
  updateCompany,
} from "../lib/repo";
import type { CompanyDraft } from "../lib/repo";
import { normalizeSearch } from "../lib/slug";
import { AddressFields } from "./AddressFields";
import CategorySelect from "../components/CategorySelect";
import CompanyLocationMap, { type LocationPinSource } from "../components/CompanyLocationMap";

export default function AdminCompanies() {
  useLiveDataRevision();
  const actor = useActor();
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [provinceFilter, setProvinceFilter] = useState("");
  const [districtFilter, setDistrictFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "unpublished">("all");
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

  const allCompanies = useMemo(
    () => listCompanies({ includeUnpublished: true }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );

  const selectedCity = findCityByName(cities, provinceFilter);
  const cityFilter = selectedCity?.id ?? "";

  const companies = useMemo(
    () =>
      allCompanies.filter((c) => {
        if (catFilter && c.categoryId !== catFilter) return false;
        if (provinceFilter) {
          // Statik listede olup veritabanında karşılığı olmayan il → eşleşme yok.
          if (!cityFilter || c.cityId !== cityFilter) return false;
        }
        if (districtFilter && c.district !== districtFilter) return false;
        if (statusFilter === "published" && !c.published) return false;
        if (statusFilter === "unpublished" && c.published) return false;
        if (!q.trim()) return true;
        const cityName = cities.find((city) => city.id === c.cityId)?.name ?? "";
        return `${c.name} ${c.district} ${cityName} ${c.address} ${c.phone} ${c.email ?? ""}`
          .toLocaleLowerCase("tr")
          .includes(q.toLocaleLowerCase("tr").replace(/İ/g, "i").replace(/ı/g, "i"));
      }),
    [q, catFilter, cityFilter, districtFilter, provinceFilter, statusFilter, allCompanies, cities],
  );

  /**
   * Filtrede eski/özel ilçeler kaybolmasın: seçili ilin DB ilçeleri + o ildeki
   * firmaların mevcut ilçe değerleri ortak listeye eklenir.
   */
  const extraDistrictNames = useMemo(() => {
    if (!selectedCity) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    const candidates = [
      ...selectedCity.districts,
      ...allCompanies.filter((c) => c.cityId === selectedCity.id).map((c) => c.district),
    ];
    for (const raw of candidates) {
      const name = raw.trim();
      if (!name) continue;
      const key = normalizeSearch(name);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
    return out;
  }, [selectedCity, allCompanies]);

  const hasFilters = Boolean(
    q.trim() || catFilter || provinceFilter || districtFilter || statusFilter !== "all",
  );

  function clearFilters() {
    setQ("");
    setCatFilter("");
    setProvinceFilter("");
    setDistrictFilter("");
    setStatusFilter("all");
  }

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
        title="Firmalar"
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
        <>
          <div className="filter-bar companies-filter-bar">
            <input
              className="input"
              type="search"
              placeholder="Firma adı, telefon veya e-posta ara…"
              aria-label="Firma ara"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <CategorySelect
              className="filter-category"
              categories={categories}
              value={catFilter}
              onChange={setCatFilter}
              allLabel="Tüm kategoriler"
              ariaLabel="Kategori filtresi"
            />
            <LocationSelect
              className="filter-location"
              value={{ province: provinceFilter, district: districtFilter }}
              onChange={(next) => {
                setProvinceFilter(next.province);
                setDistrictFilter(next.district);
              }}
              labelProvince="İl filtresi"
              labelDistrict="İlçe filtresi"
              placeholderProvince="İl ara…"
              placeholderDistrict="İlçe ara…"
              extraProvinces={cities.map((city) => city.name)}
              extraDistricts={extraDistrictNames}
              clearable
            />
            <select
              className="input"
              aria-label="Yayın durumu"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "all" | "published" | "unpublished")
              }
            >
              <option value="all">Tüm durumlar</option>
              <option value="published">Yayında</option>
              <option value="unpublished">Yayın dışı / onay bekleyen</option>
            </select>
          </div>
          <div className="filter-bar__meta">
            <span>
              {companies.length} firma gösteriliyor
              {hasFilters ? ` · ${unpublishedRows.length} yayın dışı` : ""}
            </span>
            {hasFilters && (
              <button type="button" className="filter-bar__reset" onClick={clearFilters}>
                Filtreleri temizle
              </button>
            )}
          </div>
        </>
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
          <table className="table table--rows companies-table">
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
      // GÜVENLİK: yeni firma taslak doğar; yayına alma satış + onaylı ödeme
      // guard'ından geçen updateCompany() ile yapılır.
      published: false,
    },
  );
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string,string>>({});
  const actor = useActor();
  /** Seçili il adı — DB'de şehir kaydı yoksa submit sırasında oluşturulur. */
  const [addressProvince, setAddressProvince] = useState(
    () => cities.find((c) => c.id === (initial?.cityId ?? cities[0]?.id ?? ""))?.name ?? "",
  );
  /**
   * Kayıtlı konum "saved" başlar. Adres değişirse eski koordinat temizlenir;
   * yalnızca kullanıcının bu oturumda elle seçtiği pin ("manual") korunur.
   */
  const [pinSource, setPinSource] = useState<LocationPinSource | null>(() =>
    initial?.latitude !== undefined && initial?.longitude !== undefined ? "saved" : null,
  );
  const suggestionCompanies = useMemo(() => listCompanies({ includeUnpublished: true }), []);

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
          if (!addressProvince.trim()) next.cityId = "İl seçin.";
          if (!draft.district.trim()) next.district = "İlçe seçin.";
          if (!draft.phone.trim()) next.phone = "Telefon zorunludur.";
          // Mevcut kayıtlarda açıklama boş olabilir; düzenlemeyi engelleme.
          if (!initial && !draft.description.trim()) next.description = "Açıklama zorunludur.";
          setFieldErrors(next);
          if (Object.keys(next).length) return;
          try {
            let nextDraft = draft;
            if (addressProvince.trim()) {
              // İl DB'de yoksa mevcut repo fonksiyonuyla oluştur (şema değişmez).
              let city = cities.find(
                (c) => normalizeSearch(c.name) === normalizeSearch(addressProvince),
              );
              if (!city) {
                city = listCities().find(
                  (c) => normalizeSearch(c.name) === normalizeSearch(addressProvince),
                );
              }
              if (!city) {
                city = createCity(
                  addressProvince,
                  actor,
                  draft.district.trim() ? [draft.district.trim()] : undefined,
                );
              }
              nextDraft = { ...nextDraft, cityId: city.id };
              // Statik listeden seçilen ilçe şehir kaydında yoksa filtreler için ekle.
              if (
                draft.district.trim() &&
                !city.districts.some(
                  (name) => normalizeSearch(name) === normalizeSearch(draft.district),
                )
              ) {
                addDistrict(city.id, draft.district, actor);
              }
            }
            onSubmit(nextDraft);
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
            <CategorySelect
              categories={categories}
              value={draft.categoryId}
              onChange={(categoryId) => setDraft({ ...draft, categoryId })}
            />
          </Field>
          <AddressFields
            cities={cities}
            companies={suggestionCompanies}
            initialCityId={initial?.cityId ?? cities[0]?.id ?? ""}
            initialDistrict={initial?.district ?? "Merkez"}
            initialAddress={initial?.address ?? ""}
            fieldErrors={{ cityId: fieldErrors.cityId, district: fieldErrors.district }}
            onChange={(next) => {
              setAddressProvince(next.province);
              const addressChanged =
                next.cityId !== draft.cityId ||
                next.district !== draft.district ||
                next.address !== draft.address;
              const invalidate = addressChanged && pinSource !== "manual";
              setDraft((current) => ({
                ...current,
                cityId: next.cityId,
                district: next.district,
                address: next.address,
                ...(invalidate ? { latitude: undefined, longitude: undefined } : {}),
              }));
              if (invalidate) setPinSource(null);
            }}
          />
          <CompanyLocationMap
            address={draft.address}
            district={draft.district}
            province={addressProvince}
            latitude={draft.latitude}
            longitude={draft.longitude}
            onChange={(coords, source) => {
              setDraft((current) => ({
                ...current,
                latitude: coords?.latitude,
                longitude: coords?.longitude,
              }));
              setPinSource(coords ? (source === "manual" ? "manual" : "geocode") : null);
            }}
          />
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
          <Field label="Facebook sayfası">
            <input
              value={draft.socials?.facebook ?? ""}
              onChange={(e) => setDraft({ ...draft, socials: { ...draft.socials, facebook: e.target.value } })}
              placeholder="Sayfa adı veya profil bağlantısı"
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
            <Field
              label="Açıklama"
              required={!initial}
              hint={initial ? "Mevcut firmalarda boş bırakılabilir." : undefined}
              error={fieldErrors.description}
            >
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
              checked={draft.published ?? false}
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
  const formRef = useRef<HTMLDivElement>(null);

  if (!company) return null;

  // Form açıldığında görünür alana getir (sticky topbar için offset)
  useEffect(() => {
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Topbar (60px) + biraz boşluk
    setTimeout(() => {
      window.scrollBy(0, -76);
    }, 100);
  }, []);

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
    latitude: company.latitude,
    longitude: company.longitude,
  };

  return (
    <div ref={formRef} className="card card__pad mb-14" style={{ paddingLeft: 16 }}>
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
