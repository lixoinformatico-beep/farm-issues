from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, UploadFile, File, Query
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import StreamingResponse, Response as StarletteResponse
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import csv
import io
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal

from email_service import notify_assigned, notify_followup, notify_resolved
from storage_service import init_storage, put_object, get_object, APP_NAME

# --- Config ---
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# --- App ---
app = FastAPI()
api_router = APIRouter(prefix="/api")


# --- Auth Helpers ---
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email,
               "exp": datetime.now(timezone.utc) + timedelta(hours=8), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id,
               "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=False,
                        samesite="lax", max_age=8 * 3600, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=False,
                        samesite="lax", max_age=7 * 24 * 3600, path="/")


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Token inválido")
        user = await db.users.find_one({"id": payload["sub"]})
        if not user:
            raise HTTPException(status_code=401, detail="Utilizador não encontrado")
        user.pop("_id", None)
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sessão expirada")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Requer permissões de administrador")
    return user


# --- Models ---
TIPOLOGIA = Literal["TFO", "Simples", "Encomendas", "Preço Plataforma"]
PRIORIDADE = Literal["Baixa", "Media", "Alta", "Critica"]
ESTADO = Literal["Aberto", "Em Curso", "Resolvido"]
ROLE = Literal["admin", "consultor"]


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: ROLE = "consultor"


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[ROLE] = None
    password: Optional[str] = None


class ProblemaCreate(BaseModel):
    farmacia: str
    laboratorio: str
    consultor: str
    descricao: str
    tipologia: TIPOLOGIA
    prioridade: PRIORIDADE = "Media"
    estado: ESTADO = "Aberto"
    data_prevista: Optional[str] = None
    atribuido_a_id: Optional[str] = None


class ProblemaUpdate(BaseModel):
    farmacia: Optional[str] = None
    laboratorio: Optional[str] = None
    consultor: Optional[str] = None
    descricao: Optional[str] = None
    tipologia: Optional[TIPOLOGIA] = None
    prioridade: Optional[PRIORIDADE] = None
    estado: Optional[ESTADO] = None
    data_prevista: Optional[str] = None
    atribuido_a_id: Optional[str] = None


class FollowUpCreate(BaseModel):
    texto: str
    novo_estado: Optional[ESTADO] = None


# --- Audit helper ---
async def log_audit(problema_id: str, user: dict, action: str, details: Optional[dict] = None):
    entry = {
        "id": str(uuid.uuid4()),
        "problema_id": problema_id,
        "user_id": user["id"],
        "user_name": user["name"],
        "action": action,
        "details": details or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.audit_logs.insert_one(entry)


async def _attach_user_info(problema: dict):
    """Attach atribuido_a (name + email) from atribuido_a_id."""
    if problema.get("atribuido_a_id"):
        u = await db.users.find_one({"id": problema["atribuido_a_id"]}, {"_id": 0, "password_hash": 0})
        if u:
            problema["atribuido_a_name"] = u.get("name")
            problema["atribuido_a_email"] = u.get("email")
        else:
            problema["atribuido_a_name"] = None
            problema["atribuido_a_email"] = None
    else:
        problema["atribuido_a_name"] = None
        problema["atribuido_a_email"] = None
    return problema


def _clean(doc):
    doc.pop("_id", None)
    return doc


# --- Auth Endpoints ---
@api_router.post("/auth/login")
async def login(req: LoginReq, response: Response):
    email = req.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenciais inválidas")
    set_auth_cookies(response, create_access_token(user["id"], email), create_refresh_token(user["id"]))
    return {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"ok": True}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# --- Users (admin only for write) ---
@api_router.get("/users")
async def list_users(_: dict = Depends(get_current_user)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("name", 1).to_list(500)
    return users


@api_router.post("/users")
async def create_user(req: UserCreate, _: dict = Depends(require_admin)):
    email = req.email.lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email já registado")
    user_id = str(uuid.uuid4())
    doc = {
        "id": user_id,
        "email": email,
        "name": req.name,
        "password_hash": hash_password(req.password),
        "role": req.role,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    return {"id": user_id, "email": email, "name": req.name, "role": req.role}


@api_router.patch("/users/{uid}")
async def update_user(uid: str, req: UserUpdate, _: dict = Depends(require_admin)):
    update = {}
    if req.name is not None:
        update["name"] = req.name
    if req.role is not None:
        update["role"] = req.role
    if req.password:
        update["password_hash"] = hash_password(req.password)
    if not update:
        raise HTTPException(400, "Sem alterações")
    res = await db.users.update_one({"id": uid}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Utilizador não encontrado")
    u = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
    return u


@api_router.delete("/users/{uid}")
async def delete_user(uid: str, current: dict = Depends(require_admin)):
    if uid == current["id"]:
        raise HTTPException(400, "Não pode eliminar a própria conta")
    res = await db.users.delete_one({"id": uid})
    if res.deleted_count == 0:
        raise HTTPException(404, "Utilizador não encontrado")
    return {"ok": True}


# --- Problemas CRUD ---
@api_router.post("/problemas")
async def create_problema(req: ProblemaCreate, user: dict = Depends(get_current_user)):
    pid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    doc = req.model_dump()
    doc.update({
        "id": pid,
        "criado_por": user["name"],
        "criado_por_id": user["id"],
        "created_at": now,
        "updated_at": now,
        "resolved_at": None,
    })
    await db.problemas.insert_one(doc)
    await log_audit(pid, user, "criou", {"farmacia": doc["farmacia"], "tipologia": doc["tipologia"]})

    # If assigned on create, notify
    if doc.get("atribuido_a_id"):
        assignee = await db.users.find_one({"id": doc["atribuido_a_id"]})
        if assignee and assignee.get("email"):
            await notify_assigned(assignee["email"], doc, user["name"])
            await log_audit(pid, user, "atribuiu", {"para": assignee["name"]})

    return _clean(await _attach_user_info(doc))


@api_router.get("/problemas")
async def list_problemas(
    estado: Optional[str] = None,
    farmacia: Optional[str] = None,
    laboratorio: Optional[str] = None,
    consultor: Optional[str] = None,
    tipologia: Optional[str] = None,
    atribuido_a_id: Optional[str] = None,
    q: Optional[str] = None,
    _: dict = Depends(get_current_user),
):
    query = {}
    if estado:
        query["estado"] = estado
    if farmacia:
        query["farmacia"] = {"$regex": farmacia, "$options": "i"}
    if laboratorio:
        query["laboratorio"] = {"$regex": laboratorio, "$options": "i"}
    if consultor:
        query["consultor"] = {"$regex": consultor, "$options": "i"}
    if tipologia:
        query["tipologia"] = tipologia
    if atribuido_a_id:
        query["atribuido_a_id"] = atribuido_a_id
    if q:
        query["$or"] = [
            {"descricao": {"$regex": q, "$options": "i"}},
            {"farmacia": {"$regex": q, "$options": "i"}},
            {"laboratorio": {"$regex": q, "$options": "i"}},
            {"consultor": {"$regex": q, "$options": "i"}},
        ]
    items = await db.problemas.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    for it in items:
        await _attach_user_info(it)
    return items


@api_router.get("/problemas/{pid}")
async def get_problema(pid: str, _: dict = Depends(get_current_user)):
    p = await db.problemas.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Problema não encontrado")
    await _attach_user_info(p)
    p["follow_ups"] = await db.followups.find({"problema_id": pid}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    p["attachments"] = await db.attachments.find(
        {"problema_id": pid, "is_deleted": {"$ne": True}}, {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    p["audit_logs"] = await db.audit_logs.find({"problema_id": pid}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return p


@api_router.patch("/problemas/{pid}")
async def update_problema(pid: str, req: ProblemaUpdate, user: dict = Depends(get_current_user)):
    existing = await db.problemas.find_one({"id": pid})
    if not existing:
        raise HTTPException(404, "Problema não encontrado")

    # Permissions: consultor can only edit problems they created
    if user.get("role") != "admin" and existing.get("criado_por_id") != user["id"]:
        raise HTTPException(403, "Só pode editar os problemas que criou")

    update = {k: v for k, v in req.model_dump(exclude_unset=True).items() if v is not None or k == "atribuido_a_id"}
    if not update:
        raise HTTPException(400, "Sem alterações")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()

    # Track changes
    changes = {}
    for k, v in update.items():
        if k in ("updated_at",):
            continue
        if existing.get(k) != v:
            changes[k] = {"de": existing.get(k), "para": v}

    if "estado" in update and update["estado"] == "Resolvido" and existing.get("estado") != "Resolvido":
        update["resolved_at"] = datetime.now(timezone.utc).isoformat()

    await db.problemas.update_one({"id": pid}, {"$set": update})

    if changes:
        await log_audit(pid, user, "atualizou", {"alteracoes": changes})

    # Side-effects
    new_doc = await db.problemas.find_one({"id": pid}, {"_id": 0})

    # Assignment change
    if "atribuido_a_id" in changes and update.get("atribuido_a_id"):
        assignee = await db.users.find_one({"id": update["atribuido_a_id"]})
        if assignee and assignee.get("email"):
            await notify_assigned(assignee["email"], new_doc, user["name"])
            await log_audit(pid, user, "atribuiu", {"para": assignee["name"]})

    # Resolved
    if "estado" in changes and update.get("estado") == "Resolvido":
        recipients = await _collect_emails(new_doc, exclude_user_id=user["id"])
        if recipients:
            await notify_resolved(recipients, new_doc, user["name"])

    return await _attach_user_info(new_doc)


@api_router.delete("/problemas/{pid}")
async def delete_problema(pid: str, _: dict = Depends(require_admin)):
    await db.problemas.delete_one({"id": pid})
    await db.followups.delete_many({"problema_id": pid})
    await db.audit_logs.delete_many({"problema_id": pid})
    await db.attachments.update_many({"problema_id": pid}, {"$set": {"is_deleted": True}})
    return {"ok": True}


async def _collect_emails(problema: dict, exclude_user_id: Optional[str] = None) -> list:
    """Collect emails of creator + assignee, excluding a user_id."""
    ids = set()
    if problema.get("criado_por_id"):
        ids.add(problema["criado_por_id"])
    if problema.get("atribuido_a_id"):
        ids.add(problema["atribuido_a_id"])
    if exclude_user_id:
        ids.discard(exclude_user_id)
    if not ids:
        return []
    users = await db.users.find({"id": {"$in": list(ids)}}, {"_id": 0, "email": 1}).to_list(100)
    return [u["email"] for u in users if u.get("email")]


# --- Follow-ups ---
@api_router.post("/problemas/{pid}/followups")
async def create_followup(pid: str, req: FollowUpCreate, user: dict = Depends(get_current_user)):
    p = await db.problemas.find_one({"id": pid})
    if not p:
        raise HTTPException(404, "Problema não encontrado")
    now = datetime.now(timezone.utc).isoformat()
    fu = {
        "id": str(uuid.uuid4()),
        "problema_id": pid,
        "texto": req.texto,
        "autor": user["name"],
        "autor_id": user["id"],
        "estado_anterior": p["estado"],
        "novo_estado": req.novo_estado,
        "created_at": now,
    }
    await db.followups.insert_one(fu)
    fu.pop("_id", None)

    update = {"updated_at": now}
    estado_changed = False
    if req.novo_estado and req.novo_estado != p["estado"]:
        update["estado"] = req.novo_estado
        estado_changed = True
        if req.novo_estado == "Resolvido":
            update["resolved_at"] = now
    await db.problemas.update_one({"id": pid}, {"$set": update})

    await log_audit(pid, user, "ponto_situacao", {
        "texto": req.texto[:120],
        "novo_estado": req.novo_estado,
    })

    new_doc = await db.problemas.find_one({"id": pid}, {"_id": 0})
    recipients = await _collect_emails(new_doc, exclude_user_id=user["id"])
    if recipients:
        await notify_followup(recipients, new_doc, fu)
        if estado_changed and req.novo_estado == "Resolvido":
            await notify_resolved(recipients, new_doc, user["name"])

    return fu


# --- Attachments ---
@api_router.post("/problemas/{pid}/attachments")
async def upload_attachment(pid: str, file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    p = await db.problemas.find_one({"id": pid})
    if not p:
        raise HTTPException(404, "Problema não encontrado")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "Ficheiro demasiado grande (máx 10MB)")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin"
    path = f"{APP_NAME}/problemas/{pid}/{uuid.uuid4()}.{ext}"
    try:
        result = put_object(path, data, file.content_type or "application/octet-stream")
    except Exception as e:
        logger.error(f"Upload falhou: {e}")
        raise HTTPException(500, f"Falha no upload: {e}")
    record = {
        "id": str(uuid.uuid4()),
        "problema_id": pid,
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": file.content_type or "application/octet-stream",
        "size": result.get("size", len(data)),
        "uploaded_by": user["name"],
        "uploaded_by_id": user["id"],
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.attachments.insert_one(record)
    await log_audit(pid, user, "anexo_adicionado", {"ficheiro": file.filename})
    record.pop("_id", None)
    return record


@api_router.get("/attachments/{aid}/download")
async def download_attachment(aid: str, request: Request, auth: Optional[str] = Query(None)):
    # Allow token in query for <a href> downloads
    if auth and not request.cookies.get("access_token"):
        try:
            jwt.decode(auth, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            request.cookies.__dict__  # noop
        except Exception:
            raise HTTPException(401, "Token inválido")
    else:
        await get_current_user(request)

    record = await db.attachments.find_one({"id": aid, "is_deleted": {"$ne": True}})
    if not record:
        raise HTTPException(404, "Anexo não encontrado")
    try:
        data, content_type = get_object(record["storage_path"])
    except Exception as e:
        raise HTTPException(500, f"Falha a obter ficheiro: {e}")
    return StarletteResponse(
        content=data,
        media_type=record.get("content_type", content_type),
        headers={"Content-Disposition": f'inline; filename="{record["original_filename"]}"'},
    )


@api_router.delete("/attachments/{aid}")
async def delete_attachment(aid: str, user: dict = Depends(get_current_user)):
    record = await db.attachments.find_one({"id": aid})
    if not record:
        raise HTTPException(404, "Anexo não encontrado")
    if user.get("role") != "admin" and record.get("uploaded_by_id") != user["id"]:
        raise HTTPException(403, "Só pode eliminar os seus anexos")
    await db.attachments.update_one({"id": aid}, {"$set": {"is_deleted": True}})
    await log_audit(record["problema_id"], user, "anexo_removido", {"ficheiro": record["original_filename"]})
    return {"ok": True}


# --- Dashboard Stats ---
@api_router.get("/stats")
async def stats(_: dict = Depends(get_current_user)):
    total = await db.problemas.count_documents({})
    abertos = await db.problemas.count_documents({"estado": "Aberto"})
    em_curso = await db.problemas.count_documents({"estado": "Em Curso"})
    resolvidos = await db.problemas.count_documents({"estado": "Resolvido"})

    pipeline_farm = [
        {"$group": {"_id": "$farmacia", "total": {"$sum": 1},
                    "abertos": {"$sum": {"$cond": [{"$eq": ["$estado", "Aberto"]}, 1, 0]}},
                    "em_curso": {"$sum": {"$cond": [{"$eq": ["$estado", "Em Curso"]}, 1, 0]}},
                    "resolvidos": {"$sum": {"$cond": [{"$eq": ["$estado", "Resolvido"]}, 1, 0]}}}},
        {"$sort": {"total": -1}}, {"$limit": 10}
    ]
    by_farm = await db.problemas.aggregate(pipeline_farm).to_list(100)
    by_farmacia = [{"farmacia": f["_id"], "total": f["total"], "abertos": f["abertos"],
                    "em_curso": f["em_curso"], "resolvidos": f["resolvidos"]} for f in by_farm]

    pipeline_tip = [{"$group": {"_id": "$tipologia", "total": {"$sum": 1}}}, {"$sort": {"total": -1}}]
    by_tip = await db.problemas.aggregate(pipeline_tip).to_list(100)
    by_tipologia = [{"tipologia": t["_id"], "total": t["total"]} for t in by_tip]

    pipeline_pri = [{"$group": {"_id": "$prioridade", "total": {"$sum": 1}}}]
    by_pri = await db.problemas.aggregate(pipeline_pri).to_list(100)
    by_prioridade = [{"prioridade": t["_id"], "total": t["total"]} for t in by_pri]

    return {
        "total": total, "abertos": abertos, "em_curso": em_curso, "resolvidos": resolvidos,
        "by_farmacia": by_farmacia, "by_tipologia": by_tipologia, "by_prioridade": by_prioridade,
    }


# --- Export CSV ---
@api_router.get("/problemas/export/csv")
async def export_csv(_: dict = Depends(get_current_user)):
    items = await db.problemas.find({}, {"_id": 0}).sort("created_at", -1).to_list(10000)
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";")
    writer.writerow(["ID", "Farmácia", "Laboratório", "Consultor", "Tipologia", "Prioridade",
                     "Estado", "Descrição", "Data Prevista", "Atribuído", "Criado por",
                     "Criado em", "Resolvido em"])
    # Pre-fetch users for atribuido_a_id resolution
    user_ids = list({i.get("atribuido_a_id") for i in items if i.get("atribuido_a_id")})
    users_map = {}
    if user_ids:
        users = await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
        users_map = {u["id"]: u["name"] for u in users}
    for p in items:
        atrib = users_map.get(p.get("atribuido_a_id"), "")
        writer.writerow([p.get("id"), p.get("farmacia"), p.get("laboratorio"),
                         p.get("consultor"), p.get("tipologia"), p.get("prioridade"),
                         p.get("estado"), p.get("descricao"), p.get("data_prevista", ""),
                         atrib, p.get("criado_por"),
                         p.get("created_at"), p.get("resolved_at", "")])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]),
                             media_type="text/csv",
                             headers={"Content-Disposition": "attachment; filename=problemas.csv"})


# --- Startup ---
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.problemas.create_index("id", unique=True)
    await db.followups.create_index("problema_id")
    await db.attachments.create_index("problema_id")
    await db.audit_logs.create_index("problema_id")

    # Init object storage (don't crash if it fails)
    try:
        init_storage()
    except Exception as e:
        logger.warning(f"Storage init falhou na startup: {e}")

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@farmacias.pt").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "name": "Administrador",
            "password_hash": hash_password(admin_password),
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Admin criado: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email},
                                  {"$set": {"password_hash": hash_password(admin_password)}})
        logger.info("Password admin atualizada")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)
