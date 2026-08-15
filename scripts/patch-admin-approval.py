from pathlib import Path

p = Path("src/routes/admin.motoristas.tsx")
s = p.read_text(encoding="utf-8")
start = s.index("  async function updateStatus(")
end = s.index("  async function toggleSuspend(", start)

replacement = '''  async function updateStatus(d: Driver, status: Status, reason?: string | null) {
    setBusyId(d.id);
    const toastId = status === "aprovado" ? toast.loading("Aprovando motorista...") : undefined;
    try {
      const { patch } = await updateApprovalFn({
        data: { id: d.id, status, reason: reason ?? null },
      });
      await logAdminAction({
        action: `driver.${status}`,
        entity: "drivers",
        entity_id: d.id,
        before: { approval_status: d.approval_status },
        after: patch,
      });

      if (status === "aprovado") {
        toast.success("Motorista aprovado", {
          id: toastId,
          description: "O cadastro foi liberado. A mensalidade será ativada pelo fluxo financeiro da APOIS.",
        });
      } else {
        if (toastId) toast.dismiss(toastId);
        if (status === "reprovado") toast.success("Motorista reprovado");
        if (status === "bloqueado") toast.success("Motorista bloqueado");
        if (status === "em_analise") toast.success("Cadastro reenviado para análise");
      }

      setRejectFor(null);
      setBlockFor(null);
      setUnblockFor(null);
      setRejectReason("");
      if (detail?.id === d.id) {
        setDetail({
          ...d,
          ...(patch as Database["public"]["Tables"]["drivers"]["Update"]),
        } as Driver);
      }
      await load();
    } catch (e) {
      const raw = e instanceof Error ? e.message : "falha";
      const msg = raw === "forbidden"
        ? "Você não tem permissão para aprovar motoristas"
        : mapAdminError(raw);
      toast.error("Erro ao atualizar status: " + msg, { id: toastId });
    } finally {
      setBusyId(null);
    }
  }

'''

s = s[:start] + replacement + s[end:]
s = s.replace("Motoristas — Admin MOVVI", "Motoristas — Admin APOIS")
p.write_text(s, encoding="utf-8")
