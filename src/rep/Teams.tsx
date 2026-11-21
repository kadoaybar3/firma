import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock3, Search, Users } from "lucide-react";
import { useActor } from "../lib/auth";
import { formatDate, formatDateTime } from "../lib/format";
import {
  getMyTeam,
  getSettings,
  listTeamJoinApplications,
  listTeamsOverview,
  submitTeamJoinApplication,
} from "../lib/repo";
import type { TeamJoinApplication } from "../lib/types";

/**
 * Ekipler (0015): tüm ekipleri lider, kapasite ve üye sayısıyla görüntüler;
 * ekipte olmayan personel katılım başvurusu yapar. Başvuru beklemede kalır —
 * ekip bağlantısı yalnız yönetici onayıyla kurulur (RPC/RLS katmanı).
 */
function JoinStatusBadge({ status }: { status: TeamJoinApplication["status"] }) {
  if (status === "onaylandi") return <span className="rep-badge rep-badge--green">Onaylandı</span>;
  if (status === "reddedildi") return <span className="rep-badge rep-badge--red">Reddedildi</span>;
  return <span className="rep-badge rep-badge--amber">Bekliyor</span>;
}

export default function RepTeams() {
  const actor = useActor();
  const overview = listTeamsOverview();
  const myTeam = getMyTeam(actor);
  const apps = listTeamJoinApplications(actor);
  const pending = apps.find((a) => a.status === "beklemede");
  const capacity = getSettings().teamCapacity;

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function apply(teamId: string, teamName: string) {
    setError(null);
    setMessage(null);
    setBusyId(teamId);
    try {
      await submitTeamJoinApplication(teamId, actor);
      setMessage(
        `${teamName} ekibine katılım başvurunuz alındı; ekip bağlantısı yönetici onayıyla kurulur.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Başvuru gönderilemedi.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="rep-stack">
      {error && <div className="error-banner">{error}</div>}
      {message && (
        <div className="rep-note" role="status">
          <CheckCircle2 size={16} strokeWidth={1.9} aria-hidden="true" />
          <span>{message}</span>
        </div>
      )}

      {/* Durumum: ekibim (üyeler + kapasite) */}
      <section className="rep-card">
        <div className="rep-card__head">
          <h2>
            <Users size={17} strokeWidth={2} aria-hidden="true" />{" "}
            {myTeam ? "Ekibim" : "Ekip durumum"}
          </h2>
        </div>

        {myTeam ? (
          <>
            <div className="rep-row" style={{ paddingBottom: 6 }}>
              <span className="rep-row__main">
                <strong>{myTeam.team.name}</strong>
                <span>
                  {myTeam.members.length}/{capacity} üye · lider:{" "}
                  {myTeam.members.find((m) => m.id === myTeam.team.leaderRepId)?.name ?? "—"}
                </span>
              </span>
              <span className="rep-row__side">
                {myTeam.team.leaderRepId === actor.repId ? (
                  <span className="rep-badge rep-badge--amber">Lider</span>
                ) : (
                  <span className="rep-badge rep-badge--green">Üye</span>
                )}
              </span>
            </div>
            <ul className="rep-list">
              {myTeam.members.map((m) => (
                <li key={m.id}>
                  <div className="rep-row">
                    <span className="rep-row__main">
                      <strong>{m.name}</strong>
                      <span>{m.code}</span>
                    </span>
                    <span className="rep-row__side">
                      {m.id === myTeam.team.leaderRepId ? (
                        <span className="rep-badge rep-badge--amber">Lider</span>
                      ) : m.id === actor.repId ? (
                        <span className="rep-badge rep-badge--green">Siz</span>
                      ) : null}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="rep-note" style={{ marginTop: 12 }}>
              <Users size={16} strokeWidth={1.9} aria-hidden="true" />
              <span>
                Ekip değişikliği yönetici onayıyla yapılır; başka bir ekibe geçiş için başvuru
                yapamazsınız. Kendi ekibinizi kurma yetkiniz korunur.
              </span>
            </div>
          </>
        ) : (
          <p className="text-muted small">
            Henüz bir ekibe bağlı değilsiniz. Aşağıdaki listeden bir ekibe katılım başvurusu
            yapabilir veya <Link to="/temsilci">Ana Sayfa</Link>&apos;ndaki &quot;Ekibim&quot;
            bölümünden kendi ekibinizi kurabilirsiniz (lider siz olursunuz).
          </p>
        )}
      </section>

      {/* Başvurularım */}
      <section className="rep-card">
        <div className="rep-card__head">
          <h2>
            <Clock3 size={17} strokeWidth={2} aria-hidden="true" /> Başvurularım
          </h2>
        </div>
        {apps.length === 0 ? (
          <p className="text-muted small">Henüz ekip katılım başvurunuz yok.</p>
        ) : (
          <ul className="rep-list">
            {apps.map((app) => (
              <li key={app.id}>
                <div className="rep-row">
                  <span className="rep-row__main">
                    <strong>
                      {overview.find((o) => o.teamId === app.teamId)?.teamName ?? "Ekip"}
                    </strong>
                    <span>
                      {formatDate(app.createdAt)}
                      {app.decidedAt ? ` · karar: ${formatDateTime(app.decidedAt)}` : " · yönetici onayı bekliyor"}
                    </span>
                  </span>
                  <span className="rep-row__side">
                    <JoinStatusBadge status={app.status} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {pending && (
          <div className="rep-note" style={{ marginTop: 12 }}>
            <Clock3 size={16} strokeWidth={1.9} aria-hidden="true" />
            <span>Bekleyen başvurunuz varken yenisini açamazsınız; sonuçlandıktan sonra tekrar deneyebilirsiniz.</span>
          </div>
        )}
      </section>

      {/* Tüm ekipler */}
      <section className="rep-card">
        <div className="rep-card__head">
          <h2>
            <Search size={17} strokeWidth={2} aria-hidden="true" /> Ekipler ({overview.length})
          </h2>
        </div>
        {overview.length === 0 ? (
          <p className="text-muted small">Henüz ekip kurulmamış.</p>
        ) : (
          <ul className="rep-list">
            {overview.map((team) => {
              const isMine = myTeam?.team.id === team.teamId;
              const full = team.memberCount >= team.capacity;
              const disabled = !!myTeam || !!pending || full || busyId === team.teamId;
              const label = isMine
                ? "Ekibiniz"
                : myTeam
                  ? "Ekiptesiniz"
                  : pending
                    ? "Başvuru bekliyor"
                    : full
                      ? "Kapasite dolu"
                      : busyId === team.teamId
                        ? "Gönderiliyor…"
                        : "Başvur";
              return (
                <li key={team.teamId}>
                  <div className="rep-row">
                    <span className="rep-row__main">
                      <strong>{team.teamName}</strong>
                      <span>
                        Lider: {team.leaderName} · {team.memberCount}/{team.capacity} üye
                        {full ? " · dolu" : ""}
                      </span>
                    </span>
                    <span className="rep-row__side">
                      <button
                        className="rep-btn rep-btn--primary rep-btn--sm"
                        type="button"
                        disabled={disabled}
                        onClick={() => void apply(team.teamId, team.teamName)}
                      >
                        {label}
                      </button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="rep-note" style={{ marginTop: 12 }}>
          <Users size={16} strokeWidth={1.9} aria-hidden="true" />
          <span>
            Başvurunuz yalnızca yönetici onayıyla ekip üyeliğine dönüşür; onaysız başvuru ekip
            bağlantısı oluşturmaz. Kapasite lider dahil {capacity} kişiyle sınırlıdır.
          </span>
        </div>
      </section>
    </div>
  );
}
