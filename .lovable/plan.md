
# Refinamento Enterprise do Painel Administrativo MOVVI

Objetivo: elevar o painel ao padrão Uber/99/InDrive, com **tudo persistido no Supabase**, **zero dados mock**, **propagação em tempo real** ao app do passageiro e do motorista, e UI/UX polida — sem quebrar nada do que já funciona.

Como é um escopo muito grande, vou entregar em **8 fases sequenciais**, cada uma testável de forma independente. Cada fase termina com o painel funcionando, só com mais recursos do que antes.

---

## Fase 1 — Fundação de dados e Realtime

Antes de qualquer UI nova, preciso garantir que tudo tenha onde ser salvo e que mude no app em tempo real.

- Expandir `app_settings` com **todas** as chaves novas (suporte, empresa, Google, regras operacionais, segurança, etc.) com defaults seguros.
- Nova tabela `payment_gateways` (Mercado Pago, Stripe, Asaas, PagSeguro): `provider`, `enabled`, `mode (sandbox/live)`, `api_key` (criptografada / referência a secret), `webhook_url`, `pix_key`, `extra jsonb`.
- Nova tabela `notification_channels` (firebase_push, sms, whatsapp, email): credenciais + enabled.
- Nova tabela `security_settings` (1 linha singleton): max_login_attempts, session_timeout, require_2fa, password_policy jsonb.
- Nova tabela `backups`: id, type (manual/auto), status, file_path, size, created_at.
- Expandir `tariff_rules` para cobrir **todos** os campos por categoria (base, mínima, km, min, espera, cancelamento, parada extra, noturno, pico, aeroporto, pedágio, carga, ajudante, escada, peso máx, dist máx).
- Adicionar a publicação realtime (`ALTER PUBLICATION supabase_realtime ADD TABLE ...`) em `app_settings`, `tariff_rules`, `payment_gateways`, `notification_channels`, `ride_categories` — para que mudanças no admin reflitam **imediatamente** nos apps.
- Criar hook global `useAppSettings()` (já existe — estender) e `useTariffs(category)` (já existe — estender) que assinam realtime e cacheiam.
- RLS: leitura pública apenas das chaves não-sensíveis; escrita só para admin.

## Fase 2 — Configurações da Plataforma (reescrita)

Substituir `admin.configuracoes.tsx` por uma página com **abas**:
- Empresa & Suporte
- Google & Integrações (mascarando chaves; botão "Testar conexão")
- Regras Operacionais
- Recursos (switches)
- Segurança

Componentes polidos: cards densos, labels com tooltip explicativo, validação Zod por campo, estados de loading/saving por seção, toast de sucesso/erro consistente, mobile responsivo.

## Fase 3 — Pagamentos

Nova rota `/admin/pagamentos`:
- Toggles por método (Dinheiro, PIX, Crédito, Débito, Carteira) — persistem em `app_settings`.
- Card por gateway (Mercado Pago, Stripe, Asaas, PagSeguro) com modo sandbox/live, API key (via secrets), webhook URL gerada e copiável, status de conexão.
- Configuração de PIX (chave + tipo).
- Assinatura mensal: preço, período de graça, suspensão automática (já existe parcialmente em `subscription_plans` — integrar).

## Fase 4 — Tarifas por categoria (reescrita)

Reescrever `admin.precos.tsx`:
- Seletor de categoria no topo (Carro, Moto, Entrega, Guincho, Mudança…).
- Formulário com **todos** os campos da requisição.
- **Preview de cálculo ao vivo**: usuário digita distância/tempo/horário → mostra o valor final aplicando todas as regras (reaproveita `src/lib/tariffs.ts`).
- Salvar publica via realtime → app do passageiro recalcula instantaneamente.

## Fase 5 — Mapa Operacional Aprimorado

Reescrever `admin.mapa.tsx`:
- Toggles de camadas: Motoristas online, Motoristas offline, Solicitações, Corridas aceitas, Passageiros, Heatmap de demanda, Densidade de motoristas, Tráfego (Google `TrafficLayer`).
- Heatmap via `google.maps.visualization.HeatmapLayer` baseado em corridas dos últimos N minutos.
- Painel lateral com contadores em tempo real e filtro por cidade/categoria.

## Fase 6 — Relatórios & Dashboards

Expandir `admin.relatorios.tsx` + dashboards dedicados em `/admin/financeiro`:
- Receita, Assinaturas, Motoristas, Passageiros, Categorias, Demanda por hora, Horários de pico, Top motoristas, Top cidades.
- Gráficos `recharts` (line, bar, pie, heatmap-like).
- Filtros de período, exportação CSV mantida.

## Fase 7 — Segurança, Notificações, Backups

- **Notificações**: rota expandida com cards por canal (Firebase, SMS, WhatsApp, Email) + credenciais + teste de envio.
- **Segurança**: rota nova `/admin/seguranca` com política de senha, 2FA toggle, timeout, tentativas máx, link para logs de auditoria existentes.
- **Backups**: rota `/admin/backups`. Backup manual aciona uma server function que exporta tabelas críticas para JSON em Storage (`backups` bucket). Backup automático via `pg_cron` diário. Histórico listado, download via signed URL. Restore manual (apenas super_admin) com confirmação dupla.

## Fase 8 — Polimento de UX/UI global

Passe final em **todas** as páginas admin:
- Skeleton loaders consistentes (substituir spinners genéricos).
- Empty states ilustrados (ícone + título + descrição + CTA).
- Mensagens de sucesso/erro padronizadas via `sonner` com ícones.
- Espaçamento, tipografia (escala consistente: 12/14/16/20/24/32), densidade dos cards.
- Responsividade mobile: sidebar vira drawer, tabelas viram cards empilhados.
- Atalho global de busca (⌘K) para navegar entre módulos.

---

## Detalhes técnicos

- Stack mantida: TanStack Start, Supabase, Tailwind, Google Maps connector.
- Persistência: 100% Supabase (tabelas novas + `app_settings` ampliado).
- Realtime: publicação Supabase + hooks que reassinam.
- Chaves sensíveis (Stripe, MP, Firebase, etc.): armazenadas via `add_secret`, nunca no banco em texto puro — o banco guarda apenas referência ao nome da secret.
- Migrações em SQL único por fase, com `GRANT` obrigatório em toda nova tabela pública.
- Sem quebrar rotas existentes: as páginas atuais continuam acessíveis durante a migração; a substituição é feita arquivo-a-arquivo.

---

## Confirmação antes de começar

Esse escopo é grande (estimo ~25-35 arquivos novos/editados e ~5 migrações). Posso:

**(A)** Executar tudo sequencialmente sem parar entre fases — vou levar vários turnos e você verá o painel evoluindo a cada commit.

**(B)** Executar fase por fase e te mostrar o resultado entre cada uma, para você validar antes de continuar.

**(C)** Priorizar um subconjunto (ex.: só Fases 1, 2, 4 e 8 agora — as que mais mudam a percepção de qualidade — e deixar Pagamentos/Backups/Segurança para depois).

Qual você prefere? Se não responder, sigo com **(B)** começando pela Fase 1.
