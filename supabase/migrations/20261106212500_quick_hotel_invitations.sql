-- WAKI · Invitar un hotel desde Ventas o Admin sin geolocalización inicial.
-- Sólo el destinatario con email verificado podrá crear su acceso y su hotel borrador.
create table if not exists waki_private.quick_hotel_invitations (
 id uuid primary key default gen_random_uuid(),
 hotel_name text not null,
 representative_name text not null,
 contact_email text not null,
 created_by uuid not null references auth.users(id),
 sales_staff_id uuid references public.sales_staff(id),
 invite_token uuid not null unique default gen_random_uuid(),
 expires_at timestamptz not null default (now() + interval '14 days'),
 status text not null default 'pending' check(status in ('pending','claimed','cancelled')),
 claimed_by uuid references auth.users(id),
 claimed_hotel_id uuid references public.hotels(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint quick_hotel_name_len check(length(hotel_name) between 3 and 120),
 constraint quick_hotel_rep_len check(length(representative_name) between 2 and 120),
 constraint quick_hotel_email_len check(length(contact_email) between 5 and 254)
);
create index if not exists quick_hotel_invitation_creator_idx
 on waki_private.quick_hotel_invitations(created_by,created_at desc);
create index if not exists quick_hotel_invitation_email_idx
 on waki_private.quick_hotel_invitations(lower(contact_email),created_at desc);
alter table waki_private.quick_hotel_invitations enable row level security;
revoke all on waki_private.quick_hotel_invitations from public,anon,authenticated;

create or replace function public.create_quick_hotel_invitation(
 p_hotel_name text,p_representative_name text,p_email text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid := auth.uid();
 name_clean text := nullif(trim(coalesce(p_hotel_name,'')),'');
 rep_clean text := nullif(trim(coalesce(p_representative_name,'')),'');
 email_clean text := lower(nullif(trim(coalesce(p_email,'')),''));
 staff uuid;
 is_admin boolean;
 created waki_private.quick_hotel_invitations;
 invite_url text;
begin
 if uid is null then raise exception 'AUTH_REQUIRED';end if;
 select coalesce(public.is_waki_admin(),false) into is_admin;
 select ss.id into staff
 from public.sales_staff ss join public.profiles pf on pf.id=ss.user_id
 where ss.user_id=uid and ss.is_active and pf.account_status='active'
 limit 1;
 if not is_admin and staff is null then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 if name_clean is null or length(name_clean) not between 3 and 120 then
  raise exception 'INVALID_HOTEL_NAME';end if;
 if rep_clean is null or length(rep_clean) not between 2 and 120 then
  raise exception 'INVALID_REPRESENTATIVE';end if;
 if email_clean is null or length(email_clean)>254 or
    email_clean !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
  raise exception 'INVALID_CONTACT_EMAIL';end if;

 -- Serialize simultaneous double-clicks / submissions for the same candidate.
 perform pg_advisory_xact_lock(hashtextextended('quick-hotel:'||lower(name_clean)||':'||email_clean,0));
 if exists(select 1 from waki_private.quick_hotel_invitations q
  where lower(q.hotel_name)=lower(name_clean) and lower(q.contact_email)=email_clean
    and q.status='pending' and q.expires_at>now())
 then raise exception 'INVITE_ALREADY_PENDING';end if;
 if exists(select 1 from public.hotels h
  where lower(h.name)=lower(name_clean) and lower(coalesce(h.contact_email,''))=email_clean)
 then raise exception 'HOTEL_ALREADY_REGISTERED';end if;
 if (select count(*) from waki_private.quick_hotel_invitations q
  where q.created_by=uid and q.created_at>now()-interval '24 hours') >=
    (case when is_admin then 60 else 25 end)
 then raise exception 'DAILY_INVITE_LIMIT_REACHED';end if;
 if (select count(*) from waki_private.quick_hotel_invitations q
  where lower(q.contact_email)=email_clean and q.created_at>now()-interval '24 hours') >= 3
 then raise exception 'EMAIL_INVITE_LIMIT_REACHED';end if;

 insert into waki_private.quick_hotel_invitations(
  hotel_name,representative_name,contact_email,created_by,sales_staff_id
 ) values(name_clean,rep_clean,email_clean,uid,staff)
 returning * into created;
 invite_url:='https://ventas.wakipe.com/hotel/invitacion/'||created.invite_token::text;
 insert into waki_private.communication_outbox(
  event_key,kind,audience,recipient,payload
 ) values(
  'quick-hotel-invite:'||created.id::text,'hotel_invitation','hotel',email_clean,
  jsonb_build_object('hotel_name',name_clean,'representative_name',rep_clean,
   'invitation_url',invite_url,'expires_at',created.expires_at)
 );
 return jsonb_build_object('id',created.id,'status','pending','delivery_status','pending',
  'contact_email',email_clean,'invitation_url',invite_url,'expires_at',created.expires_at);
end $$;

create or replace function public.list_quick_hotel_invitations(p_limit integer default 20)
 returns jsonb language plpgsql security definer stable set search_path='' as $$
declare uid uuid:=auth.uid(); admin_ok boolean; staff_ok boolean; result jsonb;
begin
 if uid is null then raise exception 'AUTH_REQUIRED';end if;
 select coalesce(public.is_waki_admin(),false) into admin_ok;
 select exists(select 1 from public.sales_staff s join public.profiles p on p.id=s.user_id
  where s.user_id=uid and s.is_active and p.account_status='active') into staff_ok;
 if not admin_ok and not staff_ok then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
 into result from (
  select q.id,q.hotel_name,q.representative_name,q.contact_email,q.status,q.created_at,q.expires_at,
   q.claimed_hotel_id,
   coalesce(o.state,'pending') as delivery_status,o.provider
  from waki_private.quick_hotel_invitations q
  left join waki_private.communication_outbox o
   on o.event_key='quick-hotel-invite:'||q.id::text
  where admin_ok or q.created_by=uid
  order by q.created_at desc
  limit greatest(1,least(coalesce(p_limit,20),50))
 ) x;
 return result;
end $$;

-- Keep the existing sales invitations unchanged, adding a fallback for quick invitations.
create or replace function public.get_sales_hotel_invite(target_invite_token uuid)
 returns jsonb language plpgsql stable security definer set search_path='' as $$
declare payload jsonb;
begin
 select jsonb_build_object('valid',true,'source','sales','status',oc.status,
 'hotel_name',p.name,'district',p.district,'address',p.address,
 'contact_name',oc.contact_name,'contact_role',oc.contact_role,
 'contact_phone',oc.contact_phone,'contact_email',oc.contact_email,
 'invite_expires_at',oc.invite_expires_at,'claimed',false) into payload
 from public.sales_hotel_onboarding_cases oc
 join public.sales_places p on p.id=oc.place_id
 where oc.invite_token=target_invite_token and oc.status in ('started','invited')
 and oc.invite_expires_at>now() limit 1;
 if payload is not null then return payload;end if;
 select jsonb_build_object('valid',true,'source','quick','status','invited',
  'hotel_name',q.hotel_name,'contact_name',q.representative_name,
  'contact_email',q.contact_email,'invite_expires_at',q.expires_at,'claimed',false)
 into payload
 from waki_private.quick_hotel_invitations q
 where q.invite_token=target_invite_token and q.status='pending' and q.expires_at>now()
 limit 1;
 return coalesce(payload,jsonb_build_object('valid',false,'status','unavailable'));
end $$;

create or replace function public.claim_quick_hotel_invitation(
 p_token uuid,p_legal_name text,p_ruc text,p_phone text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid();
 invite waki_private.quick_hotel_invitations;
 user_email text;
 current_role text;
 legal_clean text:=nullif(trim(coalesce(p_legal_name,'')),'');
 ruc_clean text:=regexp_replace(coalesce(p_ruc,''),'[^0-9]','','g');
 phone_clean text:=nullif(trim(coalesce(p_phone,'')),'');
 brand_id uuid;
 hotel_id uuid;
 slug text;
begin
 if uid is null then raise exception 'AUTH_REQUIRED';end if;
 select lower(u.email) into user_email from auth.users u
 where u.id=uid and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false);
 if user_email is null then raise exception 'EMAIL_VERIFICATION_REQUIRED';end if;
 select p.role into current_role from public.profiles p where p.id=uid and p.account_status='active';
 if current_role not in ('user','hotel') or current_role is null then
  raise exception 'ACCOUNT_ROLE_CONFLICT';end if;
 if legal_clean is null or length(legal_clean)>160 then raise exception 'LEGAL_NAME_REQUIRED';end if;
 if length(ruc_clean)<>11 then raise exception 'VALID_RUC_REQUIRED';end if;
 if phone_clean is null or length(phone_clean)>40 then raise exception 'PHONE_REQUIRED';end if;

 select * into invite from waki_private.quick_hotel_invitations q
 where q.invite_token=p_token for update;
 if invite.id is null then raise exception 'INVITE_NOT_FOUND';end if;
 if invite.status='claimed' then
  if invite.claimed_by=uid then
   return jsonb_build_object('status','claimed','hotel_id',invite.claimed_hotel_id);
  end if;
  raise exception 'INVITE_ALREADY_CLAIMED';
 end if;
 if invite.status<>'pending' or invite.expires_at<=now() then
  raise exception 'INVITE_EXPIRED_OR_CANCELLED';end if;
 if user_email<>lower(invite.contact_email) then
  raise exception 'INVITE_EMAIL_MISMATCH';end if;
 if exists(select 1 from public.hotel_brands b where b.ruc=ruc_clean) then
  raise exception 'RUC_ALREADY_REGISTERED';end if;

 insert into public.hotel_brands(
  commercial_name,legal_name,ruc,billing_email,contact_email,
  phone,approval_status
 ) values(invite.hotel_name,legal_clean,ruc_clean,
  invite.contact_email,invite.contact_email,phone_clean,'draft')
 returning id into brand_id;

 slug:=trim(both '-' from regexp_replace(
   lower(invite.hotel_name),'[^a-z0-9]+','-','g'))
   ||'-'||substr(replace(gen_random_uuid()::text,'-',''),1,10);

 insert into public.hotels(
  brand_id,name,slug,address,district,province,department,country_code,
  phone,contact_email,approval_status,is_active
 ) values(
  brand_id,invite.hotel_name,slug,'Dirección por completar',
  'Por completar','Por completar','Por completar','PE',
  phone_clean,invite.contact_email,'draft',false)
 returning id into hotel_id;

 insert into public.hotel_staff(hotel_id,user_id,staff_role,is_active)
 values(hotel_id,uid,'admin',true);

 update public.profiles p set
  full_name=coalesce(nullif(trim(p.full_name),''),invite.representative_name),
  phone=coalesce(nullif(trim(p.phone),''),phone_clean),
  role='hotel',updated_at=now()
 where p.id=uid;

 update waki_private.quick_hotel_invitations q set
  status='claimed',claimed_by=uid,claimed_hotel_id=hotel_id,updated_at=now()
 where q.id=invite.id;
 return jsonb_build_object('status','claimed','hotel_id',hotel_id,'brand_id',brand_id);
end $$;

revoke all on function public.create_quick_hotel_invitation(text,text,text),
 public.list_quick_hotel_invitations(integer),
 public.claim_quick_hotel_invitation(uuid,text,text,text)
 from public,anon,authenticated;
grant execute on function public.create_quick_hotel_invitation(text,text,text),
 public.list_quick_hotel_invitations(integer),
 public.claim_quick_hotel_invitation(uuid,text,text,text) to authenticated;

-- Existing read endpoint is intentionally open only to holders of a valid
-- random invitation token; the contact's email must be verified at claim.
revoke all on function public.get_sales_hotel_invite(uuid) from public,anon,authenticated;
grant execute on function public.get_sales_hotel_invite(uuid) to anon,authenticated;
