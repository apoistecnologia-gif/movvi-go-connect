# Refatoração UX do fluxo do passageiro

Apenas UI, layout, navegação e apresentação. Nenhuma alteração em backend, RLS, migrations, edge functions, preço, pagamento, PIN, state machine da corrida, matching, auth ou recuperação de corrida ativa.

## 1. Máquina de estados de UI (client-only)

Introduzir no `src/routes/passageiro.app.tsx` um `flowStep` puramente visual:

```text
idle  →  destination_picked  →  category_select  →  confirming  →  active_ride
```

- `idle`: home limpa (só busca de destino).
- `destination_picked`: destino escolhido, calculando rota.
- `category_select`: mostra lista vertical de categorias + preço + pagamento + CTA.
- `confirming` / `active_ride`: telas atuais preservadas, apenas reorganizadas para não exigir arraste.

A lógica de tarifa, matching e ciclo de vida da corrida permanece intacta — o step só controla qual seção da UI aparece.

## 2. Home (`Início`) — apenas destino

Remover da home:
- grid/carousel de categorias (Carros/Motos/Fretes/Guincho/Envios)
- bloco "Escolha o serviço"
- preços e "valor estimado"

Manter/introduzir:
- mapa escuro como hero (já existe)
- header compacto com saudação
- pill do endereço de origem (pickup atual)
- input grande **"Para onde vamos?"** abrindo o autocomplete em sheet/modal
- linha de atalhos: Casa · Trabalho · recentes (quando existirem)

Sem sheet arrastável obrigatório neste estado — o input é o único foco.

## 3. Seleção de categoria — só após destino

Nova seção `CategoryPicker` (componente em `src/components/passenger/CategoryPicker.tsx`) exibida quando `flowStep === "category_select"`:

- resumo pickup → destino no topo (2 linhas, truncáveis)
- **lista vertical** (não carrossel) de categorias disponíveis, cada linha:
  - ícone + nome (Carros, Motos, Fretes, Guincho, Envios)
  - ETA · distância
  - **Total** em destaque à direita
- linha do método de pagamento (tocável, abre seletor)
- rótulo único **"Você paga"** acima do total consolidado
- CTA fixo no rodapé: **"Confirmar MOVVI {Categoria}"**

Substituir em toda a UI: "valor estimado" / "preço estimado" → **"Você paga"**, **"Total"**, **"Valor da corrida"**.

## 4. Bottom nav sempre fixo

Ajustar `BottomNav` (modo `floating`):
- `position: fixed`, `bottom: calc(env(safe-area-inset-bottom) + 12px)`
- margens laterais 24px, pill dark MOVVI, ativo em verde `#8DD92B`
- z-index abaixo do bottom sheet (sheet permanece z-30, nav sobe só quando não há sheet aberta expandindo até o topo)
- **auto-hide** em `flowStep ∈ {confirming, active_ride}` para não competir com CTA/ficha do motorista
- páginas ganham `padding-bottom` calculado para conteúdo rolar acima da nav

## 5. Serviços (aba) — informacional

`passageiro.servicos.tsx` deixa de ser atalho para "iniciar corrida com categoria X". Vira catálogo:
- cards Carros, Motos, Fretes, Guincho, Envios
- cada card: descrição curta + "Buscar destino" → leva à home em estado `idle` (sem pré-selecionar categoria)
- deixa claro que a escolha final ocorre após o destino

## 6. Zero arraste obrigatório

Regra geral aplicada a todas as sheets do fluxo:
- snap inicial já mostra: categoria selecionada, método de pagamento, total, CTA
- em corrida ativa, snap inicial mostra: status, ETA, distância, card do motorista (foto, nome, rating, modelo, placa), PIN, ações rápidas (ligar, mensagem, compartilhar)
- detalhes secundários vão para link **"Mais detalhes"** que expande ou navega para página dedicada
- CTA principal nunca sai da viewport

Auditoria dos snaps atuais em `passageiro.app.tsx` para elevar o snap mínimo quando necessário.

## 7. Testes visuais

Rodar Playwright headless em 360×800, 390×844, 412×915 validando:
- home sem categorias
- categoria só aparece pós-destino
- CTA, total, pagamento visíveis sem drag
- bottom nav fixo, não sobrepõe sheet, não corta cards

## Arquivos afetados

- `src/routes/passageiro.app.tsx` — máquina de flowStep, home simplificada, integração do CategoryPicker, auto-hide da nav
- `src/components/passenger/CategoryPicker.tsx` — novo
- `src/components/passenger/DestinationSearch.tsx` — extraído/ajustado (input grande + atalhos)
- `src/components/BottomNav.tsx` — offset fixo, safe-area, prop para ocultar
- `src/routes/passageiro.servicos.tsx` — tom informacional, remove CTA de seleção direta
- `src/components/MovviSheet.tsx` — apenas ajuste de snaps default se necessário
- textos em componentes de preço: "valor estimado" → "Você paga" / "Total"

## Fora do escopo (não tocar)

Supabase, RLS, migrations, edge functions, cálculo de tarifa, pagamento, PIN, state machine, matching, auth, recovery de corrida ativa.

Confirma para eu implementar?
