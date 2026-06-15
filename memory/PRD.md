# PRD — Farma·Issues (Gestão de Problemas de Farmácias)

## Problema original
> Quero criar uma aplicação que registe problemas levantados pelas farmácias e registadas pelos consultores, onde eu posso criar pontos de situação e acompanhar a resolução do problema.

## Personas
- **Consultor**: regista problemas reportados pelas farmácias e cria pontos de situação.
- **Administrador**: vê dashboard, exporta relatórios, gere todos os problemas.

## Decisões do utilizador
- Autenticação: JWT simples (email + password) com httpOnly cookies.
- Campos de problema: Farmácia, Laboratório, Consultor, Descrição, Tipologia (TFO, Simples, Encomendas, Preço Plataforma), Prioridade, Estado, Data prevista, Atribuído a.
- Pontos de situação: texto + data + autor + (opcional) mudança de estado (Aberto → Em Curso → Resolvido).
- Funcionalidades extra: dashboard com estatísticas, filtros, pesquisa, exportação CSV.
- Idioma: Português (PT-PT).
- Tema visual: paleta orgânica earthy (Forest Green / Bone White) + Chivo + IBM Plex Sans (design_agent archetype 1).

## Arquitetura
- Backend: FastAPI + Motor (MongoDB async) + JWT (PyJWT) + bcrypt.
- Frontend: React 19 + React Router 7 + Tailwind + shadcn/ui + Phosphor Icons + Recharts.
- Endpoints `/api/*`:
  - `POST /api/auth/login|logout|register`, `GET /api/auth/me`
  - `GET/POST/PATCH/DELETE /api/problemas`
  - `POST /api/problemas/{id}/followups`
  - `GET /api/stats` (KPIs + agregados)
  - `GET /api/problemas/export/csv`

## Implementado (15/06/2026) — MVP completo
- ✅ Login JWT (httpOnly cookies) + seed admin (`admin@farmacias.pt` / `admin123`)
- ✅ Layout com sidebar (Dashboard, Problemas, Relatórios) + logout
- ✅ Dashboard: 4 KPIs + gráfico pie (Tipologia) + gráfico barras (Top farmácias) + tabela recentes
- ✅ Listagem de problemas com tabela densa, pesquisa, filtros (estado, tipologia, farmácia)
- ✅ Criação de problemas (Sheet lateral)
- ✅ Detalhe do problema (Sheet lateral) com timeline de pontos de situação, mudanças de estado, ações rápidas
- ✅ Adicionar ponto de situação com mudança opcional de estado
- ✅ Exportação CSV (separador `;`)
- ✅ Página Relatórios com tabela de taxa de resolução por farmácia
- ✅ Testing agent: 100% backend (16/16), 100% frontend

## Backlog (próximos passos sugeridos)
### P1
- Registo de utilizadores na UI (atualmente só admin seeded; endpoint existe)
- Atribuir problema a consultor via dropdown (lista de utilizadores)
- Notificações por email (Resend) quando problema é atribuído ou resolvido
- Anexos a problemas (object storage)

### P2
- Permissões por role (admin vs consultor) — admin pode apagar, consultor só cria/atualiza os seus
- Histórico/audit log de alterações
- Lockout após 5 logins falhados
- Dashboard com gráfico temporal (problemas abertos vs resolvidos por mês)
- Cookie secure=True em produção
- Adicionar `DialogDescription` para silenciar warning a11y do Radix

### P3
- App móvel (PWA) para consultores no terreno
- Importação CSV em massa
