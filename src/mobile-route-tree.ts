/* eslint-disable */
// Route tree client-only para Capacitor.
// Não importa rotas admin/API para evitar qualquer dependência de servidor no build mobile.

import { Route as rootRouteImport } from './routes/__root'
import { Route as IndexRouteImport } from './routes/index'
import { Route as TTokenRouteImport } from './routes/t.$token'

import { Route as PassageiroAgendarRouteImport } from './routes/passageiro.agendar'
import { Route as PassageiroAppRouteImport } from './routes/passageiro.app'
import { Route as PassageiroCadastroRouteImport } from './routes/passageiro.cadastro'
import { Route as PassageiroCarteiraRouteImport } from './routes/passageiro.carteira'
import { Route as PassageiroConfiguracoesRouteImport } from './routes/passageiro.configuracoes'
import { Route as PassageiroCorridasRouteImport } from './routes/passageiro.corridas'
import { Route as PassageiroEnviosRouteImport } from './routes/passageiro.envios'
import { Route as PassageiroFavoritosRouteImport } from './routes/passageiro.favoritos'
import { Route as PassageiroGuinchoRouteImport } from './routes/passageiro.guincho'
import { Route as PassageiroLoginRouteImport } from './routes/passageiro.login'
import { Route as PassageiroMudancasRouteImport } from './routes/passageiro.mudancas'
import { Route as PassageiroNotificacoesRouteImport } from './routes/passageiro.notificacoes'
import { Route as PassageiroPerfilRouteImport } from './routes/passageiro.perfil'
import { Route as PassageiroPreferenciasNotificacoesRouteImport } from './routes/passageiro.preferencias-notificacoes'
import { Route as PassageiroPrivacidadeRouteImport } from './routes/passageiro.privacidade'
import { Route as PassageiroSegurancaRouteImport } from './routes/passageiro.seguranca'
import { Route as PassageiroServicosRouteImport } from './routes/passageiro.servicos'
import { Route as PassageiroSobreRouteImport } from './routes/passageiro.sobre'
import { Route as PassageiroSuporteRouteImport } from './routes/passageiro.suporte'
import { Route as PassageiroTermosRouteImport } from './routes/passageiro.termos'

import { Route as MotoristaAppRouteImport } from './routes/motorista.app'
import { Route as MotoristaAssinaturaRouteImport } from './routes/motorista.assinatura'
import { Route as MotoristaCadastroRouteImport } from './routes/motorista.cadastro'
import { Route as MotoristaCarteiraRouteImport } from './routes/motorista.carteira'
import { Route as MotoristaConfiguracoesRouteImport } from './routes/motorista.configuracoes'
import { Route as MotoristaCorridasRouteImport } from './routes/motorista.corridas'
import { Route as MotoristaCorridasIdRouteImport } from './routes/motorista.corridas.$id'
import { Route as MotoristaDocumentosRouteImport } from './routes/motorista.documentos'
import { Route as MotoristaGanhosRouteImport } from './routes/motorista.ganhos'
import { Route as MotoristaLoginRouteImport } from './routes/motorista.login'
import { Route as MotoristaNotificacoesRouteImport } from './routes/motorista.notificacoes'
import { Route as MotoristaPerfilRouteImport } from './routes/motorista.perfil'
import { Route as MotoristaPreferenciasNotificacoesRouteImport } from './routes/motorista.preferencias-notificacoes'
import { Route as MotoristaPrivacidadeRouteImport } from './routes/motorista.privacidade'
import { Route as MotoristaRegaliasRouteImport } from './routes/motorista.regalias'
import { Route as MotoristaSegurancaRouteImport } from './routes/motorista.seguranca'
import { Route as MotoristaStatusRouteImport } from './routes/motorista.status'
import { Route as MotoristaSuporteRouteImport } from './routes/motorista.suporte'
import { Route as MotoristaTermosRouteImport } from './routes/motorista.termos'

const IndexRoute = IndexRouteImport.update({ id: '/', path: '/', getParentRoute: () => rootRouteImport } as any)
const TTokenRoute = TTokenRouteImport.update({ id: '/t/$token', path: '/t/$token', getParentRoute: () => rootRouteImport } as any)

const PassageiroAgendarRoute = PassageiroAgendarRouteImport.update({ id: '/passageiro/agendar', path: '/passageiro/agendar', getParentRoute: () => rootRouteImport } as any)
const PassageiroAppRoute = PassageiroAppRouteImport.update({ id: '/passageiro/app', path: '/passageiro/app', getParentRoute: () => rootRouteImport } as any)
const PassageiroCadastroRoute = PassageiroCadastroRouteImport.update({ id: '/passageiro/cadastro', path: '/passageiro/cadastro', getParentRoute: () => rootRouteImport } as any)
const PassageiroCarteiraRoute = PassageiroCarteiraRouteImport.update({ id: '/passageiro/carteira', path: '/passageiro/carteira', getParentRoute: () => rootRouteImport } as any)
const PassageiroConfiguracoesRoute = PassageiroConfiguracoesRouteImport.update({ id: '/passageiro/configuracoes', path: '/passageiro/configuracoes', getParentRoute: () => rootRouteImport } as any)
const PassageiroCorridasRoute = PassageiroCorridasRouteImport.update({ id: '/passageiro/corridas', path: '/passageiro/corridas', getParentRoute: () => rootRouteImport } as any)
const PassageiroEnviosRoute = PassageiroEnviosRouteImport.update({ id: '/passageiro/envios', path: '/passageiro/envios', getParentRoute: () => rootRouteImport } as any)
const PassageiroFavoritosRoute = PassageiroFavoritosRouteImport.update({ id: '/passageiro/favoritos', path: '/passageiro/favoritos', getParentRoute: () => rootRouteImport } as any)
const PassageiroGuinchoRoute = PassageiroGuinchoRouteImport.update({ id: '/passageiro/guincho', path: '/passageiro/guincho', getParentRoute: () => rootRouteImport } as any)
const PassageiroLoginRoute = PassageiroLoginRouteImport.update({ id: '/passageiro/login', path: '/passageiro/login', getParentRoute: () => rootRouteImport } as any)
const PassageiroMudancasRoute = PassageiroMudancasRouteImport.update({ id: '/passageiro/mudancas', path: '/passageiro/mudancas', getParentRoute: () => rootRouteImport } as any)
const PassageiroNotificacoesRoute = PassageiroNotificacoesRouteImport.update({ id: '/passageiro/notificacoes', path: '/passageiro/notificacoes', getParentRoute: () => rootRouteImport } as any)
const PassageiroPerfilRoute = PassageiroPerfilRouteImport.update({ id: '/passageiro/perfil', path: '/passageiro/perfil', getParentRoute: () => rootRouteImport } as any)
const PassageiroPreferenciasNotificacoesRoute = PassageiroPreferenciasNotificacoesRouteImport.update({ id: '/passageiro/preferencias-notificacoes', path: '/passageiro/preferencias-notificacoes', getParentRoute: () => rootRouteImport } as any)
const PassageiroPrivacidadeRoute = PassageiroPrivacidadeRouteImport.update({ id: '/passageiro/privacidade', path: '/passageiro/privacidade', getParentRoute: () => rootRouteImport } as any)
const PassageiroSegurancaRoute = PassageiroSegurancaRouteImport.update({ id: '/passageiro/seguranca', path: '/passageiro/seguranca', getParentRoute: () => rootRouteImport } as any)
const PassageiroServicosRoute = PassageiroServicosRouteImport.update({ id: '/passageiro/servicos', path: '/passageiro/servicos', getParentRoute: () => rootRouteImport } as any)
const PassageiroSobreRoute = PassageiroSobreRouteImport.update({ id: '/passageiro/sobre', path: '/passageiro/sobre', getParentRoute: () => rootRouteImport } as any)
const PassageiroSuporteRoute = PassageiroSuporteRouteImport.update({ id: '/passageiro/suporte', path: '/passageiro/suporte', getParentRoute: () => rootRouteImport } as any)
const PassageiroTermosRoute = PassageiroTermosRouteImport.update({ id: '/passageiro/termos', path: '/passageiro/termos', getParentRoute: () => rootRouteImport } as any)

const MotoristaAppRoute = MotoristaAppRouteImport.update({ id: '/motorista/app', path: '/motorista/app', getParentRoute: () => rootRouteImport } as any)
const MotoristaAssinaturaRoute = MotoristaAssinaturaRouteImport.update({ id: '/motorista/assinatura', path: '/motorista/assinatura', getParentRoute: () => rootRouteImport } as any)
const MotoristaCadastroRoute = MotoristaCadastroRouteImport.update({ id: '/motorista/cadastro', path: '/motorista/cadastro', getParentRoute: () => rootRouteImport } as any)
const MotoristaCarteiraRoute = MotoristaCarteiraRouteImport.update({ id: '/motorista/carteira', path: '/motorista/carteira', getParentRoute: () => rootRouteImport } as any)
const MotoristaConfiguracoesRoute = MotoristaConfiguracoesRouteImport.update({ id: '/motorista/configuracoes', path: '/motorista/configuracoes', getParentRoute: () => rootRouteImport } as any)
const MotoristaCorridasRoute = MotoristaCorridasRouteImport.update({ id: '/motorista/corridas', path: '/motorista/corridas', getParentRoute: () => rootRouteImport } as any)
const MotoristaCorridasIdRoute = MotoristaCorridasIdRouteImport.update({ id: '/$id', path: '/$id', getParentRoute: () => MotoristaCorridasRoute } as any)
const MotoristaDocumentosRoute = MotoristaDocumentosRouteImport.update({ id: '/motorista/documentos', path: '/motorista/documentos', getParentRoute: () => rootRouteImport } as any)
const MotoristaGanhosRoute = MotoristaGanhosRouteImport.update({ id: '/motorista/ganhos', path: '/motorista/ganhos', getParentRoute: () => rootRouteImport } as any)
const MotoristaLoginRoute = MotoristaLoginRouteImport.update({ id: '/motorista/login', path: '/motorista/login', getParentRoute: () => rootRouteImport } as any)
const MotoristaNotificacoesRoute = MotoristaNotificacoesRouteImport.update({ id: '/motorista/notificacoes', path: '/motorista/notificacoes', getParentRoute: () => rootRouteImport } as any)
const MotoristaPerfilRoute = MotoristaPerfilRouteImport.update({ id: '/motorista/perfil', path: '/motorista/perfil', getParentRoute: () => rootRouteImport } as any)
const MotoristaPreferenciasNotificacoesRoute = MotoristaPreferenciasNotificacoesRouteImport.update({ id: '/motorista/preferencias-notificacoes', path: '/motorista/preferencias-notificacoes', getParentRoute: () => rootRouteImport } as any)
const MotoristaPrivacidadeRoute = MotoristaPrivacidadeRouteImport.update({ id: '/motorista/privacidade', path: '/motorista/privacidade', getParentRoute: () => rootRouteImport } as any)
const MotoristaRegaliasRoute = MotoristaRegaliasRouteImport.update({ id: '/motorista/regalias', path: '/motorista/regalias', getParentRoute: () => rootRouteImport } as any)
const MotoristaSegurancaRoute = MotoristaSegurancaRouteImport.update({ id: '/motorista/seguranca', path: '/motorista/seguranca', getParentRoute: () => rootRouteImport } as any)
const MotoristaStatusRoute = MotoristaStatusRouteImport.update({ id: '/motorista/status', path: '/motorista/status', getParentRoute: () => rootRouteImport } as any)
const MotoristaSuporteRoute = MotoristaSuporteRouteImport.update({ id: '/motorista/suporte', path: '/motorista/suporte', getParentRoute: () => rootRouteImport } as any)
const MotoristaTermosRoute = MotoristaTermosRouteImport.update({ id: '/motorista/termos', path: '/motorista/termos', getParentRoute: () => rootRouteImport } as any)

const MotoristaCorridasRouteWithChildren = MotoristaCorridasRoute._addFileChildren({ MotoristaCorridasIdRoute })

export const routeTree = rootRouteImport._addFileChildren({
  IndexRoute,
  TTokenRoute,
  PassageiroAgendarRoute,
  PassageiroAppRoute,
  PassageiroCadastroRoute,
  PassageiroCarteiraRoute,
  PassageiroConfiguracoesRoute,
  PassageiroCorridasRoute,
  PassageiroEnviosRoute,
  PassageiroFavoritosRoute,
  PassageiroGuinchoRoute,
  PassageiroLoginRoute,
  PassageiroMudancasRoute,
  PassageiroNotificacoesRoute,
  PassageiroPerfilRoute,
  PassageiroPreferenciasNotificacoesRoute,
  PassageiroPrivacidadeRoute,
  PassageiroSegurancaRoute,
  PassageiroServicosRoute,
  PassageiroSobreRoute,
  PassageiroSuporteRoute,
  PassageiroTermosRoute,
  MotoristaAppRoute,
  MotoristaAssinaturaRoute,
  MotoristaCadastroRoute,
  MotoristaCarteiraRoute,
  MotoristaConfiguracoesRoute,
  MotoristaCorridasRoute: MotoristaCorridasRouteWithChildren,
  MotoristaDocumentosRoute,
  MotoristaGanhosRoute,
  MotoristaLoginRoute,
  MotoristaNotificacoesRoute,
  MotoristaPerfilRoute,
  MotoristaPreferenciasNotificacoesRoute,
  MotoristaPrivacidadeRoute,
  MotoristaRegaliasRoute,
  MotoristaSegurancaRoute,
  MotoristaStatusRoute,
  MotoristaSuporteRoute,
  MotoristaTermosRoute,
} as any)
