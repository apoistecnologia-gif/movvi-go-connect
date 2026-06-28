# Plano: Completar 100% do App do Motorista MOVVI

Manter identidade visual, cores, navegação e layout atuais. Substituir todas as telas "Em breve" por funcionalidades reais ligadas ao Supabase. Mobile-first, sem dados mockados.

## Fase 1 — Banco de Dados (base obrigatória)

Migração única criando o que ainda não existe:

- `driver_preferences` (user_id PK, push, ride_alerts, sound, vibration, accept_short, accept_long, max_radius_km, accept_cash, accept_pix, accept_card, theme, language, navigation_app, updated_at)
- `driver_emergency_contacts` (id, driver_user_id, name, phone, relation, is_primary)
- `driver_documents` (id, driver_id, type [cnh|crlv|selfie|vehicle_photo|insurance], file_url, status, expires_at, rejected_reason)
- `driver_announcements` (id, title, body, audience, active, starts_at, ends_at)
- View `driver_earnings_daily` agregando `rides` finalizadas (date, driver_id, trips, gross, distance_km, duration_min)
- RPC `get_driver_stats(_user_id, _from, _to)` → totals (earnings, trips, distance, online_hours, ride_hours, avg_fare, avg_per_km, acceptance_rate, cancellation_rate)
- RPC `get_driver_home_kpis(_user_id)` → KPIs do dia
- GRANTs + RLS (motorista só lê os próprios; admin lê tudo via `has_role`)

## Fase 2 — Ganhos (`/motorista/ganhos`)

Página completa substituindo o stub:
- Cards: Hoje, Ontem, Semana, Mês, Total, Corridas, KM, Horas online, Horas em viagem, Tarifa média, R$/km
- Filtros: Hoje / Ontem / Semana / Mês / Customizado (date range)
- Gráficos (recharts já no projeto): barras diárias, linha semanal, área mensal
- Extrato detalhado paginado (lista de rides finalizadas)
- Exportar CSV (já temos `csvExport.ts`) e PDF (jsPDF + autotable)

## Fase 3 — Histórico e Detalhes da Corrida

- `/motorista/corridas`: expandir card existente (foto passageiro, categoria, pagamento, ratings, horários accept/finish, botão "Ver detalhes")
- Nova rota `/motorista/corridas/$id`: timeline completa (criada → aceita → chegou → iniciada → finalizada), rota desenhada no mapa, valores, taxas, ganhos, botão "Recibo PDF"

## Fase 4 — Perfil + Status Expandidos

- `/motorista/perfil`: foto, rating médio, total corridas, "Motorista desde", veículo (modelo/cor/placa/categoria), status atual, barra de completude
- `/motorista/status`: lista de documentos com status, validade, badges (Aprovado/Pendente/Reprovado/Vencido), alerta amarelo se expira em ≤30 dias

## Fase 5 — Configurações Reais (`/motorista/configuracoes`)

Reescrever para persistir tudo em `driver_preferences`:
- Notificações (push, alertas, som, vibração)
- Corridas (curtas, longas, raio máx 1–50km)
- Pagamentos aceitos (dinheiro, PIX, máquina)
- Aparência (claro/escuro/sistema via `useTheme` já existente)
- Navegação (interna/Google Maps/Waze) — usado nos botões "Navegar" do app
- Idioma (pt/en/es) — i18n base
- Privacidade: permissões, limpar cache, "Sair de todos os dispositivos" (`supabase.auth.signOut({ scope: 'global' })`)

## Fase 6 — Home do Motorista

Painel flutuante no `/motorista/app` (offline) com KPIs do dia via `get_driver_home_kpis`:
- Ganhos hoje, corridas hoje, horas online, km, rating, taxa de aceitação, taxa de cancelamento, nível, promoção atual, anúncios, status da assinatura

## Fase 7 — Segurança + Notificações + Recibos

- `/motorista/seguranca`: SOS (já existe sos_alerts), CRUD de contatos de emergência, compartilhar localização ao vivo (link com token), ligar 190
- `/motorista/notificacoes`: inbox via `notification_inbox` (filtro por tipo, marcar lida, excluir)
- `src/lib/receipt.ts`: gerador de PDF reutilizado em corridas e detalhes

## Fase 8 — Polimento e Bug Sweep

- Revisar todos os botões/links do menu lateral do motorista; remover qualquer "Em breve"
- Loading skeletons, paginação no histórico, lazy load gráficos
- Validar formulários (zod), tratar erros em PT-BR
- Testar fluxos: cadastro → status → online → corrida → finalização → recibo → ganhos atualizados

## Tecnologias

Reuso: shadcn/ui, recharts, sonner, zod, supabase realtime, `useTheme`, `csvExport`. Adicionar: `jspdf` + `jspdf-autotable` para PDFs.

## Entrega

Cada fase entregue e testada antes da próxima. Confirmação a cada fase. Começo pela **Fase 1 (migração)** assim que aprovado.
