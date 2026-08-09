# APOIS Corridas — Fase 9: Mobile Release

> Escopo exclusivo: **APOIS Corridas**. APOIS Entregas não faz parte deste documento nem desta cadeia de release.

## Fonte de verdade

- Motorista: `franciel046631/movvi-go-connect`, branch de consolidação `fix/apois-corridas-consolidacao`.
- Projeto Android fonte do Motorista: `android-motorista/` (o script `scripts/cap-sync.mjs` copia essa árvore para `android/`).
- Passageiro: `franciel046631/say-hello-buddy-23-84b5dcbf`, branch `feat/apois-passageiro-completo`.
- Supabase oficial de Corridas: `vqtucstyduxrqjgyigfk`.

## Contrato de publicação Android

### Motorista

- [x] Package ID: `com.apois.motorista`.
- [x] Nome: `APOIS Motorista`.
- [x] Firebase Android client oficial para `com.apois.motorista` presente no projeto de homologação.
- [x] Permissão Android 13+ de notificações declarada.
- [x] Foreground Service de localização declarado.
- [x] `ACCESS_BACKGROUND_LOCATION` declarado para rastreamento durante corrida/online em segundo plano.
- [x] Cleartext desabilitado.
- [ ] `allowBackup=false` no manifest de release.
- [ ] Canal Android `apois_rides` criado/configurado no cliente para corresponder ao FCM backend.
- [ ] Recuperação de senha com deep link nativo testável.
- [ ] `versionCode`/`versionName` parametrizáveis por release.
- [ ] Configuração de assinatura de upload via secrets/arquivo externo, sem keystore ou senha no Git.
- [ ] `bundleRelease` produz AAB de release.
- [ ] AAB assinado com chave de upload real.
- [ ] Play App Signing configurado no Play Console.
- [ ] SHA-1/SHA-256 da chave de upload/Play registrados onde forem exigidos por Firebase/Google APIs.

### Passageiro

- [x] Package ID: `com.apois.passageiro`.
- [x] Nome: `APOIS Passageiro`.
- [x] `allowBackup=false`.
- [x] Cleartext desabilitado.
- [x] Firebase Android client oficial para `com.apois.passageiro`.
- [x] Canal Android padrão `apois_rides` configurado.
- [x] Recuperação de senha nativa registrada por `apoispassageiro://auth/redefinir-senha`.
- [x] Rotas públicas de Termos e Privacidade existem no app.
- [ ] `versionCode`/`versionName` parametrizáveis por release.
- [ ] Configuração de assinatura de upload via secrets/arquivo externo.
- [ ] `bundleRelease` produz AAB de release.
- [ ] AAB assinado com chave de upload real.
- [ ] Play App Signing configurado no Play Console.
- [ ] SHA-1/SHA-256 da chave de upload/Play registrados onde forem exigidos por Firebase/Google APIs.

## Itens externos do Play Console

Os itens abaixo não devem ser inventados pelo código nem marcados como concluídos sem validação humana no Play Console:

- [ ] Conta Google Play Console/empresa apta a publicar.
- [ ] Play App Signing ativado para cada package.
- [ ] Chave de upload criada e armazenada fora do repositório.
- [ ] URL pública de Política de Privacidade definida e acessível sem login.
- [ ] URL pública de Termos definida e acessível sem login.
- [ ] Formulário **Data Safety** preenchido conforme coleta real do app.
- [ ] Declaração e justificativa de localização em segundo plano do Motorista revisada no Play Console.
- [ ] Permissão de notificações explicada na experiência do usuário quando aplicável.
- [ ] Restrições das chaves Google Maps por package + certificado conferidas.
- [ ] Fingerprints Firebase/Google das chaves de upload e Play conferidos.
- [ ] Países/faixa de teste/rollout definidos.

## Gate físico antes de produção

Nenhum AAB deve ser tratado como homologado sem executar em aparelho físico, no mínimo:

1. cold start e splash;
2. login e persistência de sessão;
3. recuperação de senha por deep link;
4. permissão de notificações;
5. push em foreground, background e app encerrado;
6. localização do Motorista em foreground, background e tela bloqueada;
7. solicitação Passageiro → oferta Motorista;
8. aceite/rejeição;
9. rota até embarque;
10. chegada + PIN;
11. início e navegação ao destino;
12. finalização + settlement;
13. avaliação dos dois lados;
14. SOS/compartilhamento;
15. perda e recuperação de rede;
16. comportamento com otimização de bateria.

## Segurança de release

- Nunca versionar `.jks`, `.keystore`, senhas, tokens ou service accounts.
- Nunca usar segredo do Google/Firebase/Mercado Pago em código cliente além de identificadores/chaves públicas próprias para cliente.
- CI valida e produz artefatos; CI não deve editar, reparar, commitar ou fazer push de código-fonte.
- Build bem-sucedido sozinho não significa "pronto para produção".
