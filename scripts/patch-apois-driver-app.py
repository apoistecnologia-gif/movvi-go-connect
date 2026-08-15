from pathlib import Path

p = Path("src/routes/motorista.app.tsx")
s = p.read_text(encoding="utf-8")

replacements = {
'''import { DriverSideMenu } from "@/components/DriverSideMenu";''': '''import { DriverSideMenu } from "@/components/DriverSideMenu";\nimport { ApoisDriverBottomNav } from "@/components/ApoisDriverBottomNav";''',
'''import {\n  aceitarCorrida,\n  recusarCorrida,\n  informarChegada,\n  iniciarCorrida,\n  finalizarCorrida,\n  cancelarPeloMotorista,\n  avaliarPassageiro,\n  type RideStatus,\n} from "@/lib/rideLifecycle";''': '''import { type RideStatus } from "@/lib/rideLifecycle";\nimport {\n  aceitarCorridaMobile,\n  recusarCorridaMobile,\n  informarChegadaMobile,\n  iniciarCorridaMobile,\n  finalizarCorridaMobile,\n  cancelarPeloMotoristaMobile,\n  avaliarPassageiroMobile,\n} from "@/lib/driverRideLifecycle.mobile";''',
'''head: () => ({ meta: [{ title: "App do Motorista — MOVVI DRIVE" }] }),''': '''head: () => ({ meta: [{ title: "APOIS Motorista" }] }),''',
'''<BrandSplash storageKey="movvi:splash:motorista" />''': '''<BrandSplash storageKey="apois:splash:motorista" />''',
'''  const callAccept   = useServerFn(aceitarCorrida);\n  const callReject   = useServerFn(recusarCorrida);\n  const callArrive   = useServerFn(informarChegada);\n  const callStart    = useServerFn(iniciarCorrida);\n  const callComplete = useServerFn(finalizarCorrida);\n  const callCancel   = useServerFn(cancelarPeloMotorista);\n  const callRate     = useServerFn(avaliarPassageiro);\n  const callRoute    = useServerFn(computeRoute);''': '''  const callAccept   = aceitarCorridaMobile;\n  const callReject   = recusarCorridaMobile;\n  const callArrive   = informarChegadaMobile;\n  const callStart    = iniciarCorridaMobile;\n  const callComplete = finalizarCorridaMobile;\n  const callCancel   = cancelarPeloMotoristaMobile;\n  const callRate     = avaliarPassageiroMobile;\n  const callRoute    = useServerFn(computeRoute);''',
'''  const [userId, setUserId] = useState<string | null>(null);\n  const [driverName, setDriverName] = useState<string>("");''': '''  // userId = public.users.id (usado em candidate_driver_ids e drivers.user_id).\n  // driverId = public.drivers.id (usado em rides.driver_id/accepted_driver_id).\n  const [userId, setUserId] = useState<string | null>(null);\n  const [driverId, setDriverId] = useState<string | null>(null);\n  const [driverName, setDriverName] = useState<string>("");''',
'''      setUserId(u.user.id);\n      const meta = (u.user.user_metadata ?? {}) as Record<string, unknown>;''': '''      const meta = (u.user.user_metadata ?? {}) as Record<string, unknown>;''',
'''      if (result.ok) {\n        const d = result.profile;''': '''      if (result.ok) {\n        const d = result.profile;\n        setUserId(d.user_id);\n        setDriverId(d.id);\n        if (d.name) setDriverName(d.name.trim().split(/\\s+/)[0] || d.name);''',
'''        } else if (d.subscription_status && d.subscription_status !== "active") {''': '''        } else if (d.subscription_status && !["active", "ativa", "teste"].includes(d.subscription_status)) {''',
'''          if (row.subscription_status && row.subscription_status !== "active") {''': '''          if (row.subscription_status && !["active", "ativa", "teste"].includes(row.subscription_status)) {''',
'''  useEffect(() => { if (userId) loadTodayStats(userId); }, [userId, loadTodayStats]);''': '''  useEffect(() => { if (driverId) loadTodayStats(driverId); }, [driverId, loadTodayStats]);''',
'''.eq("auth_user_id", pid).maybeSingle()''': '''.eq("id", pid).maybeSingle()''',
'''    if (r.driver_id !== userId && (r as any).accepted_driver_id !== userId) return;''': '''    if (!driverId || (r.driver_id !== driverId && (r as any).accepted_driver_id !== driverId)) return;''',
'''        const wasActive = activeRef.current?.id === r.id || r.driver_id === userId || (r as any).accepted_driver_id === userId;''': '''        const wasActive = activeRef.current?.id === r.id || r.driver_id === driverId || (r as any).accepted_driver_id === driverId;''',
'''.eq("driver_id", userId)''': '''.eq("driver_id", driverId)''',
'''        if (acceptedDriverId && acceptedDriverId !== userId) {''': '''        if (acceptedDriverId && acceptedDriverId !== driverId) {''',
'''          if (acceptedDriverId && acceptedDriverId !== userId) {''': '''          if (acceptedDriverId && acceptedDriverId !== driverId) {''',
'''  }, [userId, loadTodayStats]);''': '''  }, [userId, driverId, loadTodayStats]);''',
'''              color={online ? "#8DD92B" : "#94a3b8"}''': '''              color={online ? "#F6BE1C" : "#94a3b8"}''',
'''                strokeColor: "#8DD92B", strokeOpacity: 1, strokeWeight: 9, geodesic: true, zIndex: 3,''': '''                strokeColor: "#F6BE1C", strokeOpacity: 1, strokeWeight: 9, geodesic: true, zIndex: 3,''',
'''        <circle cx="22" cy="22" r={r} stroke="#76C139" strokeWidth="3" fill="none"''': '''        <circle cx="22" cy="22" r={r} stroke="#F6BE1C" strokeWidth="3" fill="none"''',
'''              Segurança MOVVI''': '''              Segurança APOIS''',
'''            title: "MOVVI • Corrida cancelada",''': '''            title: "APOIS • Corrida cancelada",''',
'''  const navReserve = "calc(env(safe-area-inset-bottom) + 20px)";''': '''  const navReserve = "calc(env(safe-area-inset-bottom) + 76px)";''',
'''      {/* Bottom nav removido — todas as opções vivem dentro do menu lateral (hambúrguer). */}''': '''      <ApoisDriverBottomNav hidden={!!ratingRide} />''',
}

for old, new in replacements.items():
    if old not in s:
        print(f"[patch] trecho não encontrado, ignorando: {old[:90]!r}")
        continue
    s = s.replace(old, new)

# O accepted_driver_id e driver_id da corrida são IDs da tabela drivers.
# candidate_driver_ids continua usando public.users.id.
s = s.replace('acceptedDriverId !== userId', 'acceptedDriverId !== driverId')

# Branding visível remanescente, sem renomear componentes internos MovviMap/MovviSheet.
s = s.replace('"MOVVI • Corrida cancelada"', '"APOIS • Corrida cancelada"')
s = s.replace('>Segurança MOVVI<', '>Segurança APOIS<')

p.write_text(s, encoding="utf-8")
