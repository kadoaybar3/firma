import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useActor, useAuth } from "../lib/auth";
import { InfoBanner } from "../components/ui";

const NAV: Array<[string, string, string]> = [
  ["/temsilci", "📊", "Özetim"],
  ["/temsilci/adaylar", "🎯", "Firma adayları"],
  ["/temsilci/satislar", "💰", "Satış ve kazanç"],
];

export function RepLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <h1>Satış temsilcisi girişi</h1>
          <p>Devam etmek için giriş yapın.</p>
          <button className="btn btn--primary btn--block" onClick={() => navigate("/giris")}>
            Giriş sayfasına git
          </button>
        </div>
      </div>
    );
  }

  if (user.role !== "temsilci") {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <h1>Yalnızca satış temsilcilerine açık</h1>
          <p>Yönetici arayüzüne gitmek için bunu kullanın.</p>
          <a className="btn btn--primary btn--block" href="/yonetim">
            Yönetim paneline git
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-shell">
      <aside className="panel-sidebar">
        <div className="panel-sidebar__brand">
          <span aria-hidden="true">💼</span> Temsilci Paneli
        </div>
        <div className="panel-sidebar__scroll" style={{ display: "block" }}>
          <nav aria-label="Temsilci menüsü">
            {NAV.map(([to, icon, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/temsilci"}
                className={({ isActive }) => `panel-sidebar__link ${isActive ? "is-active" : ""}`}
              >
                <span aria-hidden="true">{icon}</span> {label}
              </NavLink>
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
              <div className="panel-sidebar__role">Satış Temsilcisi</div>
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
        <div className="panel-content">
          <InfoBanner>
            Yetkileriniz: yalnızca kendi aday ve ziyaret kayıtlarınızı görebilir, kendi
            satışlarınızı açabilirsiniz. Ödeme durumu veya komisyon oranlarını değiştiremezsiniz.
          </InfoBanner>
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export function RepHeader({ title, actor }: { title: string; actor: ReturnType<typeof useActor> }) {
  return <div className="page-head"><h2>{title}</h2><p className="small">Yetkiniz: kendi kayıtlarınız</p>{actor.repId ? null : null}</div>;
}
