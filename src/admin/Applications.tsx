import { useState, type FormEvent } from "react";
import { PanelHead } from "./AdminLayout";
import { Badge, ErrorBanner, Field } from "../components/ui";
import { useActor } from "../lib/auth";
import { formatDate } from "../lib/format";
import {
  approveRepApplication,
  listRepApplications,
  listReps,
  listTeams,
  rejectRepApplication,
} from "../lib/repo";
import type { RepApplication } from "../lib/types";

/**
 * Personel Başvuruları (0012/0013): yalnız yönetici listeler, onaylar,
 * reddeder. Onayda hesap oluşturma Netlify Function + tek transaction RPC
 * ile yapılır; bu ekran yalnızca isteği yürütür ve sonucu gösterir.
 */
type Filter = "bekleyen" | "onaylanan" | "reddedilen" | "hepsi";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "bekleyen", label: "Bekleyen" },
  { id: "onaylanan", label: "Onaylanan" },
  { id: "reddedilen", label: "Reddedilen" },
  { id: "hepsi", label: "Tümü" },
];

function StatusBadge({ status }: { status: RepApplication["status"] }) {
  if (status === "onaylandi") return <Badge tone="green">Onaylandı</Badge>;
  if (status === "reddedildi") return <Badge tone="red">Reddedildi</Badge>;
  return <Badge tone="orange">Bekliyor</Badge>;
}

export default function AdminApplications() {
  const actor = useActor();
  // Yerel/önbellek güncellemesi sonrası re-render (Reps.tsx deseni)
  const [, setTick] = useState(0);
  const [filter, setFilter] = useState<Filter>("bekleyen");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [approveId, setApproveId] = useState<string | null>(null);
  const [password, setPassword] = useState("");

  const apps = listRepApplications(actor);
  const reps = listReps(actor);
  const teams = listTeams(actor);

  const visible = apps.filter((a) =>
    filter === "hepsi"
      ? true
      : filter === "bekleyen"
        ? a.status === "beklemede"
        : filter === "onaylanan"
          ? a.status === "onaylandi"
          : a.status === "reddedildi",
  );
  const counts = {
    bekleyen: apps.filter((a) => a.status === "beklemede").length,
    onaylanan: apps.filter((a) => a.status === "onaylandi").length,
    reddedilen: apps.filter((a) => a.status === "reddedildi").length,
    hepsi: apps.length,
  };

  function cancelApprove() {
    setApproveId(null);
    setPassword("");
  }

  async function run(id: string, fn: () => Promise<void>): Promise<void> {
    setError(null);
    setBusyId(id);
    try {
      await fn();
      setTick((t) => t + 1);
      cancelApprove();
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem başarısız.");
    } finally {
      setBusyId(null);
    }
  }

  function handleApprove(e: FormEvent, app: RepApplication) {
    e.preventDefault();
    void run(app.id, () => approveRepApplication(app.id, password, actor));
  }

  function handleReject(app: RepApplication) {
    const label = `${app.firstName} ${app.lastName}`;
    if (!window.confirm(`"${label}" başvurusunu reddetmek istediğinize emin misiniz?`)) return;
    void run(app.id, () => rejectRepApplication(app.id, actor));
  }

  return (
    <div className="panel-content">
      <PanelHead
        title="Personel Başvuruları"
        desc="Referans bağlantısıyla gelen başvurular. Onayda referans personeli, ekip ve kapasite sunucuda yeniden doğrulanır; hesap yalnızca yönetici onayıyla oluşur. Reddedilen kayıtlar denetim için saklanır."
      />
      {error && <ErrorBanner message={error} />}

      <div className="card card__pad">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`btn btn--sm ${filter === f.id ? "btn--primary" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label} ({counts[f.id]})
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="text-muted small">Bu filtrede başvuru yok.</p>
        ) : (
          <table className="table" style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th>Başvuran</th>
                <th>İletişim</th>
                <th>Referans personel</th>
                <th>Ekip</th>
                <th>Başvuru tarihi</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((a) => {
                const refRep = reps.find((r) => r.id === a.referralRepId);
                const team = a.teamId ? teams.find((t) => t.id === a.teamId) : undefined;
                return (
                  <tr key={a.id}>
                    <td data-label="Başvuran">
                      <strong>
                        {a.firstName} {a.lastName}
                      </strong>
                    </td>
                    <td data-label="İletişim">
                      {a.phone}
                      <br />
                      <span className="text-muted small">{a.email}</span>
                    </td>
                    <td data-label="Referans personel">
                      {refRep ? `${refRep.name} (${refRep.code})` : "—"}
                    </td>
                    <td data-label="Ekip">{team?.name ?? "Ekipte değil"}</td>
                    <td data-label="Başvuru tarihi">{formatDate(a.createdAt)}</td>
                    <td data-label="Durum">
                      <StatusBadge status={a.status} />
                    </td>
                    <td data-label="İşlem">
                      {a.status !== "beklemede" ? (
                        <span className="text-muted small">—</span>
                      ) : approveId === a.id ? (
                        <form
                          onSubmit={(e) => handleApprove(e, a)}
                          style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 200 }}
                        >
                          <Field label="Personel şifresi" required>
                            <input
                              type="password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              required
                              minLength={6}
                              autoFocus
                              autoComplete="new-password"
                              placeholder="En az 6 karakter"
                            />
                          </Field>
                          <span style={{ display: "flex", gap: 6 }}>
                            <button
                              className="btn btn--sm btn--primary"
                              type="submit"
                              disabled={busyId === a.id || password.length < 6}
                            >
                              {busyId === a.id ? "Onaylanıyor…" : "Onayı tamamla"}
                            </button>
                            <button className="btn btn--sm" type="button" onClick={cancelApprove}>
                              İptal
                            </button>
                          </span>
                        </form>
                      ) : (
                        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <button
                            className="btn btn--sm btn--primary"
                            type="button"
                            disabled={busyId === a.id}
                            onClick={() => {
                              setError(null);
                              setApproveId(a.id);
                              setPassword("");
                            }}
                          >
                            Onayla
                          </button>
                          <button
                            className="btn btn--sm"
                            type="button"
                            disabled={busyId === a.id}
                            onClick={() => handleReject(a)}
                          >
                            {busyId === a.id ? "…" : "Reddet"}
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
    </div>
  );
}
