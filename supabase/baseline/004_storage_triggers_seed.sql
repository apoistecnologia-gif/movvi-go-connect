-- APOIS CORRIDAS — CANONICAL BASELINE 004
-- Storage, triggers and deterministic seed/configuration.

-- Storage buckets. Sensitive driver buckets are PRIVATE.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('driver-selfies','driver-selfies',false,10485760,array['image/jpeg','image/png','image/webp']),
  ('driver-cnh','driver-cnh',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf']),
  ('vehicle-documents','vehicle-documents',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf']),
  ('profile-photos','profile-photos',false,10485760,array['image/jpeg','image/png','image/webp']),
  ('documents','documents',false,104857600,array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('public-media','public-media',true,52428800,array['image/jpeg','image/png','image/webp','image/avif','image/svg+xml','video/mp4'])
on conflict(id) do update set
  name=excluded.name,public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- Storage ownership: path convention <auth.uid()>/...
create policy apois_driver_storage_insert_own on storage.objects for insert to authenticated with check (
  bucket_id=any(array['driver-selfies','driver-cnh','vehicle-documents','profile-photos'])
  and (storage.foldername(name))[1]=auth.uid()::text
);
create policy apois_driver_storage_select_own on storage.objects for select to authenticated using (
  bucket_id=any(array['driver-selfies','driver-cnh','vehicle-documents','profile-photos'])
  and ((storage.foldername(name))[1]=auth.uid()::text or private.has_permission('users.manage'))
);
create policy apois_driver_storage_update_own on storage.objects for update to authenticated using (
  bucket_id=any(array['driver-selfies','driver-cnh','vehicle-documents','profile-photos'])
  and (storage.foldername(name))[1]=auth.uid()::text
) with check (
  bucket_id=any(array['driver-selfies','driver-cnh','vehicle-documents','profile-photos'])
  and (storage.foldername(name))[1]=auth.uid()::text
);
create policy apois_driver_storage_delete_own on storage.objects for delete to authenticated using (
  bucket_id=any(array['driver-selfies','driver-cnh','vehicle-documents','profile-photos'])
  and (storage.foldername(name))[1]=auth.uid()::text
);

-- A passenger may see the accepted driver's profile photo only for a relevant ride.
create policy apois_passenger_select_ride_driver_photo on storage.objects for select to authenticated using (
  bucket_id='profile-photos'
  and exists(
    select 1
    from public.users du
    join public.drivers d on d.user_id=du.id
    join public.rides r on r.driver_id=d.id
    where du.auth_user_id::text=(storage.foldername(storage.objects.name))[1]
      and r.passenger_id=public.mobility_user_id()
      and r.status in ('motorista_a_caminho','motorista_chegou','em_viagem','finalizada')
  )
);

create policy staff_storage_read on storage.objects for select to authenticated using (private.has_permission('media.read'));
create policy staff_storage_insert on storage.objects for insert to authenticated with check (
  private.has_permission('media.write') and owner_id=auth.uid()::text
);
create policy staff_storage_update on storage.objects for update to authenticated using (
  private.has_permission('media.write') and owner_id=auth.uid()::text
) with check (private.has_permission('media.write') and owner_id=auth.uid()::text);
create policy staff_storage_delete on storage.objects for delete to authenticated using (private.has_permission('media.delete'));

-- Triggers
create trigger auth_user_profile after insert on auth.users for each row execute function public.handle_new_user();
create trigger trg_sync_driver_presence_to_active_rides
  after update of current_lat,current_lng,current_heading,last_location_at on public.drivers
  for each row execute function public.sync_driver_presence_to_active_rides();
create trigger cancellation_fee_credit_driver_wallet
  after insert or update on public.cancellation_fees for each row execute function public.credit_driver_cancellation_fee();
create trigger content_documents_updated_at before update on public.content_documents
  for each row execute function private.set_updated_at();
create trigger content_documents_version after insert or update or delete on public.content_documents
  for each row execute function private.capture_content_version();
create trigger form_submissions_updated_at before update on public.form_submissions
  for each row execute function private.set_updated_at();
create trigger media_assets_updated_at before update on public.media_assets
  for each row execute function private.set_updated_at();
create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

-- Current compatibility trigger for the optional "next ride" flow.
-- Phase 4 replaces dispatch selection with the canonical dispatch engine.
create trigger rides_append_nearby_busy_candidates
  before update of candidate_driver_ids on public.rides
  for each row execute function public.append_nearby_busy_driver_candidates();

-- Deterministic non-secret seeds.
insert into public.ride_categories(code,name,description,capacity_label,sort_order,is_active) values
  ('carros','Carro','Conforto para o dia a dia','Até 4 passageiros',10,true),
  ('motos','Moto','Mais agilidade no trajeto','1 passageiro',20,true),
  ('fretes','Fretes e Mudanças','Transporte de volumes e mudanças','Conforme o serviço',30,true),
  ('guincho','Guincho','Assistência para seu veículo','Conforme o veículo',40,true),
  ('envios','Envios','Entrega rápida de objetos','Objetos permitidos',50,true)
on conflict(code) do update set name=excluded.name,description=excluded.description,capacity_label=excluded.capacity_label,sort_order=excluded.sort_order,is_active=excluded.is_active;

insert into public.payment_methods(code,name,description,requires_balance,is_active,sort_order) values
  ('pix','Pix','Pagamento instantâneo',false,true,10),
  ('credit','Cartão de crédito','Pague com cartão de crédito',false,true,20),
  ('debit','Cartão de débito','Pague com cartão de débito',false,true,30),
  ('cash','Dinheiro','Pague diretamente ao motorista',false,true,40),
  ('wallet','Carteira APOIS','Use seu saldo disponível',true,true,50)
on conflict(code) do update set name=excluded.name,description=excluded.description,requires_balance=excluded.requires_balance,is_active=excluded.is_active,sort_order=excluded.sort_order;

-- Existing product defaults are explicit configuration, not hidden constants.
insert into public.app_settings(key,value,description) values
  ('ride.cancellation_fee_amount','5'::jsonb,'Valor padrão da taxa de cancelamento'),
  ('ride.cancellation_free_minutes','2'::jsonb,'Minutos para cancelamento sem taxa'),
  ('ride.next_offer_max_distance_km','5'::jsonb,'Distância máxima em km para oferecer uma próxima corrida a motorista que já está em viagem.')
on conflict(key) do update set value=excluded.value,description=excluded.description,updated_at=now();

insert into public.role_permissions(role,permission) values
  ('administrator','admin.access'),('administrator','audit.read'),('administrator','content.delete'),
  ('administrator','content.publish'),('administrator','content.read'),('administrator','content.write'),
  ('administrator','forms.read'),('administrator','forms.write'),('administrator','media.delete'),
  ('administrator','media.read'),('administrator','media.write'),('administrator','users.manage'),
  ('editor','admin.access'),('editor','content.publish'),('editor','content.read'),('editor','content.write'),
  ('editor','media.read'),('editor','media.write'),
  ('marketing','admin.access'),('marketing','content.publish'),('marketing','content.read'),('marketing','content.write'),
  ('marketing','forms.read'),('marketing','media.read'),('marketing','media.write'),
  ('reader','admin.access'),('reader','content.read'),('reader','media.read'),
  ('support','admin.access'),('support','content.read'),('support','content.write'),('support','forms.read'),
  ('support','forms.write'),('support','media.read')
on conflict(role,permission) do nothing;
