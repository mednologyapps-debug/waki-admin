alter table waki_private.hotel_finance_settings add constraint allowed_commission_choices check(commission_rate in (4,8));
create or replace function waki_private.finance_action(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare h uuid:=(p_data->>'hotel_id')::uuid; s waki_private.hotel_sales; rate numeric; v_id uuid; amount numeric; token text; v_count integer; previous_rate numeric; ref text; v_day date;
begin
 if auth.uid() is null or not public.is_waki_admin() then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 if h is null or not exists(select 1 from public.hotels where id=h) then raise exception 'HOTEL_NOT_FOUND';end if;
 perform pg_advisory_xact_lock(hashtextextended(h::text,0));
 if p_action='commission' then
  rate:=(p_data->>'rate')::numeric;
  if rate is null or rate not in (4,8) then raise exception 'INVALID_RATE';end if;
  select commission_rate into previous_rate from waki_private.hotel_finance_settings where hotel_id=h;
  insert into waki_private.hotel_finance_settings(hotel_id,commission_rate,updated_by) values(h,rate,auth.uid()) on conflict(hotel_id) do update set commission_rate=excluded.commission_rate,updated_at=now(),updated_by=auth.uid();
  insert into waki_private.hotel_finance_audit(hotel_id,action,actor,details) values(h,p_action,auth.uid(),jsonb_build_object('before',previous_rate,'after',rate));
  return jsonb_build_object('ok',true);
 elsif p_action='reconcile' then
  select * into s from waki_private.hotel_sales where id=(p_data->>'sale_id')::uuid and hotel_id=h for update;
  if s.id is null or s.is_test or s.payout_id is not null or s.hold_reason is not null or s.currency<>'PEN' or s.verified_at is not null then raise exception 'SALE_NOT_RECONCILABLE';end if;
  rate:=coalesce(s.commission_rate,(p_data->>'rate')::numeric);
  ref:=trim(p_data->>'reference');
  if rate is null or rate not in (4,8) or ref is null or length(ref)<3 or length(ref)>120 then raise exception 'INVALID_RECONCILIATION';end if;
  update waki_private.hotel_sales set commission_rate=rate,verified_at=now(),verified_by=auth.uid(),receipt_reference=ref where id=s.id;
  insert into waki_private.hotel_finance_audit(hotel_id,action,actor,details) values(h,p_action,auth.uid(),jsonb_build_object('sale_id',s.id,'rate',rate,'reference',ref));
  return jsonb_build_object('ok',true);
 elsif p_action='payout' then
  ref:=trim(p_data->>'reference');v_day:=(p_data->>'paid_on')::date;
  if ref is null or length(ref)<3 or length(ref)>120 or v_day is null or v_day>(now() at time zone 'America/Lima')::date or length(coalesce(p_data->>'notes',''))>1000 then raise exception 'INVALID_PAYOUT';end if;
  if exists(select 1 from waki_private.hotel_payouts where hotel_id=h and reference=ref) then raise exception 'DUPLICATE_REFERENCE';end if;
  -- Lock the actual ledger rows, then recompute the quote. Never trust browser totals.
  perform id from waki_private.hotel_sales where hotel_id=h order by id for update;
  select count(*),sum(net),md5(coalesce(string_agg(id::text||':'||net::text,',' order by id),'')) into v_count,amount,token
   from waki_private.hotel_sales_status where hotel_id=h and finance_status='pending'
    and (nullif(p_data->>'from','') is null or paid_at>=(p_data->>'from')::date::timestamp at time zone 'America/Lima')
    and (nullif(p_data->>'to','') is null or paid_at<((p_data->>'to')::date+1)::timestamp at time zone 'America/Lima');
  if v_count=0 or amount<=0 then raise exception 'NO_PENDING_SALES';end if;
  if token is distinct from p_data->>'token' or amount is distinct from (p_data->>'amount')::numeric then raise exception 'BALANCE_CHANGED';end if;
  insert into waki_private.hotel_payouts(hotel_id,amount,reference,paid_on,notes,created_by) values(h,amount,ref,v_day,coalesce(p_data->>'notes',''),auth.uid()) returning id into v_id;
  update waki_private.hotel_sales set payout_id=v_id where id in (select id from waki_private.hotel_sales_status where hotel_id=h and finance_status='pending'
   and (nullif(p_data->>'from','') is null or paid_at>=(p_data->>'from')::date::timestamp at time zone 'America/Lima')
   and (nullif(p_data->>'to','') is null or paid_at<((p_data->>'to')::date+1)::timestamp at time zone 'America/Lima'));
  insert into waki_private.hotel_finance_audit(hotel_id,action,actor,details) values(h,p_action,auth.uid(),jsonb_build_object('payout_id',v_id,'amount',amount,'sales_count',v_count));
  return jsonb_build_object('ok',true,'payout_id',v_id,'amount',amount);
 end if;
 raise exception 'INVALID_ACTION';
end $$;
create table waki_private.admin_user_approvals (
 user_id uuid primary key references public.profiles(id), status text not null check(status in ('pending','approved','rejected')),
 created_by uuid not null,created_at timestamptz not null default now(),reviewed_by uuid,reviewed_at timestamptz
);
create table waki_private.admin_control_audit (
 id bigint generated always as identity primary key,actor uuid not null,action text not null,target_id uuid,reason text not null,
 details jsonb not null default '{}',created_at timestamptz not null default now()
);
alter table waki_private.admin_user_approvals enable row level security;
alter table waki_private.admin_control_audit enable row level security;
revoke all on waki_private.admin_user_approvals,waki_private.admin_control_audit from public,anon,authenticated;
create index admin_audit_created_idx on waki_private.admin_control_audit(created_at desc);
create index admin_approval_status_idx on waki_private.admin_user_approvals(status,created_at desc);
create index admin_reservations_hotel_date_idx on public.reservations(hotel_id,start_at desc,id);
create index admin_reservations_created_idx on public.reservations(created_at desc,id);

create function waki_private.admin_control_read(p_mode text,p_filter jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;v_hotels jsonb;v_from timestamptz:=coalesce(nullif(p_filter->>'from','')::date,((now() at time zone 'America/Lima')::date-30))::timestamp at time zone 'America/Lima';
 v_until timestamptz:=(coalesce(nullif(p_filter->>'to','')::date,(now() at time zone 'America/Lima')::date)+1)::timestamp at time zone 'America/Lima';
 v_page integer:=greatest(0,least(coalesce((p_filter->>'page')::integer,0),100000));
begin
 if auth.uid() is null or not public.is_waki_admin() then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) order by name),'[]') into v_hotels from public.hotels;
 if p_mode='users' then
  with filtered as materialized (
   select p.id,p.full_name,p.phone,p.role,p.account_status,p.created_at,p.updated_at,u.email,u.email_confirmed_at,u.last_sign_in_at,u.is_anonymous,
   case when a.status='pending' then 'pending' else p.account_status end display_status,
   coalesce((select jsonb_agg(jsonb_build_object('hotel_id',s.hotel_id,'hotel_name',h.name,'staff_role',s.staff_role,'active',s.is_active)) from public.hotel_staff s join public.hotels h on h.id=s.hotel_id where s.user_id=p.id),'[]') hotels
   from public.profiles p join auth.users u on u.id=p.id left join waki_private.admin_user_approvals a on a.user_id=p.id
   where (coalesce(p_filter->>'guests','false')='true' or not coalesce(u.is_anonymous,false))
    and (coalesce(p_filter->>'search','')='' or p.full_name ilike '%'||left(p_filter->>'search',100)||'%' or u.email ilike '%'||left(p_filter->>'search',100)||'%')
    and (coalesce(p_filter->>'role','')='' or p.role=p_filter->>'role')
    and (coalesce(p_filter->>'status','')='' or (case when a.status='pending' then 'pending' else p.account_status end)=p_filter->>'status')
  ),page as(select * from filtered order by created_at desc,id limit 25 offset v_page*25)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'),'total',(select count(*) from filtered),'hotels',v_hotels) into v_result;
 elsif p_mode='reservations' then
  with filtered as materialized (
   select r.id,r.hotel_id,h.name hotel_name,r.booking_code,r.guest_name,r.guest_email,r.guest_phone,r.status,r.payment_status,r.start_at,r.end_at,r.total_amount,r.currency,r.payment_provider,r.payment_reference,r.updated_at,r.created_at,r.documents_verified_at,r.access_verified_at,
    rt.name room_name
   from public.reservations r join public.hotels h on h.id=r.hotel_id left join public.room_types rt on rt.id=r.room_type_id
   where (coalesce(p_filter->>'hotel_id','')='' or r.hotel_id=(p_filter->>'hotel_id')::uuid)
    and (coalesce(p_filter->>'status','')='' or r.status=p_filter->>'status')
    and (coalesce(p_filter->>'payment','')='' or r.payment_status=p_filter->>'payment')
    and (coalesce(p_filter->>'search','')='' or r.booking_code ilike '%'||left(p_filter->>'search',100)||'%' or r.guest_name ilike '%'||left(p_filter->>'search',100)||'%')
    and (coalesce(p_filter->>'from','')='' or r.start_at>=nullif(p_filter->>'from','')::date::timestamp at time zone 'America/Lima')
    and (coalesce(p_filter->>'to','')='' or r.start_at<(nullif(p_filter->>'to','')::date+1)::timestamp at time zone 'America/Lima')
  ),page as(select * from filtered order by start_at desc,id limit 25 offset v_page*25)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'),'total',(select count(*) from filtered),'hotels',v_hotels) into v_result;
 elsif p_mode='overview' then
  select jsonb_build_object('hotels',(select count(*) from public.hotels),
   'pending_hotels',(select count(*) from public.hotels where approval_status='pending_review'),
   'users',(select count(*) from auth.users where not coalesce(is_anonymous,false)),
   'pending_users',(select count(*) from waki_private.admin_user_approvals where status='pending'),
   'reservations',(select count(*) from public.reservations where created_at>=date_trunc('month',now() at time zone 'America/Lima') at time zone 'America/Lima'),
   'active_reservations',(select count(*) from public.reservations where status in ('confirmed','checked_in')),
   'pending_payout',coalesce((select sum(net) from waki_private.hotel_sales_status where finance_status='pending'),0)) into v_result;
 elsif p_mode='reports' then
  if v_from>=v_until or v_until-v_from>interval '367 days' then raise exception 'INVALID_DATES';end if;
  with daily as(select (created_at at time zone 'America/Lima')::date "day",count(*) reservations,count(*) filter(where payment_status='paid') paid_count from public.reservations where created_at>=v_from and created_at<v_until group by 1 order by 1),
  by_hotel as(select h.name,count(r.id) reservations,count(r.id) filter(where r.payment_status='paid') paid_count,count(r.id) filter(where r.status='cancelled') cancelled from public.hotels h left join public.reservations r on r.hotel_id=h.id and r.created_at>=v_from and r.created_at<v_until group by h.id,h.name),
  finance as(select coalesce(sum(gross) filter(where finance_status in ('pending','paid')),0) gross,coalesce(sum(commission) filter(where finance_status in ('pending','paid')),0) commission,coalesce(sum(net) filter(where finance_status='pending'),0) pending,count(*) filter(where finance_status='test') test_count from waki_private.hotel_sales_status where paid_at>=v_from and paid_at<v_until)
  select jsonb_build_object('daily',coalesce((select jsonb_agg(to_jsonb(daily)) from daily),'[]'),'hotels',coalesce((select jsonb_agg(to_jsonb(by_hotel)) from by_hotel),'[]'),'finance',(select to_jsonb(finance) from finance),'from',v_from,'to',v_until) into v_result;
 elsif p_mode='settings' then
  with audits as(select a.id::text id,a.actor,a.action,a.reason,a.created_at,a.target_id from waki_private.admin_control_audit a union all select 'f-'||f.id::text,f.actor,f.action,'Hotel: '||coalesce(h.name,f.hotel_id::text),f.created_at,f.hotel_id from waki_private.hotel_finance_audit f left join public.hotels h on h.id=f.hotel_id),page as(select a.*,p.full_name actor_name from audits a left join public.profiles p on p.id=a.actor order by a.created_at desc,a.id desc limit 25 offset v_page*25),
  commissions as(select h.id,h.name,s.commission_rate from public.hotels h left join waki_private.hotel_finance_settings s on s.hotel_id=h.id order by h.name)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'),'total',(select count(*) from audits),'commissions',coalesce((select jsonb_agg(to_jsonb(commissions)) from commissions),'[]')) into v_result;
 else raise exception 'INVALID_MODE';end if;
 return v_result;
end $$;

-- This function is service-only. The Edge Function validates the session and supplies its actor.
create function waki_private.admin_control_action(p_actor uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare caller public.profiles;target public.profiles;r public.reservations;reason text:=trim(coalesce(p_data->>'reason',''));v_role text;v_status text;v_target uuid:=(p_data->>'id')::uuid;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 select * into caller from public.profiles where id=p_actor;
 if caller.id is null or caller.account_status<>'active' or caller.role not in ('admin','super_admin') then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 if length(reason)<5 or length(reason)>500 then raise exception 'REASON_REQUIRED';end if;
 if p_action in ('create_user','update_user','approve_user','reject_user','send_activation') then
  perform pg_advisory_xact_lock(hashtextextended('waki_admin_user_security',0));
  select * into target from public.profiles where id=v_target for update;
  if target.id is null then raise exception 'USER_NOT_FOUND';end if;
  if v_target=p_actor then raise exception 'SELF_CHANGE_FORBIDDEN';end if;
  if (target.role in ('admin','super_admin') or p_data->>'role' in ('admin','super_admin')) and caller.role<>'super_admin' then raise exception 'SUPER_ADMIN_REQUIRED';end if;
  if p_action<>'create_user' and (p_data->>'updated_at')::timestamptz is distinct from target.updated_at then raise exception 'RECORD_CHANGED';end if;
  v_role:=coalesce(p_data->>'role',target.role);v_status:=coalesce(p_data->>'account_status',target.account_status);
  if p_action='create_user' then
   if exists(select 1 from waki_private.admin_user_approvals where user_id=v_target) then raise exception 'USER_ALREADY_MANAGED';end if;
   v_status:='suspended';insert into waki_private.admin_user_approvals(user_id,status,created_by) values(v_target,'pending',p_actor);
  elsif p_action='approve_user' then
   if not exists(select 1 from waki_private.admin_user_approvals where user_id=v_target and status='pending') then raise exception 'NOT_PENDING';end if;
   v_status:='active';update waki_private.admin_user_approvals set status='approved',reviewed_by=p_actor,reviewed_at=now() where user_id=v_target;
  elsif p_action='reject_user' then
   if not exists(select 1 from waki_private.admin_user_approvals where user_id=v_target and status='pending') then raise exception 'NOT_PENDING';end if;
   v_status:='blocked';update waki_private.admin_user_approvals set status='rejected',reviewed_by=p_actor,reviewed_at=now() where user_id=v_target;
  elsif p_action='update_user' and exists(select 1 from waki_private.admin_user_approvals where user_id=v_target and status='pending') and v_status='active' then raise exception 'APPROVAL_REQUIRED';end if;
  if v_role not in ('user','hotel','admin','super_admin') or v_status not in ('active','suspended','blocked') then raise exception 'INVALID_SELECTION';end if;
  if target.role='super_admin' and target.account_status='active' and (v_role<>'super_admin' or v_status<>'active') and not exists(select 1 from public.profiles where id<>target.id and role='super_admin' and account_status='active') then raise exception 'LAST_SUPER_ADMIN';end if;
  if v_role='hotel' and p_action='create_user' and nullif(p_data->>'hotel_id','') is null then raise exception 'HOTEL_REQUIRED';end if;
  update public.profiles set full_name=coalesce(nullif(trim(p_data->>'full_name'),''),full_name),role=v_role,account_status=v_status,updated_at=now() where id=v_target;
  if v_role<>'hotel' or v_status<>'active' then update public.hotel_staff set is_active=false,updated_at=now() where user_id=v_target;end if;
  if v_role='hotel' and nullif(p_data->>'hotel_id','') is not null then
   if p_data->>'staff_role' not in ('admin','reception','scanner') then raise exception 'INVALID_SELECTION';end if;
   if not exists(select 1 from public.hotels where id=(p_data->>'hotel_id')::uuid) then raise exception 'HOTEL_NOT_FOUND';end if;
   if exists(select 1 from public.hotel_staff where user_id=v_target and hotel_id<>(p_data->>'hotel_id')::uuid and is_active) then raise exception 'HOTEL_ASSIGNMENT_CONFLICT';end if;
   insert into public.hotel_staff(hotel_id,user_id,staff_role,is_active) values((p_data->>'hotel_id')::uuid,v_target,p_data->>'staff_role',v_status='active') on conflict(hotel_id,user_id) do update set staff_role=excluded.staff_role,is_active=excluded.is_active,updated_at=now();
  end if;
  insert into waki_private.admin_control_audit(actor,action,target_id,reason,details) values(p_actor,p_action,v_target,reason,jsonb_build_object('old_role',target.role,'old_status',target.account_status,'new_role',v_role,'new_status',v_status));
 elsif p_action='reservation' then
  select * into r from public.reservations where id=v_target for update;
  if r.id is null then raise exception 'RESERVATION_NOT_FOUND';end if;
  if (p_data->>'updated_at')::timestamptz is distinct from r.updated_at then raise exception 'RECORD_CHANGED';end if;
  v_status:=p_data->>'status';
  if v_status='checked_in' then
   if r.status<>'confirmed' or r.payment_status<>'paid' or r.access_verified_at is null or r.documents_verified_at is null or now()>=r.end_at then raise exception 'CHECKIN_NOT_READY';end if;
  elsif v_status='completed' then if r.status<>'checked_in' then raise exception 'INVALID_TRANSITION';end if;
  elsif v_status='no_show' then if r.status<>'confirmed' or now()<r.end_at then raise exception 'INVALID_TRANSITION';end if;
  elsif v_status='cancelled' then if r.status not in ('confirmed','pending_payment') then raise exception 'INVALID_TRANSITION';end if;
  else raise exception 'INVALID_TRANSITION';end if;
  update public.reservations set status=v_status,checked_in_at=case when v_status='checked_in' then now() else checked_in_at end,completed_at=case when v_status='completed' then now() else completed_at end,cancelled_at=case when v_status='cancelled' then now() else cancelled_at end,updated_at=now() where id=r.id;
  insert into waki_private.admin_control_audit(actor,action,target_id,reason,details) values(p_actor,p_action,r.id,reason,jsonb_build_object('old_status',r.status,'new_status',v_status,'hotel_id',r.hotel_id));
 else raise exception 'INVALID_ACTION';end if;
 return jsonb_build_object('ok',true);
end $$;

create function public.admin_control_read(p_mode text,p_filter jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select waki_private.admin_control_read(p_mode,p_filter)$$;
create function public.admin_control_action(p_actor uuid,p_action text,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select waki_private.admin_control_action(p_actor,p_action,p_data)$$;
revoke all on function public.admin_control_read(text,jsonb),waki_private.admin_control_read(text,jsonb),public.admin_control_action(uuid,text,jsonb),waki_private.admin_control_action(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_control_read(text,jsonb),waki_private.admin_control_read(text,jsonb) to authenticated;
grant usage on schema waki_private to service_role;
grant execute on function public.admin_control_action(uuid,text,jsonb),waki_private.admin_control_action(uuid,text,jsonb) to service_role;
