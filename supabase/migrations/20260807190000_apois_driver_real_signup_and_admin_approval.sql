BEGIN;

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS blocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES
 ('driver-selfies','driver-selfies',false,10485760,ARRAY['image/jpeg','image/png','image/webp']::text[]),
 ('driver-cnh','driver-cnh',false,10485760,ARRAY['image/jpeg','image/png','image/webp','application/pdf']::text[]),
 ('vehicle-documents','vehicle-documents',false,10485760,ARRAY['image/jpeg','image/png','image/webp','application/pdf']::text[]),
 ('profile-photos','profile-photos',false,10485760,ARRAY['image/jpeg','image/png','image/webp']::text[])
ON CONFLICT (id) DO UPDATE SET public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

DROP POLICY IF EXISTS apois_driver_storage_insert_own ON storage.objects;
CREATE POLICY apois_driver_storage_insert_own ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id IN ('driver-selfies','driver-cnh','vehicle-documents','profile-photos') AND (storage.foldername(name))[1]=auth.uid()::text);
DROP POLICY IF EXISTS apois_driver_storage_select_own ON storage.objects;
CREATE POLICY apois_driver_storage_select_own ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('driver-selfies','driver-cnh','vehicle-documents','profile-photos') AND ((storage.foldername(name))[1]=auth.uid()::text OR private.has_permission('users.manage')));
DROP POLICY IF EXISTS apois_driver_storage_update_own ON storage.objects;
CREATE POLICY apois_driver_storage_update_own ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id IN ('driver-selfies','driver-cnh','vehicle-documents','profile-photos') AND (storage.foldername(name))[1]=auth.uid()::text)
WITH CHECK (bucket_id IN ('driver-selfies','driver-cnh','vehicle-documents','profile-photos') AND (storage.foldername(name))[1]=auth.uid()::text);
DROP POLICY IF EXISTS apois_driver_storage_delete_own ON storage.objects;
CREATE POLICY apois_driver_storage_delete_own ON storage.objects FOR DELETE TO authenticated
USING (bucket_id IN ('driver-selfies','driver-cnh','vehicle-documents','profile-photos') AND (storage.foldername(name))[1]=auth.uid()::text);

DROP POLICY IF EXISTS drivers_admin_read ON public.drivers;
CREATE POLICY drivers_admin_read ON public.drivers FOR SELECT TO authenticated USING (private.has_permission('users.manage'));
DROP POLICY IF EXISTS drivers_admin_update ON public.drivers;
CREATE POLICY drivers_admin_update ON public.drivers FOR UPDATE TO authenticated USING (private.has_permission('users.manage')) WITH CHECK (private.has_permission('users.manage'));
DROP POLICY IF EXISTS users_admin_read ON public.users;
CREATE POLICY users_admin_read ON public.users FOR SELECT TO authenticated USING (private.has_permission('users.manage'));
DROP POLICY IF EXISTS user_roles_admin_read ON public.user_roles;
CREATE POLICY user_roles_admin_read ON public.user_roles FOR SELECT TO authenticated USING (private.has_permission('users.manage'));
DROP POLICY IF EXISTS rides_admin_read ON public.rides;
CREATE POLICY rides_admin_read ON public.rides FOR SELECT TO authenticated USING (private.has_permission('users.manage'));

CREATE TABLE IF NOT EXISTS public.admin_driver_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
 admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 note text NOT NULL CHECK (char_length(note) BETWEEN 1 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_driver_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admin_driver_notes_admin_all ON public.admin_driver_notes;
CREATE POLICY admin_driver_notes_admin_all ON public.admin_driver_notes FOR ALL TO authenticated
USING (private.has_permission('users.manage')) WITH CHECK (private.has_permission('users.manage'));

CREATE OR REPLACE FUNCTION public.driver_complete_registration(
 _name text,_phone text,_cpf text,_birth_date date,_city text,_state text,_category text,
 _vehicle_model text,_vehicle_plate text,_vehicle_color text,_vehicle_year integer,
 _selfie_path text,_cnh_path text,_cnh_back_path text,_vehicle_document_path text,_photo_path text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user public.users%ROWTYPE; v_driver public.drivers%ROWTYPE; v_category text:=lower(trim(coalesce(_category,''))); v_prefix text:=auth.uid()::text||'/';
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF v_category NOT IN ('carros','motos','fretes','guincho','envios') THEN RAISE EXCEPTION 'invalid_category' USING ERRCODE='22023'; END IF;
 IF nullif(trim(coalesce(_name,'')),'') IS NULL THEN RAISE EXCEPTION 'name_required' USING ERRCODE='22023'; END IF;
 IF _vehicle_year IS NULL OR _vehicle_year<1971 OR _vehicle_year>extract(year from now())::int+1 THEN RAISE EXCEPTION 'invalid_vehicle_year' USING ERRCODE='22023'; END IF;
 IF _selfie_path IS NULL OR left(_selfie_path,length(v_prefix))<>v_prefix OR _cnh_path IS NULL OR left(_cnh_path,length(v_prefix))<>v_prefix OR _cnh_back_path IS NULL OR left(_cnh_back_path,length(v_prefix))<>v_prefix OR _vehicle_document_path IS NULL OR left(_vehicle_document_path,length(v_prefix))<>v_prefix OR (_photo_path IS NOT NULL AND left(_photo_path,length(v_prefix))<>v_prefix) THEN RAISE EXCEPTION 'invalid_document_path' USING ERRCODE='22023'; END IF;
 SELECT * INTO v_user FROM public.users WHERE auth_user_id=auth.uid() AND deleted_at IS NULL LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'profile_missing'; END IF;
 UPDATE public.users SET name=left(trim(_name),160),phone=nullif(left(regexp_replace(coalesce(_phone,''),'[^0-9]','','g'),15),''),cpf=nullif(left(regexp_replace(coalesce(_cpf,''),'[^0-9]','','g'),14),''),birth_date=_birth_date,city=nullif(left(trim(coalesce(_city,'')),120),''),avatar_url=coalesce(_photo_path,_selfie_path),updated_at=now() WHERE id=v_user.id RETURNING * INTO v_user;
 INSERT INTO public.user_roles(user_id,role) VALUES(v_user.id,'driver') ON CONFLICT(user_id,role) DO NOTHING;
 INSERT INTO public.drivers(user_id,name,email,phone,cpf,birth_date,city,state,category,vehicle_model,vehicle_plate,vehicle_color,vehicle_year,selfie_url,cnh_url,cnh_back_url,vehicle_document_url,photo_url,approval_status,documents_status,subscription_status,is_online,updated_at)
 VALUES(v_user.id,left(trim(_name),160),v_user.email,v_user.phone,v_user.cpf,_birth_date,nullif(left(trim(coalesce(_city,'')),120),''),upper(left(trim(coalesce(_state,'')),2)),v_category,nullif(left(trim(coalesce(_vehicle_model,'')),120),''),upper(nullif(left(trim(coalesce(_vehicle_plate,'')),10),'')),nullif(left(trim(coalesce(_vehicle_color,'')),60),''),_vehicle_year,_selfie_path,_cnh_path,_cnh_back_path,_vehicle_document_path,coalesce(_photo_path,_selfie_path),'em_analise','pending_review','teste',false,now())
 ON CONFLICT(user_id) DO UPDATE SET name=excluded.name,email=excluded.email,phone=excluded.phone,cpf=excluded.cpf,birth_date=excluded.birth_date,city=excluded.city,state=excluded.state,category=excluded.category,vehicle_model=excluded.vehicle_model,vehicle_plate=excluded.vehicle_plate,vehicle_color=excluded.vehicle_color,vehicle_year=excluded.vehicle_year,selfie_url=excluded.selfie_url,cnh_url=excluded.cnh_url,cnh_back_url=excluded.cnh_back_url,vehicle_document_url=excluded.vehicle_document_url,photo_url=excluded.photo_url,approval_status='em_analise',documents_status='pending_review',is_online=false,motivo_reprovacao=NULL,updated_at=now()
 RETURNING * INTO v_driver;
 RETURN to_jsonb(v_driver);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_is_authorized() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT private.has_permission('users.manage'); $$;
CREATE OR REPLACE FUNCTION public.admin_set_driver_approval(_driver_id uuid,_status text,_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_driver public.drivers%ROWTYPE; v_status text:=lower(trim(coalesce(_status,'')));
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
 IF NOT private.has_permission('users.manage') THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF v_status NOT IN ('em_analise','aprovado','reprovado','bloqueado') THEN RAISE EXCEPTION 'invalid_status' USING ERRCODE='22023'; END IF;
 UPDATE public.drivers SET approval_status=v_status,motivo_reprovacao=CASE WHEN v_status='reprovado' THEN nullif(left(trim(coalesce(_reason,'')),500),'') ELSE NULL END,documents_status=CASE WHEN v_status='aprovado' THEN 'approved' WHEN v_status='reprovado' THEN 'rejected' ELSE documents_status END,approved_at=CASE WHEN v_status='aprovado' THEN now() ELSE approved_at END,blocked_at=CASE WHEN v_status='bloqueado' THEN now() ELSE NULL END,is_online=CASE WHEN v_status='aprovado' THEN is_online ELSE false END,updated_at=now() WHERE id=_driver_id RETURNING * INTO v_driver;
 IF NOT FOUND THEN RAISE EXCEPTION 'driver_not_found'; END IF;
 RETURN to_jsonb(v_driver);
END; $$;

REVOKE ALL ON FUNCTION public.driver_complete_registration(text,text,text,date,text,text,text,text,text,text,integer,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.driver_complete_registration(text,text,text,date,text,text,text,text,text,text,integer,text,text,text,text,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.admin_is_authorized() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_is_authorized() TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.admin_set_driver_approval(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_driver_approval(uuid,text,text) TO authenticated,service_role;

COMMIT;
