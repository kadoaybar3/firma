import { useState } from "react";
import { Badge, ErrorBanner } from "../components/ui";
import { formatDateTime } from "../lib/format";
import { useActor } from "../lib/auth";
import { LeadBoard, NewLeadForm } from "../admin/Leads";
import { listVisits } from "../lib/repo";

export default function RepLeads() {
  const actor = useActor();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <div className="page-head flex-between">
        <div>
          <h2>Firma adayları</h2>
          <p>Sahadan topladığınız firma adaylarını ekleyin, görüşme durumu güncelleyin, ziyaret kayıtları tutun.</p>
        </div>
        <button
          className="btn btn--primary"
          onClick={() => {
            setError(null);
            setAdding((a) => !a);
          }}
        >
          {adding ? "Formu kapat" : "+ Yeni aday"}
        </button>
      </div>
      {error && <ErrorBanner message={error} />}
      {adding && <NewLeadForm actor={actor} onDone={() => setAdding(false)} />}
      <LeadBoard actor={actor} />
    </div>
  );
}

export function VisitsOfLead({ leadId }: { leadId: string }) {
  const visits = listVisits(leadId);
  return (
    <div>
      {visits.map((v) => (
        <div key={v.id} className="small">
          <strong>{formatDateTime(v.date)}</strong> — {v.outcome}
          <div className="text-muted">{v.note}</div>
        </div>
      ))}
      {visits.length === 0 && <span className="text-muted small">Ziyaret yok</span>}
      <Badge tone="gray">{visits.length}</Badge>
    </div>
  );
}
