import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { RoleError } from "../App";
import { listCompanies } from "../lib/repo";
import { SyncBanner } from "../components/SyncBanner";

const NAV_GROUPS: Array<{ label: string; items: Array<[string, string, string]> }> = [
  {
    label: "Genel",
    items: [
      ["/yonetim", "📊", "Genel durum"],
      ["/yonetim/firmalar", "🏪", "Firma kayıtları"],
      ["/yonetim/kategoriler", "🗂️", "Kategoriler"],
      ["/yonetim/sehirler", "🗺️", "Şehir ve ilçeler"],
    ],
  },
  {
    label: "Satış",
    items: [
      ["/yonetim/temsilciler", "👥", "Satış temsilcileri"],
      ["/yonetim/adaylar", "🎯", "Firma adayları"],
      ["/yonetim/satislar", "💰", "Satış kayıtları"],
      ["/yonetim/komisyonlar", "🧾", "Komisyon hesapları"],
      ["/yonetim/referanslar", "🎟️", "Referans kayıtları"],
    ],
  },
  {
    label: "Finans",
    items: [
      ["/yonetim/uyelikler", "🔐", "Üyelikler"],
      ["/yonetim/odemeler", "💳", "Ödeme kayıtları"],
      ["/yonetim/raporlar", "📈", "Raporlar"],
    ],
  },
  {
    label: "Sistem",
    items: [
      ["/yonetim/denetim", "🛡️", "İşlem geçmişi"],
      ["/yonetim/ayarlar", "⚙️", "Ayarlar"],
    ],
  },
];

export function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Yetki koruması — yalnızca admin rolü
  if (!user) {
    return (
      <RoleGate
        title="Yönetim paneli"
        message="Devam etmek için lütfen giriş yapın."
        onLogin={() => navigate("/giris", { replace: true })}
      />
    );
  }
  if (user.role !== "admin") return <RoleError expected="yönetici" />;

  const publishedCount = listCompanies().length;

  return (
    <div className="panel-shell">
      <aside className="panel-sidebar">
        <div className="panel-sidebar__brand">
          <span aria-hidden="true">🧭</span> Firma Rehberi · Yönetim
        </div>
        <div className="panel-sidebar__scroll" style={{ display: "block" }}>
          <nav aria-label="Yönetim menüsü">
            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="panel-sidebar__group">{group.label}</div>
                {group.items.map(([to, icon, label]) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === "/yonetim"}
                    className={({ isActive }) =>
                      `panel-sidebar__link ${isActive ? "is-active" : ""}`
                    }
                  >
                    <span aria-hidden="true">{icon}</span> {label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </div>
        <div className="panel-sidebar__foot">
          <div className="panel-sidebar__user">
            <span className="panel-sidebar__avatar" aria-hidden="true">
              {user.name.slice(0, 1)}
            </span>
            <div>
              <div className="panel-sidebar__name">{user.name}</div>
              <div className="panel-sidebar__role">
                Yönetici · {publishedCount} firma kayıtlı
              </div>
            </div>
          </div>
          <button
            className="btn btn--sm btn--block"
            style={{ background: "rgba(255,255,255,.1)", color: "#fff" }}
            onClick={() => {
              logout();
              navigate("/", { replace: true });
            }}
          >
            Çıkış yap
          </button>
        </div>
      </aside>
      <div className="panel-main">
        <SyncBanner />
        <Outlet />
      </div>
    </div>
  );
}

export function RoleGate({
  title,
  message,
  onLogin,
}: {
  title: string;
  message: string;
  onLogin: () => void;
}) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>{title}</h1>
        <p>{message}</p>
        <button className="btn btn--primary btn--block" onClick={onLogin}>
          Giriş sayfasına git
        </button>
      </div>
    </div>
  );
}

/** Panel sayfaları ortak üst bölüm */
export function PanelHead({ title, desc, action }: { title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className="page-head flex-between">
      <div>
        <h2>{title}</h2>
        {desc && <p>{desc}</p>}
      </div>
      {action}
    </div>
  );
}
