-- WAKI: expediente privado de afiliación bancaria y contrato firmado.
-- No modifica datos ni aprobación de hoteles existentes.
create table if not exists waki_private.hotel_affiliation_dossiers (
  hotel_id uuid primary key references public.hotels(id) on delete cascade,
  bank_name text,
  account_type text,
  account_number text,
  cci text,
  account_holder text,
  holder_ruc text,
  currency text not null default 'PEN' check (currency = 'PEN'),
  signed_contract_path text,
  signed_contract_at timestamptz,
  bank_document_path text,
  bank_verified_at timestamptz,
  bank_verified_by uuid references auth.users(id),
  contract_verified_at timestamptz,
  contract_verified_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create table if not exists waki_private.hotel_affiliation_audit (
  id bigint generated always as identity primary key,
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  action text not null check (action in ('bank_updated','contract_uploaded','bank_document_uploaded','verified')),
  created_at timestamptz not null default now()
);
alter table waki_private.hotel_affiliation_dossiers enable row level security;
alter table waki_private.hotel_affiliation_audit enable row level security;
revoke all on waki_private.hotel_affiliation_dossiers,waki_private.hotel_affiliation_audit from public,anon,authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('hotel-affiliations','hotel-affiliations',false,10485760,array['application/pdf'])
on conflict (id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['application/pdf'];

-- El bucket nunca permite lectura anónima ni sustitución/eliminación de PDFs.
create policy "WAKI affiliation upload own hotel PDFs" on storage.objects
for insert to authenticated
with check (
  bucket_id='hotel-affiliations'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(contracts|bank)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
  and (
    public.is_waki_admin()
    or exists (
      select 1 from public.hotels h
      where h.id::text=split_part(name,'/',1)
        and h.approval_status in ('draft','pending_review','rejected')
        and public.user_can_manage_hotel(h.id)
    )
  )
);
create policy "WAKI affiliation read own hotel PDFs" on storage.objects
for select to authenticated
using (
  bucket_id='hotel-affiliations'
  and (
    public.is_waki_admin()
    or exists (
      select 1 from public.hotels h
      where h.id::text=split_part(name,'/',1)
        and public.user_can_manage_hotel(h.id)
    )
  )
);

create or replace function waki_private.hotel_dossier_control(p_hotel uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  h public.hotels;
  doc waki_private.hotel_affiliation_dossiers;
  is_admin boolean := coalesce(public.is_waki_admin(),false);
  can_manage boolean := coalesce(public.user_can_manage_hotel(p_hotel),false);
  f_path text;
  f_ok boolean;
  v_action text := coalesce(p_action,'read');
begin
  if auth.uid() is null or not (is_admin or can_manage) then
    raise exception 'NOT_AUTHORIZED' using errcode='42501';
  end if;
  select * into h from public.hotels where id=p_hotel;
  if h.id is null then raise exception 'HOTEL_NOT_FOUND'; end if;

  if v_action='save_bank' then
    if not is_admin and h.approval_status not in ('draft','pending_review','rejected') then
      raise exception 'CONTACT_WAKI_FOR_BANK_CHANGES';
    end if;
    if length(trim(coalesce(p_data->>'bank_name',''))) not between 3 and 80
      or coalesce(p_data->>'account_type','') not in ('corriente','ahorros')
      or coalesce(p_data->>'account_number','') !~ '^[0-9]{6,30}$'
      or coalesce(p_data->>'cci','') !~ '^[0-9]{20}$'
      or length(trim(coalesce(p_data->>'account_holder',''))) not between 3 and 150
      or coalesce(p_data->>'holder_ruc','') !~ '^[0-9]{11}$' then
      raise exception 'INVALID_BANK_DETAILS';
    end if;
    insert into waki_private.hotel_affiliation_dossiers(
      hotel_id,bank_name,account_type,account_number,cci,account_holder,holder_ruc,updated_by)
    values (p_hotel,trim(p_data->>'bank_name'),p_data->>'account_type',
      p_data->>'account_number',p_data->>'cci',trim(p_data->>'account_holder'),
      p_data->>'holder_ruc',auth.uid())
    on conflict(hotel_id) do update set
      bank_name=excluded.bank_name,account_type=excluded.account_type,
      account_number=excluded.account_number,cci=excluded.cci,
      account_holder=excluded.account_holder,holder_ruc=excluded.holder_ruc,
      bank_verified_at=null,bank_verified_by=null,updated_by=auth.uid(),updated_at=now();
    insert into waki_private.hotel_affiliation_audit(hotel_id,actor_id,action)
    values(p_hotel,auth.uid(),'bank_updated');

  elsif v_action in ('attach_contract','attach_bank_document') then
    if not is_admin and h.approval_status not in ('draft','pending_review','rejected') then
      raise exception 'CONTACT_WAKI_FOR_DOCUMENT_CHANGES';
    end if;
    f_path:=p_data->>'path';
    if f_path is null or length(f_path)>220 or
      f_path !~ ('^'||p_hotel::text||'/'||
          case when v_action='attach_contract' then 'contracts' else 'bank' end||
          '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$') then
      raise exception 'INVALID_DOCUMENT_PATH';
    end if;
    select exists(select 1 from storage.objects so
      where so.bucket_id='hotel-affiliations' and so.name=f_path)
    into f_ok;
    if not f_ok then raise exception 'DOCUMENT_NOT_UPLOADED'; end if;
    insert into waki_private.hotel_affiliation_dossiers(hotel_id,updated_by)
    values(p_hotel,auth.uid()) on conflict(hotel_id) do nothing;
    if v_action='attach_contract' then
      update waki_private.hotel_affiliation_dossiers
        set signed_contract_path=f_path,signed_contract_at=now(),
            contract_verified_at=null,contract_verified_by=null,updated_by=auth.uid(),updated_at=now()
      where hotel_id=p_hotel;
    else
      update waki_private.hotel_affiliation_dossiers
        set bank_document_path=f_path,bank_verified_at=null,
            bank_verified_by=null,updated_by=auth.uid(),updated_at=now()
      where hotel_id=p_hotel;
    end if;
    insert into waki_private.hotel_affiliation_audit(hotel_id,actor_id,action)
    values(p_hotel,auth.uid(),case when v_action='attach_contract'
      then 'contract_uploaded' else 'bank_document_uploaded' end);

  elsif v_action='verify' then
    if not is_admin then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
    select * into doc from waki_private.hotel_affiliation_dossiers where hotel_id=p_hotel for update;
    if doc.hotel_id is null or doc.signed_contract_path is null
      or doc.bank_name is null or doc.account_number is null or doc.cci is null then
      raise exception 'AFFILIATION_DOSSIER_INCOMPLETE';
    end if;
    if p_data->>'contract_verified' is distinct from 'true'
       or p_data->>'bank_verified' is distinct from 'true' then
      raise exception 'AFFILIATION_VERIFICATION_REQUIRED';
    end if;
    update waki_private.hotel_affiliation_dossiers
    set contract_verified_by=auth.uid(),contract_verified_at=now(),
      bank_verified_by=auth.uid(),bank_verified_at=now(),
      updated_by=auth.uid(),updated_at=now()
    where hotel_id=p_hotel;
    insert into waki_private.hotel_affiliation_audit(hotel_id,actor_id,action)
    values(p_hotel,auth.uid(),'verified');

  elsif v_action<>'read' then
    raise exception 'INVALID_ACTION';
  end if;

  select * into doc from waki_private.hotel_affiliation_dossiers where hotel_id=p_hotel;
  return jsonb_build_object(
    'hotel_id',p_hotel,
    'bank_name',doc.bank_name,'account_type',doc.account_type,
    'account_number',doc.account_number,'cci',doc.cci,
    'account_holder',doc.account_holder,'holder_ruc',doc.holder_ruc,'currency','PEN',
    'signed_contract_path',doc.signed_contract_path,
    'bank_document_path',doc.bank_document_path,
    'contract_verified',doc.contract_verified_at is not null,
    'bank_verified',doc.bank_verified_at is not null,
    'bank_ready',doc.bank_name is not null and doc.account_number is not null and doc.cci is not null,
    'contract_ready',doc.signed_contract_path is not null,
    'updated_at',doc.updated_at
  );
end $$;

create or replace function public.hotel_dossier_control(
 p_hotel uuid,p_action text default 'read',p_data jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path=''
as $$ select waki_private.hotel_dossier_control(p_hotel,p_action,p_data) $$;
revoke all on function waki_private.hotel_dossier_control(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.hotel_dossier_control(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function waki_private.hotel_dossier_control(uuid,text,jsonb) to authenticated;
grant execute on function public.hotel_dossier_control(uuid,text,jsonb) to authenticated;

-- El alta requiere expediente completo; la aprobación exige revisión real del administrador.
-- Las habitaciones previamente aprobadas NO cambian de estado.
create or replace function waki_private.require_affiliation_readiness()
returns trigger language plpgsql security definer set search_path='' as $$
declare readiness jsonb;
begin
 if new.approval_status is distinct from old.approval_status
   and new.approval_status in ('pending_review','approved') then
  if not exists(select 1 from waki_private.hotel_legal_acceptances
    where hotel_id=new.id and document_version='2026-10-27-hotels-v1') then
    raise exception 'HOTEL_LEGAL_ACCEPTANCE_REQUIRED';
  end if;
  if not exists(select 1 from waki_private.hotel_affiliation_dossiers
    where hotel_id=new.id and bank_name is not null and account_number is not null
      and cci is not null and signed_contract_path is not null) then
    raise exception 'AFFILIATION_DOSSIER_INCOMPLETE';
  end if;
  if new.approval_status='approved' then
   if not exists(select 1 from waki_private.hotel_affiliation_reviews
       where hotel_id=new.id and bank_verified and training_verified)
     or not exists(select 1 from waki_private.hotel_affiliation_dossiers
       where hotel_id=new.id and bank_verified_at is not null
         and contract_verified_at is not null) then
     raise exception 'AFFILIATION_REVIEW_REQUIRED';
   end if;
   readiness:=public.get_hotel_onboarding_status(new.id);
   if not coalesce((readiness->>'is_ready')::boolean,false)
     or new.latitude is null or new.longitude is null
     or new.latitude not between -90 and 90 or new.longitude not between -180 and 180
     or not exists(select 1 from public.room_types rt
       join public.room_units ru on ru.room_type_id=rt.id
       where rt.hotel_id=new.id and rt.is_active and ru.is_active) then
     raise exception 'HOTEL_ONBOARDING_INCOMPLETE';
   end if;
  end if;
 end if;
 return new;
end $$;
revoke all on function waki_private.require_affiliation_readiness() from public,anon,authenticated;
