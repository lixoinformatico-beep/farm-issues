"""S3-compatible object storage client (Cloudflare R2 / AWS S3).

Drop-in replacement for the old Emergent objstore client. Keeps the same
public interface used by server.py:
    - init_storage() -> str | None   (returns bucket name on success)
    - put_object(path, data, content_type) -> {"path": ..., "size": ...}
    - get_object(path) -> (bytes, content_type)
    - APP_NAME

Required env vars (Cloudflare R2):
    R2_ENDPOINT_URL        e.g. https://<accountid>.r2.cloudflarestorage.com
    R2_ACCESS_KEY_ID
    R2_SECRET_ACCESS_KEY
    R2_BUCKET
Optional:
    APP_NAME               (default: farma-issues)
    R2_REGION              (default: auto)

If credentials are missing, storage stays disabled and attachments are
turned off gracefully (init_storage returns None).
"""
import os
import logging

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

APP_NAME = os.environ.get("APP_NAME", "farma-issues")

ENDPOINT_URL = os.environ.get("R2_ENDPOINT_URL", "")
ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "")
SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
BUCKET = os.environ.get("R2_BUCKET", "")
REGION = os.environ.get("R2_REGION", "auto")

_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not (ENDPOINT_URL and ACCESS_KEY_ID and SECRET_ACCESS_KEY and BUCKET):
        return None
    _client = boto3.client(
        "s3",
        endpoint_url=ENDPOINT_URL,
        aws_access_key_id=ACCESS_KEY_ID,
        aws_secret_access_key=SECRET_ACCESS_KEY,
        region_name=REGION,
        config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
    )
    return _client


def init_storage() -> str | None:
    """Verify storage is reachable. Returns bucket name or None if disabled."""
    client = _get_client()
    if client is None:
        logger.warning("Storage R2/S3 nao configurado - anexos desativados")
        return None
    try:
        client.head_bucket(Bucket=BUCKET)
        logger.info(f"Object storage inicializado (bucket: {BUCKET})")
        return BUCKET
    except ClientError as e:
        logger.error(f"Falha a aceder ao bucket '{BUCKET}': {e}")
        return None


def put_object(path: str, data: bytes, content_type: str) -> dict:
    client = _get_client()
    if client is None:
        raise RuntimeError("Storage nao disponivel")
    client.put_object(
        Bucket=BUCKET,
        Key=path,
        Body=data,
        ContentType=content_type,
    )
    return {"path": path, "size": len(data)}


def get_object(path: str) -> tuple[bytes, str]:
    client = _get_client()
    if client is None:
        raise RuntimeError("Storage nao disponivel")
    resp = client.get_object(Bucket=BUCKET, Key=path)
    body = resp["Body"].read()
    content_type = resp.get("ContentType", "application/octet-stream")
    return body, content_type


def delete_object(path: str) -> None:
    client = _get_client()
    if client is None:
        return
    try:
        client.delete_object(Bucket=BUCKET, Key=path)
    except ClientError as e:
        logger.warning(f"Falha a remover objeto '{path}': {e}")
