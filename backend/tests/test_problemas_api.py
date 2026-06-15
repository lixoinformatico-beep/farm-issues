"""Backend integration tests for problemas (pharmacy issues) API."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://farm-issues.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@farmacias.pt"
ADMIN_PASSWORD = "admin123"


# --- Fixtures ---
@pytest.fixture(scope="module")
def auth_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def created_problema(auth_session):
    payload = {
        "farmacia": "TEST_Farmacia Central",
        "laboratorio": "TEST_Lab Bayer",
        "consultor": "TEST_Consultor",
        "descricao": "TEST_Encomenda em atraso",
        "tipologia": "Encomendas",
        "prioridade": "Alta",
        "estado": "Aberto",
        "data_prevista": "2026-02-15",
    }
    r = auth_session.post(f"{API}/problemas", json=payload)
    assert r.status_code == 200, r.text
    return r.json()


# --- Auth Tests ---
class TestAuth:
    def test_login_success(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == ADMIN_EMAIL
        assert data["role"] == "admin"
        assert "access_token" in s.cookies

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401
        assert "Credenciais" in r.json().get("detail", "")

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_with_cookie(self, auth_session):
        r = auth_session.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_logout(self):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        r = s.post(f"{API}/auth/logout")
        assert r.status_code == 200
        # After logout, /me should fail
        r2 = s.get(f"{API}/auth/me")
        assert r2.status_code == 401


# --- Problemas CRUD ---
class TestProblemas:
    def test_create_problema(self, created_problema):
        assert created_problema["farmacia"] == "TEST_Farmacia Central"
        assert created_problema["tipologia"] == "Encomendas"
        assert created_problema["estado"] == "Aberto"
        assert "id" in created_problema
        assert "_id" not in created_problema

    def test_get_problema(self, auth_session, created_problema):
        pid = created_problema["id"]
        r = auth_session.get(f"{API}/problemas/{pid}")
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == pid
        assert "follow_ups" in data
        assert isinstance(data["follow_ups"], list)

    def test_list_problemas(self, auth_session, created_problema):
        r = auth_session.get(f"{API}/problemas")
        assert r.status_code == 200
        items = r.json()
        assert any(p["id"] == created_problema["id"] for p in items)

    def test_filter_by_estado(self, auth_session, created_problema):
        r = auth_session.get(f"{API}/problemas", params={"estado": "Aberto"})
        assert r.status_code == 200
        for p in r.json():
            assert p["estado"] == "Aberto"

    def test_filter_by_tipologia(self, auth_session, created_problema):
        r = auth_session.get(f"{API}/problemas", params={"tipologia": "Encomendas"})
        assert r.status_code == 200
        ids = [p["id"] for p in r.json()]
        assert created_problema["id"] in ids

    def test_search_q(self, auth_session, created_problema):
        r = auth_session.get(f"{API}/problemas", params={"q": "TEST_Farmacia"})
        assert r.status_code == 200
        assert any(p["id"] == created_problema["id"] for p in r.json())

    def test_patch_problema(self, auth_session, created_problema):
        pid = created_problema["id"]
        r = auth_session.patch(f"{API}/problemas/{pid}", json={"estado": "Em Curso"})
        assert r.status_code == 200
        assert r.json()["estado"] == "Em Curso"
        # Verify persistence
        r2 = auth_session.get(f"{API}/problemas/{pid}")
        assert r2.json()["estado"] == "Em Curso"


# --- Follow-ups ---
class TestFollowUps:
    def test_create_followup_changes_state(self, auth_session, created_problema):
        pid = created_problema["id"]
        r = auth_session.post(
            f"{API}/problemas/{pid}/followups",
            json={"texto": "TEST_Follow-up: aguarda resposta", "novo_estado": "Resolvido"},
        )
        assert r.status_code == 200
        fu = r.json()
        assert fu["texto"].startswith("TEST_Follow-up")
        assert fu["novo_estado"] == "Resolvido"
        # Verify problema state and resolved_at updated
        r2 = auth_session.get(f"{API}/problemas/{pid}")
        data = r2.json()
        assert data["estado"] == "Resolvido"
        assert data["resolved_at"] is not None
        assert len(data["follow_ups"]) >= 1


# --- Stats ---
class TestStats:
    def test_stats_structure(self, auth_session, created_problema):
        r = auth_session.get(f"{API}/stats")
        assert r.status_code == 200
        d = r.json()
        for k in ("total", "abertos", "em_curso", "resolvidos",
                  "by_farmacia", "by_tipologia", "by_prioridade"):
            assert k in d
        assert d["total"] >= 1
        assert isinstance(d["by_farmacia"], list)


# --- Export CSV ---
class TestExport:
    def test_export_csv(self, auth_session, created_problema):
        r = auth_session.get(f"{API}/problemas/export/csv")
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        assert "TEST_Farmacia Central" in r.text
        assert "Farmácia" in r.text  # header in PT-PT

    def test_export_requires_auth(self):
        r = requests.get(f"{API}/problemas/export/csv")
        assert r.status_code == 401


# --- Cleanup ---
@pytest.fixture(scope="session", autouse=True)
def cleanup(request):
    yield
    try:
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        items = s.get(f"{API}/problemas", params={"q": "TEST_"}).json()
        for p in items:
            s.delete(f"{API}/problemas/{p['id']}")
    except Exception:
        pass
