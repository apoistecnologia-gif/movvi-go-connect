# APOIS Corridas — Fase 9: Mobile Release

> Escopo exclusivo: **APOIS Corridas**. APOIS Entregas não faz parte deste documento nem desta cadeia de release.

## Fonte de verdade

- Motorista: `franciel046631/movvi-go-connect`, branch de consolidação `fix/apois-corridas-consolidacao`.
- Projeto Android fonte do Motorista: `android-motorista/` (o script `scripts/cap-sync.mjs` copia essa árvore para `android/`).
- Passageiro: `franciel046631/say-hello-buddy-23-84b5dcbf`, branch `feat/apois-passageiro-completo`.
- Supabase oficial de Corridas: `vqtucstyduxrqjgyigfk`.

## Estado objetivo da Fase 9

A configuração Android e os builds técnicos dos dois aplicativos já passaram pelos contratos dedicados da Fase 9. O P0 visual nativo do Passageiro também foi corrigido e validado no APK canônico: launcher/splash padrão do Capacitor foram removidos e substituídos pela identidade APOIS. O Motorista agora também possui o ciclo de vida online conectado ao `DriverLocationService` nativo, com validação técnica de build/empacotamento concluída. **A Fase 9 ainda não está concluída para publicação**, porque a continuidade real de localização/push em aparelho físico ainda precisa ser homologada, os AABs gerados até agora são não assinados e os segredos de chave de upload ainda não estão configurados nos repositórios. O Passageiro também precisa de uma URL pública HTTPS real para o fluxo de compartilhamento; o placeholder `.example` foi removido do workflow de release.

A partir de agora os workflows de release são deliberadamente **fail-closed**: não publicam artefato AAB como release quando não há chave de upload real e verificável.

### Evidências de CI

**Motorista**
- workflow técnico anterior: `APOIS Corridas — Driver Phase 9 Release`, run `31286334420`, `success`;
- revalidação do código/runtime do HEAD de consolidação `04da883cc54387ca54a4b049f57d983ffe48ffd3`: run `31289455062`, `success`;
- inspeção do AAB produzido nessa revalidação: `jarsigner` informou **`jar is unsigned`**;
- gate de entradas externas após endurecimento do release: run `31289946329`, falhou somente por ausência dos quatro segredos de assinatura listados abaixo. A chave Google Maps do Motorista está presente;
- auditoria do background encontrou um gap real: `DriverLocationService`/`DriverLocationPlugin` existiam no Android nativo, porém o ciclo de vida online da tela operacional ainda publicava presença somente pela WebView e não iniciava o plugin nativo;
- wiring do ciclo online/offline para o Foreground Service nativo: commits `1804c22bd547eb309cfbacaa4e075d1a3fd010a7` e `5e107aaf74a6c1b46346e97c33235c30cc875354`;
- gate isolado `APOIS Corridas — Driver Background Location Gate`, run `31313727541`, `success`: contrato Fase 9, TypeScript, ESLint, Firebase Driver, build mobile de produção, `cap sync`, verificação nativa, hard gate de wiring, `assembleDebug` e upload do APK passaram;
- inspeção do APK desse gate confirmou `DriverLocationPlugin`, `DriverLocationService`, ação `START_LOCATION` e `driver_set_presence` no DEX, além do bridge `DriverLocation` no bundle JavaScript. Isso comprova o empacotamento técnico; **não substitui o teste físico com tela bloqueada/background**.

**Passageiro**
- workflow técnico anterior: `APOIS Corridas — Passenger Phase 9 Release`, run `31286532212`, `success`;
- inspeção do AAB desse run: **não assinado**;
- gate de entradas externas após endurecimento do release: run `31290025340`; as duas chaves Google Maps estão presentes, mas faltam a URL pública e os quatro segredos de assinatura;
- correção P0 de launcher/splash/ícone de notificação: commit `3753087cf5cfd81bfe08521bbf69e01fd10b8251`;
- validação isolada de empacotamento do P0: run `31293700335`, `success`;
- validação canônica do PR #7 após a correção: run `31293968209`, `success`;
- o APK canônico desse run foi extraído e inspecionado: a marca APOIS esperada está presente e os bitmaps antigos `ic_launcher*.png`/`splash.png` do Capacitor não estão mais empacotados.

## Contrato de publicação Android

### Motorista

- [x] Package ID: `com.apois.motorista`.
- [x] Nome: `APOIS Motorista`.
- [x] Firebase Android client oficial para `com.apois.motorista` presente no projeto de homologação.
- [x] Permissão Android 13+ de notificações declarada.
- [x] Foreground Service de localização declarado.
- [x] `ACCESS_BACKGROUND_LOCATION` declarado para rastreamento durante corrida/online em segundo plano.
- [x] Ciclo de vida online/offline da tela operacional conecta o APK ao `DriverLocationPlugin`/`DriverLocationService` nativo.
- [x] Serviço nativo publica presença/GPS pelo RPC canônico `driver_set_presence`, sem depender da WebView para cada atualização.
- [x] O início/reidratação do Foreground Service é limitado à Activity visível no bridge web, compatível com a restrição de início de FGS de localização do Android 14+.
- [ ] Continuidade real de GPS confirmada em aparelho físico com app em background e tela bloqueada.
- [x] Cleartext desabilitado.
- [x] `allowBackup=false` no manifest de release.
- [x] Canal Android `apois_rides` criado/configurado no cliente para corresponder ao FCM backend.
- [x] Recuperação de senha com deep link nativo implementada e coberta pelo contrato de release.
- [x] `versionCode`/`versionName` parametrizáveis por release.
- [x] Gradle preparado para assinatura de upload via secrets/arquivo externo, sem keystore ou senha no Git.
- [x] `bundleRelease` produz AAB de release técnico.
- [x] Workflow endurecido para exigir chave de upload e validar a assinatura com `jarsigner` antes do upload do artefato.
- [ ] AAB assinado com chave de upload real e verificado em CI.
- [ ] Play App Signing configurado no Play Console.
- [ ] SHA-1/SHA-256 da chave de upload/Play registrados onde forem exigidos por Firebase/Google APIs.

### Passageiro

- [x] Package ID: `com.apois.passageiro`.
- [x] Nome: `APOIS Passageiro`.
- [x] `allowBackup=false`.
- [x] Cleartext desabilitado.
- [x] Firebase Android client oficial para `com.apois.passageiro`.
- [x] Canal Android padrão `apois_rides` configurado.
- [x] Launcher adaptativo/fallback Android usa identidade oficial APOIS e não os bitmaps padrão do Capacitor.
- [x] Splash nativo Android usa identidade APOIS/preto e não o splash padrão do Capacitor.
- [x] Ícone pequeno de notificação FCM usa recurso monocromático dedicado `ic_stat_apois_notification`.
- [x] Recuperação de senha nativa registrada por `apoispassageiro://auth/redefinir-senha`.
- [x] Rotas públicas de Termos e Privacidade existem no app.
- [x] `versionCode`/`versionName` parametrizáveis por release.
- [x] Gradle preparado para assinatura de upload via secrets/arquivo externo.
- [x] `bundleRelease` produz AAB de release técnico.
- [x] Workflow endurecido para rejeitar URL pública falsa/localhost e validar assinatura do AAB antes do upload.
- [ ] `APOIS_PASSENGER_PUBLIC_URL` configurada com domínio HTTPS público real.
- [ ] AAB assinado com chave de upload real e verificado em CI.
- [ ] Play App Signing configurado no Play Console.
- [ ] SHA-1/SHA-256 da chave de upload/Play registrados onde forem exigidos por Firebase/Google APIs.

## Entradas externas ainda ausentes

### Motorista — GitHub Actions secrets

O gate `31289946329` confirmou que `APOIS_GOOGLE_MAPS_BROWSER_KEY` existe, mas faltam:

- `APOIS_UPLOAD_KEYSTORE_BASE64`
- `APOIS_UPLOAD_KEY_ALIAS`
- `APOIS_UPLOAD_STORE_PASSWORD`
- `APOIS_UPLOAD_KEY_PASSWORD`

### Passageiro — GitHub Actions/Variables

O gate `31290025340` confirmou que `GOOGLE_MAPS_WEB_API_KEY` e `GOOGLE_MAPS_ANDROID_API_KEY` existem, mas faltam:

- repository variable `APOIS_PASSENGER_PUBLIC_URL`
- secret `APOIS_UPLOAD_KEYSTORE_BASE64`
- secret `APOIS_UPLOAD_KEY_ALIAS`
- secret `APOIS_UPLOAD_STORE_PASSWORD`
- secret `APOIS_UPLOAD_KEY_PASSWORD`

A URL deve ser HTTPS real. `.example`, `localhost`, `127.0.0.1` e `0.0.0.0` são rejeitados pelo workflow de release.

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
- AAB não assinado não é artefato de publicação.
