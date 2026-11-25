import { Link, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  FilePlus2,
  Lock,
  PencilLine,
  Plus,
} from "lucide-react";
import { useActor } from "../lib/auth";
import { formatDate } from "../lib/format";
import { getCategoryById, getCityById, listLeads } from "../lib/repo";
import { isDraft, isLocked, LeadStatusBadge } from "./repShared";
import {
  FirmIdentity,
  FirmList,
  FirmListRow,
  FirmMenu,
} from "../components/FirmList";
import { Badge } from "../components/ui";

export default function RepDrafts() {
  const actor = useActor();
  const location = useLocation();
  const created = Boolean((location.state as { created?: boolean } | null)?.created);
  const leads = listLeads(actor);
  const drafts = leads.filter(isDraft);
  const inReview = drafts.filter(isLocked).length;
  const approved = leads.filter((l) => Boolean(l.convertedToCompanyId));

  return (
    <div className="rep-stack">
      <div>
        <Link className="rep-backlink" to="/temsilci">
          <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" />
          Ana sayfa
        </Link>
        <div className="rep-pagehead">
          <h1>Taslaklarım</h1>
          <p>
            Yalnızca size ait taslaklar. Anlaşma bildirilene kadar bilgileri düzenleyebilirsiniz;
            anlaşma bildirildikten sonra kayıt kilitlenir.
          </p>
        </div>
      </div>

      {created && (
        <div className="rep-note rep-note--success" role="status">
          <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />
          <span>
            Taslak kaydedildi. Firma bilgilerini kontrol edip anlaşma adımına geçebilirsiniz.
          </span>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Link className="rep-btn rep-btn--primary" to="/temsilci/yeni">
          <Plus size={17} strokeWidth={2.2} aria-hidden="true" />
          Yeni firma ekle
        </Link>
      </div>

      {drafts.length === 0 ? (
        <div className="rep-card">
          <div className="rep-empty">
            <span className="rep-empty__icon" aria-hidden="true">
              <FilePlus2 size={24} strokeWidth={1.8} />
            </span>
            <strong>Henüz taslağınız yok</strong>
            <p>Sahada görüştüğünüz firmayı ekleyin; taslak size bağlı olarak saklanır.</p>
            <Link className="rep-btn rep-btn--primary rep-btn--sm" to="/temsilci/yeni">
              <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
              İlk taslağı oluştur
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="fl-listmeta">
            <strong>{drafts.length} taslak firma</strong>
            <span>
              {drafts.length - inReview} düzenlenebilir · {inReview} incelemede
            </span>
          </div>

          <FirmList label="Taslak firmalarım">
            {drafts.map((lead) => {
              const locked = isLocked(lead);
              const category = lead.categoryId ? getCategoryById(lead.categoryId)?.name : undefined;
              const city = lead.cityId ? getCityById(lead.cityId)?.name : undefined;
              const place = [lead.district, city].filter(Boolean).join(", ");

              return (
                <FirmListRow
                  key={lead.id}
                  identity={
                    <FirmIdentity
                      name={lead.companyName}
                      category={category}
                      place={place || undefined}
                      phone={lead.phone}
                      note={`Oluşturuldu: ${formatDate(lead.createdAt)}`}
                      badges={<LeadStatusBadge status={lead.status} />}
                    />
                  }
                  aside={
                    <div className="fl-row__actions">
                      {locked ? (
                        <Link
                          className="btn btn--sm"
                          to={`/temsilci/taslak/${lead.id}/odeme`}
                        >
                          <CheckCircle2 size={15} strokeWidth={2} aria-hidden="true" />
                          Durumu görüntüle
                        </Link>
                      ) : (
                        <Link
                          className="btn btn--sm btn--primary"
                          to={`/temsilci/taslak/${lead.id}/odeme`}
                        >
                          Anlaşma adımına geç
                        </Link>
                      )}
                      {!locked && (
                        <FirmMenu
                          label={`${lead.companyName} taslak işlemleri`}
                          items={[
                            {
                              label: "Taslağı düzenle",
                              icon: <PencilLine size={15} strokeWidth={2} aria-hidden="true" />,
                              to: `/temsilci/taslak/${lead.id}`,
                            },
                          ]}
                        />
                      )}
                    </div>
                  }
                  footer={
                    locked ? (
                      <div className="rep-note rep-note--warn" style={{ margin: 0 }}>
                        <Lock size={15} strokeWidth={2} aria-hidden="true" />
                        <span>
                          Anlaşma bildirildi. Firma bilgileri kilitlendi ve yönetici
                          incelemesinde.
                        </span>
                      </div>
                    ) : undefined
                  }
                />
              );
            })}
          </FirmList>
        </>
      )}

      {approved.length > 0 && (
        <section>
          <div className="fl-listmeta">
            <strong>Onaylanan firmalar</strong>
            <span>{approved.length} firma rehbere eklendi</span>
          </div>
          <FirmList label="Onaylanan firmalar">
            {approved.map((lead) => (
              <FirmListRow
                key={lead.id}
                identity={
                  <FirmIdentity
                    name={lead.companyName}
                    note="Yönetici onayıyla rehbere eklendi"
                  />
                }
                aside={<Badge tone="green">Onaylandı</Badge>}
              />
            ))}
          </FirmList>
        </section>
      )}
    </div>
  );
}
