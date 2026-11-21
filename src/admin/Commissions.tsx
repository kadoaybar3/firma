import { useState } from "react";
import { Banknote, History, Receipt, Users } from "lucide-react";
import { PanelHead } from "./AdminLayout";
import { EmptyState, ErrorBanner, StatCard } from "../components/ui";
import { useActor } from "../lib/auth";
import { formatDateTime, formatTRY } from "../lib/format";
import {
  getRepById,
  listCommissionPayouts,
  listCommissionPayoutSummary,
  listTeamCommissions,
  listTeamCommissionPayouts,
  listTeamCommissionSummary,
  recordCommissionPayout,
  recordTeamCommissionPayout,
} from "../lib/repo";

export default function AdminCommissions() {
  const actor = useActor();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [busyRep, setBusyRep] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [references, setReferences] = useState<Record<string, string>>({});
  const [busyLeader, setBusyLeader] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState("all");
  const [teamAmounts, setTeamAmounts] = useState<Record<string, string>>({});
  const [teamReferences, setTeamReferences] = useState<Record<string, string>>({});
  void tick;

  const summaries = listCommissionPayoutSummary(actor);
  const payouts = listCommissionPayouts(actor);
  const totalEarned = summaries.reduce((sum, row) => sum + row.earned, 0);
  const totalPaid = summaries.reduce((sum, row) => sum + row.paid, 0);
  const totalOutstanding = summaries.reduce((sum, row) => sum + row.outstanding, 0);

  // Ekip liderliği komisyonları — temsilci komisyonlarından ayrı defter (0014)
  const teamSummaries = listTeamCommissionSummary(actor);
  const teamComms = listTeamCommissions(actor);
  const teamPayouts = listTeamCommissionPayouts(actor);
  const filteredSummaries =
    teamFilter === "all"
      ? teamSummaries
      : teamSummaries.filter((row) => row.leader.id === teamFilter);
  const filteredComms =
    teamFilter === "all"
      ? teamComms
      : teamComms.filter((tc) => tc.leaderRepId === teamFilter);
  const filteredTeamPayouts =
    teamFilter === "all"
      ? teamPayouts
      : teamPayouts.filter((p) => p.leaderRepId === teamFilter);
  const teamTotals = filteredSummaries.reduce(
    (acc, row) => ({
      earned: acc.earned + row.earned,
      paid: acc.paid + row.paid,
      outstanding: acc.outstanding + row.outstanding,
    }),
    { earned: 0, paid: 0, outstanding: 0 },
  );

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

  async function saveTeamPayout(leaderId: string) {
    setError(null);
    setMessage(null);
    const amount = Number(teamAmounts[leaderId]);
    setBusyLeader(leaderId);
    try {
      await recordTeamCommissionPayout(leaderId, amount, teamReferences[leaderId] ?? "", actor);
      setTeamAmounts((current) => ({ ...current, [leaderId]: "" }));
      setTeamReferences((current) => ({ ...current, [leaderId]: "" }));
      setMessage("Ekip liderliği ödemesi kaydedildi.");
      setTick((value) => value + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ödeme kaydedilemedi.");
    } finally {
      setBusyLeader(null);
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

      <section className="adm-panel" style={{ marginTop: 18 }}>
        <div className="adm-panel__head">
          <h2><Users size={16} strokeWidth={1.9} aria-hidden="true" /> Ekip Liderliği Komisyonları</h2>
        </div>
        <div className="adm-panel__body">
          <p className="text-muted small">
            Ekip üyelerinin her yeni satışında, satış sonrası Firma Rehberi&apos;ne kalan tutarın
            %20&apos;si ekip liderine yazılır. Temsilci komisyonlarından ayrı bir defterdir;
            mevcut temsilci bakiyelerini etkilemez.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <label htmlFor="team-leader-filter" className="small text-muted">Lider filtresi</label>
            <select
              id="team-leader-filter"
              className="input"
              style={{ maxWidth: 260 }}
              value={teamFilter}
              onChange={(event) => setTeamFilter(event.target.value)}
            >
              <option value="all">Tüm liderler</option>
              {teamSummaries.map((row) => (
                <option key={row.leader.id} value={row.leader.id}>{row.leader.name}</option>
              ))}
            </select>
            <span className="small text-muted">
              Hakediş {formatTRY(teamTotals.earned)} · Ödenen {formatTRY(teamTotals.paid)} ·
              Kalan {formatTRY(teamTotals.outstanding)}
            </span>
          </div>

          {filteredSummaries.length === 0 ? (
            <p className="text-muted small">Henüz ekip liderliği komisyonu oluşmadı.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Ekip lideri</th>
                    <th>Hakediş</th>
                    <th>Ödenen</th>
                    <th>Kalan</th>
                    <th>Ödeme tutarı</th>
                    <th>Banka referans no (isteğe bağlı)</th>
                    <th>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSummaries.map(({ leader, earned, paid, outstanding }) => (
                    <tr key={leader.id}>
                      <td>
                        <strong>{leader.name}</strong>
                        <div className="text-muted small">{leader.code}</div>
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
                          aria-label={`${leader.name} için ekip liderliği ödeme tutarı`}
                          placeholder="Tutar girin"
                          value={teamAmounts[leader.id] ?? ""}
                          onChange={(event) =>
                            setTeamAmounts((current) => ({ ...current, [leader.id]: event.target.value }))
                          }
                          disabled={outstanding <= 0 || busyLeader === leader.id}
                        />
                      </td>
                      <td>
                        <input
                          className="input"
                          type="text"
                          maxLength={120}
                          aria-label={`${leader.name} için banka referans numarası`}
                          placeholder="İsteğe bağlı"
                          value={teamReferences[leader.id] ?? ""}
                          onChange={(event) =>
                            setTeamReferences((current) => ({ ...current, [leader.id]: event.target.value }))
                          }
                          disabled={outstanding <= 0 || busyLeader === leader.id}
                        />
                      </td>
                      <td>
                        <button
                          className="btn btn--sm btn--primary"
                          type="button"
                          disabled={
                            outstanding <= 0 || !teamAmounts[leader.id] || busyLeader === leader.id
                          }
                          onClick={() => void saveTeamPayout(leader.id)}
                        >
                          {busyLeader === leader.id ? "Kaydediliyor…" : "Ödeme kaydet"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {filteredComms.length > 0 && (
            <div className="table-wrap" style={{ marginTop: 14 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Ekip lideri</th>
                    <th>Satışı yapan</th>
                    <th>Matrah</th>
                    <th>Oran</th>
                    <th>Komisyon</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredComms.map((tc) => (
                    <tr key={tc.id}>
                      <td className="small text-muted">{formatDateTime(tc.createdAt)}</td>
                      <td>{getRepById(tc.leaderRepId)?.name ?? "—"}</td>
                      <td>{getRepById(tc.repId)?.name ?? "—"}</td>
                      <td>{formatTRY(tc.baseAmount)}</td>
                      <td>%{tc.rate}</td>
                      <td><strong>{formatTRY(tc.amount)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="small" style={{ marginTop: 16, marginBottom: 8 }}>
            <History size={14} strokeWidth={1.9} aria-hidden="true" style={{ verticalAlign: -2 }} />{" "}
            Ekip liderliği ödeme kayıtları
          </h3>
          {filteredTeamPayouts.length === 0 ? (
            <p className="text-muted small">Henüz ekip liderliği ödemesi kaydedilmedi.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Tarih</th><th>Ekip lideri</th><th>Tutar</th><th>Banka referans no</th></tr>
                </thead>
                <tbody>
                  {filteredTeamPayouts.map((payout) => (
                    <tr key={payout.id}>
                      <td className="small text-muted">{formatDateTime(payout.paidAt)}</td>
                      <td>{getRepById(payout.leaderRepId)?.name ?? "—"}</td>
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
