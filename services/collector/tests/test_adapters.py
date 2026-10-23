"""Adaptör testleri — sahte/yerel veriyle; dış servise istek YOK."""

import sys
import os
import threading

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from adapters import (
    CsvAdapter,
    FakeAdapter,
    PlacesAdapter,
    ScraperAdapter,
    SourceDisabledError,
    SourceError,
    build_places_payload,
)
from contract import SOURCE_PLACES, SearchRequest
from jobs import phone_key


def run(adapter, req, limit_seen=None):  # type: ignore[no-untyped-def]
    """Adaptörü senkron yürütür; progress kaydı tutar."""
    seen = []
    cands = adapter.search(req, progress=lambda d, t: seen.append((d, t)), cancel=threading.Event())
    return cands, seen


def req(**kw):  # type: ignore[no-untyped-def]
    base = {"il": "Afyonkarahisar", "ilce": "Merkez", "kategori": "Kasap", "limit": 5, "source": "x"}
    base.update(kw)
    return SearchRequest(**base)


# ---------- fake ----------
def test_fake_kaynak_sayiyi_asmaz():
    cands, _ = run(FakeAdapter(), req(limit=20))
    assert len(cands) == 6  # fake kaynak tavanı — sayı kuralı: uydurma yok
    assert all(c.source == "fake" for c in cands)


def test_fake_tam_yonetilebilir():
    cands, _ = run(FakeAdapter(), req(limit=2))
    assert len(cands) == 2


# ---------- csv ----------
CSV_CONTENT = (
    "Firma Adı;Telefon;Adres;Web Sitesi;Enlem;Boylam;Place ID\n"
    "A Kasap;05551112233;Merkez Cd.;https://a.example;38.75;30.52;p1\n"
    "B Kasap;05555556666;; ; ; ;\n"
)


def test_csv_icerik_yorumlanir():
    cands, _ = run(CsvAdapter(), req(sourceConfig={"content": CSV_CONTENT}))
    assert [c.name for c in cands] == ["A Kasap", "B Kasap"]
    assert cands[0].latitude == 38.75
    assert cands[1].address in (None, "")


def test_csv_bos_icerik_hata():
    with pytest.raises(SourceError):
        run(CsvAdapter(), req(sourceConfig={"content": " "}))


# ---------- places (yapı/yapılandırma) ----------
def test_places_payload_saf_kurulur():
    payload = build_places_payload(req(limit=15))
    assert payload["textQuery"] == "Kasap Merkez Afyonkarahisar"
    assert payload["regionCode"] == "TR"
    assert payload["pageSize"] == 15


def test_places_limit_1_20_kisitlanir():
    # Şema seviyesinda 1–20 dışı reddedilir
    import pydantic

    with pytest.raises(pydantic.ValidationError):
        SearchRequest(**{**req().__dict__, "limit": 99})
    with pytest.raises(pydantic.ValidationError):
        SearchRequest(**{**req().__dict__, "limit": 0})
    # Güvenlik katmanı: build_places_payload yine de kenetler
    over = SearchRequest.model_construct(il="Afyonkarahisar", ilce="Merkez", kategori="Kasap", limit=99, source="x")
    assert build_places_payload(over)["pageSize"] == 20
    zero = SearchRequest.model_construct(il="Afyonkarahisar", ilce="Merkez", kategori="Kasap", limit=0, source="x")
    assert build_places_payload(zero)["pageSize"] == 1


def test_places_anahtarsiz_etkilestimaz():
    import os

    os.environ.pop("GOOGLE_PLACES_API_KEY", None)
    adapter = PlacesAdapter(api_key="")
    with pytest.raises(SourceDisabledError):
        run(adapter, req())


def test_places_istek_uzaktan_yapilmaz_anahtarsiz():
    import os

    os.environ.pop("GOOGLE_PLACES_API_KEY", None)

    class ThrowingHTTP:
        def __enter__(self):  # pragma: no cover
            raise AssertionError("anahtar yokken HTTP çağrısı BAŞLATILMAMALI")

        def __exit__(self, *a):  # pragma: no cover
            return False

    adapter = PlacesAdapter(api_key=None, base_url="")
    with pytest.raises(SourceDisabledError):
        run(adapter, req())


# ---------- scraper: yasak katman ----------
def test_scraper_iceride_uyarilmayinca_engellenir():
    adapter = ScraperAdapter(app_env="development", enabled_flag="0")
    with pytest.raises(SourceDisabledError) as ei:
        run(adapter, req())
    assert "ToS" in str(ei.value)


def test_scraper_uretim_ortamindaher_zaman_engel():
    adapter = ScraperAdapter(app_env="production", enabled_flag="1")
    assert adapter.is_configured() is False
    with pytest.raises(SourceDisabledError):
        run(adapter, req())


# ---------- scraper canlı (O-6): uyum kurulumu + sahte alt süreç ----------
import sys as _sys
import io as _io

import adapters as adapters_module


SCRAPER_CSV_MIN = (
    "name,category,address,phone,phone_intl,website,lat,lng,place_id\n"
    "A Kasap,Kasap,Cd. 1,,05551112233,,38.75,30.52,ChIJ1\n"
    "B Kasap,Kasap,Cd. 2,05555556666,,,38.76,30.53,\n"
)


def _gates_env(monkeypatch, repo: str) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("COLLECTOR_ENABLE_SCRAPER", "1")
    monkeypatch.setenv("COLLECTOR_SCRAPER_PYTHON", _sys.executable)
    monkeypatch.setenv("COLLECTOR_SCRAPER_REPO", repo)
    for var in ("TLS_VERIFY", "COLLECTOR_API_KEY"):
        monkeypatch.delenv(var, raising=False)


def test_scraper_saf_komut_uyum_bayraklarini_kilitlemistir():
    cmd = adapters_module.ScraperAdapter.build_command(
        _sys.executable, "/repo", "Kasap in Merkez, Afyonkarahisar", "/x/businesses.csv", "/x/state.sqlite"
    )
    assert cmd[1] == "/repo/runner_compliant.py"
    assert cmd[2] == "scrape"
    assert cmd[cmd.index("--query") + 1] == "Kasap in Merkez, Afyonkarahisar"
    assert cmd[cmd.index("--out") + 1] == "/x/businesses.csv"
    assert cmd[cmd.index("--db") + 1] == "/x/state.sqlite"
    for flag in ("--direct", "--no-details", "--no-emails"):
        assert flag in cmd
    assert cmd[cmd.index("--workers") + 1] == "1"
    assert cmd[cmd.index("--max-pages") + 1] == "1"
    assert cmd[cmd.index("--lang") + 1] == "tr"
    # Genişletme/rotasyon YASAK: grid, proxy dosyası, rotate yok
    assert "--all" not in cmd
    assert "--proxy-file" not in cmd
    assert "--rotate-per-request" not in cmd


def test_scraper_env_tsl_verify_zorunlu_true(monkeypatch):
    """Depo varsayılanı false olsa da alt süreçte TLS doğrulaması AÇIK zorunludur."""
    monkeypatch.setenv("TLS_VERIFY", "false")
    assert adapters_module.ScraperAdapter.subprocess_env()["TLS_VERIFY"] == "true"


def test_scraper_eksik_yapiilandirma_durus_listelenir():
    for var in ("APP_ENV", "COLLECTOR_ENABLE_SCRAPER", "COLLECTOR_SCRAPER_PYTHON", "COLLECTOR_SCRAPER_REPO"):
        os.environ.pop(var, None)
    adapter = adapters_module.ScraperAdapter()
    assert adapter.is_configured() is False
    gates = adapter.missing_gates()
    assert any("COLLECTOR_ENABLE_SCRAPER" in g for g in gates)
    assert any("COLLECTOR_SCRAPER_PYTHON" in g for g in gates)
    assert any("COLLECTOR_SCRAPER_REPO" in g for g in gates)
    with pytest.raises(SourceDisabledError) as ei:
        run(adapter, req())
    assert "ToS" in str(ei.value)


def test_scraper_repo_runner_yoksa_kapali(tmp_path):
    repo = tmp_path / "bos"; repo.mkdir()
    adapter = adapters_module.ScraperAdapter(
        app_env="development", enabled_flag="1", python_exe=_sys.executable, repo_dir=str(repo)
    )
    assert adapter.is_configured() is False
    assert any("runner_compliant.py" in g for g in adapter.missing_gates())


class _FakeScraperProc:
    """subprocess.Popen yerine geçen kukla 'scraper süreci'."""

    poll_calls = 0
    returncode = None

    def __init__(self, cmd, cwd=None, stdout=None, stderr=None, text=False, encoding=None, errors=None, env=None):
        self.cmd = cmd
        self.cwd = cwd
        self.env = env or {}
        self.stdout = _io.StringIO("")
        self.stderr = _io.StringIO("")
        # Son örneği hem taban hem somut sınıfa kaydet (test erişimi için)
        _FakeScraperProc.son_kayit = self  # noqa: PLW0210
        self._out_csv = cmd[cmd.index("--out") + 1]
        self._write_output()

    def _write_output(self) -> None:  # subclass bunu belirler
        pass

    def poll(self):
        self.poll_calls += 1
        if self.poll_calls >= 2:
            self.returncode = 0
        return self.returncode

    def wait(self, timeout=None):  # noqa: ARG002
        return self.returncode

    def terminate(self):
        self.terminate_called = True

    def kill(self):
        self.terminate_called = True


class _SuccessProc(_FakeScraperProc):
    def _write_output(self):
        with open(self._out_csv, "w", encoding="utf-8") as fh:
            fh.write(SCRAPER_CSV_MIN)


class _FailProc(_FakeScraperProc):
    def _write_output(self):
        pass

    def poll(self):
        self.poll_calls += 1
        if self.poll_calls >= 2:
            self.returncode = 2
        return self.returncode


class _SlowProc(_FakeScraperProc):
    def poll(self):
        return None  # hiç bitmez


def _with_fake_popen(monkeypatch, proc_cls):  # type: ignore[no-untyped-def]
    monkeypatch.setattr(adapters_module.subprocess, "Popen", proc_cls)


def test_scraper_canli_yol_sahte_surecie_parcalar(tmp_path, monkeypatch):
    repo = tmp_path / "repo"; repo.mkdir()
    (repo / "runner_compliant.py").write_text("# stub runner", encoding="utf-8")
    _gates_env(monkeypatch, str(repo))
    _with_fake_popen(monkeypatch, _SuccessProc)

    adapter = adapters_module.ScraperAdapter(max_seconds=10)
    adapter._POLL_INTERVAL = 0.01
    cands, _ = run(adapter, req())
    proc = _FakeScraperProc.son_kayit
    # Komut: uyumlu bayraklar + TLS doğrulaması zorunlu açık + repo cwd
    assert proc.cmd[proc.cmd.index("--query") + 1] == "Kasap in Merkez, Afyonkarahisar"
    assert "--direct" in proc.cmd and "--no-details" in proc.cmd
    assert proc.env.get("TLS_VERIFY") == "true"
    assert proc.cwd.endswith("repo")
    # CSV → 2 aday; sınıf eşleştirmesi ortak işlevden gelir
    assert [c.name for c in cands] == ["A Kasap", "B Kasap"]
    assert all(c.source == "maps-scraper" for c in cands)
    assert cands[0].phone == "05551112233"
    assert cands[1].latitude == 38.76
    assert any("place_id yok" in w for w in (cands[1].warnings or []))


def test_scraper_limiti_asan_fazlalik_atilir(tmp_path, monkeypatch):
    repo = tmp_path / "repo"; repo.mkdir()
    (repo / "runner_compliant.py").write_text("# stub", encoding="utf-8")
    _gates_env(monkeypatch, str(repo))
    _with_fake_popen(monkeypatch, _SuccessProc)

    adapter = adapters_module.ScraperAdapter(max_seconds=10)
    adapter._POLL_INTERVAL = 0.01
    cands, _ = run(adapter, req(limit=1))
    assert [c.name for c in cands] == ["A Kasap"]  # fazlası atıldı — eklenmez


def test_scraper_surec_basarisizsa_sahte_uretmez(tmp_path, monkeypatch):
    repo = tmp_path / "repo"; repo.mkdir()
    (repo / "runner_compliant.py").write_text("# stub", encoding="utf-8")
    _gates_env(monkeypatch, str(repo))
    _with_fake_popen(monkeypatch, _FailProc)

    adapter = adapters_module.ScraperAdapter(max_seconds=10)
    adapter._POLL_INTERVAL = 0.01
    with pytest.raises(SourceError) as ei:
        run(adapter, req())
    assert "çıktı kodu 2" in str(ei.value) or "çıkış kodu 2" in str(ei.value)
    assert "sahte aday üretilmez" in str(ei.value)


def test_scraper_zaman_asiminda_surec_durdurulur(tmp_path, monkeypatch):
    repo = tmp_path / "repo"; repo.mkdir()
    (repo / "runner_compliant.py").write_text("# stub", encoding="utf-8")
    _gates_env(monkeypatch, str(repo))
    _with_fake_popen(monkeypatch, _SlowProc)

    adapter = adapters_module.ScraperAdapter(max_seconds=0.05)
    adapter._POLL_INTERVAL = 0.01
    with pytest.raises(SourceError) as ei:
        run(adapter, req())
    assert "zaman aşımı" in str(ei.value)
    assert _FakeScraperProc.son_kayit.terminate_called is True


def test_scraper_iptal_sureci_keser(tmp_path, monkeypatch):
    repo = tmp_path / "repo"; repo.mkdir()
    (repo / "runner_compliant.py").write_text("# stub", encoding="utf-8")
    _gates_env(monkeypatch, str(repo))
    _with_fake_popen(monkeypatch, _SlowProc)

    adapter = adapters_module.ScraperAdapter(max_seconds=30)
    adapter._POLL_INTERVAL = 0.01
    cancel = threading.Event()
    threading.Timer(0.05, cancel.set).start()
    with pytest.raises(SourceError) as ei:
        adapter.search(req(), progress=lambda d, t: None, cancel=cancel)
    assert "iptal" in str(ei.value).lower()


def test_phone_key_tr_normalizasyon():
    assert phone_key("+90 555 111 22 33") == "5551112233"
    assert phone_key("0555 111 22 33") == "5551112233"
    assert phone_key("00905551112233") == "5551112233"
    assert phone_key(None) == ""
