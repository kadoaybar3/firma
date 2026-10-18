import { useState } from "react";
import { PanelHead } from "./AdminLayout";
import { Badge, ErrorBanner, Field } from "../components/ui";
import { useActor } from "../lib/auth";
import { categoryCompanyCount, createCategory, deleteCategory, listCategories } from "../lib/repo";

export default function AdminCategories() {
  const actor = useActor();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="panel-content">
      <PanelHead
        title="Kategoriler"
        desc="İşletme kategorilerini ve ikonlarını yönetin. Kategori silmek için önce firmaları taşımalısınız."
      />
      {error && <ErrorBanner message={error} />}

      <div className="card card__pad mb-14" style={{ maxWidth: 520 }}>
        <form
          className="form-row"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              createCategory(name, icon, actor);
              setName("");
              setIcon("");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Kategori eklenemedi.");
            }
          }}
        >
          <Field label="Kategori adı" required>
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Örn: Güzellik & Kuaför" />
          </Field>
          <Field label="İkon" hint="1 emoji">
            <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} placeholder="💅" style={{ width: 96 }} />
          </Field>
          <button className="btn btn--primary" type="submit" style={{ alignSelf: "flex-end", marginBottom: 14 }}>
            Ekle
          </button>
        </form>
      </div>

      <div className="table-wrap" style={{ maxWidth: 720 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Kategori</th>
              <th>Slug</th>
              <th>Firma sayısı</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {listCategories().map((c) => (
              <tr key={c.id}>
                <td>
                  <span aria-hidden="true">{c.icon}</span> <strong>{c.name}</strong>
                </td>
                <td className="text-muted small">/kategori/{c.slug}</td>
                <td>
                  <Badge tone="blue">{categoryCompanyCount(c.id)}</Badge>
                </td>
                <td>
                  <button
                    className="btn btn--sm btn--danger"
                    onClick={async () => {
                      setError(null);
                      try {
                        deleteCategory(c.id, actor);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Silinemedi.");
                      }
                    }}
                  >
                    Sil
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
