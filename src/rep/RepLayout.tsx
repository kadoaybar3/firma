import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Building2,
  ExternalLink,
  LayoutDashboard,
  MapPin,
  Menu,
  Receipt,
  Target,
  type LucideIcon,
  X,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { SyncBanner } from "../components/SyncBanner";

/**
 * Çalışan menüsü — yönetici menüsünün küçültülmüş kopyası DEĞİL:
 * yalnızca sahadaki iş akışı (firma bul/ekle → üyelik sat → satışları izle).
 */
const NAV: Array<{ to: string; icon: LucideIcon; label: string; hint: string }> = [
  { to: "/temsilci", icon: LayoutDashboard, label: "Ana Sayfa", hint: "Kendi özetiniz" },
  { to: "/temsilci/firmalar", icon: Target, label: "Firma Bul / Ekle", hint: "Ara, mükerrer kontrol et, aday ekle" },
  { to: "/temsilci/uyelik", icon: Building2, label: "Üyelik Satışı", hint: "Firma seç, satış aç" },
  { to: "/temsilci/satislarim", icon: Receipt, label: "Satışlarım", hint: "Satış ve komisyon durumu" },
];

export function RepLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    setDrawer(false);
  }, [pathname]);

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

  const active = [...NAV]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));

  return (
    <div className={`panel-shell panel-shell--rep ${drawer ? "is-drawer-open" : ""}`}>
      <button
        type="button"
        className="panel-backdrop"
        aria-label="Menüyü kapat"
        tabIndex={drawer ? 0 : -1}
        onClick={() => setDrawer(false)}
      />

      <aside className="panel-sidebar panel-sidebar--light" aria-label="Temsilci menüsü">
        <div className="panel-sidebar__brandrow">
          <Link className="panel-sidebar__brand" to="/temsilci">
            <span className="panel-sidebar__mark" aria-hidden="true">
              <MapPin size={16} strokeWidth={2.1} />
            </span>
            <span className="panel-sidebar__brandtext">
              <span className="panel-sidebar__title">Firma Rehberi</span>
              <span className="panel-sidebar__subtitle">Temsilci paneli</span>
            </span>
          </Link>
          <button
            type="button"
            className="panel-iconbtn panel-sidebar__close"
            aria-label="Menüyü kapat"
            onClick={() => setDrawer(false)}
          >
            <X size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div className="panel-sidebar__scroll">
          <nav>
            {NAV.map(({ to, icon: Icon, label, hint }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/temsilci"}
                title={label}
                className={({ isActive }) => `panel-sidebar__link ${isActive ? "is-active" : ""}`}
              >
                <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
                <span className="panel-sidebar__label">
                  {label}
                  <span className="panel-sidebar__hint">{hint}</span>
                </span>
              </NavLink>
            ))}
          </nav>

          <div className="panel-sidebar__note">
            <strong>Saha akışı</strong>
            <p>
              Rehberde arayın → mükerrer kaydı kontrol edin → aday oluşturun. Firma kaydı
              yönetici onayıyla yayına alınır.
            </p>
          </div>
        </div>

        <div className="panel-sidebar__foot">
          <div className="panel-sidebar__user">
            <span className="panel-sidebar__avatar" aria-hidden="true">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="panel-sidebar__usertext">
              <div className="panel-sidebar__name">{user.name}</div>
              <div className="panel-sidebar__role">Satış temsilcisi</div>
            </div>
          </div>
          <button
            className="btn btn--sm btn--block panel-sidebar__logout"
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
        <header className="panel-topbar">
          <div className="panel-topbar__left">
            <button
              type="button"
              className="panel-iconbtn panel-topbar__menu"
              aria-label="Menüyü aç"
              aria-expanded={drawer}
              onClick={() => setDrawer(true)}
            >
              <Menu size={19} strokeWidth={2} aria-hidden="true" />
            </button>
            <div className="panel-topbar__title">
              <span className="panel-topbar__eyebrow">Temsilci</span>
              <span className="panel-topbar__current">{active?.label ?? "Panel"}</span>
            </div>
          </div>
          <Link className="btn btn--ghost btn--sm panel-topbar__site" to="/">
            <ExternalLink size={15} strokeWidth={2} aria-hidden="true" />
            Siteyi gör
          </Link>
        </header>
        <SyncBanner />
        <Outlet />
      </div>
    </div>
  );
}
