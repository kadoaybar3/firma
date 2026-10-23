import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { SiteLayout } from "./components/SiteLayout";
import { ScrollToTop } from "./components/ScrollToTop";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ErrorBanner } from "./components/ui";

/*
 * Kod-bölme stratejisi: halka açık ana sayfalar hariç tüm ağır bölümler
 * route-level lazy yüklenir — yönetim/temsilci paneli kodu halka açık
 * ilk yüke dahil edilmez (performans incelemesi: S1+S2+S3).
 */

// --- Halka açık sayfalar (lazy) ---
const HomePage = lazy(() => import("./pages/HomePage"));
const FirmsPage = lazy(() => import("./pages/FirmsPage"));
const FirmDetailPage = lazy(() => import("./pages/FirmDetailPage"));
const ContactPage = lazy(() =>
  import("./pages/StaticPages").then((m) => ({ default: m.ContactPage })),
);
const HakkindaPage = lazy(() =>
  import("./pages/StaticPages").then((m) => ({ default: m.HakkindaPage })),
);
const KvkkPage = lazy(() =>
  import("./pages/StaticPages").then((m) => ({ default: m.KvkkPage })),
);
const TermsPage = lazy(() =>
  import("./pages/StaticPages").then((m) => ({ default: m.TermsPage })),
);
const LoginPage = lazy(() =>
  import("./pages/StaticPages").then((m) => ({ default: m.LoginPage })),
);
const NotFoundPage = lazy(() =>
  import("./pages/StaticPages").then((m) => ({ default: m.NotFoundPage })),
);

// --- Yönetim paneli (lazy — yalnızca admin rolü erişir) ---
const AdminLayout = lazy(() =>
  import("./admin/AdminLayout").then((m) => ({ default: m.AdminLayout })),
);
const AdminDashboard = lazy(() => import("./admin/Dashboard"));
const AdminCompanies = lazy(() => import("./admin/Companies"));
const AdminCategories = lazy(() => import("./admin/Categories"));
const AdminCities = lazy(() => import("./admin/Cities"));
const AdminReps = lazy(() => import("./admin/Reps"));
const AdminLeads = lazy(() => import("./admin/Leads"));
const AdminSales = lazy(() => import("./admin/Sales"));
const AdminPayments = lazy(() => import("./admin/Payments"));
const AdminMemberships = lazy(() => import("./admin/Memberships"));
const AdminCommissions = lazy(() => import("./admin/Commissions"));
const AdminReferrals = lazy(() => import("./admin/Referrals"));
const AdminReports = lazy(() => import("./admin/Reports"));
const AdminSettings = lazy(() => import("./admin/Settings"));
const AdminAudit = lazy(() => import("./admin/Audit"));
const AdminImport = lazy(() => import("./admin/Import"));

// --- Temsilci paneli (lazy — yalnızca temsilci rolü erişir) ---
const RepLayout = lazy(() =>
  import("./rep/RepLayout").then((m) => ({ default: m.RepLayout })),
);
const RepDashboard = lazy(() => import("./rep/Dashboard"));
const RepLeads = lazy(() => import("./rep/Leads"));
const RepMembershipSale = lazy(() => import("./rep/MembershipSale"));
const RepMySales = lazy(() => import("./rep/MySales"));

/** Lazy bölüm yüklenirken gösterilen ortak bekleme görünümü */
function PageFallback() {
  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: "var(--text-2)" }}>
      Yükleniyor…
    </div>
  );
}

/**
 * Supabase modunda açılış kapısı: oturum + anlık görüntü yüklemesi bitmeden
 * hiçbir rota çizilmez (boş liste parlaması / kısmi veri önlenir).
 * Demo modda phase zaten "ready" olduğundan kapı etkisizdir.
 */
function BootGate({ children }: { children: ReactNode }) {
  const { phase, bootError } = useAuth();
  if (phase === "booting") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          color: "var(--text-2)",
        }}
      >
        Veri bağlantısı kuruluyor…
      </div>
    );
  }
  if (phase === "error") {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "var(--space-5, 24px)" }}>
        <div className="auth-card" style={{ maxWidth: 520 }}>
          <h1>Veri bağlantısı kurulamadı</h1>
          <p className="mb-14">
            Uygulama canlı veritabanına bağlanamadı. Migration'ların uygulandığından ve
            bağlantı bilgilerinin doğru olduğundan emin olun; internet bağlantınızı kontrol edin.
          </p>
          <ErrorBanner message={bootError ?? "Bilinmeyen hata"} />
          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={() => window.location.reload()}
          >
            Yeniden dene
          </button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}

/** Route-level role check, before either protected panel tree is rendered. */
function RequireRole({ role, children }: { role: "admin" | "temsilci"; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/giris" replace />;
  if (user.role !== role) {
    return <RoleError expected={role === "admin" ? "yönetici" : "satış temsilcisi"} />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        {/* Rota değişiminde sayfa başına dön (geri/ileri hariç) */}
        <ScrollToTop />
        {/* Hata sınırı Suspense'i dışında olmalı: chunk çözümlemesi sırasında
            firlayan hata Suspense'ten yukarı akar ve burada yakalanır. */}
        <ErrorBoundary>
          <BootGate>
            <Suspense fallback={<PageFallback />}>
            <Routes>
              {/* ===== Halke açık site ===== */}
              <Route element={<SiteLayout />}>
                <Route index element={<HomePage />} />
                <Route path="firmalar" element={<FirmsPage />} />
                <Route path="firma/:slug" element={<FirmDetailPage />} />
                <Route path="kategori/:catSlug" element={<FirmsPage />} />
                <Route path="sehir/:citySlug" element={<FirmsPage />} />
                <Route path="sehir/:citySlug/:district" element={<FirmsPage />} />
                <Route path="iletisim" element={<ContactPage />} />
                <Route path="hakkimizda" element={<HakkindaPage />} />
                <Route path="kvkk" element={<KvkkPage />} />
                <Route path="kullanim-kosullari" element={<TermsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>

              {/* ===== Ortak giriş ===== */}
              <Route path="giris" element={<LoginPage />} />

              {/* ===== Yönetim paneli (yalnızca admin rolü) ===== */}
              <Route path="yonetim" element={<RequireRole role="admin"><AdminLayout /></RequireRole>}>
                <Route index element={<AdminDashboard />} />
                <Route path="firmalar" element={<AdminCompanies />} />
                <Route path="kategoriler" element={<AdminCategories />} />
                <Route path="sehirler" element={<AdminCities />} />
                <Route path="ice-aktar" element={<AdminImport />} />
                <Route path="temsilciler" element={<AdminReps />} />
                <Route path="adaylar" element={<AdminLeads />} />
                <Route path="satislar" element={<AdminSales />} />
                <Route path="odemeler" element={<AdminPayments />} />
                <Route path="uyelikler" element={<AdminMemberships />} />
                <Route path="komisyonlar" element={<AdminCommissions />} />
                <Route path="referanslar" element={<AdminReferrals />} />
                <Route path="raporlar" element={<AdminReports />} />
                <Route path="ayarlar" element={<AdminSettings />} />
                <Route path="denetim" element={<AdminAudit />} />
              </Route>

              {/* ===== Satış temsilcisi paneli (yalnızca temsilci rolü) ===== */}
              <Route path="temsilci" element={<RequireRole role="temsilci"><RepLayout /></RequireRole>}>
                <Route index element={<RepDashboard />} />
                <Route path="firmalar" element={<RepLeads />} />
                <Route path="uyelik" element={<RepMembershipSale />} />
                <Route path="satislarim" element={<RepMySales />} />
                {/* Eski bağlantılar korunur: yer imleri kırılmaz */}
                <Route path="adaylar" element={<Navigate to="/temsilci/firmalar" replace />} />
                <Route path="satislar" element={<Navigate to="/temsilci/satislarim" replace />} />
                <Route path="*" element={<Navigate to="/temsilci" replace />} />
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
          </BootGate>
        </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  );
}

/** Yetki hatasında gösterilecek ortak görünüm */
export function RoleError({ expected }: { expected: string }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>Erişim engellendi</h1>
        <p className="mb-14">Bu bölüm yalnızca <strong>{expected}</strong> rolüne açık.</p>
        <a className="btn btn--primary btn--block" href="/giris">
          Giriş sayfasına dön
        </a>
      </div>
    </div>
  );
}

export function AppError({ message }: { message: string }) {
  return (
    <div className="panel-content">
      <ErrorBanner message={message} />
    </div>
  );
}
