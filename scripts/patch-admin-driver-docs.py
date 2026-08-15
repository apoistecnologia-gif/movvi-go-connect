from pathlib import Path

p = Path("src/routes/admin.motoristas.tsx")
s = p.read_text(encoding="utf-8")

old_pending = '''function docsPending(d: Driver) {
  if (d.documents_status && d.documents_status !== "approved" && d.documents_status !== "aprovado") return true;
  return !d.selfie_url || !d.cnh_url || !d.vehicle_document_url;
}'''
new_pending = '''function docsPending(d: Driver) {
  if (d.documents_status && d.documents_status !== "approved" && d.documents_status !== "aprovado") return true;
  return !d.selfie_url || !d.cnh_url || !d.cnh_back_url || !d.vehicle_document_url || !d.vehicle_photo_url;
}'''
s = s.replace(old_pending, new_pending)

old_cards = '''              <DocCard label="Selfie" url={urls.selfie_url} rawPath={driver.selfie_url} loading={docsLoading} failed={!!urlError} />
              <DocCard label="CNH" url={urls.cnh_url} rawPath={driver.cnh_url} loading={docsLoading} failed={!!urlError} />
              <DocCard
                label="Doc. Veículo"
                url={urls.vehicle_document_url}
                rawPath={driver.vehicle_document_url}
                loading={docsLoading}
                failed={!!urlError}
              />'''
new_cards = '''              <DocCard label="Foto de perfil" url={urls.selfie_url} rawPath={driver.selfie_url} loading={docsLoading} failed={!!urlError} />
              <DocCard label="CNH — frente" url={urls.cnh_url} rawPath={driver.cnh_url} loading={docsLoading} failed={!!urlError} />
              <DocCard label="CNH — verso" url={urls.cnh_back_url} rawPath={driver.cnh_back_url} loading={docsLoading} failed={!!urlError} />
              <DocCard
                label="CRLV"
                url={urls.vehicle_document_url}
                rawPath={driver.vehicle_document_url}
                loading={docsLoading}
                failed={!!urlError}
              />
              <DocCard
                label="Foto do veículo"
                url={urls.vehicle_photo_url}
                rawPath={driver.vehicle_photo_url}
                loading={docsLoading}
                failed={!!urlError}
              />'''
if old_cards not in s:
    raise SystemExit("Bloco de documentos do admin não encontrado")
s = s.replace(old_cards, new_cards)

p.write_text(s, encoding="utf-8")
