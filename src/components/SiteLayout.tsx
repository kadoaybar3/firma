import { NavLink, Outlet, Link } from "react-router-dom";
import { useAuth, useActor } from "../lib/auth";
import { listCategories } from "../lib/repo";

export function SiteLayout() {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      <SiteHeader />
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}

function SiteHeader() {
  const { user } = useAuth();
  const cats = listCategories().slice(0, 4);

  return (
    <header className="site-header">
      <div className="container site-header__inner">
        <Link className="site-header__logo" to="/">
          <span className="site-header__logo-badge" aria-hidden="true">🗺️</span>
          Firma Rehberi
        </Link>
        <nav className="site-header__nav" aria-label="Ana menü">
          <NavLink className="site-header__link" to="/firmalar" end>
            Firmalar
          </NavLink>
          {cats.map((c) => (
            <NavLink key={c.id} className="site-header__link" to={`/kategori/${c.slug}`}>
              {c.name}
            </NavLink>
          ))}
          <NavLink className="site-header__link" to="/iletisim">
            İletişim
          </NavLink>
        </nav>
        <Link className="btn btn--primary site-header__cta" to="/giris">
          {user ? "Panellere Git" : "Giriş Yap"}
        </Link>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div>
          <div className="site-header__logo" style={{ marginBottom: 10 }}>
            <span className="site-header__logo-badge" aria-hidden="true">🗺️</span>
            Firma Rehberi
          </div>
          <p className="text-muted small" style={{ maxWidth: 320 }}>
            Afyonkarahisar'da başlayıp Türkiye geneline yayılacak, küçük işletmelerin internette
            bulunabilirliğini artıran yerel firma rehberi platformu.
          </p>
        </div>
        <div>
          <div className="site-footer__title">Firma Rehberi</div>
          <div className="site-footer__links">
            <Link to="/firmalar">Tüm Firmalar</Link>
            <Link to="/sehir/afyonkarahisar">Afyonkarahisar</Link>
            <Link to="/hakkimizda">Hakkımızda</Link>
            <Link to="/iletisim">İletişim</Link>
          </div>
        </div>
        <div>
          <div className="site-footer__title">Yasal</div>
          <div className="site-footer__links">
            <Link to="/kvkk">KVKK Aydınlatma Metni</Link>
            <Link to="/kullanim-kosullari">Kullanım Koşulları</Link>
            <a href="/yonetim">Yönetim Girişi</a>
          </div>
        </div>
      </div>
      <div className="site-footer__note">
        © {new Date().getFullYear()} Firma Rehberi — Bu sitedeki veriler örnek amaçlıdır.
      </div>
    </footer>
  );
}

/** Aktör bilgisini doğru türde paylaşmak için yardımcı (panellerde kullanılır) */
export function useSessionActor() {
  return useActor();
}
