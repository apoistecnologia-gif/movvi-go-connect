# Plano: Passageiro MOVVI — Production Ready

Este é um escopo muito grande (12 áreas + várias telas novas + schema novo). Vou entregar em **5 fases sequenciais**, cada uma testável e sem quebrar o que já funciona. Confirme se a ordem está OK antes de eu começar.

## Premissas
- Não recriar telas existentes — só refinar.
- Manter tema escuro, branding, máquina de estados da corrida, RLS atual.
- Tudo persistido no Lovable Cloud (Supabase). Sem mocks. Sem "em breve".

---

## Fase 1 — Home, Top Bar e Cartão de Embarque
- Top bar: alinhar hambúrguer + botão tema, aumentar ícone ~10%, espaçamento consistente.
- Saudação: capitalizar primeiro nome (`Franciel`, não `FRANCIEL`), auto-shrink se nome longo, sem truncar com `...`.
- Cartão de origem:
  - Título "Seu local de embarque" (substitui "Localização aproximada").
  - Reverse geocoding → endereço completo; falha → mostrar `lat, lng` formatado; **nunca** endereço falso.
  - Botão "Atualizar GPS" (refresh) no cartão.
- Polimento de espaçamento/tipografia da home.

## Fase 2 — Perfil completo (`/passageiro/perfil`)
- Novos campos no schema `users`: `cpf`, `birth_date`, `gender`, `emergency_contact_name`, `emergency_contact_phone`, `email_verified_at`, `phone_verified_at`.
- Tela com: foto (com crop), nome, CPF (máscara + validação), nascimento, telefone, e-mail, contato de emergência, gênero (opcional), trocar senha, verificar e-mail (reenvio), verificar telefone (OTP via Supabase), excluir conta (server fn que apaga via Admin API).
- Validação Zod, persistência real, feedback de erro PT-BR.

## Fase 3 — Configurações funcionais (`/passageiro/configuracoes`)
- Nova tabela `passenger_preferences` (push, ride_alerts, promotions, sound, vibration, language, theme).
- Tema: light / dark / system (provider já tem dark — adicionar toggle real).
- Privacidade: status da permissão GPS + link para abrir configurações do SO + Termos / Política.
- Suporte: FAQ, abrir ticket, chat (placeholder funcional do `support_tickets`), WhatsApp, ligar, emergência.
- Sobre: versão do app, logout.

## Fase 4 — Histórico + Avaliação + Notificações
- Histórico: filtros (Hoje/Semana/Mês/Concluídas/Canceladas) + busca; cada item mostra motorista, veículo, categoria, origem, destino, km, duração, valor, pagamento, recibo (modal), rota (mini-mapa) e avaliação dada.
- Avaliação: garantir fluxo único pós-corrida (já existe `enforce_single_rating`); adicionar "Favoritar motorista" (tabela `favorite_drivers`) e "Reportar motorista" (tabela `driver_reports`). Após enviar → não exibir mais.
- Central de notificações `/passageiro/notificacoes`: usa tabela `notifications` existente; contador não-lidas no sino, marcar todas, excluir.

## Fase 5 — Suporte, Promoções, Segurança, Mapa & Polimento UI
- Suporte (`/passageiro/suporte`): FAQ estática, abrir chamado (`support_tickets`), WhatsApp/telefone via `app_settings`, emergência (cria `sos_alerts`), itens perdidos, problemas na corrida.
- Promoções (`/passageiro/promocoes`): listar `coupons` ativos, resgatar (grava em `coupon_redemptions`), código de indicação (`referrals`), convidar amigos (share link).
- Segurança (`/passageiro/seguranca`): sessões ativas (Supabase Auth), histórico de login (`auth_login_history` nova), 2FA TOTP (Supabase MFA), trocar senha, sair de todos os dispositivos.
- Mapa: animação suave do GPS (interpolação), marcadores premium de origem/destino, motoristas próximos via `driver_public_locations` com movimento realtime, melhor estado de loading.
- Polimento global: spacing/typography tokens, micro-animações framer-motion já instalado se houver, estados vazios e de erro consistentes, transições entre páginas.

---

## Mudanças de schema (resumo)
Migrations necessárias (em ordem, com GRANTs + RLS):
1. `ALTER users` add cpf, birth_date, gender, emergency_contact_*, email_verified_at, phone_verified_at.
2. `passenger_preferences` (1:1 com user).
3. `favorite_drivers` (passenger_id, driver_id).
4. `driver_reports` (passenger_id, driver_id, ride_id, reason, details).
5. `support_tickets` + `support_messages`.
6. `referrals` (referrer_id, referred_id, code, status).
7. `auth_login_history` (user_id, ip, ua, location, created_at).
8. FAQ pode ficar estática em JSON — sem tabela.

Todas com RLS escopo `auth.uid()` e GRANTs para `authenticated` + `service_role`.

---

## Riscos / Decisões pendentes
- **Verificação de telefone**: Supabase Phone Auth precisa de provedor SMS configurado (Twilio etc.). Se não houver, faço UI + marca `phone_verified_at` quando provider for plugado depois. OK?
- **Excluir conta**: ação destrutiva via server fn com Admin API + confirmação dupla. OK?
- **2FA TOTP**: usa Supabase MFA nativo, sem custo extra.
- **Promoções/Indicação**: vou criar a lógica básica (resgate + bônus em crédito interno) — sem integração com gateway de pagamento real nesta entrega.

---

## Como vou trabalhar
- Uma fase por vez. Ao fim de cada uma: build limpo, smoke test, te aviso para validar.
- Sem tocar em motorista/admin além do mínimo necessário.

**Posso começar pela Fase 1?** Se quiser priorizar outra fase primeiro (ex: Perfil antes da Home), me diga.
