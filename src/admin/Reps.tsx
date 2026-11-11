import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Eye, PenLine, Receipt, Ticket, Wallet } from "lucide-react";
import { PanelHead } from "./AdminLayout";
import { Badge, ErrorBanner, Field, StatCard } from "../components/ui";
import { useActor } from "../lib/auth";
import { formatDate, formatTRY } from "../lib/format";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { loadSnapshot } from "../lib/dataSource";
import {
  applySnapshot,
  createReferralCode,
  createRep,
  getCityById,
  listCategories,
  listCommissions,
  listCompanies,
  listReferrals,
  listReps,
  listSales,
  updateRep,
} from "../lib/repo";
import type { Company, Sale } from "../lib/types";

export default function AdminRepsPage() {
  return <AdminReps />;
}

type EditForm = { name: string; phone: string; status: "aktif" | "pasif" };

function AdminReps() {
  const actor = useActor();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [commission, setCommission] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [, setTick] = useState(0);

  const reps = listReps(actor);
  const companies = listCompanies({ includeUnpublished: true });
  const sales = listSales(actor);
  const categories = listCategories();

  function run(fn: () => void) {
    setError(null);
    try {
      fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem başarısız.");
    }
  }

  function startEdit(rep: { id: string; name: string; phone: string; status: "aktif" | "pasif" }) {
    setEditingId(rep.id);
    setForm({ name: rep.name, phone: rep.phone, status: rep.status });
  }

  function saveEdit(id: string) {
    if (!form) return;
    run(() => {
      updateRep(id, { name: form.name, phone: form.phone, status: form.status }, actor);
      setEditingId(null);
      setForm(null);
    });
  }

  function clearNewStaff() {
    setName("");
    setPhone("");
    setEmail("");
    setPassword("");
    setCommission("");
  }

  async function createStaff(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const fullName = name.trim();
    const parts = fullName.split(/\s+/);
    if (parts.length < 2) {
      setError("Ad ve soyadı birlikte girin.");
      return;
    }
    if (!isSupabaseConfigured || !supabase) {
      // Demo modda auth hesabı oluşturulamaz; yalnız yerel personel kaydı açılır.
      run(() => {
        const rep = createRep(fullName, phone, actor);
        if (commission !== "") {
          updateRep(rep.id, { customCommissionRate: Number(commission) }, actor);
        }
        clearNewStaff();
      });
      return;
    }
    setCreating(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Oturum bulunamadı; yeniden giriş yapın.");
      const res = await fetch("/api/admin-create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          firstName: parts[0],
          lastName: parts.slice(1).join(" "),
          phone,
          email,
          password,
          customCommissionRate: commission === "" ? null : Number(commission),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(body.message || "Personel oluşturulamadı.");
      const { db } = await loadSnapshot();
      applySnapshot(db);
      setTick((tick) => tick + 1);
      clearNewStaff();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Personel oluşturulamadı.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="panel-content reps-page">
      <PanelHead
        title="Satış temsilcileri"
        desc="Saha ekibini yönetin. Komisyon oranını temsilci bazında yüzde olarak tanımlayabilirsiniz (boş kalırsa genel tutar uygulanır)."
      />
      {error && <ErrorBanner message={error} />}

      <section className="card card__pad mb-14 reps-create">
        <div className="reps-create__head">
          <h2 className="reps-create__title">Personel ekle</h2>
          <p className="text-muted small reps-create__hint">
            {isSupabaseConfigured
              ? "Hesap Supabase Auth üzerinde açılır; personel e-posta veya telefonla giriş yapabilir."
              : "Demo mod: hesap yalnızca yerel olarak oluşturulur, giriş yapılamaz."}
          </p>
        </div>
        <form className="reps-form" onSubmit={createStaff}>
          <Field label="Ad soyad" required>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Telefon" required>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0555 000 00 00"
              required
            />
          </Field>
          <Field label="E-posta" required>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="personel@ornek.com"
              autoComplete="off"
              required={isSupabaseConfigured}
            />
          </Field>
          <Field label="İlk giriş şifresi" required={isSupabaseConfigured} hint="En az 6 karakter.">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              autoComplete="new-password"
              required={isSupabaseConfigured}
            />
          </Field>
          <Field label="Komisyon oranı (%)">
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              inputMode="decimal"
              value={commission}
              onChange={(e) => setCommission(e.target.value)}
              placeholder="Genel"
            />
          </Field>
          <div className="reps-form__actions">
            <button className="btn btn--primary" type="submit" disabled={creating}>
              {creating ? "Oluşturuluyor…" : "Personel oluştur"}
            </button>
          </div>
        </form>
      </section>

      {reps.map((rep) => (
        <article className="card card__pad mb-14 reps-card" key={rep.id}>
          <div className="reps-card__head">
            <h3 className="reps-card__title">
              <span className="reps-card__name">{rep.name}</span>
              <Badge tone="blue">{rep.code}</Badge>
              <Badge tone={rep.status === "aktif" ? "green" : "gray"}>
                {rep.status === "aktif" ? "Aktif" : "Pasif"}
              </Badge>
            </h3>
            <span className="text-muted small">{rep.phone || "Telefon yok"}</span>
          </div>

          {editingId === rep.id && form ? (
            <div className="reps-edit">
              <div className="reps-form">
                <Field label="Ad soyad" required>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </Field>
                <Field label="Telefon">
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </Field>
                <Field label="Durum">
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value as EditForm["status"] })}
                  >
                    <option value="aktif">Aktif</option>
                    <option value="pasif">Pasif</option>
                  </select>
                </Field>
              </div>
              <div className="reps-actions">
                <button className="btn btn--primary" type="button" onClick={() => saveEdit(rep.id)}>
                  Kaydet
                </button>
                <button
                  className="btn btn--sm btn--ghost"
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setForm(null);
                  }}
                >
                  İptal
                </button>
                <span className="text-muted small reps-actions__note">
                  Personel kodu ({rep.code}) ve giriş bilgileri değişmez.
                </span>
              </div>
            </div>
          ) : (
            <div className="reps-actions">
              <button className="btn btn--sm" onClick={() => startEdit(rep)}>
                <PenLine size={15} strokeWidth={1.9} aria-hidden="true" />
                Düzenle
              </button>
              <button className="btn btn--sm btn--ghost" onClick={() => setDetailId(detailId === rep.id ? null : rep.id)}>
                <Eye size={15} strokeWidth={1.9} aria-hidden="true" />
                {detailId === rep.id ? "Detayı kapat" : "Detay"}
              </button>
              <button
                className="btn btn--sm"
                onClick={() =>
                  run(() =>
                    updateRep(
                      rep.id,
                      { status: rep.status === "aktif" ? "pasif" : "aktif" },
                      actor,
                    ),
                  )
                }
              >
                {rep.status === "aktif" ? "Pasife al" : "Aktife al"}
              </button>
              <button className="btn btn--sm btn--ghost" onClick={() => run(() => createReferralCode(rep.id, actor))}>
                <Ticket size={15} strokeWidth={1.9} aria-hidden="true" />
                Referans kodu üret
              </button>
              <label className="reps-rate">
                Komisyon
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={100}
                  placeholder="Genel"
                  defaultValue={rep.customCommissionRate ?? ""}
                  onBlur={(e) =>
                    run(() =>
                      updateRep(
                        rep.id,
                        { customCommissionRate: e.target.value === "" ? undefined : Number(e.target.value) },
                        actor,
                      ),
                    )
                  }
                />
                <span aria-hidden="true">%</span>
              </label>
            </div>
          )}

          {detailId === rep.id && (
            <RepDetail
              rep={rep}
              companies={companies.filter((company) => company.repId === rep.id)}
              sales={sales}
              categories={categories}
            />
          )}
        </article>
      ))}

      <div className="stats-grid mt-18">
        <StatCard
          icon={<Ticket size={20} strokeWidth={1.9} />}
          label="Aktif referans kodu"
          value={listReferrals(actor).filter((r) => !r.usedAt).length}
          hint="Kullanılmamış kod sayısı"
        />
        <StatCard
          icon={<Receipt size={20} strokeWidth={1.9} />}
          label="Toplam komisyon kaydı"
          value={listCommissions(actor).length}
        />
        <StatCard
          icon={<Wallet size={20} strokeWidth={1.9} />}
          label="Ödenen komisyon toplamı"
          value={formatTRY(
            listCommissions(actor)
              .filter((c) => c.com.status === "odendi")
              .reduce((s, c) => s + c.com.amount, 0),
          )}
          tone="success"
        />
      </div>
    </div>
  );
}

function RepDetail({
  rep,
  companies,
  sales,
  categories,
}: {
  rep: { id: string; name: string; code: string; status: "aktif" | "pasif" };
  companies: Company[];
  sales: Sale[];
  categories: ReturnType<typeof listCategories>;
}) {
  const published = companies.filter((company) => company.published).length;
  const unpublished = companies.length - published;

  return (
    <div className="reps-detail">
      <div className="reps-detail__meta">
        <span>
          Personel: <strong>{rep.name}</strong>
        </span>
        <span>
          Kod: <strong>{rep.code}</strong>
        </span>
        <Badge tone={rep.status === "aktif" ? "green" : "gray"}>
          {rep.status === "aktif" ? "Aktif" : "Pasif"}
        </Badge>
      </div>

      <div className="stats-grid mb-14">
        <StatCard label="Toplam firma" value={companies.length} />
        <StatCard label="Yayındaki firma" value={published} tone="success" />
        <StatCard label="Onay bekleyen (yayın dışı)" value={unpublished} tone="warning" />
        <StatCard label="Reddedilen firma" value="—" hint="Veri modelinde red durumu tutulmuyor" />
      </div>

      {companies.length === 0 ? (
        <p className="text-muted small">Bu personelin getirdiği firma kaydı yok.</p>
      ) : (
        <div className="table-wrap table-wrap--cards">
          <table className="table">
            <thead>
              <tr>
                <th>Firma</th>
                <th>Kategori</th>
                <th>İl / ilçe</th>
                <th>Kayıt tarihi</th>
                <th>Ödeme durumu</th>
                <th>Yayın durumu</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => {
                const sale = sales
                  .filter((row) => row.companyId === company.id)
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
                const category = categories.find((row) => row.id === company.categoryId);
                const city = getCityById(company.cityId);
                return (
                  <tr key={company.id}>
                    <td data-label="Firma">
                      <Link to={`/firma/${company.slug}`} target="_blank" rel="noreferrer">
                        {company.name}
                      </Link>
                    </td>
                    <td data-label="Kategori">{category?.name ?? "—"}</td>
                    <td data-label="İl / ilçe">
                      {city?.name ?? "—"}
                      {company.district ? ` / ${company.district}` : ""}
                    </td>
                    <td data-label="Kayıt tarihi">{formatDate(company.createdAt)}</td>
                    <td data-label="Ödeme durumu"><PaymentBadge sale={sale} /></td>
                    <td data-label="Yayın durumu">
                      <Badge tone={company.published ? "green" : "orange"}>
                        {company.published ? "Yayında" : "Yayın dışı"}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PaymentBadge({ sale }: { sale?: Sale }) {
  if (!sale) return <Badge tone="gray">Kayıt yok</Badge>;
  if (sale.status === "odendi") return <Badge tone="green">Ödendi</Badge>;
  if (sale.status === "iptal") return <Badge tone="red">İptal</Badge>;
  return <Badge tone="orange">Bekliyor</Badge>;
}
