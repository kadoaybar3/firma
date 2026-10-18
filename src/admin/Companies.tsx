import { useMemo, useState } from "react";
import { PanelHead } from "./AdminLayout";
import { Badge, EmptyState, ErrorBanner, Field } from "../components/ui";
import { useActor } from "../lib/auth";
import { isOpenNow } from "../lib/hours";
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
  const [tick, setTick] = useState(0);

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
    try {
      fn();
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem başarısız.");
    }
  }

  return (
    <div className="panel-content">
      <PanelHead
        title="Firma kayıtları"
        desc="Rehberdeki tüm firmalar; yayında/pasif durumu, öne çıkarma ve düzenleme."
        action={
          <button className="btn btn--primary" onClick={() => setCreating((c) => !c)}>
            {creating ? "Kapat" : "+ Yeni firma"}
          </button>
        }
      />

      {error && <ErrorBanner message={error} />}

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
            placeholder="🔍 Firma adı / telefon ara…"
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
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {!creating && companies.length === 0 ? (
        <EmptyState icon="🏪" title="Firma bulunamadı" description="Arama/filtre kriterlerinizi değiştirin." />
      ) : null}

      {!creating && companies.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Firma</th>
                <th>Kategori</th>
                <th>İlçe</th>
                <th>Durum</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((co) => {
                const category = categories.find((c) => c.id === co.categoryId);
                return (
                  <tr key={co.id}>
                    <td>
                      <strong>{co.name}</strong>
                      <div className="text-muted small">{co.phone}</div>
                    </td>
                    <td>
                      {category?.icon} {category?.name}
                    </td>
                    <td>{getDistrictOf(co, cities)}</td>
                    <td>
                      <div className="flex-between">
                        <Badge tone={co.published ? "green" : "gray"}>
                          {co.published ? "Yayında" : "Yayın dışı"}
                        </Badge>
                        {co.featured && <Badge tone="orange">Öne çıkan</Badge>}
                        <Badge tone={isOpenNow(co.hours) ? "blue" : "gray"}>
                          {isOpenNow(co.hours) ? "Açık" : "Kapalı"}
                        </Badge>
                      </div>
                    </td>
                    <td>
                      <div className="actions-cell">
                        <button
                          className="btn btn--sm"
                          onClick={() =>
                            handleAction(() => updateCompany(co.id, { published: !co.published }, actor))
                          }
                        >
                          {co.published ? "Yayından al" : "Yayına al"}
                        </button>
                        <button
                          className="btn btn--sm"
                          onClick={() =>
                            handleAction(() => updateCompany(co.id, { featured: !co.featured }, actor))
                          }
                        >
                          {co.featured ? "Öne çıkarmayı bırakır" : "Öne çıkar"}
                        </button>
                        <button
                          className="btn btn--sm btn--ghost"
                          onClick={() => setEditingId(editingId === co.id ? null : co.id)}
                        >
                          {editingId === co.id ? "Düzenlemeyi kapat" : "Düzenle"}
                        </button>
                        <button
                          className="btn btn--sm btn--danger"
                          onClick={() => {
                            if (confirm(`"${co.name}" firması silinsin mi?`))
                              handleAction(() => deleteCompany(co.id, actor));
                          }}
                        >
                          Sil
                        </button>
                      </div>
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
    </div>
  );
}

function getDistrictOf(co: { cityId: string; district: string }, cities: ReturnType<typeof listCities>) {
  const city = cities.find((c) => c.id === co.cityId);
  return city ? `${city.name} / ${co.district}` : co.district;
}

/* ---------- Firma ekleme formu ---------- */
function CompanyForm({
  categories,
  cities,
  reps,
  onSubmit,
  onCancel,
}: {
  categories: ReturnType<typeof listCategories>;
  cities: ReturnType<typeof listCities>;
  reps: ReturnType<typeof listReps>;
  onSubmit: (draft: CompanyDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<CompanyDraft>({
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
    images: ["🏢"],
    featured: false,
    published: true,
  });
  const [error, setError] = useState<string | null>(null);

  const city = cities.find((c) => c.id === draft.cityId);

  return (
    <div className="card card__pad mb-14">
      <h3 style={{ fontWeight: 800, marginBottom: 14 }}>Yeni firma ekle</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          try {
            onSubmit(draft);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Kayıt başarısız.");
          }
        }}
      >
        <div className="form-grid">
          <Field label="Firma adı" required>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              required
            />
          </Field>
          <Field label="Kategori" required>
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
          <Field label="Şehir" required>
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
          <Field label="İlçe" required>
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
          <Field label="Telefon" required>
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
          <Field label="Görsel rozetleri" hint="Virgülle ayrılmış emojiler">
            <input
              value={(draft.images ?? []).join(", ")}
              onChange={(e) =>
                setDraft({ ...draft, images: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
              }
            />
          </Field>
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
        <Field label="Açıklama" required>
          <textarea
            rows={3}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="Firmanın hizmet ve ayrıcı özelliklerini kısaca yazın…"
          />
        </Field>
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

  return (
    <div className="card card__pad mb-14" style={{ paddingLeft: 16 }}>
      <h3 style={{ fontWeight: 800, marginBottom: 14 }}>Firmayı düzenle: {company.name}</h3>
      {error && <div className="error-banner mb-14">{error}</div>}
      <CompanyForm
        categories={categories}
        cities={cities}
        reps={reps}
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
