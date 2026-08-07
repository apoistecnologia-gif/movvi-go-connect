from pathlib import Path

p = Path("src/routes/motorista.app.tsx")
s = p.read_text(encoding="utf-8")

# Rota via Edge Function oficial, sem createServerFn remoto no APK.
s = s.replace('import { useServerFn } from "@tanstack/react-start";\n', '')
s = s.replace(
    'import { computeRoute, type RouteStep } from "@/lib/routes.functions";',
    'import { computeDriverRoute, type DriverRouteStep } from "@/lib/driverRoutes.mobile";',
)
s = s.replace('  const callRoute    = useServerFn(computeRoute);', '  const callRoute    = computeDriverRoute;')
s = s.replace('(s: RouteStep)', '(s: DriverRouteStep)')

# A confirmação de recebimento era de um schema MOVVI antigo. O Supabase oficial
# não tem payment_received_at/payment_received_by; o pagamento da corrida será
# tratado pelo fluxo financeiro oficial, sem fabricar colunas no app.
state_start = s.find('  const [paymentConfirming, setPaymentConfirming]')
if state_start != -1:
    state_end = s.find('  const ratedRidesRef', state_start)
    s = s[:state_start] + s[state_end:]

fn_start = s.find('  async function confirmPaymentReceived()')
if fn_start != -1:
    fn_end = s.find('  const mapRef =', fn_start)
    s = s[:fn_start] + s[fn_end:]

s = s.replace('          setPaymentConfirmedAt((r as any).payment_received_at ?? null);\n', '')
s = s.replace('        loadTodayStats(userId);', '        if (driverId) loadTodayStats(driverId);')

s = s.replace('''          paymentConfirmedAt={paymentConfirmedAt}\n          paymentConfirming={paymentConfirming}\n          onConfirmPayment={confirmPaymentReceived}\n''', '')

s = s.replace('''  errorMessage, onSubmit, onDismiss, onSkip,\n  paymentConfirmedAt, paymentConfirming, onConfirmPayment,\n''', '''  errorMessage, onSubmit, onDismiss, onSkip,\n''')
s = s.replace('''  onSubmit: () => void; onDismiss: () => void; onSkip: () => void;\n  paymentConfirmedAt: string | null;\n  paymentConfirming: boolean;\n  onConfirmPayment: () => void;\n''', '''  onSubmit: () => void; onDismiss: () => void; onSkip: () => void;\n''')

payment_block_call = '''            <PaymentConfirmBlock\n              paymentLabel={paymentLabel}\n              confirmedAt={paymentConfirmedAt}\n              loading={paymentConfirming}\n              onConfirm={onConfirmPayment}\n            />\n\n'''
s = s.replace(payment_block_call, '')

payment_fn_start = s.find('function PaymentConfirmBlock({')
if payment_fn_start != -1:
    payment_fn_end = s.find('/* ============================================================\n   TOP FLOATING GLASS STAT', payment_fn_start)
    if payment_fn_end != -1:
        s = s[:payment_fn_start] + s[payment_fn_end:]

# requestLocation só descobre a posição. Presença é persistida pelo RPC oficial
# quando o motorista realmente toca em Ficar online.
legacy_save_start = s.find('        // salva imediatamente no perfil do motorista')
if legacy_save_start != -1:
    legacy_save_end = s.find('        // centraliza mapa', legacy_save_start)
    if legacy_save_end != -1:
        s = s[:legacy_save_start] + s[legacy_save_end:]

# Remover escritas diretas em drivers (RLS oficial não permite UPDATE do cliente).
# useDriverBroadcast chama driver_set_presence e é a única fonte de presença.
activate_direct_start = s.find('      if (userId) {\n        supabase.from("drivers").update({')
if activate_direct_start != -1:
    activate_direct_end = s.find('      if (mapRef.current) {', activate_direct_start)
    if activate_direct_end != -1:
        s = s[:activate_direct_start] + s[activate_direct_end:]

# Modo de teste: manter apenas estado local; o hook publica assim que online=true.
test_update_start = s.find('    await supabase\n      .from("drivers")\n      .update({')
if test_update_start != -1:
    test_update_end = s.find('    if (mapRef.current) {', test_update_start)
    if test_update_end != -1:
        s = s[:test_update_start] + s[test_update_end:]

# O hook de broadcast também cuida do offline. Não tentar UPDATE direto no unmount.
offline_effect = '''  // offline ao desmontar\n  useEffect(() => () => { if (online && userId)\n    supabase.from("drivers").update({ is_online: false }).eq("user_id", userId).then();\n  }, [online, userId]);\n\n'''
s = s.replace(offline_effect, '')

# Nas mudanças de bloqueio/assinatura basta derrubar o estado local; o hook envia
# _online=false pelo RPC. Remove as escritas diretas redundantes.
s = s.replace('''            if (userId) {\n              void supabase.from("drivers").update({ is_online: false }).eq("user_id", userId);\n            }\n''', '')
s = s.replace('''              if (userId) {\n                void supabase.from("drivers").update({ is_online: false }).eq("user_id", userId);\n              }\n''', '')

# Identidade visual dos mockups.
s = s.replace('MOVVI {(category?.label ?? "CAR").toUpperCase()}', 'APOIS {(category?.label ?? "CAR").toUpperCase()}')
s = s.replace('bg-[#76C139]', 'bg-[#F6BE1C]')
s = s.replace('text-[#071008]', 'text-black')
s = s.replace('border-[#071008]/70', 'border-black/70')
s = s.replace('rgba(118,193,57,0.4)', 'rgba(246,190,28,0.45)')
s = s.replace('Cheguei ao local', 'Cheguei no embarque')

# Tags/console visíveis internamente podem conservar nomes de componentes, mas
# notificações e textos apresentados ao usuário devem ser APOIS.
s = s.replace('tag: `movvi-ride-', 'tag: `apois-ride-')

p.write_text(s, encoding="utf-8")
