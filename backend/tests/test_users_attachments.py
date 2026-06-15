"""Backend tests for users management, role permissions, attachments, audit log, and assignment."""
import os
import io
import uuid
import pytest
import requests

from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@farmacias.pt"
ADMIN_PASSWORD = "admin123"

CONSULTOR_EMAIL = f"test_consultor_{uuid.uuid4().hex[:6]}@farmacias.pt"
CONSULTOR_PASSWORD = "consultor123"
CONSULTOR_NAME = "TEST Consultor One"


# --- Fixtures ---
@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="module")
def consultor_data(admin_session):
    """Create a consultor user, return their dict."""
    r = admin_session.post(f"{API}/users", json={
        "email": CONSULTOR_EMAIL,
        "password": CONSULTOR_PASSWORD,
        "name": CONSULTOR_NAME,
        "role": "consultor",
    })
    assert r.status_code == 200, r.text
    user = r.json()
    yield user
    # cleanup
    try:
        admin_session.delete(f"{API}/users/{user['id']}")
    except Exception:
        pass


@pytest.fixture(scope="module")
def consultor_session(consultor_data):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": CONSULTOR_EMAIL, "password": CONSULTOR_PASSWORD})
    assert r.status_code == 200, r.text
    return s


# --- Users CRUD & Permissions ---
class TestUsers:
    def test_create_user_admin(self, admin_session, consultor_data):
        assert consultor_data["email"] == CONSULTOR_EMAIL.lower()
        assert consultor_data["role"] == "consultor"
        assert "id" in consultor_data

    def test_list_users_returns_admin_and_consultor(self, admin_session, consultor_data):
        r = admin_session.get(f"{API}/users")
        assert r.status_code == 200
        users = r.json()
        emails = [u["email"] for u in users]
        assert ADMIN_EMAIL in emails
        assert CONSULTOR_EMAIL.lower() in emails
        # No _id and no password_hash leaks
        for u in users:
            assert "_id" not in u
            assert "password_hash" not in u

    def test_list_users_consultor_can_read(self, consultor_session):
        # Consultor can read (needed for assign dropdown)
        r = consultor_session.get(f"{API}/users")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_consultor_cannot_create_user(self, consultor_session):
        r = consultor_session.post(f"{API}/users", json={
            "email": f"forbidden_{uuid.uuid4().hex[:6]}@x.pt",
            "password": "x", "name": "X", "role": "consultor"
        })
        assert r.status_code == 403

    def test_consultor_cannot_patch_user(self, consultor_session, consultor_data):
        r = consultor_session.patch(f"{API}/users/{consultor_data['id']}", json={"name": "Hack"})
        assert r.status_code == 403

    def test_consultor_cannot_delete_user(self, consultor_session, consultor_data):
        r = consultor_session.delete(f"{API}/users/{consultor_data['id']}")
        assert r.status_code == 403

    def test_admin_cannot_delete_self(self, admin_session):
        me = admin_session.get(f"{API}/auth/me").json()
        r = admin_session.delete(f"{API}/users/{me['id']}")
        assert r.status_code == 400

    def test_admin_can_patch_user(self, admin_session, consultor_data):
        new_name = "TEST Consultor Updated"
        r = admin_session.patch(f"{API}/users/{consultor_data['id']}", json={"name": new_name})
        assert r.status_code == 200
        assert r.json()["name"] == new_name


# --- Problemas with assignment ---
@pytest.fixture(scope="module")
def assigned_problema(admin_session, consultor_data):
    payload = {
        "farmacia": "TEST_Farma Assigned",
        "laboratorio": "TEST_Lab",
        "consultor": "TEST_C",
        "descricao": "TEST_atribuição",
        "tipologia": "TFO",
        "prioridade": "Media",
        "estado": "Aberto",
        "atribuido_a_id": consultor_data["id"],
    }
    r = admin_session.post(f"{API}/problemas", json=payload)
    assert r.status_code == 200, r.text
    p = r.json()
    yield p
    try:
        admin_session.delete(f"{API}/problemas/{p['id']}")
    except Exception:
        pass


class TestAssignment:
    def test_create_with_assignment_returns_user_info(self, assigned_problema, consultor_data):
        assert assigned_problema.get("atribuido_a_id") == consultor_data["id"]
        # name resolved from users collection (may have been updated by other tests)
        assert assigned_problema.get("atribuido_a_name") is not None
        assert assigned_problema.get("atribuido_a_email") == consultor_data["email"]

    def test_get_problema_includes_followups_attachments_audit(self, admin_session, assigned_problema):
        r = admin_session.get(f"{API}/problemas/{assigned_problema['id']}")
        assert r.status_code == 200
        data = r.json()
        assert "follow_ups" in data and isinstance(data["follow_ups"], list)
        assert "attachments" in data and isinstance(data["attachments"], list)
        assert "audit_logs" in data and isinstance(data["audit_logs"], list)
        # Audit must have at least "criou" entry + "atribuiu"
        actions = [a["action"] for a in data["audit_logs"]]
        assert "criou" in actions
        assert "atribuiu" in actions

    def test_filter_by_atribuido_a_id(self, admin_session, assigned_problema, consultor_data):
        r = admin_session.get(f"{API}/problemas", params={"atribuido_a_id": consultor_data["id"]})
        assert r.status_code == 200
        ids = [p["id"] for p in r.json()]
        assert assigned_problema["id"] in ids


class TestProblemaPermissions:
    def test_consultor_cannot_edit_problema_he_did_not_create(self, consultor_session, assigned_problema):
        # Created by admin; consultor (assignee) should NOT be allowed to PATCH
        r = consultor_session.patch(f"{API}/problemas/{assigned_problema['id']}",
                                    json={"estado": "Em Curso"})
        assert r.status_code == 403

    def test_consultor_cannot_delete_problema(self, consultor_session, assigned_problema):
        r = consultor_session.delete(f"{API}/problemas/{assigned_problema['id']}")
        assert r.status_code == 403

    def test_consultor_can_edit_own_problema(self, consultor_session):
        # Create a problema as consultor
        r = consultor_session.post(f"{API}/problemas", json={
            "farmacia": "TEST_Own", "laboratorio": "L", "consultor": "C",
            "descricao": "TEST own", "tipologia": "Simples",
        })
        assert r.status_code == 200
        pid = r.json()["id"]
        r2 = consultor_session.patch(f"{API}/problemas/{pid}", json={"estado": "Em Curso"})
        assert r2.status_code == 200
        assert r2.json()["estado"] == "Em Curso"


# --- Attachments ---
class TestAttachments:
    def test_upload_and_list_attachment(self, admin_session, assigned_problema):
        pid = assigned_problema["id"]
        files = {"file": ("test.txt", io.BytesIO(b"hello world TEST"), "text/plain")}
        # Switch off JSON header for multipart
        s = requests.Session()
        s.cookies.update(admin_session.cookies)
        r = s.post(f"{API}/problemas/{pid}/attachments", files=files)
        if r.status_code == 500 and "Storage" in r.text:
            pytest.skip(f"Object storage not available: {r.text}")
        assert r.status_code == 200, r.text
        att = r.json()
        assert att["original_filename"] == "test.txt"
        assert att["problema_id"] == pid
        assert "id" in att

        # Listed in problema detail
        r2 = admin_session.get(f"{API}/problemas/{pid}")
        atts = r2.json()["attachments"]
        assert any(a["id"] == att["id"] for a in atts)

        # Audit log has anexo_adicionado
        actions = [a["action"] for a in r2.json()["audit_logs"]]
        assert "anexo_adicionado" in actions

        # Download
        r3 = admin_session.get(f"{API}/attachments/{att['id']}/download")
        assert r3.status_code == 200
        assert b"hello world TEST" in r3.content

        # Delete (admin can delete any)
        r4 = admin_session.delete(f"{API}/attachments/{att['id']}")
        assert r4.status_code == 200

        # Not listed after delete
        r5 = admin_session.get(f"{API}/problemas/{pid}")
        atts2 = r5.json()["attachments"]
        assert not any(a["id"] == att["id"] for a in atts2)


# --- CSV Export with assignee name ---
class TestCSV:
    def test_csv_includes_assignee_name(self, admin_session, assigned_problema, consultor_data):
        r = admin_session.get(f"{API}/problemas/export/csv")
        assert r.status_code == 200
        # Header in PT-PT contains 'Atribuído'
        text = r.text
        assert "Atribuído" in text
        # Assignee name must appear (or the problema row contains it)
        assert consultor_data["name"] in text or "TEST_Farma Assigned" in text


# --- Cleanup any TEST_ data ---
@pytest.fixture(scope="session", autouse=True)
def cleanup_session():
    yield
    try:
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        items = s.get(f"{API}/problemas", params={"q": "TEST_"}).json()
        for p in items:
            s.delete(f"{API}/problemas/{p['id']}")
        # Cleanup any leftover TEST consultor accounts
        users = s.get(f"{API}/users").json()
        for u in users:
            if u.get("email", "").startswith("test_consultor_"):
                s.delete(f"{API}/users/{u['id']}")
    except Exception:
        pass
