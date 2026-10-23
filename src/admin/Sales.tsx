import { useState } from "react";
import { Clock, Wallet } from "lucide-react";
import { PanelHead } from "./AdminLayout";
import { Badge, ErrorBanner, Field, StatCard } from "../components/ui";
import { useActor } from "../lib/auth";
import { formatTRY, formatDateTime } from "../lib/format";
import { isPaymentProviderConfigured } from "../lib/payments";
import {
  cancelSale,
  confirmRenewal,
  confirmSale,
  createPendingPayment,
  createSale,
  getCompanyById,
  listCompanies,
  listReps,
  listSales,
} from "../lib/repo";

export default function AdminSales() {
  const actor = useActor();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  const sales = listSales(actor);
  const companies = listCompanies({ includeUnpublished: true });
  const reps = listReps(actor);

  function refresh() {
    setTick((t) => t + 1);
  }
  void tick;

  function run(fn: () => void) {
    setError(null);
    setMessage(null);
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
        title="Satış kayıtları"
        desc="Üyelik satışlarını açın, ödemeyi doğrulayın, satışı kesinleştirin. Komisyon kesinleşme anında otomatik üretilir ve mükerrer üretilmez."
        action={
          <button className="btn btn--primary" onClick={() => setCreating((c) => !c)}>
            {creating ? "Kapat" : "+ Yeni satış"}
          </button>
        }
      />

      {!isPaymentProviderConfigured && (
        <div className="info-banner">
          ⓘ Ödeme sağlayıcısı entegrasyonu yapılandırılmadı. Ödemeler şu aşamada{" "}
          <strong>"banka/kredi kartına yazılmışlık"</strong> doğrulamasıyla (sağlayıcı webhook'ı
          yerine) yönetici tarafından manuel işaretlenir — sistem gerçek ödeme alınmış gibi davranmaz.
        </div>
      )}

      {error && <ErrorBanner message={error} />}
      {message && <div className="info-banner">{message}</div>}

      {creating && (
        <div className="card card__pad mb-14">
          <h3 style={{ fontWeight: 800, marginBottom: 12 }}>Yeni satış kaydı</h3>
          <form
            className="form-row"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const companyId = (form.elements.namedItem("companyId") as HTMLSelectElement).value;
              const channel = (form.elements.namedItem("channel") as HTMLSelectElement).value as
                | "temsilci"
                | "dogrudan";
              const repId = (form.elements.namedItem("repId") as HTMLSelectElement).value;
              const referralCode = (form.elements.namedItem("referralCode") as HTMLInputElement).value;
              run(() => {
                createSale(
                  {
                    companyId,
                    channel,
                    repId: channel === "temsilci" ? repId || null : null,
                    referralCode: channel === "dogrudan" ? referralCode : undefined,
                  },
                  actor,
                );
                setCreating(false);
                setMessage("Satış kaydı açıldı. Ödeme doğrulatıktan sonra kesinleştirin.");
              });
            }}
          >
            <Field label="Firma" required>
              <select name="companyId" required>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Kanal" required>
              <select name="channel" defaultValue="temsilci">
                <option value="temsilci">Satış temsilcisi ile</option>
                <option value="dogrudan">Doğrudan (referans koduyla)</option>
              </select>
            </Field>
            <Field label="Temsilci" hint="Kanal 'temsilci' ise">
              <select name="repId">
                <option value="">— seçin —</option>
                {reps.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.code})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Referans kodu" hint="Kanal 'dogrudan' ise">
              <input name="referralCode" placeholder="Örn: KADINANA-1001" />
            </Field>
            <button className="btn btn--primary" type="submit" style={{ alignSelf: "flex-end", marginBottom: 14 }}>
              Satışı aç
            </button>
          </form>
        </div>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Satış</th>
              <th>Kanal</th>
              <th>Tutar</th>
              <th>Durum</th>
              <th>Adımlar</th>
            </tr>
          </thead>
          <tbody>
            {sales.length === 0 && (
              <tr>
                <td colSpan={5} className="text-muted">
                  Henüz satış kaydı yok.
                </td>
              </tr>
            )}
            {sales.map((sale) => {
              const company = getCompanyById(sale.companyId);
              const paid = sale.status === "odendi";
              return (
                <tr key={sale.id}>
                  <td>
                    <strong>{company?.name ?? "—"}</strong>
                    <div className="text-muted small">{formatDateTime(sale.createdAt)}</div>
                    {sale.renewalForMembershipId && (
                      <Badge tone="blue">Üyelik yenileme</Badge>
                    )}
                  </td>
                  <td>
                    {sale.channel === "temsilci"
                      ? reps.find((r) => r.id === sale.repId)?.name ?? "temsilci"
                      : sale.referralCode
                        ? `Doğrudan (${sale.referralCode})`
                        : "Doğrudan"}
                  </td>
                  <td>{formatTRY(sale.amount)}</td>
                  <td>
                    <Badge tone={paid ? "green" : sale.status === "potansiyel" ? "orange" : "red"}>
                      {sale.status === "potansiyel" ? "Beklemede" : paid ? "Kesinleşti" : "İptal"}
                    </Badge>
                    {sale.confirmedAt && (
                      <div className="text-muted small">{formatDateTime(sale.confirmedAt)}</div>
                    )}
                  </td>
                  <td>
                    <div className="actions-cell">
                      {!paid && sale.status === "potansiyel" && (
                        <>
                          <button
                            className="btn btn--sm"
                            onClick={() =>
                              run(() => {
                                createPendingPayment(sale.id, actor);
                                setMessage("Beklemede ödeme kaydı açıldı; doğrulayın.");
                              })
                            }
                          >
                            Ödeme kaydı aç
                          </button>
                          <button
                            className="btn btn--sm btn--primary"
                            onClick={() =>
                              run(() => {
                                if (sale.renewalForMembershipId) {
                                  confirmRenewal(sale.id, actor);
                                } else {
                                  confirmSale(sale.id, actor);
                                }
                              })
                            }
                          >
                            Kesinleştir
                          </button>
                          <button
                            className="btn btn--sm btn--danger"
                            onClick={() => run(() => cancelSale(sale.id, actor))}
                          >
                            İptal
                          </button>
                        </>
                      )}
                      {paid && sale.renewalForMembershipId && <span className="text-muted small">Yenileme tamam</span>}
                      {paid && !sale.renewalForMembershipId && <span className="text-muted small">Üyelik başladı</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="stats-grid mt-18">
        <StatCard
          icon={<Wallet size={20} strokeWidth={1.9} />}
          label="Kesinleşen satış toplamı"
          value={formatTRY(
            sales.filter((s) => s.status === "odendi").reduce((sum, s) => sum + s.amount, 0),
          )}
          tone="success"
        />
        <StatCard
          icon={<Clock size={20} strokeWidth={1.9} />}
          label="Bekleyen satış"
          value={sales.filter((s) => s.status === "potansiyel").length}
          tone="warning"
        />
      </div>
    </div>
  );
}
