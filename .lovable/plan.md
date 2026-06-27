# MOVVI Admin — Plano de Conclusão

A entrega é gigantesca (13 módulos novos, todos com CRUD + realtime + exportação). Vou dividir em fases pequenas e verificáveis para não quebrar nada do que já está pronto (Dashboard, Motoristas, Categorias, Preços).

Regras gerais aplicadas a todas as fases:
- Reuso de `AdminLayout`, `AdminSidebar`, `AdminGuard`, `useRealtimeTable`, `logAdminAction`, `useAppSettings`, `formatBRL`.
- Zero dado mockado; todas as listagens leem do Supabase.
- Sidebar é incrementada a cada fase (item habilitado só quando a página existir).
- Realtime via canais Supabase nas tabelas relevantes.
- Sem alterar Dashboard, Categorias e Preços existentes.

## Fase A — Migrações de schema que faltam
Uma única migration cobrindo:
- `passengers_admin_view` (view leve com agregados: total_rides, completed, cancelled, total_spent, avg_rating, last_login) — calculada por SQL function `get_passenger_stats(uuid)`.
- Colunas `suspended_at`, `blocked_at`, `block_reason` em `users` (passageiros) — se ainda não existirem.
- Tabela `admin_users_meta` (role já vive em `user_roles`; aqui só `display_name`, `phone`, `last_login_at`).
- Atualizar `app_settings` com chaves padrão de "Platform Settings" (platform_name, support_email, support_phone, whatsapp, currency, country, timezone, allow_cash, allow_pix, allow_credit_card, allow_scheduled, require_gps, require_driver_approval, enable_promotions, enable_notifications).
- Cron `auto_suspend_overdue_subscriptions()` já existe — adicionar `pg_cron` schedule diário.
- Grants + RLS nas novas estruturas.

## Fase B — Passageiros (`/admin/passageiros`)
- Lista com busca (nome/email/telefone), filtros (ativo/suspenso/bloqueado), paginação server-side.
- Drawer de detalhes: perfil, agregados (KPIs), histórico de corridas (últimas 50), avaliação média.
- Ações: editar, suspender, bloquear, excluir (todos auditados via `logAdminAction`).

## Fase C — Corridas (`/admin/corridas`)
- Tabela com filtros rápidos (Hoje / Ontem / Semana / Mês / por status) + busca (ID, passageiro, motorista, categoria, cidade).
- Drawer com mapa Google (`MovviMap`) renderizando origem/destino + polyline, timeline de status, dados completos, ação "Cancelar corrida".

## Fase D — Mapa Operacional (`/admin/mapa`)
- Mapa fullscreen com camadas alternáveis: motoristas online/offline, solicitações ativas, corridas em andamento.
- Atualização via Supabase Realtime (`drivers`, `rides`).

## Fase E — Preços (renomear para "Tarifas")
- Renomear item da sidebar para "Tarifas"; rota `/admin/precos` mantida (já indexada).
- Ampliar campos editáveis: `base_fare, min_fare, per_km, per_min, free_wait_min, wait_per_min, cancel_fee, extra_stop_fee, airport_fee, toll_fee, night_mult, peak_mult, max_search_radius_km, max_pickup_km, max_wait_min, max_stops`.
- Botão "Resetar para padrão" e "Pré-visualizar tarifa" (calcula via `src/lib/tariffs.ts`).

## Fase F — Promoções (`/admin/cupons`)
- CRUD em `coupons`: tipo (percent/fixed/first_ride/free_delivery), max_discount, expires_at, usage_limit, enabled.
- Listagem de resgates via `coupon_redemptions`.

## Fase G — Assinaturas (`/admin/assinaturas`)
- CRUD `subscription_plans` (preço mensal, preço promocional, grace period).
- Lista de `subscriptions` ativas/vencidas, ação "suspender manualmente".
- Confirmação de que `auto_suspend_overdue_subscriptions` está agendado.

## Fase H — Financeiro (`/admin/financeiro`)
- Cards de receita (hoje/mês/ano), assinaturas pagas/vencidas, pagamentos pendentes (de `payments`).
- Gráficos com `recharts` (já é dep do shadcn chart).
- Export CSV/Excel (via `xlsx` lib) e PDF (via `jspdf`).

## Fase I — Relatórios (`/admin/relatorios`)
- Geração por tipo (motoristas, passageiros, corridas, receita, assinaturas, categorias).
- Exportação CSV/Excel/PDF.

## Fase J — Notificações (`/admin/notificacoes`)
- Form de broadcast → grava em `notifications_broadcast` + fanout para `notifications` (todos / motoristas / passageiros / cidade / categoria / específico).
- Histórico dos broadcasts.

## Fase K — Configurações da plataforma (`/admin/configuracoes`)
- Formulário lendo/gravando `app_settings` (campos listados na Fase A).

## Fase L — Administradores (`/admin/administradores`)
- CRUD de admins: criar via Supabase Admin (server fn protegida com `requireSupabaseAuth` + checagem `has_role('super_admin')`).
- Atribuição de papéis (`super_admin`, `operations`, `financial`, `support`, `readonly`).
- Sidebar/Guards passam a respeitar permissões por papel.

## Fase M — Logs do sistema (`/admin/logs`)
- Lista paginada + filtros (entity, action, actor) sobre `admin_audit_logs` e `admin_login_history`.
- Trigger de `admin_login_history` no login do admin (`/admin/login`).

---

**Sequência sugerida de entrega (por turno):**
1. Fase A (migration) — bloqueante para B/K/L.
2. Fase B + sidebar update.
3. Fase C + Fase D (módulos operacionais).
4. Fase E (expansão Tarifas) + Fase F (Cupons).
5. Fase G (Assinaturas) + Fase K (Configurações).
6. Fase H (Financeiro) + Fase I (Relatórios) — exigem `bun add xlsx jspdf jspdf-autotable recharts(?)`.
7. Fase J (Notificações).
8. Fase L (Administradores) + Fase M (Logs) — finaliza com governança.

Confirma que devo seguir nessa ordem (começando agora pela Fase A)? Se preferir priorizar algum módulo específico (ex.: pular direto para Passageiros + Corridas), me diga e ajusto a fila.
