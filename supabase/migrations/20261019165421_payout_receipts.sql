create table waki_private.payout_notifications (
 payout_id uuid primary key references waki_private.hotel_payouts(id),recipient text,payload jsonb not null,
 state text not null default 'pending' check(state in ('pending','sending','sent','failed','unconfigured','unknown')),
 attempts integer not null default 0,lease uuid,attempted_at timestamptz,sent_at timestamptz,error_code text,message_id text
);
alter table waki_private.payout_notifications enable row level security;
revoke all on waki_private.payout_notifications from public,anon,authenticated;
create or replace function waki_private.finance_overview(p_from date,p_to date,p_search text,p_status text,p_page integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_waki_admin() then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 if p_from is not null and p_to is not null and p_from>p_to then raise exception 'INVALID_DATES';end if;
 with sales as materialized (
  select * from waki_private.hotel_sales_status where (p_from is null or paid_at>=p_from::timestamp at time zone 'America/Lima') and (p_to is null or paid_at<(p_to+1)::timestamp at time zone 'America/Lima')
 ), grouped as (
  select h.id hotel_id,h.name,h.district,c.commission_rate,
   count(s.id) filter(where finance_status='pending') pending_count,min(s.paid_at) filter(where finance_status='pending') pending_since,(select max(paid_on) from waki_private.hotel_payouts where hotel_id=h.id) last_paid_on,count(s.id) filter(where finance_status in ('pending','paid')) sales_count,
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
  'counts',(select jsonb_build_object('pending',count(*) filter(where pending>0),'paid',count(*) filter(where deposited>0),'review',count(*) filter(where review_count+held_count>0),'all',count(*)) from grouped),'total',(select count(*) from filtered),'summary',(select jsonb_build_object('gross',coalesce(sum(gross),0),'commission',coalesce(sum(commission),0),'pending',coalesce(sum(pending),0),'deposited',coalesce(sum(deposited),0),'review_count',coalesce(sum(review_count+held_count),0),'test_count',coalesce(sum(test_count),0)) from grouped)) into result;
 return result;
end $$;

create or replace function waki_private.finance_detail(p_hotel uuid,p_from date,p_to date,p_page integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_waki_admin() then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 return (with sales as materialized (
  select * from waki_private.hotel_sales_status where hotel_id=p_hotel and (p_from is null or paid_at>=p_from::timestamp at time zone 'America/Lima') and (p_to is null or paid_at<(p_to+1)::timestamp at time zone 'America/Lima')
 ), page as(select * from sales order by paid_at desc,id limit 50 offset greatest(0,coalesce(p_page,0))*50),
 payouts as(select p.id,p.amount,p.reference,p.paid_on,p.notes,p.created_at,n.state email_status,n.recipient from waki_private.hotel_payouts p left join waki_private.payout_notifications n on n.payout_id=p.id where p.hotel_id=p_hotel order by p.created_at desc,p.id limit 25 offset greatest(0,coalesce(p_page,0))*25)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'::jsonb),'total',(select count(*) from sales),
 'summary',jsonb_build_object('deposited',coalesce((select sum(amount) from waki_private.hotel_payouts where hotel_id=p_hotel),0),'payout_count',(select count(*) from waki_private.hotel_payouts where hotel_id=p_hotel),'commission_rate',(select commission_rate from waki_private.hotel_finance_settings where hotel_id=p_hotel),'contact_email',(select contact_email from public.hotels where id=p_hotel)),'quote',(select jsonb_build_object('count',count(*),'amount',coalesce(sum(net),0),'token',md5(coalesce(string_agg(id::text||':'||net::text,',' order by id),''))) from sales where finance_status='pending'),
 'payouts',coalesce((select jsonb_agg(to_jsonb(payouts)) from payouts),'[]'::jsonb)));
end $$;


create function waki_private.payout_receipt(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_waki_admin() then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 select payload into result from waki_private.payout_notifications where payout_id=p_id;
 if result is not null then return result;end if;
 select jsonb_build_object('id',p.id,'hotel_id',p.hotel_id,'hotel_name',h.name,'recipient',h.contact_email,'amount',p.amount,'currency',p.currency,'reference',p.reference,'paid_on',p.paid_on,'notes',p.notes,'created_at',p.created_at,
 'gross',coalesce(sum(s.gross),0),'commission',coalesce(sum(s.commission),0),'period_from',min(s.paid_at),'period_to',max(s.paid_at),'items',coalesce(jsonb_agg(jsonb_build_object('id',s.id,'booking_code',s.booking_code,'source_kind',s.source_kind,'paid_at',s.paid_at,'gross',s.gross,'rate',s.commission_rate,'commission',s.commission,'net',s.net) order by s.paid_at,s.id) filter(where s.id is not null),'[]')) into result
 from waki_private.hotel_payouts p join public.hotels h on h.id=p.hotel_id left join waki_private.hotel_sales s on s.payout_id=p.id where p.id=p_id group by p.id,h.id;
 if result is null then raise exception 'PAYOUT_NOT_FOUND';end if;
 return result;
end $$;
create or replace function public.admin_finance_action(p_action text,p_data jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;receipt jsonb;
begin
 result:=waki_private.finance_action(p_action,p_data);
 if p_action='payout' then
  receipt:=waki_private.payout_receipt((result->>'payout_id')::uuid);
  perform waki_private.enqueue_payout_receipt((result->>'payout_id')::uuid,receipt);
 end if;
 return result;
end $$;
create function waki_private.enqueue_payout_receipt(p_id uuid,p_receipt jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_waki_admin() then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 -- Rebuild server data. Do not accept a caller-supplied recipient or balance.
 p_receipt:=waki_private.payout_receipt(p_id);
 insert into waki_private.payout_notifications(payout_id,recipient,payload) values(p_id,p_receipt->>'recipient',p_receipt) on conflict do nothing;
end $$;
create function public.admin_payout_receipt(p_id uuid) returns jsonb language sql security invoker set search_path='' as $$select waki_private.payout_receipt(p_id)$$;
create function waki_private.payout_delivery(p_id uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare n waki_private.payout_notifications;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 select * into n from waki_private.payout_notifications where payout_id=p_id for update;
 if n.payout_id is null then return jsonb_build_object('ok',false,'state','unavailable');end if;
 if p_action='claim' then
  if n.state='sending' and n.attempted_at<now()-interval '2 minutes' then update waki_private.payout_notifications set state='unknown',error_code='DELIVERY_UNKNOWN' where payout_id=p_id;return jsonb_build_object('ok',false,'state','unknown');end if;
  if n.state in ('sent','sending','unknown') then return jsonb_build_object('ok',false,'state',n.state);end if;
  if n.attempted_at>now()-interval '30 seconds' then return jsonb_build_object('ok',false,'state',n.state);end if;
  if n.recipient is null or n.error_code='HOTEL_EMAIL_MISSING' then select h.contact_email into n.recipient from public.hotels h join waki_private.hotel_payouts p on p.hotel_id=h.id where p.id=p_id;end if;
  update waki_private.payout_notifications set recipient=n.recipient,state='sending',attempts=attempts+1,lease=gen_random_uuid(),attempted_at=now(),error_code=null where payout_id=p_id returning * into n;
  return jsonb_build_object('ok',true,'lease',n.lease,'recipient',n.recipient,'payload',n.payload);
 elsif p_action='finish' then
  if n.state<>'sending' or n.lease is distinct from (p_data->>'lease')::uuid or p_data->>'state' not in ('sent','failed','unconfigured','unknown') then raise exception 'INVALID_DELIVERY';end if;
  update waki_private.payout_notifications set state=p_data->>'state',sent_at=case when p_data->>'state'='sent' then now() end,error_code=left(p_data->>'error_code',80),message_id=left(p_data->>'message_id',200) where payout_id=p_id;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'INVALID_ACTION';
end $$;
create function public.admin_payout_delivery(p_id uuid,p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select waki_private.payout_delivery(p_id,p_action,p_data)$$;
revoke all on function waki_private.payout_receipt(uuid),waki_private.enqueue_payout_receipt(uuid,jsonb),public.admin_payout_receipt(uuid),waki_private.payout_delivery(uuid,text,jsonb),public.admin_payout_delivery(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function waki_private.payout_receipt(uuid),waki_private.enqueue_payout_receipt(uuid,jsonb),public.admin_payout_receipt(uuid) to authenticated;
grant execute on function waki_private.payout_delivery(uuid,text,jsonb),public.admin_payout_delivery(uuid,text,jsonb) to service_role;

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
  rate:=coalesce(s.commission_rate,(select commission_rate from waki_private.hotel_finance_settings where hotel_id=h));
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

-- Existing accepted hotels are untouched. New approvals must have their agreed rate.
create function waki_private.require_approval_commission() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.approval_status='approved' and old.approval_status is distinct from 'approved' and not exists(select 1 from waki_private.hotel_finance_settings where hotel_id=new.id and commission_rate in (4,8)) then raise exception 'COMMISSION_REQUIRED';end if;
 return new;
end $$;
revoke all on function waki_private.require_approval_commission() from public,anon,authenticated;
create trigger approval_requires_commission before update of approval_status on public.hotels for each row execute function waki_private.require_approval_commission();
