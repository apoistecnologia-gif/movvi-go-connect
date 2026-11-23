# SENATRAN — Q12 Segregação dos ambientes — Corridas

> Evidência técnica de trabalho, **não** certificação de conformidade. Última auditoria: 23/11/2026. Estado da resposta do formulário: **Parcialmente**, até concluir os itens pendentes.

## Escopo verificado

- Projeto oficial Supabase de produção: `tbbzkrfupmqdywnzgnms` — `ACTIVE_HEALTHY` na consulta de 23/11/2026.
- Vercel: `prj_hQLbIy31b8lbvhQU0iz6U6u38Srq` — preview e desenvolvimento com par Supabase inerte `https://apois-preview-isolado-sem-backend.invalid` e publicável fictício; produção com conexão real isolada na configuração de variáveis.
- Branch oficial de código: `fix/apois-corridas-oficial-20261113`. Proposta desta auditoria: `security/senatran-q12-guards-20261123`.
- Não foi encontrada branch de desenvolvimento gerenciada no Supabase, nem projeto separado de homologação dentre os projetos acessíveis. Criar branch gerenciada pode implicar custo, portanto **não foi feito**.

## Medidas propostas sem alteração dos dados de produção

1. Adicionado `scripts/assert-q12-build-environment.mjs` e respectivo teste em Node. Para deploys Vercel de preview/desenvolvimento, exige configuração explícita, rejeita URLs conhecidas de produção e projetos legados, e rejeita credenciais `service_role`. O build de produção não é alterado por esta verificação.
2. `vite.config.ts` chama o verificador no início do build.
3. `.github/workflows/senatran-q12-preview-isolation.yml` foi adicionado para testar cenários de permissão/bloqueio sem consultar dados de produção.
4. Configurações de CI apropriadas foram consolidadas de uma branch de homologação previamente existente, sem acesso ao banco real.

## Constatações particulares

- **Fluxo web:** `src/integrations/supabase/client.ts` considera `VITE_SUPABASE_URL` e a alternativa `SUPABASE_URL`; o middleware SSR lê variáveis do servidor. As configurações Preview observadas apontam para endereço inerte.
- **Banco de testes gratuito:** `.github/workflows/apois-database-baseline.yml` contém serviço PostgreSQL 16 efêmero (`PGHOST=127.0.0.1`, `PGDATABASE=apois_test`), com teste de identidade do banco e verificação de schema. O workflow foi consolidado na branch proposta, mas sua execução no GitHub Actions ainda não foi validada.
- **Deriva adicional:** `supabase/config.toml` define `project_id=vqtucstyduxrqjgyigfk`, diferente de `tbbzkrfupmqdywnzgnms`.
- **Homologação móvel:** `.env.mobile` aponta para projeto legado `vqtucstyduxrqjgyigfk`, e `vite.mobile.config.ts` declara uma URL fixa `https://movvi-go-connect.lovable.app/_serverFn/`. Nenhum deles foi demonstrado como ambiente isolado de dados reais. Não classificar homologação de APK como isolada antes da verificação das funções remotas e do banco.

## Evidências de execução e limitações

- Testes locais: **8/8 passaram** em `node --test scripts/assert-q12-build-environment.test.mjs`, sobre os arquivos da branch.
- Preview Vercel do commit que adicionou os testes e verificações: **READY**. Isso demonstra que o build foi produzido, não valida todos os fluxos operacionais, acessos remotos nem APIs privilegiadas.
- GitHub Actions: o primeiro run deste workflow finalizou com **failure** sem disponibilizar etapas/logs utilizáveis pelo conector. O workflow atualizado e a pipeline completa **não têm confirmação de aprovação**.
- Vercel Preview não substitui uma homologação funcional: o endpoint `.invalid` bloqueia o acesso a backend, mas não permite testar operações com dados fictícios.
- Nenhum registro, tabela, senha, pagamento, corrida ou entrega do Supabase de produção foi alterado nesta etapa.

## Critérios faltantes para resposta integral "Sim"

- Disponibilizar e **testar** um banco de homologação separado, local/efêmero e sem cópias de dados pessoais; validar aplicação, Auth, Edge Functions, RPCs e objetos de Storage em fluxos representativos.
- Auditar todos os links externos/alternativos para backend e serviços privilegiados, incluindo builds nativos, funções remotas, variáveis por branch, URLs de servidor e CI.
- Confirmar isolamento com testes negativos executados nos ambientes reais, não só verificações estáticas e build READY.
- Conciliar `supabase/config.toml`, scripts e documentação legada sem alterar produção inadvertidamente.
- Obter testes de CI efetivamente concluídos e evidências de runtime antes de integrar a branch à versão oficial.

**Resultado provisório:** isolamento preventivo do Preview melhorado em branch de segurança, homologação funcional independente ainda pendente. **Não marcar Q12 como Sim** e não assinar a declaração do formulário com base apenas nessas evidências.

## 23/11/2026 — Proteção de homologação móvel

- `vite.mobile.config.ts` agora rejeita builds com `APOIS_MOBILE_BUILD_TIER=homologation` se Supabase ou endpoint de funções usar IDs/domínios de produção/legados.
- O endpoint `VITE_TSS_SERVER_FN_BASE` passa a exigir configuração explícita na homologação, em vez de usar silenciosamente o fallback antigo `movvi-go-connect.lovable.app`.
- As duas workflows de homologação Motorista receberam a marcação de tier. Esses builds falham de forma controlada enquanto não houver backend de teste separado; o empacotamento de produção permanece inalterado.
- Nove novos testes negativos e de compatibilidade do script `assert-q12-mobile-environment.mjs` passaram localmente, junto aos oito testes Web Q12 (17/17 no total). A execução GitHub Actions continua falhando antes de fornecer steps/logs; não há aprovação de CI.
- **Não afirmar Q12=Sim:** Preview segue usando URL inerte e não existe ambiente Supabase funcional, persistente e segregado comprovado, nem homologação integral do app.
