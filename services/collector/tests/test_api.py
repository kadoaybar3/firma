"""API katmanı testleri — TestClient ile; sahte veri, ağ YOK, yetkilendirme dahil."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

import main as app_module
from tests.conftest import wait_finished


@pytest.fixture
def client(monkeypatch) -> TestClient:
    """Sahte kayıt defteri + anahtarlı yetkilendirme."""
    from adapters import BaseSourceAdapter, FakeAdapter, ScraperAdapter
    from contract import Candidate
    from jobs import JobStore

    class Quick(BaseSourceAdapter):
        name = "quick"

        def search(self, req, progress, cancel):  # type: ignore[no-untyped-def]
            out = [Candidate(name="Hızlı A", source=self.name, phone="05551112233", address="Adres 1")]
            progress(1, 1)
            return out

        def is_configured(self) -> bool:
            return True

    monkeypatch.setattr(app_module, "registry", {"quick": Quick(), "fake": FakeAdapter(), "maps-scraper": ScraperAdapter(app_env="development", enabled_flag="0")})
    monkeypatch.setattr(app_module, "store", JobStore(app_module.registry, timeout_seconds=5))
    monkeypatch.setenv("COLLECTOR_API_KEY", "gizli-anahtar-test")
    return TestClient(app_module.app)


def auth(client: TestClient) -> dict:  # type: ignore[no-untyped-def]
    return {"x-collector-key": "gizli-anahtar-test"}


def payload(**over):  # type: ignore[no-untyped-def]
    body = {"il": "Afyonkarahisar", "ilce": "Merkez", "kategori": "Kasap", "limit": 5, "source": "quick"}
    body.update(over)
    return body


# ---------- sağlık ----------
def test_health_anahtarli(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert "quick" in body["adapters"]
    assert body["scraperEnabled"] is False


# ---------- yetkilendirme ----------
def test_anahtarsiz_istek_401(client):
    assert client.get("/jobs/x").status_code == 401
    assert client.get("/jobs/x").json()["detail"]


def test_yanlis_anahtar_401(client):
    resp = client.get("/jobs/x", headers={"x-collector-key": "yanlis"})
    assert resp.status_code == 401


def test_health_yetkilendirmesiz_acik(client):
    assert client.get("/health").status_code == 200  # sağlık denetimi anahtarsız


def test_anahtarsiz_yerel_istek_izinli(monkeypatch):
    """COLLECTOR_API_KEY yoksa geri döngü istekleri kabul edilir (geliştirme)."""
    from adapters import FakeAdapter
    from jobs import JobStore

    monkeypatch.delenv("COLLECTOR_API_KEY", raising=False)
    monkeypatch.setattr(app_module, "registry", {"fake": FakeAdapter()})
    monkeypatch.setattr(app_module, "store", JobStore(app_module.registry))
    c = TestClient(app_module.app, client=("127.0.0.1", 50000))
    assert c.get("/health").status_code == 200
    from contract import SearchRequest

    resp = c.post("/jobs", json=SearchRequest(il="Konya", ilce="Meram", kategori="Fırıncı", source="fake").model_dump())
    assert resp.status_code == 201
    # Uzak host reddedilir
    c2 = TestClient(app_module.app, client=("203.0.113.7", 50000))
    assert c2.get("/jobs/x").status_code == 401


# ---------- iş yaşam döngüsü ----------
def test_is_olustur_takip_et_adaylari_al(client):
    created = client.post("/jobs", json=payload(), headers=auth(client))
    assert created.status_code == 201
    job_id = created.json()["jobId"]

    status = client.get(f"/jobs/{job_id}", headers=auth(client))
    assert status.status_code == 200
    body = status.json()
    assert body["jobId"] == job_id
    assert body["source"] == "quick"
    assert body["state"] in {"queued", "running", "done"}

    # bitmesini bekle
    wait_finished(app_module.store, job_id)
    cands = client.get(f"/jobs/{job_id}/candidates", headers=auth(client)).json()
    assert cands["state"] == "done"
    assert len(cands["candidates"]) == 1
    assert cands["candidates"][0]["name"] == "Hızlı A"


def test_ayni_parametrelerle_ikinci_is_409(client):
    first = client.post("/jobs", json=payload(), headers=auth(client))
    assert first.status_code == 201
    wait_finished(app_module.store, first.json()["jobId"])  # bitebilir — sonra tekrar deneme
    second = client.post("/jobs", json=payload(), headers=auth(client))
    assert second.status_code in {201, 409}  # bitmişse yeni iş açılır


def test_ayni_parametrelerle_ikinci_is_409_calisirken(client, monkeypatch):
    """Aktif iş sürerken tekrar istek → 409 + mevcut iş kimliği."""
    import threading
    import time

    from adapters import BaseSourceAdapter
    from contract import Candidate
    from jobs import JobStore

    class Slow(BaseSourceAdapter):
        name = "slow"

        def search(self, req, progress, cancel):  # type: ignore[no-untyped-def]
            time.sleep(0.2)
            progress(1, 1)
            return [Candidate(name="Yavaş A", source=self.name, phone="05559998877", address="Adres")]

    monkeypatch.setattr(app_module, "registry", {"slow": Slow()})
    monkeypatch.setattr(app_module, "store", JobStore(app_module.registry, timeout_seconds=5))

    first = client.post("/jobs", json=payload(source="slow"), headers=auth(client))
    assert first.status_code == 201
    second = client.post("/jobs", json=payload(source="slow"), headers=auth(client))
    assert second.status_code == 409
    assert second.json()["jobId"] == first.json()["jobId"]
    wait_finished(app_module.store, first.json()["jobId"])


def test_limit_dogrulamasi_422(client):
    resp = client.post("/jobs", json=payload(limit=50), headers=auth(client))
    assert resp.status_code == 422  # 1–20 dışı reddedilir


def test_bilinmeyen_kaynak_400(client):
    resp = client.post("/jobs", json=payload(source="kurbağa"), headers=auth(client))
    assert resp.status_code == 400


def test_yapilandirilmamis_kaynak_400_ve_durus_mesaji(client):
    resp = client.post("/jobs", json=payload(source="maps-scraper"), headers=auth(client))
    assert resp.status_code == 400
    assert "ToS" in resp.json()["detail"]["message"]


def test_scraper_400_mesaji_eksikleri_sayar(client):
    """Kapalı canlı kaynak 400 mesajında 'ToS' + eksik koşullar listelenir."""
    resp = client.post("/jobs", json=payload(source="maps-scraper"), headers=auth(client))
    assert resp.status_code == 400
    message = resp.json()["detail"]["message"]
    assert "ToS" in message
    assert "COLLECTOR_ENABLE_SCRAPER=1" in message


def test_bilinmeyen_is_404(client):
    assert client.get("/jobs/hiçyok", headers=auth(client)).status_code == 404
    assert client.get("/jobs/hiçyok/candidates", headers=auth(client)).status_code == 404
    assert client.post("/jobs/hiçyok/cancel", headers=auth(client)).status_code == 404


def test_iptal_uclari(client):
    created = client.post("/jobs", json=payload(source="fake"), headers=auth(client))
    job_id = created.json()["jobId"]
    ok = client.post(f"/jobs/{job_id}/cancel", headers=auth(client))
    assert ok.status_code == 200 and ok.json()["ok"] is True


def test_adapter_adapters_ekstra_alan_reddi(client):
    resp = client.post("/jobs", json={**payload(), "izinsizAlan": 1}, headers=auth(client))
    assert resp.status_code == 422
