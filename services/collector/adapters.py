"""
Veri kaynağı adaptörleri — arayüzden bağımsız, değiştirilebilir kaynaklar.

SÖZLEŞME: her adaptör `search(req, progress, cancel)` uygular; uzun işi HTTP
isteği açık tutmadan yürütür (job katmanı ayrı sorgular). Adaptörler AĞ
çağrısını yalnız kendi kaynağı için yapar; Firma Rehberi DB'sine ASLA yazmaz.

Kaynak politikası (bkz. docs/SCRAPER-DEGERLENDIRMESI.md):
  - google-places : resmî Places API (New) — anahtar gerektirir (sunucu env).
  - csv           : kullanıcı tarafından sağlanan dosya/içerik (izinli kaynak).
  - fake          : test/demoda sahte veri — ağ erişimi YOK.
  - maps-scraper  : CANLI ama çift kapalı — üretimde ASLA; yalnız yerel
    geliştirmede APP_ENV != production VE COLLECTOR_ENABLE_SCRAPER=1 VE
    COLLECTOR_SCRAPER_PYTHON/REPO tanımlıyken çalışır (O-6).
    Alt süreç runner_compliant.py: TLS doğrulaması açık zorunlu, consent-
    bypass çerezi gönderilmez, --direct (proxy/rotation yok), tek işçi,
    tek sayfa, tek sorgu; fazla sonuç limit'e kesilir, uydurma yok.
  - maps-scraper-csv : çevrimdışı dosya (canlı istek yok).
"""

import csv
import io
import os
import shutil
import subprocess
import tempfile
import threading
import time
from typing import Callable, Dict, List, Optional, Tuple

import httpx

from contract import (
    SOURCE_CSV,
    SOURCE_FAKE,
    SOURCE_PLACES,
    SOURCE_SCRAPER,
    SOURCE_SCRAPER_CSV,
    Candidate,
    SearchRequest,
)

ProgressFn = Callable[[int, int], None]


class SourceError(Exception):
    """Kaynağın kendisinden gelen/ona ait hata — iş failed durumuna taşınır."""


class SourceDisabledError(SourceError):
    """Kaynak bilinçli kapatılmış (örn. scraper üretimde)."""


class BaseSourceAdapter:
    name: str = "base"
    requires_config: bool = False

    def is_configured(self) -> bool:
        return True

    def search(
        self,
        req: SearchRequest,
        progress: ProgressFn,
        cancel: threading.Event,
    ) -> List[Candidate]:
        raise NotImplementedError


def check_cancel(cancel: threading.Event) -> None:
    if cancel.is_set():
        raise SourceError("İş iptal edildi.")


def build_places_payload(req: SearchRequest) -> dict:
    """Places API (New) Text Search gövdesi — saf, test edilebilir."""
    text_query = " ".join(part for part in [req.kategori, req.ilce, req.il] if part)
    return {
        "textQuery": text_query,
        "regionCode": "TR",
        "languageCode": "tr",
        "pageSize": min(max(req.limit, 1), 20),
    }


PLACES_FIELD_MASK = (
    "places.id,places.displayName,places.formattedAddress,places.location,"
    "places.internationalPhoneNumber,places.websiteUri"
)


class PlacesAdapter(BaseSourceAdapter):
    """Resmî Google Places API (New) — ücretli; anahtar sunucu env'inde."""

    name = SOURCE_PLACES
    requires_config = True

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None) -> None:
        self._api_key = api_key if api_key is not None else os.environ.get("GOOGLE_PLACES_API_KEY")
        self._base_url = base_url or "https://places.googleapis.com/v1/places:searchText"

    def is_configured(self) -> bool:
        return bool(self._api_key)

    def search(self, req: SearchRequest, progress: ProgressFn, cancel: threading.Event) -> List[Candidate]:
        if not self.is_configured():
            raise SourceDisabledError(
                "GOOGLE_PLACES_API_KEY yapılandırılmamış — Places araması yapılamaz."
            )
        payload = build_places_payload(req)
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(
                self._base_url,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": self._api_key or "",
                    "X-Goog-FieldMask": PLACES_FIELD_MASK,
                },
            )
        if resp.status_code != 200:
            raise SourceError(f"Places isteği başarısız (HTTP {resp.status_code}).")
        data = resp.json()
        out: List[Candidate] = []
        for place in (data.get("places") or [])[: req.limit]:
            check_cancel(cancel)
            loc = place.get("location") or {}
            lat, lng = loc.get("latitude"), loc.get("longitude")
            out.append(
                Candidate(
                    name=(place.get("displayName") or {}).get("text", ""),
                    source=self.name,
                    address=place.get("formattedAddress"),
                    phone=place.get("internationalPhoneNumber"),
                    website=place.get("websiteUri"),
                    latitude=lat if isinstance(lat, float) else None,
                    longitude=lng if isinstance(lng, float) else None,
                    placeId=place.get("id"),
                )
            )
            progress(len(out), req.limit)
        return out


class CsvAdapter(BaseSourceAdapter):
    """Kullanıcı tarafından sağlanan CSV/TSV içerik — izinli kaynak.

    Beklenen sütun başlıkları (baylık sıra önemli değil):
    Firma Adı, Telefon, Adres, Web Sitesi, Enlem, Boylam, Place ID
    """

    name = SOURCE_CSV

    def search(self, req: SearchRequest, progress: ProgressFn, cancel: threading.Event) -> List[Candidate]:
        content = str(req.sourceConfig.get("content") or "")
        if not content.strip():
            raise SourceError("CSV içeriği boş — sourceConfig.content gerekli.")
        reader = csv.DictReader(io.StringIO(content), delimiter=";" if ";" in content.splitlines()[0] else ",")
        out: List[Candidate] = []

        def opt(row: dict, key: str) -> Optional[str]:
            value = (row.get(key) or "").strip()
            return value or None

        def opt_float(row: dict, key: str) -> Optional[float]:
            value = (row.get(key) or "").strip()
            try:
                return float(value.replace(",", ".")) if value else None
            except ValueError:
                return None

        for row in reader:
            check_cancel(cancel)
            name = opt(row, "Firma Adı") or opt(row, "name") or ""
            if not name:
                continue
            out.append(
                Candidate(
                    name=name,
                    source=self.name,
                    phone=opt(row, "Telefon"),
                    address=opt(row, "Adres"),
                    website=opt(row, "Web Sitesi"),
                    latitude=opt_float(row, "Enlem"),
                    longitude=opt_float(row, "Boylam"),
                    placeId=opt(row, "Place ID"),
                )
            )
            progress(len(out), len(reader.fieldnames or []))
        return out


class MapsScraperCsvAdapter(BaseSourceAdapter):
    """
    maps-scraper CSV dosyası → Candidate (OFFLINE — canlı istek YOK).

    O-2/O-3 analizinde doğrulanan scraper çıktısı (`businesses.csv`) sözleşmeye
    döner. Sözleşme eşlemesi:
        name→name, (phone_intl|phone)→phone, address→address,
        website→website (boş→None), lat/lng→latitude/longitude,
        place_id→placeId (boşsa google_maps_url içindeki ?cid=...) —
    `category` sütunu BİLDİRİLMEDEN atılır: birden fazla kategori içerebilir
    ("Kasap,Türk restoranı") ve ana kategori tahmini yasaktır — kategori
    bağlantısı yalnız yönetim panelinde kullanıcı seçimiyle, gerçek DB
    kimliği üzerinden yapılır (importLib kategori kilidi).

    Güvenceler: bozuk/eksik satır işi çökertmez (atlanır + sayılır + log'a
    düşer); tüm satırlar bozuksa SourceError; lat/lng 0/boş/geçersiz →
    koordinat None ("0,0" gerçek konum sayılmaz); cid yedekli placeId.
    """

    name = SOURCE_SCRAPER_CSV

    # --- saf yardımcılar (test edilebilir) --------------------------------
    @staticmethod
    def parse_coord(raw: Optional[str]) -> Optional[float]:
        """0/boş/geçersiz → None; boşluk ve virgül ondalığı tolere edilir."""
        value = (raw or "").strip().replace(",", ".")
        if not value:
            return None
        try:
            number = float(value)
        except ValueError:
            return None
        return number if number != 0.0 else None

    @staticmethod
    def parse_place_id(row: Optional[dict]) -> Optional[str]:
        """place_id boşsa google_maps_url'ten `?cid=<decimal>` çıkarılır."""
        pid = ((row or {}).get("place_id") or "").strip()
        if pid:
            return pid
        url = ((row or {}).get("google_maps_url") or "").strip()
        if "cid=" in url:
            return url.split("cid=", 1)[1].split("&", 1)[0].strip() or None
        return None

    # --- ortak eşleme (ScraperAdapter da kullanır) -------------------------
    @staticmethod
    def map_rows(
        content: str,
        source_name: str,
        progress: ProgressFn,
        cancel: threading.Event,
    ) -> Tuple[List[Candidate], int]:
        """Scraper-CSV içeriğini Candidate listesine çevirir.

        Dönüş: (adaylar, atlanan bozuk satır sayısı). Bu işlev ScraperAdapter
        (canlı alt süreç çıktısı) ve MapsScraperCsvAdapter (kullanıcı dosyası)
        tarafından PAYLAŞILIR — saf bölüm test edilebilir.
        """
        delimiter: str = ","
        if content.splitlines():
            head = content.splitlines()[0]
            if ";" in head:
                delimiter = ";"
            elif "\t" in head:
                delimiter = "\t"
        reader = csv.DictReader(io.StringIO(content), delimiter=delimiter)

        out: List[Candidate] = []
        rejected_rows = 0
        for row in reader:
            check_cancel(cancel)
            try:
                name = (row.get("name") or "").strip()
                if not name:
                    rejected_rows += 1
                    continue
                lat = MapsScraperCsvAdapter.parse_coord(row.get("lat"))
                lng = MapsScraperCsvAdapter.parse_coord(row.get("lng"))
                # Koordinat çift halde taşınır: ikisi de geçerliyse yaz, biri
                # 0/boş/geçersizse İKİSİ None — yarım koordinat üretilmez
                cand = Candidate(
                    name=name,
                    source=source_name,
                    phone=((row.get("phone_intl") or "").strip() or (row.get("phone") or "").strip()) or None,
                    address=(row.get("address") or "").strip() or None,
                    website=(row.get("website") or "").strip() or None,
                    latitude=lat if (lat is not None and lng is not None) else None,
                    longitude=lng if (lat is not None and lng is not None) else None,
                    placeId=MapsScraperCsvAdapter.parse_place_id(row),
                )
                if not cand.placeId:
                    cand.warnings.append("place_id yok (cid'den de bulunamadı)")
                out.append(cand)
            except Exception:  # bozuk satır işi çökertmez
                rejected_rows += 1
                continue
            progress(len(out), len(reader.fieldnames or []))
        return out, rejected_rows

    # --- ana akış ----------------------------------------------------------
    def search(self, req: SearchRequest, progress: ProgressFn, cancel: threading.Event) -> List[Candidate]:
        content = str(req.sourceConfig.get("content") or "")
        path = str(req.sourceConfig.get("path") or "")
        if path and not content:
            try:
                content = open(path, encoding="utf-8", errors="replace").read()
            except OSError as exc:
                raise SourceError(f"CSV dosyası okunamadı: {exc}") from exc
        if not content.strip():
            raise SourceError("CSV içeriği boş — sourceConfig.content (veya path) gerekli.")

        out, rejected_rows = self.map_rows(content, self.name, progress, cancel)

        if rejected_rows:
            print(f"[maps-scraper-csv] {rejected_rows} bozuk/eksik satır atlandı; {len(out)} geçerli aday üretildi.")
        if not out:
            raise SourceError(
                f"CSV'de geçerli satır yok ({rejected_rows} bozuk satır atlandı) — sütun başlıkları scraper çıktısıyla aynı mı? (name, address, phone, …)"
            )
        return out


class FakeAdapter(BaseSourceAdapter):
    """Test/demo kaynağı — ağ erişimi YOK; deterministik sahte adaylar üretir."""

    name = SOURCE_FAKE

    def search(self, req: SearchRequest, progress: ProgressFn, cancel: threading.Event) -> List[Candidate]:
        total = min(req.limit, 6)  # sayı kuralı: bulunmayanı uydurma
        out: List[Candidate] = []
        for i in range(total):
            check_cancel(cancel)
            time.sleep(0.02)
            cand = Candidate(
                name=f"{req.kategori} Örnek {i + 1} ({req.ilce})",
                source=self.name,
                phone="05551112233" if i == 1 else f"05550000{i:02d}",
                address=None if i == 2 else f"{req.ilce} Örnek Cad. No:{i + 1}",
                website=None if i % 2 else f"https://ornek{i + 1}.example",
                latitude=38.75 + i / 1000 if i != 3 else None,
                longitude=30.52 + i / 1000 if i != 3 else None,
                placeId=f"fake-{i + 1}",
            )
            out.append(cand)
            progress(len(out), total)
        return out


class ScraperAdapter(BaseSourceAdapter):
    """
    CANLI maps-scraper kaynağı — alt süreç CSV uyducu entegrasyon (O-6).

    KORUMA ÇERÇEVESİ (bkz. docs/SCRAPER-DEGERLENDIRMESI.md ve O-3):
      - Repo README'si Google'ın belgelenmemiş iç uç noktalarını kullandığını
        ve ToS ihlali olduğunu söylüyor → bu kaynak ÜRETİMDE ASLA AÇILMAZ.
      - TLS sertifika doğrulaması ZORUNLU AÇIK (alt süreç env'ine TLS_VERIFY=
        "true" yazılır — deponun varsayılan false değeri geçersiz kılınır).
      - Consent-bypass çerezleri GÖNDERİLMEZ (runner_compliant.py
        CONSENT_COOKIES sabitini boşaltır; onay duvarı aşmaya çalışılmaz,
        engellenirse durum dürüstçe raporlanır).
      - Grid/toplu/derin tarama YOK: --direct (proxy/rotation yok), tek işçi,
        tek sayfa, --no-details, --no-emails; tek sorgu tek çağrı.
      - Sayı kuralı: dönen aday `limit`'e kesilir — fazlası ATILIR, eksik
        uydurulmaz; çıktı yoksa/bozuksa SourceError (sahte aday YOK).
      - DB'ye yazma yok: adaylar iş belleğinde kalır; kayıt kullanıcı onayıyla
        mevcut runImport akışında.

    Yapılandırma (TAMAMI gerekli; eksikse kaynak kapalı sayılır ve eksikler
    mesajda tek tek listelenir):
      APP_ENV != "production"
      COLLECTOR_ENABLE_SCRAPER=1
      COLLECTOR_SCRAPER_PYTHON : scraper venv python (py>=3.11, curl_cffi'li)
      COLLECTOR_SCRAPER_REPO   : google-maps-scraper repo kökü (runner_compliant.py içeren)
      COLLECTOR_SCRAPER_MAX_SECONDS : opsiyonel (varsayılan 90; iş 120 sn'de iptal)
    """

    name = SOURCE_SCRAPER
    # İptal kontrolü aralığı (saniye) — testler daraltabilir.
    _POLL_INTERVAL = 0.25

    def __init__(
        self,
        app_env: Optional[str] = None,
        enabled_flag: Optional[str] = None,
        python_exe: Optional[str] = None,
        repo_dir: Optional[str] = None,
        max_seconds: Optional[float] = None,
    ) -> None:
        self._app_env = app_env if app_env is not None else os.environ.get("APP_ENV", "development")
        self._flag = enabled_flag if enabled_flag is not None else os.environ.get("COLLECTOR_ENABLE_SCRAPER", "0")
        self._python = python_exe if python_exe is not None else os.environ.get("COLLECTOR_SCRAPER_PYTHON", "")
        self._repo = repo_dir if repo_dir is not None else os.environ.get("COLLECTOR_SCRAPER_REPO", "")
        self._max_seconds = max_seconds if max_seconds is not None else float(
            os.environ.get("COLLECTOR_SCRAPER_MAX_SECONDS", "90")
        )

    # ---------- yapılandırma kapısı (eksikleri dürüst listele) -------------
    def missing_gates(self) -> List[str]:
        missing: List[str] = []
        if self._app_env == "production":
            missing.append("APP_ENV üretim — canlı scraper üretimde yasak (ToS)")
        if self._flag != "1":
            missing.append("COLLECTOR_ENABLE_SCRAPER=1")
        if not self._python:
            missing.append("COLLECTOR_SCRAPER_PYTHON")
        elif not os.path.isfile(self._python):
            missing.append(f"COLLECTOR_SCRAPER_PYTHON bulunamadı: {self._python}")
        if not self._repo:
            missing.append("COLLECTOR_SCRAPER_REPO")
        elif not os.path.isfile(os.path.join(self._repo, "runner_compliant.py")):
            missing.append(f"COLLECTOR_SCRAPER_REPO'da runner_compliant.py yok: {self._repo}")
        return missing

    def is_configured(self) -> bool:
        return not self.missing_gates()

    def _disabled_message(self) -> str:
        return (
            "maps-scraper canlı kaynağı kapalı (Google ToS riski — bkz. "
            "docs/SCRAPER-DEGERLENDIRMESI.md). Yalnız yerel geliştirmede, "
            f"şu koşulların TAMAMI sağlandığında çalışır: {'; '.join(self.missing_gates())}"
        )

    # ---------- saf kurulum ------------------------------------------------
    @staticmethod
    def build_query(req: SearchRequest) -> str:
        """Google sorgusu — panel seçiminden gelir, tahmin yok: `kategori in ilçe, il`."""
        return f"{req.kategori} in {req.ilce}, {req.il}"

    @staticmethod
    def build_command(python_exe: str, repo_dir: str, query: str, out_csv: str, state_db: str) -> List[str]:
        """UYUM KOMUTU — koruma bayrakları sabit (grid/toplu/rotation YOK).

        state_db: iş başına YENİ geçici sqlite — scraper'tın kalıcı durumunda
        sorgu "tamamlandı" işaretliyse 'Nothing pending' ile boş dönmesine
        karşı her iş kendi durum dosyasıyla çalışır (--fresh ile silme YOK).
        """
        runner = os.path.join(repo_dir, "runner_compliant.py")
        return [
            python_exe,
            runner,
            "scrape",
            "--query", query,
            "--out", out_csv,
            "--db", state_db,
            "--direct",            # proxy/rotation yok
            "--workers", "1",      # tek işçi
            "--max-pages", "1",    # tek sayfa (derin tarama yok)
            "--no-details",        # yer detay takibi yok
            "--no-emails",         # e-posta çıkarımı yok
            "--lang", "tr",
            "--gl", "tr",
        ]

    @staticmethod
    def subprocess_env() -> Dict[str, str]:
        """Alt süreç ortamı — TLS_VERIFY=true ZORUNLU (depo varsayılanı override edilir)."""
        env = dict(os.environ)
        env["TLS_VERIFY"] = "true"
        return env

    # ---------- koşucu -----------------------------------------------------
    def _run_subprocess(
        self, cmd: List[str], cwd: str, cancel: threading.Event
    ) -> Tuple[int, str]:
        """Süreci başlatır; iptali poll eder, zaman aşımında öldürür.

        Dönüş: (çıkış kodu, birleşik stdout/stderr metni). Dosya okuma arayana ait.
        """
        started = time.monotonic()
        try:
            proc = subprocess.Popen(  # noqa: S603 — komut sabit kurulumdan gelir
                cmd,
                cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=self.subprocess_env(),
            )
        except OSError as exc:
            raise SourceError(f"Scraper süreci başlatılamadı: {exc}") from exc

        try:
            while True:
                check_cancel(cancel)
                rc = proc.poll()
                if rc is not None:
                    return rc, (proc.stdout.read() if proc.stdout else "")
                if time.monotonic() - started > self._max_seconds:
                    proc.terminate()
                    try:
                        proc.wait(timeout=5)
                    except subprocess.TimeoutExpired:  # pragma: no cover
                        proc.kill()
                        proc.wait(timeout=5)
                    return -1, f"[zaman aşımı: {self._max_seconds}s içinde bitmedi]"
                time.sleep(self._POLL_INTERVAL)
        finally:
            if proc.stdout:
                proc.stdout.close()

    def search(self, req: SearchRequest, progress: ProgressFn, cancel: threading.Event) -> List[Candidate]:
        missing = self.missing_gates()
        if missing:
            raise SourceDisabledError(self._disabled_message())

        work = tempfile.mkdtemp(prefix="collector-scraper-")
        try:
            out_csv = os.path.join(work, "businesses.csv")
            state_db = os.path.join(work, "state.sqlite")
            query = self.build_query(req)
            cmd = self.build_command(self._python, self._repo, query, out_csv, state_db)
            rc, output = self._run_subprocess(cmd, self._repo, cancel)
            if cancel.is_set():
                raise SourceError("İş iptal edildi.")
            if rc != 0:
                tail = (output or "").strip()[-800:]
                raise SourceError(
                    f"Scraper süreci başarısız (çıkış kodu {rc}). Google tarafında "
                    f"engel/duvar olabilir — sahte aday üretilmez. Çıktı:\n{tail}"
                )
            if not os.path.isfile(out_csv):
                raise SourceError(
                    "Scraper süreci sıfır çıktı döndürdü (businesses.csv oluşmadı). "
                    f"Son çıktı:\n{(output or '').strip()[-800:]}"
                )
            with open(out_csv, encoding="utf-8", errors="replace") as fh:
                content = fh.read()
            cands, rejected = MapsScraperCsvAdapter.map_rows(content, self.name, progress, cancel)
            if rejected:
                print(f"[maps-scraper] {rejected} bozuk satır atlandı; {len(cands)} geçerli.")
            if not cands:
                raise SourceError(
                    "Google arama sonuç döndürmedi (CSV boş). Sorgu/kategori geçerliyse "
                    f"Google tarafında engel olabilir — sahte aday üretilmez. Çıktı:\n{(output or '').strip()[-500:]}"
                )
            # Sayı kuralı: istenenin üzerindeki fazlalık ATILIR, eklenmez.
            return cands[: req.limit]
        finally:
            shutil.rmtree(work, ignore_errors=True)


def default_registry(app_env: Optional[str] = None) -> Dict[str, BaseSourceAdapter]:
    """Üretim kayıt defteri — scraper kapalı gelir; dokümantasyon: README."""
    return {
        SOURCE_PLACES: PlacesAdapter(),
        SOURCE_CSV: CsvAdapter(),
        SOURCE_FAKE: FakeAdapter(),
        SOURCE_SCRAPER: ScraperAdapter(app_env=app_env),
        SOURCE_SCRAPER_CSV: MapsScraperCsvAdapter(),
    }
