import { useState } from "react";
import { Banknote, History, Receipt } from "lucide-react";
import { PanelHead } from "./AdminLayout";
import { EmptyState, ErrorBanner, StatCard } from "../components/ui";
import { useActor } from "../lib/auth";
import { formatDateTime, formatTRY } from "../lib/format";
import {
  listCommissionPayouts,
  listCommissionPayoutSummary,
  recordCommissionPayout,
} from "../lib/repo";

export default function AdminCommissions() {
  const actor = useActor();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [busyRep, setBusyRep] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [references, setReferences] = useState<Record<string, string>>({});
  void tick;

  const summaries = listCommissionPayoutSummary(actor);
  const payouts = listCommissionPayouts(actor);
  const totalEarned = summaries.reduce((sum, row) => sum + row.earned, 0);
  const totalPaid = summaries.reduce((sum, row) => sum + row.paid, 0);
  const totalOutstanding = summaries.reduce((sum, row) => sum + row.outstanding, 0);

  async function savePayout(repId: string) {
    setError(null);
    setMessage(null);
    const amount = Number(amounts[repId]);
    setBusyRep(repId);
    try {
      await recordCommissionPayout(repId, amount, references[repId] ?? "", actor);
      setAmounts((current) => ({ ...current, [repId]: "" }));
      setReferences((current) => ({ ...current, [repId]: "" }));
      setMessage("Temsilci ödemesi kaydedildi.");
      setTick((value) => value + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ödeme kaydedilemedi.");
    } finally {
      setBusyRep(null);
    }
  }

  return (
    <div className="panel-content">
      <PanelHead
        title="Temsilci Ödemeleri"
        desc="Temsilciye banka üzerinden ödeme yaptıktan sonra tutarı kaydedin. Kısmi ödemelerde kalan alacak otomatik hesaplanır."
      />
      {error && <ErrorBanner message={error} />}
      {message && <div className="info-banner">{message}</div>}

      <div className="stats-grid mb-14">
        <StatCard
          icon={<Receipt size={20} strokeWidth={1.9} />}
          label="Toplam hakediş"
          value={formatTRY(totalEarned)}
        />
        <StatCard
          icon={<Banknote size={20} strokeWidth={1.9} />}
          label="Toplam ödenen"
          value={formatTRY(totalPaid)}
          tone="success"
        />
        <StatCard
          icon={<Receipt size={20} strokeWidth={1.9} />}
          label="Kalan alacak"
          value={formatTRY(totalOutstanding)}
          tone="warning"
        />
      </div>

      {summaries.length === 0 ? (
        <EmptyState
          icon={<Receipt size={30} strokeWidth={1.5} aria-hidden="true" />}
          title="Temsilci bulunamadı"
          description="Ödeme kaydı oluşturmak için önce bir temsilci ekleyin."
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Temsilci</th>
                <th>Hakediş</th>
                <th>Ödenen</th>
                <th>Kalan</th>
                <th>Ödeme tutarı</th>
                <th>Banka referans no (isteğe bağlı)</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {summaries.map(({ rep, earned, paid, outstanding }) => (
                <tr key={rep.id}>
                  <td>
                    <strong>{rep.name}</strong>
                    <div className="text-muted small">{rep.code}</div>
                  </td>
                  <td>{formatTRY(earned)}</td>
                  <td>{formatTRY(paid)}</td>
                  <td><strong>{formatTRY(outstanding)}</strong></td>
                  <td>
                    <input
                      className="input"
                      type="number"
                      min="0.01"
                      max={outstanding}
                      step="0.01"
                      inputMode="decimal"
                      aria-label={`${rep.name} için ödeme tutarı`}
                      placeholder="Tutar girin"
                      value={amounts[rep.id] ?? ""}
                      onChange={(event) =>
                        setAmounts((current) => ({ ...current, [rep.id]: event.target.value }))
                      }
                      disabled={outstanding <= 0 || busyRep === rep.id}
                    />
                  </td>
                  <td>
                    <input
                      className="input"
                      type="text"
                      maxLength={120}
                      aria-label={`${rep.name} için banka referans numarası`}
                      placeholder="İsteğe bağlı"
                      value={references[rep.id] ?? ""}
                      onChange={(event) =>
                        setReferences((current) => ({ ...current, [rep.id]: event.target.value }))
                      }
                      disabled={outstanding <= 0 || busyRep === rep.id}
                    />
                  </td>
                  <td>
                    <button
                      className="btn btn--sm btn--primary"
                      type="button"
                      disabled={outstanding <= 0 || !amounts[rep.id] || busyRep === rep.id}
                      onClick={() => void savePayout(rep.id)}
                    >
                      {busyRep === rep.id ? "Kaydediliyor…" : "Ödeme kaydet"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="adm-panel" style={{ marginTop: 18 }}>
        <div className="adm-panel__head">
          <h2><History size={16} strokeWidth={1.9} aria-hidden="true" /> Ödeme geçmişi</h2>
        </div>
        <div className="adm-panel__body">
          {payouts.length === 0 ? (
            <p className="text-muted small">Henüz temsilci ödemesi kaydedilmedi.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Tarih</th><th>Temsilci</th><th>Tutar</th><th>Banka referans no</th></tr>
                </thead>
                <tbody>
                  {payouts.map((payout) => (
                    <tr key={payout.id}>
                      <td className="small text-muted">{formatDateTime(payout.paidAt)}</td>
                      <td>{summaries.find((row) => row.rep.id === payout.repId)?.rep.name ?? "—"}</td>
                      <td>{formatTRY(payout.amount)}</td>
                      <td>{payout.referenceNo || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
