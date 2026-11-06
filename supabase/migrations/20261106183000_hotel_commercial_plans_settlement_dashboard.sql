-- WAKI: plan Socio 8% + S/99/mes, plan Flexible 12% sin cuota.
-- Los cargos de suscripción son cuentas por cobrar registradas manualmente.
-- NO emite comprobantes tributarios, NO cobra tarjetas y NO transfiere dinero.

create table if not exists waki_private.hotel_commercial_plans (
  hotel_id uuid primary key references public.hotels(id),
  assignment_id uuid not null default gen_random_uuid(),
  code text not null check (code in ('socio','flexible')),
  commission_rate numeric(5,2) not null check (commission_rate in (8,12)),
  monthly_fee numeric(10,2) not null check (monthly_fee in (0,99)),
  activated_on date,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint hotel_plan_price_match check (
    (code='socio' and commission_rate=8 and monthly_fee=99) or
    (code='flexible' and commission_rate=12 and monthly_fee=0))
);
create table if not exists waki_private.hotel_plan_events (
  id bigint generated always as identity primary key,
  hotel_id uuid not null references public.hotels(id),
  old_plan text, new_plan text not null,
  old_rate numeric, new_rate numeric not null,
  old_fee numeric, new_fee numeric not null,
  reason text, actor uuid,
  created_at timestamptz not null default now()
);
create index if not exists hotel_plan_events_idx on waki_private.hotel_plan_events(hotel_id,created_at desc);
create table if not exists waki_private.hotel_subscription_charges (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id),
  assignment_id uuid not null,
  period_start date not null,
  period_end date not null,
  due_on date not null,
  amount numeric(10,2) not null check (amount>0),
  status text not null default 'pending' check(status in ('pending','paid','waived')),
  paid_on date,
  payment_reference text,
  waiver_reason text,
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint charge_period_valid check(period_start<=period_end),
  unique(assignment_id,period_start)
);
create index if not exists hotel_subscription_charges_by_hotel
 on waki_private.hotel_subscription_charges(hotel_id,status,due_on);
create unique index if not exists hotel_subscription_charge_ref_unique
 on waki_private.hotel_subscription_charges(hotel_id,payment_reference)
 where payment_reference is not null;
alter table waki_private.hotel_commercial_plans enable row level security;
alter table waki_private.hotel_plan_events enable row level security;
alter table waki_private.hotel_subscription_charges enable row level security;
revoke all on waki_private.hotel_commercial_plans,waki_private.hotel_plan_events,waki_private.hotel_subscription_charges from public,anon,authenticated;
alter table waki_private.hotel_finance_settings drop constraint if exists allowed_commission_choices;
alter table waki_private.hotel_finance_settings
 add constraint allowed_commission_choices check (commission_rate in (4,8,12));

create or replace function waki_private.plan_cycle_date(p_start date,p_offset integer)
returns date language sql immutable set search_path='' as $$
with m as (select (date_trunc('month',p_start::timestamp)+make_interval(months=>p_offset))::date first_day)
select (first_day + least(extract(day from p_start)::int-1,
  extract(day from first_day + interval '1 month - 1 day')::int-1))::date
from m;
$$;

create or replace function waki_private.generate_subscription_charges()
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 insert into waki_private.hotel_subscription_charges(hotel_id,assignment_id,period_start,period_end,due_on,amount)
 select p.hotel_id,p.assignment_id,
  waki_private.plan_cycle_date(p.activated_on,g.n),
  waki_private.plan_cycle_date(p.activated_on,g.n+1)-1,
  waki_private.plan_cycle_date(p.activated_on,g.n),p.monthly_fee
 from waki_private.hotel_commercial_plans p
 join public.hotels h on h.id=p.hotel_id and h.approval_status='approved' and h.is_active
 cross join lateral generate_series(0,120) g(n)
 where p.code='socio' and p.activated_on is not null
 and waki_private.plan_cycle_date(p.activated_on,g.n)<=(now() at time zone 'America/Lima')::date
 on conflict(assignment_id,period_start) do nothing;
 get diagnostics n=row_count;
 return n;
end $$;

create or replace function waki_private.assign_commercial_plan(p_hotel uuid,p_code text,p_reason text default '')
returns jsonb language plpgsql security definer set search_path='' as $$
declare h public.hotels; prev waki_private.hotel_commercial_plans; rate numeric;fee numeric;v_start date;
begin
 if auth.uid() is null or not coalesce(public.is_waki_admin(),false) then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 select * into h from public.hotels where id=p_hotel for update;
 if h.id is null then raise exception 'HOTEL_NOT_FOUND';end if;
 if p_code not in ('socio','flexible') or p_code is null then raise exception 'INVALID_PLAN';end if;
 select * into prev from waki_private.hotel_commercial_plans where hotel_id=p_hotel for update;
 if prev.hotel_id is not null and prev.code=p_code then return jsonb_build_object('ok',true,'unchanged',true);end if;
 if prev.hotel_id is not null and length(trim(coalesce(p_reason,'')))<5 then raise exception 'CHANGE_REASON_REQUIRED';end if;
 rate:=case when p_code='socio' then 8 else 12 end;
 fee:=case when p_code='socio' then 99 else 0 end;
 v_start:=case when h.approval_status='approved' and h.is_active
   then (now() at time zone 'America/Lima')::date else null end;
 insert into waki_private.hotel_commercial_plans(hotel_id,assignment_id,code,commission_rate,monthly_fee,activated_on,updated_by)
 values(p_hotel,gen_random_uuid(),p_code,rate,fee,v_start,auth.uid())
 on conflict(hotel_id) do update set assignment_id=excluded.assignment_id,code=excluded.code,
 commission_rate=excluded.commission_rate,monthly_fee=excluded.monthly_fee,activated_on=excluded.activated_on,
 updated_by=auth.uid(),updated_at=now();
 insert into waki_private.hotel_plan_events(hotel_id,old_plan,new_plan,old_rate,new_rate,old_fee,new_fee,reason,actor)
 values(p_hotel,prev.code,p_code,prev.commission_rate,rate,prev.monthly_fee,fee,trim(coalesce(p_reason,'')),auth.uid());
 insert into waki_private.hotel_finance_settings(hotel_id,commission_rate,updated_by)
 values(p_hotel,rate,auth.uid())
 on conflict(hotel_id) do update set commission_rate=excluded.commission_rate,updated_by=auth.uid(),updated_at=now();
 insert into waki_private.hotel_finance_audit(hotel_id,action,actor,details)
 values(p_hotel,'plan_changed',auth.uid(),jsonb_build_object('old',prev.code,'new',p_code,'rate',rate,'reason',p_reason));
 if v_start is not null and p_code='socio' then perform waki_private.generate_subscription_charges();end if;
 return jsonb_build_object('ok',true,'code',p_code,'commission_rate',rate,'monthly_fee',fee);
end $$;

create or replace function public.admin_hotel_commercial_plan(
 p_hotel uuid,p_action text default 'read',p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c waki_private.hotel_subscription_charges; ref text;day date;
begin
 if auth.uid() is null or not coalesce(public.is_waki_admin(),false) then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 if p_hotel is null or not exists(select 1 from public.hotels where id=p_hotel) then raise exception 'HOTEL_NOT_FOUND';end if;
 if p_action='assign' then
   perform waki_private.assign_commercial_plan(p_hotel,p_data->>'code',p_data->>'reason');
 elsif p_action in ('paid','waived') then
   select * into c from waki_private.hotel_subscription_charges
    where id=(p_data->>'charge_id')::uuid and hotel_id=p_hotel for update;
   if c.id is null or c.status<>'pending' then raise exception 'CHARGE_NOT_PENDING';end if;
   if p_action='paid' then
    ref:=trim(coalesce(p_data->>'reference',''));
    day:=(p_data->>'paid_on')::date;
    if length(ref)<3 or length(ref)>120 or day is null or day>(now() at time zone 'America/Lima')::date
     then raise exception 'PAYMENT_REFERENCE_REQUIRED';end if;
    update waki_private.hotel_subscription_charges
      set status='paid',paid_on=day,payment_reference=ref,verified_by=auth.uid(),verified_at=now() where id=c.id;
   else
    if length(trim(coalesce(p_data->>'reason','')))<8 then raise exception 'WAIVER_REASON_REQUIRED';end if;
    update waki_private.hotel_subscription_charges
      set status='waived',waiver_reason=trim(p_data->>'reason'),verified_by=auth.uid(),verified_at=now() where id=c.id;
   end if;
   insert into waki_private.hotel_finance_audit(hotel_id,action,actor,details)
    values(p_hotel,'subscription_'||p_action,auth.uid(),
    jsonb_build_object('charge',c.id,'reference',ref,'reason',p_data->>'reason'));
 elsif p_action<>'read' then
   raise exception 'INVALID_ACTION';
 end if;
 return jsonb_build_object(
  'plan',(select to_jsonb(p) from waki_private.hotel_commercial_plans p where p.hotel_id=p_hotel),
  'legacy_rate',(select commission_rate from waki_private.hotel_finance_settings where hotel_id=p_hotel),
  'charges',coalesce((select jsonb_agg(to_jsonb(c) order by c.period_start desc)
    from (select id,period_start,period_end,due_on,amount,status,paid_on,payment_reference,waiver_reason
     from waki_private.hotel_subscription_charges where hotel_id=p_hotel
     order by period_start desc limit 36)c),'[]'::jsonb),
  'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc)
    from (select old_plan,new_plan,old_rate,new_rate,old_fee,new_fee,reason,created_at
    from waki_private.hotel_plan_events where hotel_id=p_hotel order by created_at desc limit 15)e),'[]'::jsonb));
end $$;

create or replace function public.admin_generate_subscription_charges()
returns jsonb language plpgsql security definer set search_path='' as $$
declare created integer;
begin
 if auth.uid() is null or not coalesce(public.is_waki_admin(),false) then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 created:=waki_private.generate_subscription_charges();
 return jsonb_build_object('ok',true,'created',created);
end $$;

create or replace function public.admin_settlement_cutoff()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare local_today date:=(now() at time zone 'America/Lima')::date;cut_date date;until_day date;result jsonb;
begin
 if auth.uid() is null or not coalesce(public.is_waki_admin(),false) then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 cut_date:=greatest(local_today-extract(dow from local_today)::integer,
   local_today-((extract(dow from local_today)::integer+4)%7));
 until_day:=cut_date-1;
 with records as (
  select h.id hotel_id,h.name,h.district,h.approval_status,
   p.code plan_code,p.commission_rate,p.monthly_fee,p.activated_on,
   coalesce(s.gross,0) gross,coalesce(s.commission,0) commission,
   coalesce(s.hotel_net,0) hotel_net,coalesce(s.reservations,0) reservations,
   coalesce(s.issues,0) issues,coalesce(c.subscription_due,0) subscription_due,
   coalesce(c.charge_count,0) charge_count,
   coalesce(d.bank_verified_at is not null and d.contract_verified_at is not null,false) bank_ready,
   coalesce(p.code='socio' and p.activated_on is not null
    and coalesce((select max(q.period_end) from waki_private.hotel_subscription_charges q
      where q.assignment_id=p.assignment_id),p.activated_on-1)<local_today,false) needs_invoice
  from public.hotels h
  left join waki_private.hotel_commercial_plans p on p.hotel_id=h.id
  left join waki_private.hotel_affiliation_dossiers d on d.hotel_id=h.id
  left join lateral (
   select sum(gross) filter(where finance_status='pending') gross,
    sum(commission) filter(where finance_status='pending') commission,
    sum(net) filter(where finance_status='pending') hotel_net,
    count(*) filter(where finance_status='pending') reservations,
    count(*) filter(where finance_status in ('review','held')) issues
   from waki_private.hotel_sales_status s where s.hotel_id=h.id
     and s.paid_at<(until_day+1)::timestamp at time zone 'America/Lima'
  )s on true
  left join lateral (
   select sum(amount) subscription_due,count(*) charge_count
   from waki_private.hotel_subscription_charges c where c.hotel_id=h.id
    and c.status='pending' and c.due_on<=local_today
  )c on true
 )
 select jsonb_build_object('today',local_today,'cutoff_date',cut_date,
  'through_date',until_day,'is_cutoff_today',extract(dow from local_today)::integer in (0,3),
  'rows',coalesce(jsonb_agg(to_jsonb(r) order by r.hotel_net desc,r.name),'[]'::jsonb),
  'summary',jsonb_build_object(
   'gross',coalesce(sum(r.gross),0),'commission',coalesce(sum(r.commission),0),
   'hotel_net',coalesce(sum(r.hotel_net),0),'reservations',coalesce(sum(r.reservations),0),
   'subscription_due',coalesce(sum(r.subscription_due),0),'issues',coalesce(sum(r.issues),0),
   'hotels_due',count(*) filter(where r.hotel_net>0),
   'hotels_unbilled',count(*) filter(where r.needs_invoice),
   'hotels_without_plan',count(*) filter(where r.plan_code is null)))
 into result from records r;
 return result;
end $$;

create or replace function waki_private.approve_hotel_affiliation(p_hotel uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare h public.hotels;v_rate numeric;v_code text;
begin
 if auth.uid() is null or not coalesce(public.is_waki_admin(),false) then raise exception 'NOT_AUTHORIZED';end if;
 select * into h from public.hotels where id=p_hotel for update;
 if h.id is null or h.approval_status not in ('draft','pending_review','rejected')
   then raise exception 'INVALID_REVIEW_STATUS';end if;
 v_code:=p_data->>'plan_code';
 if v_code is null or v_code not in ('socio','flexible') then raise exception 'PLAN_REQUIRED';end if;
 perform waki_private.hotel_affiliation(p_hotel,'review',p_data);
 perform waki_private.assign_commercial_plan(p_hotel,v_code,p_data->>'plan_reason');
 select commission_rate into v_rate from waki_private.hotel_finance_settings where hotel_id=p_hotel;
 update public.hotels set approval_status='approved',is_active=true,approved_by=auth.uid(),
  approved_at=now(),reviewed_at=now(),rejection_reason=null where id=p_hotel;
 update waki_private.hotel_commercial_plans set activated_on=(now() at time zone 'America/Lima')::date
  where hotel_id=p_hotel and activated_on is null;
 perform waki_private.generate_subscription_charges();
 insert into public.hotel_review_events(hotel_id,action,comment,created_by)
  values(p_hotel,'approved','Aprobación con plan comercial y expediente verificado.',auth.uid());
 return jsonb_build_object('ok',true,'plan',v_code,'commission_rate',v_rate);
end $$;

create or replace function waki_private.require_approval_commission()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.approval_status='approved' and old.approval_status is distinct from 'approved'
 and not exists(select 1 from waki_private.hotel_finance_settings
  where hotel_id=new.id and commission_rate in (4,8,12))
 then raise exception 'COMMISSION_REQUIRED';end if;
 return new;
end $$;

-- Existing transactions retain their original commission_rate. Updated finance_action below
-- accepts 12% for new operations and forbids direct commission edits for plan-managed hotels.
