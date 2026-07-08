## Escopo

Apenas UI, layout, navegação, comportamento de mapa e responsividade do app do motorista (`src/routes/motorista.app.tsx` + subcomponentes). Nada de schema, RLS, edge functions, precificação, PIN, autenticação ou matching.

O app já tem a maioria das estruturas pedidas (IdleBottomPanel, MovviSheet compacto, `ActiveTripNavOverlay` em tela cheia, offer entrante). O trabalho é polir cada uma delas para os critérios da tarefa.

## Mudanças por seção

### 1. Home online/offline (`IdleBottomPanel`, ~L1316–1410)
- Reduzir altura total do card idle (hoje ocupa ~28vh) para deixar mais mapa à mostra.
- Header compacto no topo (avatar + nome + pill ONLINE/OFFLINE + "Recebendo solicitações").
- Métricas "Corridas hoje" em linha única de 3 mini-stats.
- CTA "Ficar online/offline" sempre visível no rodapé com `padding-bottom: calc(env(safe-area-inset-bottom) + 20px)`.
- Remover cards vazios/redundantes; preservar mensagens de GPS.

### 2. Oferta entrante (bloco de incoming request)
- Reescrever card em layout fixo (não arrastável, `min-h-dvh` com scroll interno se preciso).
- Ordem: valor motorista → distância/tempo até coleta → distância/tempo total → categoria → passageiro (nome+rating) → endereços coleta/destino → forma de pagamento → countdown.
- Botões "Recusar" (secundário) e "Aceitar corrida" (primário verde MOVVI) fixos no rodapé com safe-area.
- Testar visualmente em 360x800 / 390x844 / 412x915 via Playwright.

### 3. Indo à coleta (`ActiveRidePanel` fase `motorista_a_caminho`)
- Sheet compacto com snaps reduzidos (~ `[46, 62]` em vez de `[54, 76, 92]`) para não cobrir a rota.
- Conteúdo: passageiro (nome+rating+avatar), endereço coleta, ETA/km.
- CTA "Cheguei ao local" fixo no snap mínimo — sempre visível sem arrastar.
- Ações call/mensagem em ícones compactos.

### 4. Chegou / PIN (fase `motorista_chegou`)
- Painel compacto com status "Aguardando passageiro", passageiro, instrução "Peça o PIN ao passageiro".
- CTA "Iniciar corrida" fixo. Diálogo de PIN continua o mesmo (lógica intacta).

### 5. Em viagem (`ActiveTripNavOverlay`, L2608+)
- Auditar altura do painel inferior: garantir 96–140px.
- Barra superior compacta com instrução/status + ETA/km à direita.
- Botão recenter posicionado acima do painel (já existe, ajustar offset).
- CTA "Finalizar corrida" sempre visível.
- Confirmar `fitBounds` / camera com padding inferior correto para a rota não ficar escondida.
- Manter estilo dark do mapa.

### 6. Trip completed
- Tela de resumo já existe (rating + summary). Ajustar para exibir claramente: ganho, passageiro, resumo de rota, status pagamento, CTA "Receber novas corridas" (volta ao idle online).

### 7. Safe-area e responsividade global
- Trocar quaisquer `min-h-screen` / `h-screen` residuais por `min-h-dvh` / `h-dvh`.
- Aplicar `padding-bottom: calc(env(safe-area-inset-bottom) + 20px)` em todos os painéis fixos inferiores.
- Verificar overflow/clipping em 360x800.

### 8. Validação
- Playwright headless em 360x800, 390x844, 412x915 capturando: idle online, idle offline, mock de oferta (se possível via estado), painel a caminho, overlay em viagem.
- Ler screenshots para confirmar CTAs visíveis e mapa não coberto.

## Fora de escopo (não tocar)
- Passageiro (`passageiro.*`).
- `rideLifecycle`, server functions de accept/arrive/start/complete, PIN, pricing, matching.
- Migrations, RLS, edge functions.
- `MovviMap` internals além de padding/camera props existentes.

## Detalhes técnicos
- Arquivo principal: `src/routes/motorista.app.tsx` (2743 linhas).
- Subcomponentes já in-file: `IdleBottomPanel`, `ActiveRidePanel`, `ActiveTripNavOverlay`, `PremiumTopBar`-equivalente do driver.
- `MovviSheet` snaps são configuráveis por prop `snaps` — sem alterar o componente.
- Nenhum novo arquivo obrigatório; se um subcomponente crescer muito, extrair para `src/components/driver/`.
