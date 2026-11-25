import { useState } from "react";
import { BadgeCheck, Clock } from "lucide-react";
import { PanelHead } from "./AdminLayout";
import { Badge, ErrorBanner, StatCard } from "../components/ui";
import { FirmIdentity } from "../components/FirmList";
import { useActor } from "../lib/auth";
import { formatTRY } from "../lib/format";
import { createRenewalSale, getCompanyById, listMemberships } from "../lib/repo";

export default function AdminMemberships() {
  const actor = useActor();
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  void tick;

  const memberships = listMemberships(actor);

  function run(fn: () => void) {
    setError(null);
    try {
      fn();
      setTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "İşlem başarısız.");
    }
  }

  const active = memberships.filter((m) => m.status === "aktif" && new Date(m.endsAt) >= new Date());

  return (
    <div className="panel-content">
      <PanelHead
        title="Üyelik Yenileme"
        desc="Firma yıllık üyelikleri ve yenileme süreçleri. Yenileme komisyonu, üyeliği ilk kazandıran temsilciye otomatik bağlanır."
      />
      {error && <ErrorBanner message={error} />}

      <div className="stats-grid mb-14">
        <StatCard
          icon={<BadgeCheck size={20} strokeWidth={1.9} />}
          label="Aktif üyelik"
          value={active.length}
          tone="success"
        />
        <StatCard
          icon={<Clock size={20} strokeWidth={1.9} />}
          label="Süresi biten"
          value={memberships.length - active.length}
          tone="warning"
        />
      </div>

      <div className="fl-listmeta">
        <strong>{memberships.length} üyelik kaydı</strong>
        <span>{active.length} aktif · {memberships.length - active.length} süresi biten</span>
      </div>

      <div className="table-wrap table-wrap--cards">
        <table className="table table--rows">
          <thead>
            <tr>
              <th>Firma</th>
              <th>Başlangıç</th>
              <th>Bitiş</th>
              <th>Durum</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {memberships.map((m) => {
              const company = getCompanyById(m.companyId);
              const expired = new Date(m.endsAt) < new Date();
              return (
                <tr key={m.id}>
                  <td data-label="Firma">
                    <FirmIdentity
                      name={company?.name ?? "Firma kaydı yok"}
                      href={company ? `/firma/${company.slug}` : undefined}
                      images={company?.images}
                      place={company?.district}
                      phone={company?.phone}
                    />
                  </td>
                  <td data-label="Başlangıç" className="small">{new Date(m.startsAt).toLocaleDateString("tr-TR")}</td>
                  <td data-label="Bitiş" className="small">{new Date(m.endsAt).toLocaleDateString("tr-TR")}</td>
                  <td data-label="Durum">
                    <Badge tone={m.status === "aktif" && !expired ? "green" : "gray"}>
                      {m.status === "iptal"
                        ? "İptal"
                        : m.status === "suresi_bitti" || (expired && m.status === "aktif")
                          ? "Süresi bitti"
                          : "Aktif"}
                    </Badge>
                  </td>
                  <td data-label="İşlem">
                    <button
                      className="btn btn--sm btn--ghost"
                      disabled={m.status === "iptal"}
                      onClick={() => {
                        if (
                          confirm(
                            "Yenileme satışı açılacak; ödeme doğrulatıp kesinleştirmeniz gerekir. Devam?",
                          )
                        ) {
                          run(() => {
                            const sale = createRenewalSale(m.id, actor);
                            alert(
                              `Yenileme satışı açıldı: ${formatTRY(sale.amount)}. "Satış kayıtları" ve "Ödeme kayıtları" sayfalarından doğrulayın.`,
                            );
                          });
                        }
                      }}
                    >
                      Yenileme başlat
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
