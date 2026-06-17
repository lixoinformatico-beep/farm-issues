"""Email notifications via Resend."""
import os
import asyncio
import logging
import resend

logger = logging.getLogger(__name__)

resend.api_key = os.environ.get("RESEND_API_KEY", "")
SENDER = os.environ.get("SENDER_EMAIL", "onboarding@resend.dev")
APP_NAME_LABEL = "Farma·Issues"


def _wrap(title: str, body_html: str) -> str:
    return f"""
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background-color:#F4F3EF;font-family:Helvetica,Arial,sans-serif;color:#1E231F;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F3EF;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #E5E3DB;">
        <tr><td style="padding:24px 32px;border-bottom:1px solid #E5E3DB;background:#384C37;">
          <span style="color:#fff;font-size:11px;letter-spacing:3px;text-transform:uppercase;">{APP_NAME_LABEL}</span>
          <h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:500;">{title}</h1>
        </td></tr>
        <tr><td style="padding:28px 32px;">{body_html}</td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #E5E3DB;color:#8A938B;font-size:11px;">
          Email automático · Farma·Issues
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
""".strip()


async def _send(to: str, subject: str, html: str):
    if not to or not resend.api_key:
        return None
    try:
        params = {"from": SENDER, "to": [to], "subject": subject, "html": html}
        return await asyncio.to_thread(resend.Emails.send, params)
    except Exception as e:
        logger.error(f"Email falhou para {to}: {e}")
        return None


def _row(label: str, value) -> str:
    return f"<tr><td style='padding:6px 0;color:#8A938B;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;width:140px;'>{label}</td><td style='padding:6px 0;color:#1E231F;font-size:14px;'>{value or '—'}</td></tr>"


async def notify_assigned(to_email: str, problema: dict, assigner_name: str):
    title = "Foi-lhe atribuído um pedido de apoio"
    rows = "".join([
        _row("Farmácia", problema.get("farmacia")),
        _row("Laboratório", problema.get("laboratorio")),
        _row("Tipologia", problema.get("tipologia")),
        _row("Prioridade", problema.get("prioridade")),
        _row("Estado", problema.get("estado")),
        _row("Atribuído por", assigner_name),
    ])
    body = f"""
<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#343A35;">
  Foi-lhe atribuído um novo pedido de apoio. Os detalhes encontram-se abaixo.
</p>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border-top:1px solid #E5E3DB;border-bottom:1px solid #E5E3DB;margin:12px 0;">{rows}</table>
<p style="margin:16px 0 4px;color:#8A938B;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">Descrição</p>
<p style="margin:0;font-size:14px;line-height:1.6;color:#1E231F;white-space:pre-wrap;">{problema.get('descricao','')}</p>
"""
    return await _send(to_email, f"[Farma·Issues] {title}: {problema.get('farmacia','')}", _wrap(title, body))


async def notify_followup(to_emails: list, problema: dict, followup: dict):
    title = "Novo ponto de situação"
    estado_change = ""
    if followup.get("novo_estado") and followup["novo_estado"] != followup.get("estado_anterior"):
        estado_change = f"<p style='margin:8px 0;font-size:13px;color:#384C37;'><strong>Mudança de estado:</strong> {followup['estado_anterior']} → {followup['novo_estado']}</p>"
    body = f"""
<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#343A35;">
  Foi adicionado um novo ponto de situação ao pedido de apoio da <strong>{problema.get('farmacia','')}</strong>.
</p>
<p style="margin:0 0 4px;color:#8A938B;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">Autor</p>
<p style="margin:0 0 12px;font-size:14px;color:#1E231F;">{followup.get('autor','')}</p>
{estado_change}
<p style="margin:12px 0 4px;color:#8A938B;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">Conteúdo</p>
<div style="background:#F4F3EF;border:1px solid #E5E3DB;padding:12px;font-size:14px;line-height:1.6;color:#1E231F;white-space:pre-wrap;">{followup.get('texto','')}</div>
"""
    results = []
    for email in to_emails:
        results.append(await _send(email, f"[Farma·Issues] {title}: {problema.get('farmacia','')}", _wrap(title, body)))
    return results


async def notify_resolved(to_emails: list, problema: dict, resolver_name: str):
    title = "Pedido de apoio resolvido"
    body = f"""
<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#343A35;">
  O pedido de apoio da <strong>{problema.get('farmacia','')}</strong> foi marcado como
  <span style="color:#426B4F;font-weight:600;">Resolvido</span> por {resolver_name}.
</p>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border-top:1px solid #E5E3DB;border-bottom:1px solid #E5E3DB;margin:12px 0;">
  {_row("Farmácia", problema.get("farmacia"))}
  {_row("Laboratório", problema.get("laboratorio"))}
  {_row("Tipologia", problema.get("tipologia"))}
</table>
<p style="margin:0;font-size:14px;line-height:1.6;color:#1E231F;white-space:pre-wrap;">{problema.get('descricao','')}</p>
"""
    results = []
    for email in to_emails:
        results.append(await _send(email, f"[Farma·Issues] {title}: {problema.get('farmacia','')}", _wrap(title, body)))
    return results


async def notify_status_change(to_emails: list, problema: dict, old_state: str, new_state: str, by_name: str):
    title = "Estado atualizado"
    body = f"""
<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#343A35;">
  O estado do pedido de apoio da <strong>{problema.get('farmacia','')}</strong> foi atualizado por {by_name}.
</p>
<p style="margin:8px 0;font-size:13px;color:#384C37;"><strong>Mudança de estado:</strong> {old_state} &rarr; {new_state}</p>
<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border-top:1px solid #E5E3DB;border-bottom:1px solid #E5E3DB;margin:12px 0;">
  {_row("Farmácia", problema.get("farmacia"))}
  {_row("Laboratório", problema.get("laboratorio"))}
  {_row("Tipologia", problema.get("tipologia"))}
</table>
"""
    results = []
    for email in to_emails:
        results.append(await _send(email, f"[Farma·Issues] {title}: {problema.get('farmacia','')}", _wrap(title, body)))
    return results
