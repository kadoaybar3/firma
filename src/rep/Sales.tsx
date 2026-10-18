import { useState } from "react";
import { Badge, EmptyState, ErrorBanner, Field, StatCard } from "../components/ui";
import { useActor } from "../lib/auth";
import { formatTRY, formatDateTime } from "../lib/format";
import {
  createSale,
  getCompanyById,
  listCompanies,
  listCommissions,
  listMemberships,
  listPayments,
  listSales,
} from "../lib/repo";

export default function RepSalesPage() {
  const actor = useActor();

  return (
    <div>
      <div className="page-head">
        <h2>Satış ve kazanç</h2>
        <p>
          Kendi satışlarınızı açarsınız; ödeme durumu ve komisyon yönetimi yalnızca yöneticidedir
          (yetki arayüzde ve veritabanı seviyesinde korunur).
        </p>
      </div>
      <RepSales actor={actor} />
    </div>
  );
}

function RepSales({ actor }: { actor: ReturnType<typeof useActor> }) {
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const sales = listSales(actor);
  const payments = listPayments(actor);
  const commissions = listCommissions(actor);
  const memberships = listMemberships(actor);
  // Aktif üyeliği olan firmalar yeniden satışa açılmaz
  const activeCompanyIds = new Set(
    memberships.filter((m) => m.status === "aktif").map((m) => m.companyId),
  );
  const companies = listCompanies().filter((c) => !activeCompanyIds.has(c.id));

  function run(fn: () => void) {
    setError(null);
    setMessage(null);
    try {
      fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem başarısız.");
    }
  }

  return (
    <div>
      {error && <ErrorBanner message={error} />}
      {message && <div className="info-banner">{message}</div>}

      <div className="stats-grid mb-14">
        <StatCard
          icon="🧾"
          label="Bekleyen kazanç"
          value={formatTRY(
            commissions.filter((c) => c.com.status !== "odendi").reduce((s, c) => s + c.com.amount, 0),
          )}
          tone="warning"
        />
        <StatCard
          icon="🏦"
          label="Ödenmiş kazanç"
          value={formatTRY(
            commissions.filter((c) => c.com.status === "odendi").reduce((s, c) => s + c.com.amount, 0),
          )}
          tone="success"
        />
      </div>

      <div className="card card__pad mb-14">
        <h3 style={{ fontWeight: 800 }}>Satış türleri</h3>
        <p className="text-muted small">
          <strong>Gerçek satış:</strong> firmanın üyeliğini bizzat sattınız; komisyon sizin için doğar.
          <br />
          <strong>Doğrudan satış:</strong> işletme, size özel referans koduyla kendi başına üye oldu;
          ödül kazanırsınız.
        </p>
        <button className="btn btn--primary mt-8" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Formu kapat" : "+ Yeni satış kaydı"}
        </button>
      </div>

      {showForm && (
        <div className="card card__pad mb-14">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.target as HTMLFormElement);
              const channel = String(data.get("channel")) as "temsilci" | "dogrudan";
              const companyId = String(data.get("companyId"));
              const referralCode = channel === "dogrudan" ? String(data.get("referralCode")) : undefined;
              run(() => {
                createSale({ companyId, channel, referralCode }, actor);
                setShowForm(false);
                setMessage(
                  "Satış kaydı açıldı. Ödeme doğrulandıktan sonra komisyonunuz otomatik kesinleşir.",
                );
              });
            }}
          >
            <div className="form-grid">
              <Field label="Firma" required>
                <select name="companyId" required>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Satış türü" required>
                <select name="channel" defaultValue="temsilci">
                  <option value="temsilci">Gerçek satış (temsilci)</option>
                  <option value="dogrudan">Doğrudan satış (referans kodu)</option>
                </select>
              </Field>
              <Field label="Referans kodu" hint="Satış türü 'dogrudan' ise">
                <input name="referralCode" placeholder="Örn: KADINANA-1001" />
              </Field>
            </div>
            <button className="btn btn--primary" type="submit">
              Satışı kaydet
            </button>
          </form>
        </div>
      )}

      {sales.length === 0 ? (
        <EmptyState icon="💰" title="Satış kaydı yok" description="Yukarıdaki formdan ilk satış kaydınızı açın." />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Firma</th>
                <th>Tutar</th>
                <th>Durum</th>
                <th>Ödeme / komisyon</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((sale) => {
                const company = getCompanyById(sale.companyId);
                const payment = payments.find((p) => p.saleId === sale.id);
                const commission = commissions.find(
                  (c) => c.com.saleId === sale.id,
                );
                return (
                  <tr key={sale.id}>
                    <td>
                      <strong>{company?.name ?? "—"}</strong>
                      <div className="text-muted small">{formatDateTime(sale.createdAt)}</div>
                    </td>
                    <td>{formatTRY(sale.amount)}</td>
                    <td>
                      <Badge
                        tone={sale.status === "odendi" ? "green" : sale.status === "potansiyel" ? "orange" : "red"}
                      >
                        {sale.status === "odendi" ? "Kesinleşti" : sale.status === "potansiyel" ? "Beklemede" : "İptal"}
                      </Badge>
                    </td>
                    <td className="small">
                      Ödeme:{" "}
                      <Badge tone={payment?.status === "onaylandi" ? "green" : "orange"}>
                        {payment?.status ?? "kayıt yok"}
                      </Badge>
                      {commission && (
                        <div className="text-muted" style={{ marginTop: 4 }}>
                          Komisyon: {formatTRY(commission.com.amount)} ({commission.com.status})
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {companies.length === 0 && (
        <p className="text-muted small">Satışa açtığınız tüm firmaların aktif üyeliği var.</p>
      )}
    </div>
  );
}
