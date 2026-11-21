import { useState } from "react";
import { Users } from "lucide-react";
import { PanelHead } from "./AdminLayout";
import { Badge, ErrorBanner } from "../components/ui";
import { useActor } from "../lib/auth";
import { formatDate } from "../lib/format";
import {
  approveTeamJoinApplication,
  getSettings,
  listReps,
  listTeamJoinApplications,
  listTeams,
  rejectTeamJoinApplication,
  setRepTeam,
  setTeamLeader,
  updateSettings,
} from "../lib/repo";
import type { TeamJoinApplication } from "../lib/types";

function JoinStatusBadge({ status }: { status: TeamJoinApplication["status"] }) {
  if (status === "onaylandi") return <Badge tone="green">Onaylandı</Badge>;
  if (status === "reddedildi") return <Badge tone="red">Reddedildi</Badge>;
  return <Badge tone="orange">Bekliyor</Badge>;
}

/**
 * Ekip altyapısı (0011): ekipleri listeleme, kapasite ayarı ve personelin
 * ekip bağlantısını yönetme. Ekip KURMA personel panelindedir (createTeam);
 * ekipler arası transfer ve liderlik değişikliği yalnızca burada (admin).
 */
export default function AdminTeams() {
  const actor = useActor();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const teams = listTeams(actor);
  const reps = listReps(actor);
  const capacity = getSettings().teamCapacity;
  const joinApps = listTeamJoinApplications(actor);

  async function act(fn: () => void | Promise<void>): Promise<void> {
    setError(null);
    setSaved(false);
    try {
      await fn();
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem başarısız.");
    }
  }

  /** Katılım başvurusu onay/red — sonuç satırda hâlâ beklemedeyse uygulanır. */
  async function runJoin(id: string, fn: () => Promise<void>): Promise<void> {
    setError(null);
    setSaved(false);
    setBusyId(id);
    try {
      await fn();
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem başarısız.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="panel-content">
      <PanelHead
        title="Ekipler"
        desc="Bağımsız ekipler: her ekibin tek bir lideri vardır, alt/üst ekip yoktur. Kapasite lider dahil kişi sayısıdır. Ekip kurma yetkisi personelde; transfer ve liderlik değişikliği yalnızca yöneticidedir."
      />
      {error && <ErrorBanner message={error} />}
      {saved && <div className="info-banner">Güncellendi.</div>}

      {/* Genel kapasite */}
      <div className="card card__pad mt-18">
        <h3 style={{ fontWeight: 800 }}>Genel ekip kapasitesi</h3>
        <CapacityForm
          key={`cap-${capacity}`}
          value={capacity}
          onSubmit={(n) => void act(() => { updateSettings({ teamCapacity: n }, actor); })}
        />
      </div>

      {/* Ekipler */}
      <div className="card card__pad mt-18">
        <h3 style={{ fontWeight: 800 }}>Ekipler ({teams.length})</h3>
        {teams.length === 0 ? (
          <p className="text-muted small mt-14">
            Henüz ekip yok. Personel panelindeki "Ekibim" bölümünden personel kendi ekibini kurar.
          </p>
        ) : (
          <table className="table" style={{ minWidth: 640, marginTop: 10 }}>
            <thead>
              <tr>
                <th>Ekip</th>
                <th>Lider</th>
                <th>Üye sayısı</th>
                <th>Üyeler</th>
                <th>Lideri değiştir</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => {
                const members = reps.filter((r) => r.teamId === t.id);
                const leader = reps.find((r) => r.id === t.leaderRepId);
                return (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.name}</strong>
                    </td>
                    <td>{leader?.name ?? "—"}</td>
                    <td>
                      {members.length}/{capacity}
                    </td>
                    <td>{members.map((m) => m.name).join(", ") || "—"}</td>
                    <td>
                      <select
                        aria-label={`${t.name} lideri`}
                        value={reps.some((r) => r.id === t.leaderRepId) ? t.leaderRepId : ""}
                        onChange={(e) => {
                          if (e.target.value && e.target.value !== t.leaderRepId)
                            void act(() => setTeamLeader(t.id, e.target.value, actor));
                        }}
                      >
                        {!reps.some((r) => r.id === t.leaderRepId) && (
                          <option value="">Seçin…</option>
                        )}
                        {reps.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Katılım başvuruları (0015) */}
      <div className="card card__pad mt-18">
        <h3 style={{ fontWeight: 800 }}>Ekip katılım başvuruları ({joinApps.length})</h3>
        <p className="text-muted small">
          Personelin ekip seçimine dayalı katılım başvuruları. Onayda kapasite ve personelin başka
          ekibe bağlı olmadığı sunucuda yeniden kontrol edilir; onaylanan satır ekip üyeliğini
          kurar, reddedilen kayıt silinmez.
        </p>
        {joinApps.length === 0 ? (
          <p className="text-muted small mt-14">Katılım başvurusu yok.</p>
        ) : (
          <table className="table" style={{ minWidth: 720, marginTop: 10 }}>
            <thead>
              <tr>
                <th>Personel</th>
                <th>Talep edilen ekip</th>
                <th>Başvuru tarihi</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {joinApps.map((app) => {
                const rep = reps.find((r) => r.id === app.repId);
                const team = teams.find((t) => t.id === app.teamId);
                return (
                  <tr key={app.id}>
                    <td>
                      <strong>{rep?.name ?? "—"}</strong>
                      <div className="text-muted small">{rep?.code ?? ""}</div>
                    </td>
                    <td>{team?.name ?? "Ekip bulunamadı"}</td>
                    <td className="small">{formatDate(app.createdAt)}</td>
                    <td>
                      <JoinStatusBadge status={app.status} />
                    </td>
                    <td>
                      {app.status !== "beklemede" ? (
                        <span className="text-muted small">
                          {app.decidedAt ? formatDate(app.decidedAt) : "—"}
                        </span>
                      ) : (
                        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            className="btn btn--sm btn--primary"
                            type="button"
                            disabled={busyId === app.id}
                            onClick={() =>
                              void runJoin(app.id, () => approveTeamJoinApplication(app.id, actor))
                            }
                          >
                            {busyId === app.id ? "…" : "Onayla"}
                          </button>
                          <button
                            className="btn btn--sm"
                            type="button"
                            disabled={busyId === app.id}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `"${rep?.name ?? "Personel"}" başvurusunu reddetmek istediğinize emin misiniz?`,
                                )
                              )
                                return;
                              void runJoin(app.id, () => rejectTeamJoinApplication(app.id, actor));
                            }}
                          >
                            Reddet
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Personel ekip bağlantısı */}
      <div className="card card__pad mt-18">
        <h3 style={{ fontWeight: 800 }}>Personel ekip bağlantısı</h3>
        <p className="text-muted small">
          Transfer yalnızca yöneticiyle yapılır; ekip lideri kendi ekibinden ayrılamaz (önce
          liderlik değiştirilir).
        </p>
        <table className="table" style={{ minWidth: 520, marginTop: 10 }}>
          <thead>
            <tr>
              <th>Personel</th>
              <th>Kod</th>
              <th>Ekip</th>
            </tr>
          </thead>
          <tbody>
            {reps.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.code}</td>
                <td>
                  <select
                    aria-label={`${r.name} ekip bağlantısı`}
                    value={r.teamId ?? ""}
                    onChange={(e) =>
                      void act(() => setRepTeam(r.id, e.target.value || null, actor))
                    }
                  >
                    <option value="">Ekipte değil</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CapacityForm({ value, onSubmit }: { value: number; onSubmit: (n: number) => void }) {
  const [v, setV] = useState(value);
  const n = Number(v) || 0;
  return (
    <form
      className="form-row"
      style={{ alignItems: "flex-end", marginTop: 10 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (n >= 2) onSubmit(n);
      }}
    >
      <label className="field" style={{ maxWidth: 260 }}>
        <span className="field__label">Kapasite (kişi — lider dahil)</span>
        <input
          type="number"
          min={2}
          max={500}
          value={v}
          onChange={(e) => setV(Number(e.target.value))}
        />
        <span className="field__hint">
          Örnek: 15 → 1 lider + en fazla 14 üye
          {n < 2 ? " · en az 2" : ""}
        </span>
      </label>
      <button className="btn btn--primary" type="submit" disabled={n < 2}>
        <Users size={16} strokeWidth={2} aria-hidden="true" /> Kapasiteyi kaydet
      </button>
    </form>
  );
}
