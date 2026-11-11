import { Link, useLocation } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  FilePlus2,
  FileText,
  Lock,
  PencilLine,
  Plus,
} from "lucide-react";
import { useActor } from "../lib/auth";
import { formatDate } from "../lib/format";
import { getCategoryById, getCityById, listLeads } from "../lib/repo";
import { isDraft, isLocked, LeadStatusBadge } from "./repShared";

export default function RepDrafts() {
  const actor = useActor();
  const location = useLocation();
  const created = Boolean((location.state as { created?: boolean } | null)?.created);
  const leads = listLeads(actor);
  const drafts = leads.filter(isDraft);
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
            Yalnızca size ait taslaklar. Ödeme başlamadan önce bilgileri düzenleyebilirsiniz;
            anlaşma bildirildikten sonra kayıt kilitlenir.
          </p>
        </div>
      </div>

      {created && (
        <div className="rep-note rep-note--success" role="status">
          <CheckCircle2 size={16} strokeWidth={2} aria-hidden="true" />
          <span>
            Taslak kaydedildi. Firma bilgilerini kontrol edip ödeme adımına geçebilirsiniz.
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
        <div className="rep-grid">
          {drafts.map((lead) => {
            const locked = isLocked(lead);
            const category = lead.categoryId ? getCategoryById(lead.categoryId)?.name : undefined;
            const city = lead.cityId ? getCityById(lead.cityId)?.name : undefined;
            const place = [city, lead.district].filter(Boolean).join(", ");

            return (
              <article key={lead.id} className="rep-card rep-draft">
                <div className="rep-draft__top">
                  <div className="rep-draft__title">
                    <strong title={lead.companyName}>{lead.companyName}</strong>
                    <span>Oluşturuldu: {formatDate(lead.createdAt)}</span>
                  </div>
                  <LeadStatusBadge status={lead.status} />
                </div>

                <div className="rep-draft__meta">
                  {category && <span>{category}</span>}
                  {place && <span>{place}</span>}
                  {lead.phone && <span>{lead.phone}</span>}
                </div>

                {locked ? (
                  <div className="rep-note rep-note--warn">
                    <Lock size={15} strokeWidth={2} aria-hidden="true" />
                    <span>
                      Anlaşma bildirildi. Firma bilgileri kilitlendi ve yönetici incelemesinde.
                    </span>
                  </div>
                ) : (
                  <div className="rep-note">
                    <FileText size={15} strokeWidth={1.9} aria-hidden="true" />
                    <span>Ödeme başlamadan önce bilgileri düzenleyebilirsiniz.</span>
                  </div>
                )}

                <div className="rep-draft__actions">
                  {locked ? (
                    <Link className="rep-btn rep-btn--ghost rep-btn--sm" to={`/temsilci/taslak/${lead.id}/odeme`}>
                      <CreditCard size={15} strokeWidth={2} aria-hidden="true" />
                      Durumu görüntüle
                    </Link>
                  ) : (
                    <>
                      <Link className="rep-btn rep-btn--ghost rep-btn--sm" to={`/temsilci/taslak/${lead.id}`}>
                        <PencilLine size={15} strokeWidth={2} aria-hidden="true" />
                        Düzenle
                      </Link>
                      <Link className="rep-btn rep-btn--primary rep-btn--sm" to={`/temsilci/taslak/${lead.id}/odeme`}>
                        <CreditCard size={15} strokeWidth={2} aria-hidden="true" />
                        Ödemeye Geç
                      </Link>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {approved.length > 0 && (
        <section className="rep-card">
          <div className="rep-card__head">
            <h2>Onaylanan firmalar</h2>
            <span className="rep-badge rep-badge--green">{approved.length}</span>
          </div>
          <ul className="rep-list">
            {approved.map((lead) => (
              <li key={lead.id}>
                <div className="rep-row">
                  <span className="rep-row__main">
                    <strong>{lead.companyName}</strong>
                    <span>Yönetici onayıyla rehbere eklendi</span>
                  </span>
                  <span className="rep-row__side">
                    <span className="rep-badge rep-badge--green">Onaylandı</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
