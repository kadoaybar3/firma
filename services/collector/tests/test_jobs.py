"""İş yaşam döngüsü testleri — sahte adaptörlerle, ağ YOK."""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from contract import Candidate, SearchRequest  # noqa: F401
from jobs import STATE_CANCELLED, STATE_DONE, STATE_FAILED, STATE_RUNNING
from tests.conftest import wait_finished


def test_is_olusturma_ve_bitis(store, req):
    job_id, error = store.start(req)
    assert job_id and error is None
    job = wait_finished(store, job_id)
    assert job.state == STATE_DONE
    assert len(job.candidates) == 3
    assert job.progress_total == 3


def test_is_ici_mukerrer_ve_eksik_uyarilari(store, req):
    job_id, _ = store.start(req)
    job = wait_finished(store, job_id)
    warns = [set(c.warnings) for c in job.candidates]
    # Telefonu tekrar eden 2. aday işaretlendi
    assert "Aynı iş içinde telefonu tekrar eden aday" in warns[1]
    # Telefonu olmayan 3. aday işaretlendi
    assert "Telefon yok" in warns[2]
    # Temiz aday uyarısız
    assert warns[0] == set()


def test_ayni_parametrelerle_ikinci_is_409():
    """Aktif iş sürerken ikinci istek → mevcut iş döner.

    Deterministik: instant adaptör bazen ikinci start'tan önce bitip yarışı
    bozabiliyordu; burada job süresi ikinci istekten uzun tur örnek.
    (Aynı davranış test_api.py'de iş-tabanında slow adaptörle de örneklenir.)
    """
    import time

    from adapters import BaseSourceAdapter
    from jobs import JobStore

    class Slow(BaseSourceAdapter):
        name = "slow"

        def search(self, req, progress, cancel):  # type: ignore[no-untyped-def]
            time.sleep(0.6)
            progress(1, 1)
            return [
                Candidate(name=f"{req.kategori} A", source=self.name, phone="05551112233", address="adres A"),
            ]

    s = JobStore({"slow": Slow()}, timeout_seconds=5)
    r = SearchRequest(il="Afyonkarahisar", ilce="Merkez", kategori="Kasap", limit=5, source="slow")
    job_id1, err1 = s.start(r)
    assert err1 is None and job_id1 is not None
    job_id2, err2 = s.start(r)
    assert job_id2 == job_id1  # mevcut işin kimliği döner
    assert err2 is not None and "zaten var" in err2


def test_farkli_parametreler_yeni_is(store, req):
    store.start(req)
    other = SearchRequest(il="Konya", ilce="Meram", kategori="Fırıncı", limit=5, source="instant")
    job_id, error = store.start(other)
    assert error is None and job_id is not None


def test_bilinmeyen_kaynak_400(store, req):
    bad = req.model_copy(update={"source": "yok-boyle"})
    job_id, error = store.start(bad)
    assert job_id is None and "Bilinmeyen kaynak" in error


def test_hata_is_failed_durumuna_gider(store, req):
    bad = req.model_copy(update={"source": "exploding"})
    job_id, _ = store.start(bad)
    job = wait_finished(store, job_id)
    assert job.state == STATE_FAILED
    assert "Kaynak patladı" in job.error


def test_iptal(store, req):
    job_id, _ = store.start(req)
    assert store.cancel(job_id) is True
    job = wait_finished(store, job_id)
    assert job.state in {STATE_CANCELLED, STATE_DONE}  # hızlı iş iptali kaçırmış olabilir


def test_bilinmeyen_is_404_yolu(store, req):
    assert store.get("hiniste-yok") is None


def test_km_mi_uyarisi_temiz_adayda_yok(store, req):
    job_id, _ = store.start(req)
    job = wait_finished(store, job_id)
    for c in job.candidates[:1]:
        assert all("yok" not in w for w in c.warnings) or c.warnings == []
