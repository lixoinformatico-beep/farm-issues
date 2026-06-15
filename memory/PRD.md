# PRD — Farma·Issues (Gestão de Problemas de Farmácias)

## Problema original
> Quero criar uma aplicação que registe problemas levantados pelas farmácias e registadas pelos consultores, onde eu posso criar pontos de situação e acompanhar a resolução do problema.

## Personas
- **Consultor**: regista problemas reportados pelas farmácias e cria pontos de situação. Edita os próprios problemas.
- **Administrador**: gere utilizadores, vê dashboard, exporta relatórios, edita/elimina qualquer problema.

## Stack
- **Backend**: FastAPI + Motor (MongoDB async) + JWT (PyJWT) + bcrypt + Resend + Emergent Object Storage.
- **Frontend**: React 19 + React Router 7 + Tailwind + shadcn/ui + Phosphor + Recharts.

## Endpoints `/api/*`
- Auth: `POST /auth/login|logout`, `GET /auth/me`
- Users (admin para escrita): `GET /users`, `POST /users`, `PATCH /users/{id}`, `DELETE /users/{id}`
- Problemas: `GET/POST /problemas`, `GET/PATCH/DELETE /problemas/{id}` (DELETE só admin; PATCH só criador ou admin)
- Follow-ups: `POST /problemas/{id}/followups`
- Anexos: `POST /problemas/{id}/attachments` (multipart), `GET /attachments/{id}/download`, `DELETE /attachments/{id}`
- Stats: `GET /stats` (KPIs + agregados)
- Export: `GET /problemas/export/csv`

## Implementado

### v1.0 — MVP (15/06/2026)
- ✅ Login JWT + seed admin (admin@farmacias.pt / admin123)
- ✅ Dashboard com KPIs + gráficos (Recharts)
- ✅ Lista de problemas com tabela densa, pesquisa, filtros
- ✅ Criação/edição via Sheet lateral
- ✅ Timeline de pontos de situação com mudança de estado
- ✅ Exportação CSV (separador `;`)
- ✅ Página Relatórios (taxa de resolução)
- ✅ Testing: 100% backend (16/16), 100% frontend

### v1.1 — Gestão avançada (15/06/2026)
- ✅ **Gestão de Utilizadores** (`/utilizadores`, admin-only) com criar/eliminar
- ✅ **Atribuição** via dropdown de utilizadores no Sheet criar/editar
- ✅ **Notificações por email** (Resend `onboarding@resend.dev`) em:
  - Atribuição (notifica o utilizador atribuído)
  - Novo ponto de situação (notifica criador + atribuído, exceto autor)
  - Problema resolvido (notifica criador + atribuído)
- ✅ **Permissões por role**:
  - Admin: tudo (CRUD utilizadores, eliminar problemas)
  - Consultor: ver tudo, criar problemas/follow-ups/anexos, editar/resolver os seus
- ✅ **Audit log** visível em tab "Histórico" (criou, atualizou, atribuiu, ponto_situacao, anexo_adicionado, anexo_removido)
- ✅ **Anexos** via Emergent Object Storage (PDF, imagens, docs até 10MB) com upload/download/eliminar
- ✅ Detail sheet reorganizado em 3 tabs: Pontos de situação | Anexos | Histórico
- ✅ Testing: 100% backend (32/32), 100% frontend

## Backlog
### P1
- Replace native date input com shadcn Calendar + format dd/mm/yyyy
- Domínio próprio verificado no Resend (em vez do sandbox)
- Brute-force lockout em /api/auth/login

### P2
- Histórico/audit log gráfico no Dashboard (atividade temporal)
- Cookie secure=True em produção
- Permitir editar campos do problema via Sheet (não só estado/atribuído)
- Anexos directamente em follow-ups (não só em problemas)

### P3
- App móvel (PWA)
- Importação CSV em massa
- Filtros avançados: "atribuído a mim", intervalo de datas
