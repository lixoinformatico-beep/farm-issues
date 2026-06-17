"""Sincronização (um sentido) farm-issues -> planner (Sprint Board).

Quando um pedido de apoio é criado, cria automaticamente uma tarefa na
coleção `tasks` da base de dados do planner (mesmo cluster MongoDB). Quando
o estado do pedido muda, atualiza o estado da tarefa correspondente.

Ativa-se apenas se estas variáveis de ambiente estiverem definidas:
    PLANNER_DB_NAME        nome da base de dados do planner no mesmo cluster
    PLANNER_OWNER_EMAIL    email do utilizador do planner que fica dono das tarefas
Opcional:
    PLANNER_DEFAULT_CATEGORY   categoria das tarefas (default: farmacia)

Se não estiverem definidas, a sincronização fica desligada (no-op) e o
farm-issues funciona normalmente.
"""
import os
import uuid
import logging
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)

MONGO_URL = os.environ.get("MONGO_URL", "")
PLANNER_DB_NAME = os.environ.get("PLANNER_DB_NAME", "")
PLANNER_OWNER_EMAIL = os.environ.get("PLANNER_OWNER_EMAIL", "").lower()
DEFAULT_CATEGORY = os.environ.get("PLANNER_DEFAULT_CATEGORY", "farmacia")

# farm-issues estado -> planner status
STATUS_MAP = {
    "Aberto": "todo",
    "Em Curso": "in_progress",
    "Resolvido": "done",
}
# farm-issues prioridade -> planner priority
PRIORITY_MAP = {
    "Baixa": "low",
    "Media": "medium",
    "Alta": "high",
    "Critica": "high",
}

_client = None
_owner_id_cache = None


def enabled() -> bool:
    return bool(MONGO_URL and PLANNER_DB_NAME and PLANNER_OWNER_EMAIL)


def _db():
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(MONGO_URL)
    return _client[PLANNER_DB_NAME]


async def _owner_id(db) -> str | None:
    global _owner_id_cache
    if _owner_id_cache:
        return _owner_id_cache
    u = await db.users.find_one({"email": PLANNER_OWNER_EMAIL}, {"id": 1, "_id": 0})
    if not u:
        logger.warning(f"planner_sync: utilizador '{PLANNER_OWNER_EMAIL}' nao encontrado no planner")
        return None
    _owner_id_cache = u["id"]
    return _owner_id_cache


async def _active_sprint_id(db, owner_id: str) -> str | None:
    s = await db.sprints.find_one(
        {"user_id": owner_id, "status": "active"}, {"id": 1, "_id": 0}
    )
    return s["id"] if s else None


def _build_title(pedido: dict) -> str:
    farmacia = pedido.get("farmacia", "").strip()
    tipologia = pedido.get("tipologia", "").strip()
    if farmacia and tipologia:
        return f"{farmacia} — {tipologia}"
    return farmacia or tipologia or "Pedido de apoio"


async def create_task_for_pedido(pedido: dict) -> str | None:
    """Cria a tarefa no planner. Devolve o id da tarefa ou None se desativado/falha."""
    if not enabled():
        return None
    try:
        db = _db()
        owner_id = await _owner_id(db)
        if not owner_id:
            return None
        sprint_id = await _active_sprint_id(db, owner_id)
        now = datetime.now(timezone.utc).isoformat()
        status = STATUS_MAP.get(pedido.get("estado", "Aberto"), "todo")
        tags = [t for t in [pedido.get("tipologia"), pedido.get("laboratorio")] if t]
        task = {
            "id": str(uuid.uuid4()),
            "user_id": owner_id,
            "title": _build_title(pedido),
            "description": pedido.get("descricao", "") or "",
            "estimated_minutes": 30,
            "priority": PRIORITY_MAP.get(pedido.get("prioridade", "Media"), "medium"),
            "category": DEFAULT_CATEGORY,
            "tags": tags,
            "status": status,
            "sprint_id": sprint_id,
            "time_logged_seconds": 0,
            "timer_started_at": None,
            "due_date": pedido.get("data_prevista") or None,
            "recurrence": "none",
            "created_at": now,
            "updated_at": now,
            "completed_at": now if status == "done" else None,
            # metadados de origem (o planner ignora campos extra)
            "source": "farm-issues",
            "source_pedido_id": pedido.get("id"),
        }
        await db.tasks.insert_one(task)
        logger.info(f"planner_sync: tarefa criada ({task['id']}) para pedido {pedido.get('id')}")
        return task["id"]
    except Exception as e:
        logger.warning(f"planner_sync: falha a criar tarefa: {e}")
        return None


async def update_task_status(task_id: str, estado: str) -> None:
    """Atualiza o estado da tarefa do planner a partir do estado do pedido."""
    if not enabled() or not task_id:
        return
    try:
        db = _db()
        status = STATUS_MAP.get(estado)
        if not status:
            return
        now = datetime.now(timezone.utc).isoformat()
        updates = {
            "status": status,
            "updated_at": now,
            "completed_at": now if status == "done" else None,
        }
        await db.tasks.update_one({"id": task_id}, {"$set": updates})
        logger.info(f"planner_sync: tarefa {task_id} -> {status}")
    except Exception as e:
        logger.warning(f"planner_sync: falha a atualizar tarefa {task_id}: {e}")
