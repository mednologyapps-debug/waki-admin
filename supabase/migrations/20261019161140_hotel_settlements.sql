-- Private financial ledger; no client may write balances or transfer money.
create schema if not exists waki_private;
create table waki_private.hotel_finance_settings (
 hotel_id uuid primary key references public.hotels(id),
 commission_rate numeric(5,2) not null check (commission_rate between 0 and 100),
 updated_at timestamptz not null default now(), updated_by uuid not null
);
create table waki_private.hotel_payouts (
 id uuid primary key default gen_random_uuid(), hotel_id uuid not null references public.hotels(id),
 amount numeric(14,2) not null check(amount>0), currency text not null default 'PEN' check(currency='PEN'),
 reference text not null check(length(reference) between 3 and 120), paid_on date not null,
 notes text not null default '', created_by uuid not null, created_at timestamptz not null default now(),
 unique(hotel_id,reference)
);
create table waki_private.hotel_sales (
 id uuid primary key default gen_random_uuid(), source_kind text not null check(source_kind in ('reservation','extension')),
 source_id uuid not null, reservation_id uuid not null references public.reservations(id),
 hotel_id uuid not null references public.hotels(id), booking_code text not null,
 gross numeric(14,2) not null check(gross>=0), currency text not null,
 commission_rate numeric(5,2) check(commission_rate between 0 and 100),
 commission numeric(14,2) generated always as (round(gross*commission_rate/100,2)) stored,
 net numeric(14,2) generated always as (gross-round(gross*commission_rate/100,2)) stored,
 paid_at timestamptz not null, provider text, is_test boolean not null default false,
 verified_at timestamptz, verified_by uuid, receipt_reference text,
 hold_reason text, payout_id uuid references waki_private.hotel_payouts(id),
 unique(source_kind,source_id)
);
create table waki_private.hotel_finance_audit (
 id bigint generated always as identity primary key, hotel_id uuid not null references public.hotels(id),
 action text not null, actor uuid not null, details jsonb not null, created_at timestamptz not null default now()
);
alter table waki_private.hotel_finance_settings enable row level security;
alter table waki_private.hotel_payouts enable row level security;
alter table waki_private.hotel_sales enable row level security;
alter table waki_private.hotel_finance_audit enable row level security;
revoke all on waki_private.hotel_finance_settings,waki_private.hotel_payouts,waki_private.hotel_sales,waki_private.hotel_finance_audit from public,anon,authenticated;
create index hotel_sales_period_idx on waki_private.hotel_sales(paid_at,hotel_id);
create index hotel_sales_pending_idx on waki_private.hotel_sales(hotel_id,paid_at) where payout_id is null;
create index hotel_sales_reservation_idx on waki_private.hotel_sales(reservation_id);
create index hotel_sales_payout_idx on waki_private.hotel_sales(payout_id) where payout_id is not null;
create index hotel_payout_history_idx on waki_private.hotel_payouts(hotel_id,created_at desc);
create index hotel_audit_history_idx on waki_private.hotel_finance_audit(hotel_id,created_at desc);

create function waki_private.capture_hotel_sale() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.reservations; v_gross numeric; v_rate numeric; v_kind text; v_status text;
begin
 if tg_table_name='reservations' then
  r:=new; v_kind:='reservation'; v_status:=new.payment_status;
  -- total_amount includes extensions after payment. Never recalculate an existing base sale.
  select greatest(0,new.total_amount-coalesce(sum(amount) filter(where status='paid'),0)) into v_gross
    from public.reservation_extensions where reservation_id=new.id;
 else
  select * into r from public.reservations where id=new.reservation_id;
  v_kind:='extension';v_status:=new.status;v_gross:=new.amount;
 end if;
 if v_status='paid' then
  select commission_rate into v_rate from waki_private.hotel_finance_settings where hotel_id=r.hotel_id;
  insert into waki_private.hotel_sales(source_kind,source_id,reservation_id,hotel_id,booking_code,gross,currency,commission_rate,paid_at,provider,is_test,hold_reason)
  values(v_kind,new.id,r.id,r.hotel_id,r.booking_code,v_gross,new.currency,v_rate,coalesce(new.paid_at,new.created_at),new.payment_provider,
    coalesce(new.payment_provider ~* '(test|mock|qa|sandbox)',false),
    case when r.status in ('cancelled','rejected','refunded') then 'Reserva cancelada, rechazada o reembolsada' end)
  on conflict(source_kind,source_id) do nothing;
 else
  update waki_private.hotel_sales set hold_reason='El pago dejó de estar pagado: '||coalesce(v_status,'sin estado')
    where source_kind=v_kind and source_id=new.id;
 end if;
 if tg_table_name='reservations' then
 if new.status in ('cancelled','rejected','refunded') or new.payment_status <> 'paid' then
  update waki_private.hotel_sales set hold_reason='Revisar estado de la reserva: '||new.status||' / '||new.payment_status where reservation_id=r.id;
 end if;
 end if;
 return new;
end $$;
revoke all on function waki_private.capture_hotel_sale() from public,anon,authenticated;
create trigger finance_reservation_capture after insert or update of payment_status,status,payment_provider on public.reservations for each row execute function waki_private.capture_hotel_sale();
create trigger finance_extension_capture after insert or update of status,payment_provider on public.reservation_extensions for each row execute function waki_private.capture_hotel_sale();

-- Legacy rows require explicit reconciliation: do not invent historical commissions.
insert into waki_private.hotel_sales(source_kind,source_id,reservation_id,hotel_id,booking_code,gross,currency,paid_at,provider,is_test,hold_reason)
select 'reservation',r.id,r.id,r.hotel_id,r.booking_code,greatest(0,r.total_amount-coalesce(e.amount,0)),r.currency,coalesce(r.paid_at,r.created_at),r.payment_provider,
 coalesce(r.payment_provider ~* '(test|mock|qa|sandbox)',false),case when r.status in ('cancelled','rejected','refunded') then 'Revisar estado de la reserva: '||r.status end
from public.reservations r left join (select reservation_id,sum(amount) amount from public.reservation_extensions where status='paid' group by reservation_id) e on e.reservation_id=r.id where r.payment_status='paid';
insert into waki_private.hotel_sales(source_kind,source_id,reservation_id,hotel_id,booking_code,gross,currency,paid_at,provider,is_test,hold_reason)
select 'extension',e.id,r.id,r.hotel_id,r.booking_code,e.amount,e.currency,coalesce(e.paid_at,e.created_at),e.payment_provider,
 coalesce(e.payment_provider ~* '(test|mock|qa|sandbox)',false),case when r.status in ('cancelled','rejected','refunded') or r.payment_status<>'paid' then 'Revisar estado de la reserva: '||r.status end
from public.reservation_extensions e join public.reservations r on r.id=e.reservation_id where e.status='paid';

create view waki_private.hotel_sales_status with (security_invoker=true) as
select s.*,case when is_test then 'test' when hold_reason is not null then 'held' when currency<>'PEN' or verified_at is null or commission_rate is null then 'review' when payout_id is not null then 'paid' else 'pending' end finance_status
from waki_private.hotel_sales s;
revoke all on waki_private.hotel_sales_status from public,anon,authenticated;

create function waki_private.finance_overview(p_from date,p_to date,p_search text,p_status text,p_page integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_waki_admin() then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 if p_from is not null and p_to is not null and p_from>p_to then raise exception 'INVALID_DATES';end if;
 with sales as materialized (
  select * from waki_private.hotel_sales_status where (p_from is null or paid_at>=p_from::timestamp at time zone 'America/Lima') and (p_to is null or paid_at<(p_to+1)::timestamp at time zone 'America/Lima')
 ), grouped as (
  select h.id hotel_id,h.name,h.district,c.commission_rate,
   count(s.id) filter(where finance_status in ('pending','paid')) sales_count,
   coalesce(sum(gross) filter(where finance_status in ('pending','paid')),0) gross,
   coalesce(sum(commission) filter(where finance_status in ('pending','paid')),0) commission,
   coalesce(sum(net) filter(where finance_status='pending'),0) pending,
   coalesce(sum(net) filter(where payout_id is not null and not is_test),0) deposited,
   count(s.id) filter(where finance_status='review') review_count,
   count(s.id) filter(where finance_status='test') test_count,
   count(s.id) filter(where finance_status='held') held_count,
   min(s.commission_rate) filter(where finance_status in ('pending','paid')) min_rate,
   max(s.commission_rate) filter(where finance_status in ('pending','paid')) max_rate
  from public.hotels h left join waki_private.hotel_finance_settings c on c.hotel_id=h.id left join sales s on s.hotel_id=h.id
  where coalesce(p_search,'')='' or h.name ilike '%'||left(p_search,100)||'%' or h.district ilike '%'||left(p_search,100)||'%'
  group by h.id,h.name,h.district,c.commission_rate
 ), filtered as materialized (
  select * from grouped where coalesce(p_status,'all')='all' or (p_status='pending' and pending>0) or (p_status='review' and review_count+held_count>0) or (p_status='test' and test_count>0) or (p_status='paid' and deposited>0)
 ), page as (select * from filtered order by pending desc,name,hotel_id limit 25 offset greatest(0,coalesce(p_page,0))*25)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),
  'total',(select count(*) from filtered),'summary',(select jsonb_build_object('gross',coalesce(sum(gross),0),'commission',coalesce(sum(commission),0),'pending',coalesce(sum(pending),0),'deposited',coalesce(sum(deposited),0),'review_count',coalesce(sum(review_count+held_count),0),'test_count',coalesce(sum(test_count),0)) from filtered)) into result;
 return result;
end $$;

create function waki_private.finance_detail(p_hotel uuid,p_from date,p_to date,p_page integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_waki_admin() then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 return (with sales as materialized (
  select * from waki_private.hotel_sales_status where hotel_id=p_hotel and (p_from is null or paid_at>=p_from::timestamp at time zone 'America/Lima') and (p_to is null or paid_at<(p_to+1)::timestamp at time zone 'America/Lima')
 ), page as(select * from sales order by paid_at desc,id limit 50 offset greatest(0,coalesce(p_page,0))*50),
 payouts as(select id,amount,reference,paid_on,notes,created_at from waki_private.hotel_payouts where hotel_id=p_hotel order by created_at desc limit 20)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),'total',(select count(*) from sales),
 'quote',(select jsonb_build_object('count',count(*),'amount',coalesce(sum(net),0),'token',md5(coalesce(string_agg(id::text||':'||net::text,',' order by id),''))) from sales where finance_status='pending'),
 'payouts',coalesce((select jsonb_agg(to_jsonb(payouts)) from payouts),'[]'::jsonb)));
end $$;

create function waki_private.finance_action(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare h uuid:=(p_data->>'hotel_id')::uuid; s waki_private.hotel_sales; rate numeric; v_id uuid; amount numeric; token text; v_count integer; previous_rate numeric; ref text; v_day date;
begin
 if auth.uid() is null or not public.is_waki_admin() then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 if h is null or not exists(select 1 from public.hotels where id=h) then raise exception 'HOTEL_NOT_FOUND';end if;
 perform pg_advisory_xact_lock(hashtextextended(h::text,0));
 if p_action='commission' then
  rate:=(p_data->>'rate')::numeric;
  if rate is null or rate<0 or rate>100 or rate<>round(rate,2) then raise exception 'INVALID_RATE';end if;
  select commission_rate into previous_rate from waki_private.hotel_finance_settings where hotel_id=h;
  insert into waki_private.hotel_finance_settings(hotel_id,commission_rate,updated_by) values(h,rate,auth.uid()) on conflict(hotel_id) do update set commission_rate=excluded.commission_rate,updated_at=now(),updated_by=auth.uid();
  insert into waki_private.hotel_finance_audit(hotel_id,action,actor,details) values(h,p_action,auth.uid(),jsonb_build_object('before',previous_rate,'after',rate));
  return jsonb_build_object('ok',true);
 elsif p_action='reconcile' then
  select * into s from waki_private.hotel_sales where id=(p_data->>'sale_id')::uuid and hotel_id=h for update;
  if s.id is null or s.is_test or s.payout_id is not null or s.hold_reason is not null or s.currency<>'PEN' or s.verified_at is not null then raise exception 'SALE_NOT_RECONCILABLE';end if;
  rate:=coalesce(s.commission_rate,(p_data->>'rate')::numeric);
  ref:=trim(p_data->>'reference');
  if rate is null or rate<0 or rate>100 or rate<>round(rate,2) or ref is null or length(ref)<3 or length(ref)>120 then raise exception 'INVALID_RECONCILIATION';end if;
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
-- Only narrow invoker wrappers are exposed by PostgREST. Private routines enforce current DB roles.
create function public.admin_finance_overview(p_from date default null,p_to date default null,p_search text default '',p_status text default 'all',p_page integer default 0) returns jsonb language sql security invoker set search_path='' as $$select waki_private.finance_overview(p_from,p_to,p_search,p_status,p_page)$$;
create function public.admin_finance_detail(p_hotel uuid,p_from date default null,p_to date default null,p_page integer default 0) returns jsonb language sql security invoker set search_path='' as $$select waki_private.finance_detail(p_hotel,p_from,p_to,p_page)$$;
create function public.admin_finance_action(p_action text,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select waki_private.finance_action(p_action,p_data)$$;
revoke all on function waki_private.finance_overview(date,date,text,text,integer),waki_private.finance_detail(uuid,date,date,integer),waki_private.finance_action(text,jsonb),public.admin_finance_overview(date,date,text,text,integer),public.admin_finance_detail(uuid,date,date,integer),public.admin_finance_action(text,jsonb) from public,anon,authenticated;
grant usage on schema waki_private to authenticated;
grant execute on function waki_private.finance_overview(date,date,text,text,integer),waki_private.finance_detail(uuid,date,date,integer),waki_private.finance_action(text,jsonb),public.admin_finance_overview(date,date,text,text,integer),public.admin_finance_detail(uuid,date,date,integer),public.admin_finance_action(text,jsonb) to authenticated;
