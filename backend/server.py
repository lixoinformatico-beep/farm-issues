from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Query
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import StreamingResponse
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

# --- Helpers ---
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

# --- Models ---
TIPOLOGIA = Literal["TFO", "Simples", "Encomendas", "Preço Plataforma"]
PRIORIDADE = Literal["Baixa", "Media", "Alta", "Critica"]
ESTADO = Literal["Aberto", "Em Curso", "Resolvido"]

class UserPublic(BaseModel):
    id: str
    email: str
    name: str
    role: str

class LoginReq(BaseModel):
    email: EmailStr
    password: str

class RegisterReq(BaseModel):
    email: EmailStr
    password: str
    name: str

class ProblemaCreate(BaseModel):
    farmacia: str
    laboratorio: str
    consultor: str
    descricao: str
    tipologia: TIPOLOGIA
    prioridade: PRIORIDADE = "Media"
    estado: ESTADO = "Aberto"
    data_prevista: Optional[str] = None
    atribuido_a: Optional[str] = None

class ProblemaUpdate(BaseModel):
    farmacia: Optional[str] = None
    laboratorio: Optional[str] = None
    consultor: Optional[str] = None
    descricao: Optional[str] = None
    tipologia: Optional[TIPOLOGIA] = None
    prioridade: Optional[PRIORIDADE] = None
    estado: Optional[ESTADO] = None
    data_prevista: Optional[str] = None
    atribuido_a: Optional[str] = None

class FollowUpCreate(BaseModel):
    texto: str
    novo_estado: Optional[ESTADO] = None

# --- Auth Endpoints ---
@api_router.post("/auth/register")
async def register(req: RegisterReq, response: Response):
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
        "role": "consultor",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(doc)
    set_auth_cookies(response, create_access_token(user_id, email), create_refresh_token(user_id))
    return {"id": user_id, "email": email, "name": req.name, "role": "consultor"}

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

# --- Users (consultores) ---
@api_router.get("/users")
async def list_users(_: dict = Depends(get_current_user)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(500)
    return users

# --- Problemas CRUD ---
def _clean(doc):
    doc.pop("_id", None)
    return doc

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
    return _clean(doc)

@api_router.get("/problemas")
async def list_problemas(
    estado: Optional[str] = None,
    farmacia: Optional[str] = None,
    laboratorio: Optional[str] = None,
    consultor: Optional[str] = None,
    tipologia: Optional[str] = None,
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
    if q:
        query["$or"] = [
            {"descricao": {"$regex": q, "$options": "i"}},
            {"farmacia": {"$regex": q, "$options": "i"}},
            {"laboratorio": {"$regex": q, "$options": "i"}},
            {"consultor": {"$regex": q, "$options": "i"}},
        ]
    items = await db.problemas.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return items

@api_router.get("/problemas/{pid}")
async def get_problema(pid: str, _: dict = Depends(get_current_user)):
    p = await db.problemas.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Problema não encontrado")
    follow_ups = await db.followups.find({"problema_id": pid}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    p["follow_ups"] = follow_ups
    return p

@api_router.patch("/problemas/{pid}")
async def update_problema(pid: str, req: ProblemaUpdate, _: dict = Depends(get_current_user)):
    update = {k: v for k, v in req.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(400, "Sem alterações")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    if update.get("estado") == "Resolvido":
        update["resolved_at"] = datetime.now(timezone.utc).isoformat()
    res = await db.problemas.update_one({"id": pid}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Problema não encontrado")
    p = await db.problemas.find_one({"id": pid}, {"_id": 0})
    return p

@api_router.delete("/problemas/{pid}")
async def delete_problema(pid: str, _: dict = Depends(get_current_user)):
    await db.problemas.delete_one({"id": pid})
    await db.followups.delete_many({"problema_id": pid})
    return {"ok": True}

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
    update = {"updated_at": now}
    if req.novo_estado and req.novo_estado != p["estado"]:
        update["estado"] = req.novo_estado
        if req.novo_estado == "Resolvido":
            update["resolved_at"] = now
    await db.problemas.update_one({"id": pid}, {"$set": update})
    fu.pop("_id", None)
    return fu

# --- Dashboard Stats ---
@api_router.get("/stats")
async def stats(_: dict = Depends(get_current_user)):
    total = await db.problemas.count_documents({})
    abertos = await db.problemas.count_documents({"estado": "Aberto"})
    em_curso = await db.problemas.count_documents({"estado": "Em Curso"})
    resolvidos = await db.problemas.count_documents({"estado": "Resolvido"})

    # By farmacia
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

    # By tipologia
    pipeline_tip = [{"$group": {"_id": "$tipologia", "total": {"$sum": 1}}}, {"$sort": {"total": -1}}]
    by_tip = await db.problemas.aggregate(pipeline_tip).to_list(100)
    by_tipologia = [{"tipologia": t["_id"], "total": t["total"]} for t in by_tip]

    # By prioridade
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
    for p in items:
        writer.writerow([p.get("id"), p.get("farmacia"), p.get("laboratorio"),
                         p.get("consultor"), p.get("tipologia"), p.get("prioridade"),
                         p.get("estado"), p.get("descricao"), p.get("data_prevista", ""),
                         p.get("atribuido_a", ""), p.get("criado_por"),
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
