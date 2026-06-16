"""Diagnóstico R2 — corre uma vez para descobrir o erro exato.

Uso (no shell do Render, dentro de backend/, ou localmente com as env vars):
    python diag_r2.py

Lê as mesmas variáveis que o storage_service: R2_ENDPOINT_URL,
R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_REGION.
"""
import os
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

ENDPOINT = os.environ.get("R2_ENDPOINT_URL", "")
AKID = os.environ.get("R2_ACCESS_KEY_ID", "")
SECRET = os.environ.get("R2_SECRET_ACCESS_KEY", "")
BUCKET = os.environ.get("R2_BUCKET", "")
REGION = os.environ.get("R2_REGION", "auto")

print("=== Variaveis (mascaradas) ===")
print("ENDPOINT:", ENDPOINT)
print("BUCKET  :", repr(BUCKET))
print("REGION  :", REGION)
print("AKID    :", (AKID[:4] + "..." + AKID[-4:]) if len(AKID) > 8 else "(curto/vazio)", f"[{len(AKID)} chars]")
print("SECRET  :", "definido" if SECRET else "VAZIO", f"[{len(SECRET)} chars]")
print()

client = boto3.client(
    "s3",
    endpoint_url=ENDPOINT,
    aws_access_key_id=AKID,
    aws_secret_access_key=SECRET,
    region_name=REGION,
    config=Config(signature_version="s3v4", retries={"max_attempts": 1}),
)

print("=== Teste 1: listar buckets (valida as chaves) ===")
try:
    resp = client.list_buckets()
    names = [b["Name"] for b in resp.get("Buckets", [])]
    print("OK. Buckets visiveis:", names)
    print("'%s' existe?" % BUCKET, BUCKET in names)
except ClientError as e:
    print("ERRO:", e.response["Error"].get("Code"), "-", e.response["Error"].get("Message"))
except Exception as e:
    print("ERRO inesperado:", type(e).__name__, e)
print()

print("=== Teste 2: head_bucket (acesso ao bucket) ===")
try:
    client.head_bucket(Bucket=BUCKET)
    print("OK. Acesso ao bucket confirmado.")
except ClientError as e:
    print("ERRO:", e.response["Error"].get("Code"), "-", e.response["Error"].get("Message"))
except Exception as e:
    print("ERRO inesperado:", type(e).__name__, e)
print()

print("=== Teste 3: escrever e ler um objeto ===")
try:
    client.put_object(Bucket=BUCKET, Key="diag/test.txt", Body=b"ok", ContentType="text/plain")
    body = client.get_object(Bucket=BUCKET, Key="diag/test.txt")["Body"].read()
    print("OK. Escrita+leitura:", body)
    client.delete_object(Bucket=BUCKET, Key="diag/test.txt")
    print("Objeto de teste removido.")
except ClientError as e:
    print("ERRO:", e.response["Error"].get("Code"), "-", e.response["Error"].get("Message"))
except Exception as e:
    print("ERRO inesperado:", type(e).__name__, e)
