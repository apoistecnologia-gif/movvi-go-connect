# Admin Panel MOVVI DRIVE — Plano de Implementação

Escopo enorme (17 módulos). Vou entregar em **fases incrementais**, cada uma totalmente funcional, ligada ao Supabase, sem mocks. Confirme o plano e a ordem antes de eu começar.

## Arquitetura comum (Fase 0 — base)

- **Shell admin novo:** `src/components/admin/AdminLayout.tsx` com sidebar fixa (desktop) + drawer (mobile), header com busca/notificações, tema escuro + accents `#8DD92B`.
- **Rotas:** mover painel para layout `src/routes/_admin/` (route gate via `AdminGuard` existente + `has_role('admin')`). Mantém `/admin/login`. Cada módulo vira `/admin/<modulo>`.
- **RBAC:** estender enum `app_role` com `admin`, `super_admin`, `financial`, `support`, `operations`, `readonly`. Helper `useAdminRole()` + componente `<Can role="...">`.
- **Realtime:** hook `useRealtimeTable(table, filter)` reutilizável.
- **Settings dinâmicos:** tabela `admin_settings` já existe; criar `useSetting(key)` + `useSettings(prefix)` com cache + realtime. Tarifas e configurações do app passam por aqui — apps passageiro/motorista já consomem via `loadTariffs()`.
- **Audit log:** tabela `admin_audit_logs` + trigger helper `log_admin_action()` chamado nas mutations.

## Fases

### Fase 1 — Banco de dados (migration única)
Criar/ajustar tabelas, com GRANTs + RLS + realtime + índices:

- `app_role` enum estendido + `user_roles` atualizado.
- `ride_categories` (key, label, icon, color, enabled, sort_order).
- `tariff_rules` (category_id, field_key, value numeric, updated_by, updated_at) — substitui chaves soltas, mas mantém compat via view `admin_settings`.
- `coupons` (code, type, value, max_discount, valid_from, valid_to, usage_limit, used_count, scope, enabled).
- `coupon_redemptions` (coupon_id, user_id, ride_id, amount).
- `subscriptions` (já existe — adicionar campos `grace_period_days`, `promotional_price`, `auto_suspend`).
- `subscription_plans` (price, promo_price, billing_cycle_days, grace_days).
- `notifications_broadcast` (title, body, audience_type, audience_filter, sent_at, sent_by, delivery_count).
- `admin_audit_logs` (actor_id, action, entity, entity_id, before, after, ip).
- `admin_login_history` (user_id, ip, ua, success, created_at).
- `app_settings` chaves padrão: plataforma, suporte, mapa, raios, timeouts, multiplicadores (noturno/pico/feriado), taxas (aeroporto, pedágio, parada extra).
- `rides` — garantir colunas: `waypoints jsonb`, `payment_method`, `coupon_id`, `surge_multiplier`, `night_multiplier`.
- Index em `rides(status, created_at)`, `drivers(approval_status, online)`, `users(role, created_at)`.
- Trigger `auto_suspend_overdue_subscriptions()` rodando via pg_cron.
- Realtime publication: `rides, drivers, ride_categories, tariff_rules, app_settings, notifications_broadcast`.

### Fase 2 — Dashboard
KPIs reais via SQL agregada + realtime. Mapa ao vivo com motoristas online (`drivers` + canal realtime). Lista das últimas 20 solicitações.

### Fase 3 — Motoristas (expansão do atual)
Aproveita `/admin/motoristas`. Adiciona: editar dados, suspender/bloquear/excluir, histórico de corridas, avaliações, ganhos, status de assinatura.

### Fase 4 — Passageiros
`/admin/passageiros` — listar, filtrar, detalhar, editar/suspender/bloquear/excluir, histórico de corridas, rating.

### Fase 5 — Corridas
`/admin/corridas` — filtros por status, busca, detalhe completo (timeline + rota GPS via Google Maps Directions com `polyline` salva).

### Fase 6 — Categorias + Tarifas dinâmicas
- `/admin/categorias` — CRUD enable/disable, rename, ícone, cor, ordem.
- `/admin/tarifas` — editor por categoria com campos específicos (Carro: base, mín, /km, /min, espera grátis, espera/min, cancelamento, multiplicador noturno/pico, aeroporto, pedágio, parada extra; Moto/Entrega/Guincho/Mudança com seus campos).
- Função `computeFare(category, ride_context)` em `src/lib/fareEngine.ts` consumindo tudo do banco (substitui `tariffs.ts` + `rideCategories.estimateFare`).
- Apps passageiro/motorista assinam realtime das tabelas — sem novo deploy.

### Fase 7 — Assinaturas + Financeiro
- `/admin/assinaturas` — planos, cobranças, status, suspensão automática.
- `/admin/financeiro` — receitas, gráficos (recharts) diário/mensal, pagos vs vencidos.

### Fase 8 — Cupons
`/admin/cupons` — CRUD completo, tipos (%, fixo, primeira corrida, frete grátis), validade, limite, desconto máximo. Aplicação integrada no `fareEngine`.

### Fase 9 — Notificações Push
`/admin/notificacoes` — compositor + segmentação (todos, motoristas, passageiros, cidade, categoria, usuário específico). Persistência em `notifications` + envio via Web Push (FCM) se chave configurada; senão grava in-app.

### Fase 10 — Configurações do App
`/admin/configuracoes` — formulário das chaves `app_settings`. Apps consomem via `useSetting`.

### Fase 11 — Relatórios
`/admin/relatorios` — gerador com filtros + export CSV/Excel (`xlsx` lib) e PDF (`pdfmake`). 

### Fase 12 — Mapa ao vivo
`/admin/mapa` — motoristas online, solicitações ativas, corridas em andamento, heatmap (HeatmapLayer), histórico filtrável.

### Fase 13 — Segurança/Auditoria
- `/admin/usuarios-admin` — gestão de admins com RBAC.
- `/admin/logs` — audit logs + login history com filtros.

## Detalhes técnicos

- Tudo TanStack Query + `createServerFn` para mutations sensíveis (auditadas).
- Realtime via canal por página, com `removeChannel` no unmount.
- Componentes shadcn (Table, Tabs, Dialog, Form com zod).
- Sidebar destacando rota ativa, colapsável no mobile (Sheet).
- Acessos por role escondem itens do menu e bloqueiam rotas (`<Can />`).
- Nenhum `Em breve` — qualquer item não pronto fica fora do menu até a fase entregar.

## Tamanho

Isto são ~40 arquivos novos + 1 migration grande. Vou entregar **uma fase por turno** para você revisar. Posso começar pela **Fase 1 (migration) + Fase 0 (shell)** no próximo turno.

## Pergunta antes de começar

1. Confirma a ordem de entrega (Fase 0/1 primeiro)?
2. Push notifications: configurar FCM agora (precisa chave do servidor) ou deixar como in-app por enquanto?
3. Algum módulo prioritário fora da ordem acima?
