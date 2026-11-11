alter table waki_private.quick_hotel_invitations
  add column if not exists legal_name text,
  add column if not exists ruc text,
  add column if not exists plan_code text
    check (plan_code is null or plan_code in ('socio','flexible'));

create or replace function public.create_quick_hotel_invitation(
 p_hotel_name text,
 p_representative_name text,
 p_email text,
 p_legal_name text,
 p_ruc text,
 p_plan_code text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid := auth.uid();
 name_clean text := nullif(trim(coalesce(p_hotel_name,'')),'');
 rep_clean text := nullif(trim(coalesce(p_representative_name,'')),'');
 email_clean text := lower(nullif(trim(coalesce(p_email,'')),''));
 legal_clean text := nullif(trim(coalesce(p_legal_name,'')),'');
 ruc_clean text := regexp_replace(coalesce(p_ruc,''),'[^0-9]','','g');
 plan_clean text := lower(trim(coalesce(p_plan_code,'')));
 staff uuid;
 is_admin boolean;
 created waki_private.quick_hotel_invitations;
 invite_url text;
begin
 if uid is null then raise exception 'AUTH_REQUIRED'; end if;
 select coalesce(public.is_waki_admin(),false) into is_admin;
 select ss.id into staff
 from public.sales_staff ss join public.profiles pf on pf.id=ss.user_id
 where ss.user_id=uid and ss.is_active and pf.account_status='active'
 limit 1;
 if not is_admin and staff is null then raise exception 'NOT_AUTHORIZED' using errcode='42501'; end if;
 if name_clean is null or length(name_clean) not between 3 and 120 then raise exception 'INVALID_HOTEL_NAME'; end if;
 if rep_clean is null or length(rep_clean) not between 2 and 120 then raise exception 'INVALID_REPRESENTATIVE'; end if;
 if email_clean is null or length(email_clean)>254 or email_clean !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then raise exception 'INVALID_CONTACT_EMAIL'; end if;
 if legal_clean is null or length(legal_clean) not between 3 and 160 then raise exception 'INVALID_LEGAL_NAME'; end if;
 if ruc_clean !~ '^[0-9]{11}$' then raise exception 'INVALID_RUC'; end if;
 if plan_clean not in ('socio','flexible') then raise exception 'INVALID_PLAN'; end if;

 perform pg_advisory_xact_lock(hashtextextended('quick-hotel:'||lower(name_clean)||':'||email_clean,0));
 if exists(select 1 from waki_private.quick_hotel_invitations q where lower(q.hotel_name)=lower(name_clean)
   and lower(q.contact_email)=email_clean and q.status='pending' and q.expires_at>now()) then raise exception 'INVITE_ALREADY_PENDING'; end if;
 if exists(select 1 from public.hotels h where lower(h.name)=lower(name_clean) and lower(coalesce(h.contact_email,''))=email_clean) then raise exception 'HOTEL_ALREADY_REGISTERED'; end if;
 if exists(select 1 from public.hotel_brands b where b.ruc=ruc_clean) then raise exception 'RUC_ALREADY_REGISTERED'; end if;
 if (select count(*) from waki_private.quick_hotel_invitations q where q.created_by=uid and q.created_at>now()-interval '24 hours') >= (case when is_admin then 60 else 25 end) then raise exception 'DAILY_INVITE_LIMIT_REACHED'; end if;
 if (select count(*) from waki_private.quick_hotel_invitations q where lower(q.contact_email)=email_clean and q.created_at>now()-interval '24 hours') >= 3 then raise exception 'EMAIL_INVITE_LIMIT_REACHED'; end if;

 insert into waki_private.quick_hotel_invitations(
   hotel_name,representative_name,contact_email,created_by,sales_staff_id,legal_name,ruc,plan_code
 ) values(name_clean,rep_clean,email_clean,uid,staff,legal_clean,ruc_clean,plan_clean)
 returning * into created;
 invite_url:='https://hotel.wakipe.com/invitacion/'||created.invite_token::text;
 insert into waki_private.communication_outbox(event_key,kind,audience,recipient,payload)
 values('quick-hotel-invite:'||created.id::text,'hotel_invitation','hotel',email_clean,
  jsonb_build_object('hotel_name',name_clean,'representative_name',rep_clean,'invitation_url',invite_url,
    'expires_at',created.expires_at,'legal_name',legal_clean,'ruc',ruc_clean,'plan_code',plan_clean));
 return jsonb_build_object('id',created.id,'status','pending','delivery_status','pending',
  'contact_email',email_clean,'invitation_url',invite_url,'expires_at',created.expires_at,
  'plan_code',plan_clean,'legal_name',legal_clean,'ruc',ruc_clean);
end $$;
revoke all on function public.create_quick_hotel_invitation(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.create_quick_hotel_invitation(text,text,text,text,text,text) to authenticated;

create or replace function public.get_sales_hotel_invite(target_invite_token uuid)
 returns jsonb language plpgsql stable security definer set search_path='' as $$
declare payload jsonb;
begin
 select jsonb_build_object('valid',true,'source','sales','status',oc.status,
  'hotel_name',p.name,'district',p.district,'address',p.address,
  'contact_name',oc.contact_name,'contact_role',oc.contact_role,'contact_phone',oc.contact_phone,
  'contact_email',oc.contact_email,'invite_expires_at',oc.invite_expires_at,'claimed',false,
  'legal_name',null,'ruc',null,'plan_code',null) into payload
 from public.sales_hotel_onboarding_cases oc join public.sales_places p on p.id=oc.place_id
 where oc.invite_token=target_invite_token and oc.status in ('started','invited')
  and oc.invite_expires_at>now() limit 1;
 if payload is not null then return payload; end if;
 select jsonb_build_object('valid',true,'source','quick','status','invited',
  'hotel_name',q.hotel_name,'contact_name',q.representative_name,'contact_email',q.contact_email,
  'invite_expires_at',q.expires_at,'claimed',false,'legal_name',q.legal_name,'ruc',q.ruc,'plan_code',q.plan_code)
 into payload from waki_private.quick_hotel_invitations q
 where q.invite_token=target_invite_token and q.status='pending' and q.expires_at>now() limit 1;
 return coalesce(payload,jsonb_build_object('valid',false,'status','unavailable'));
end $$;

create or replace function waki_private.apply_quick_invitation_plan()
returns trigger language plpgsql security definer set search_path='' as $$
declare commission numeric; monthly numeric; actor uuid;
begin
 if new.status='claimed' and old.status is distinct from 'claimed'
   and new.claimed_hotel_id is not null and new.plan_code is not null then
  commission:=case when new.plan_code='socio' then 8 else 12 end;
  monthly:=case when new.plan_code='socio' then 99 else 0 end;
  actor:=coalesce(new.claimed_by,new.created_by);
  insert into waki_private.hotel_commercial_plans(hotel_id,assignment_id,code,commission_rate,monthly_fee,updated_by)
  values(new.claimed_hotel_id,gen_random_uuid(),new.plan_code,commission,monthly,actor)
  on conflict(hotel_id) do update set code=excluded.code,commission_rate=excluded.commission_rate,
    monthly_fee=excluded.monthly_fee,updated_by=excluded.updated_by,updated_at=now();
  insert into waki_private.hotel_finance_settings(hotel_id,commission_rate,updated_by)
  values(new.claimed_hotel_id,commission,actor)
  on conflict(hotel_id) do update set commission_rate=excluded.commission_rate,updated_by=excluded.updated_by,updated_at=now();
 end if;
 return new;
end $$;
drop trigger if exists apply_quick_invitation_plan on waki_private.quick_hotel_invitations;
create trigger apply_quick_invitation_plan after update of status on waki_private.quick_hotel_invitations
for each row execute function waki_private.apply_quick_invitation_plan();
revoke all on function waki_private.apply_quick_invitation_plan() from public,anon,authenticated;

create or replace function public.hotel_contract_generation_context(p_hotel uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
  raise exception 'NOT_AUTHORIZED' using errcode='42501';
 end if;
 select jsonb_build_object(
  'hotel',jsonb_build_object('id',h.id,'name',h.name,'address',h.address,'contact_email',h.contact_email),
  'brand',jsonb_build_object('commercial_name',b.commercial_name,'legal_name',b.legal_name,'ruc',b.ruc),
  'plan',jsonb_build_object('code',p.code,'commission_rate',p.commission_rate,'monthly_fee',p.monthly_fee)
 ) into result
 from public.hotels h join public.hotel_brands b on b.id=h.brand_id
 left join waki_private.hotel_commercial_plans p on p.hotel_id=h.id
 where h.id=p_hotel;
 if result is null then raise exception 'HOTEL_NOT_FOUND'; end if;
 if result->'plan'->>'code' is null then raise exception 'HOTEL_PLAN_REQUIRED'; end if;
 return result;
end $$;
revoke all on function public.hotel_contract_generation_context(uuid) from public,anon,authenticated;
grant execute on function public.hotel_contract_generation_context(uuid) to service_role;

create or replace function public.hotel_contract_offer_generated(
 p_hotel uuid,p_path text,p_offered_by uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_offer waki_private.hotel_contract_offers; h public.hotels;
begin
 if coalesce(current_setting('request.jwt.claim.role',true),'')<>'service_role' then
  raise exception 'NOT_AUTHORIZED' using errcode='42501';
 end if;
 if p_path !~ ('^'||p_hotel::text||'/contracts/[0-9a-f-]{36}\.pdf$') then
  raise exception 'INVALID_CONTRACT_PDF';
 end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='hotel-affiliations' and o.name=p_path) then
  raise exception 'INVALID_CONTRACT_PDF';
 end if;
 if not exists(select 1 from public.hotel_staff s where s.hotel_id=p_hotel and s.user_id=p_offered_by and s.is_active) then
  raise exception 'NOT_AUTHORIZED' using errcode='42501';
 end if;
 select * into h from public.hotels where id=p_hotel for update;
 if h.id is null or h.approval_status not in ('draft','rejected','pending_review') then
  raise exception 'INVALID_CONTRACT_STATUS';
 end if;
 select * into current_offer from waki_private.hotel_contract_offers where hotel_id=p_hotel for update;
 if current_offer.accepted_at is not null then raise exception 'CONTRACT_ALREADY_ACCEPTED'; end if;
 insert into waki_private.hotel_contract_offers(hotel_id,document_path,offered_by)
 values(p_hotel,p_path,p_offered_by)
 on conflict(hotel_id) do update set document_path=excluded.document_path,
  offered_by=excluded.offered_by,offered_at=now()
 returning * into current_offer;
 return jsonb_build_object('document_path',current_offer.document_path,'offered_at',current_offer.offered_at);
end $$;
revoke all on function public.hotel_contract_offer_generated(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.hotel_contract_offer_generated(uuid,text,uuid) to service_role;
