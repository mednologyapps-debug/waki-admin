-- Operational events: no guest PII. Only active staff of this hotel can read.
create table public.hotel_booking_notices(
 id uuid primary key default gen_random_uuid(), hotel_id uuid not null references public.hotels(id) on delete cascade,
 reservation_id uuid not null references public.reservations(id) on delete cascade,
 created_at timestamptz not null default now(), unique(reservation_id)
);
alter table public.hotel_booking_notices enable row level security;
revoke all on public.hotel_booking_notices from public,anon,authenticated;
grant select on public.hotel_booking_notices to authenticated;
create policy hotel_notice_authorized on public.hotel_booking_notices for select to authenticated
 using(public.user_can_operate_hotel_reservations(hotel_id) or public.is_waki_admin());
create index hotel_booking_notices_hotel_time on public.hotel_booking_notices(hotel_id,created_at desc);

create table waki_private.communication_outbox(
 id uuid primary key default gen_random_uuid(),event_key text unique not null,kind text not null,
 audience text not null check(audience in ('hotel','user')),user_id uuid references auth.users(id) on delete cascade,
 hotel_id uuid references public.hotels(id) on delete cascade,reservation_id uuid references public.reservations(id) on delete cascade,
 recipient text not null,payload jsonb not null default '{}',created_at timestamptz not null default now(),
 state text not null default 'pending' check(state in ('pending','sending','sent','failed','unconfigured','unknown','skipped')),
 lease uuid,attempted_at timestamptz,sent_at timestamptz,error_code text,attempts integer not null default 0
);
alter table waki_private.communication_outbox enable row level security;
revoke all on waki_private.communication_outbox from public,anon,authenticated;
create index communication_pending_idx on waki_private.communication_outbox(created_at) where state in ('pending','unconfigured');
create function waki_private.enqueue_reservation_notice() returns trigger language plpgsql security definer set search_path='' as $$
declare k text; recipient_user text; recipient_hotel text; hname text; payload jsonb;
begin
 if new.payment_status='paid' and new.status='confirmed' and (tg_op='INSERT' or old.status is distinct from 'confirmed' or old.payment_status is distinct from 'paid') then
  k:='reservation_confirmed';
  insert into public.hotel_booking_notices(hotel_id,reservation_id) values(new.hotel_id,new.id) on conflict do nothing;
 elsif tg_op='UPDATE' and new.status='cancelled' and old.status is distinct from new.status and old.payment_status='paid' then
  k:='reservation_cancelled';
 else return new;end if;
 select contact_email,name into recipient_hotel,hname from public.hotels where id=new.hotel_id;
 payload:=jsonb_build_object('hotel_name',hname,'booking_code',new.booking_code,'start_at',new.start_at,'end_at',new.end_at,'amount',new.total_amount,'currency',new.currency);
 if recipient_hotel ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
 insert into waki_private.communication_outbox(event_key,kind,audience,hotel_id,reservation_id,recipient,payload)
 values(k||':hotel:'||new.id,k,'hotel',new.hotel_id,new.id,recipient_hotel,payload) on conflict do nothing;
 end if;
 -- Guest-provided emails are intentionally ignored. A verified registered account is required.
 select u.email into recipient_user from auth.users u join public.profiles p on p.id=u.id
 where u.id=new.user_id and not coalesce(u.is_anonymous,false) and u.email_confirmed_at is not null and p.account_status='active';
 if recipient_user ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
 insert into waki_private.communication_outbox(event_key,kind,audience,user_id,hotel_id,reservation_id,recipient,payload)
 values(k||':user:'||new.id,k,'user',new.user_id,new.hotel_id,new.id,recipient_user,payload) on conflict do nothing;
 end if;
 return new;
end $$;
create trigger enqueue_reservation_notice after insert or update of status,payment_status on public.reservations for each row execute function waki_private.enqueue_reservation_notice();
revoke all on function waki_private.enqueue_reservation_notice() from public,anon,authenticated;

create function waki_private.enqueue_hotel_review_notice() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.approval_status is distinct from new.approval_status and new.approval_status in ('approved','rejected','pending_review') and
 new.contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
 insert into waki_private.communication_outbox(event_key,kind,audience,hotel_id,recipient,payload)
 values('hotel_review:'||new.id||':'||new.approval_status||':'||new.updated_at,'hotel_'||new.approval_status,'hotel',new.id,new.contact_email,
 jsonb_build_object('hotel_name',new.name,'reason',left(new.rejection_reason,500))) on conflict do nothing;
 end if;return new;
end $$;
create trigger enqueue_hotel_review_notice after update of approval_status on public.hotels for each row execute function waki_private.enqueue_hotel_review_notice();
revoke all on function waki_private.enqueue_hotel_review_notice() from public,anon,authenticated;

-- Claim/complete split prevents duplicate deliveries. Ambiguous deliveries are never retried automatically.
create function waki_private.communication_batch(p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare answer jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 if p_action='claim' then
  update waki_private.communication_outbox set state='unknown',error_code='DELIVERY_INTERRUPTED' where state='sending' and attempted_at<now()-interval '10 minutes';
  update waki_private.communication_outbox o set state='skipped',error_code='USER_INELIGIBLE' where o.state in ('pending','unconfigured') and o.audience='user' and not exists(
   select 1 from auth.users u join public.profiles p on p.id=u.id where u.id=o.user_id and not coalesce(u.is_anonymous,false) and u.email_confirmed_at is not null and u.email=o.recipient and p.account_status='active');
  with picked as(select id from waki_private.communication_outbox where state in ('pending','unconfigured') and attempts<5 order by created_at for update skip locked limit 10),
  claimed as(update waki_private.communication_outbox o set state='sending',lease=gen_random_uuid(),attempted_at=now(),attempts=attempts+1 from picked p where o.id=p.id returning o.*)
  select coalesce(jsonb_agg(to_jsonb(claimed)),'[]') into answer from claimed; return answer;
 elsif p_action='complete' then
  if p_data->>'state' not in ('sent','failed','unknown','unconfigured') then raise exception 'INVALID_STATE';end if;
  update waki_private.communication_outbox set state=p_data->>'state',error_code=left(p_data->>'error_code',80),sent_at=case when p_data->>'state'='sent' then now() end
   where id=(p_data->>'id')::uuid and lease=(p_data->>'lease')::uuid and state='sending';
  return jsonb_build_object('ok',found);
 end if;raise exception 'INVALID_ACTION';
end $$;
create function public.waki_communication_batch(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select waki_private.communication_batch(p_action,p_data)$$;
revoke all on function waki_private.communication_batch(text,jsonb),public.waki_communication_batch(text,jsonb) from public,anon,authenticated;
grant execute on function waki_private.communication_batch(text,jsonb),public.waki_communication_batch(text,jsonb) to service_role;

-- Web measurement stores session IDs, coarse device and source; never names, queries, IPs or hotel searches.
create table waki_private.web_events(
 id uuid primary key,session_id uuid not null,event text not null,path text not null,device text not null,
 source text not null default 'direct',medium text not null default '',campaign text not null default '',
 referrer text not null default '',created_at timestamptz not null default now()
);
alter table waki_private.web_events enable row level security;
revoke all on waki_private.web_events from public,anon,authenticated;
create index web_events_time on waki_private.web_events(created_at desc);
create index web_events_session on waki_private.web_events(session_id,created_at);
create table waki_private.telemetry_rate(bucket text primary key,hits integer not null default 0,expires_at timestamptz not null);
alter table waki_private.telemetry_rate enable row level security;
revoke all on waki_private.telemetry_rate from public,anon,authenticated;
create function waki_private.ingest_web_events(p_bucket text,p_events jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare hits integer; e jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 if length(p_bucket)<>64 or p_bucket !~ '^[a-f0-9]+$' or jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events) not between 1 and 20 then raise exception 'INVALID_REQUEST';end if;
 insert into waki_private.telemetry_rate(bucket,hits,expires_at) values(p_bucket,jsonb_array_length(p_events),now()+interval '2 hours')
 on conflict(bucket) do update set hits=waki_private.telemetry_rate.hits+excluded.hits returning telemetry_rate.hits into hits;
 if hits>240 then return jsonb_build_object('accepted',false,'reason','RATE_LIMIT');end if;
 for e in select value from jsonb_array_elements(p_events) loop
  if e->>'event' not in ('page_view','hero_search','partner_open','partner_submitted','portal_click','client_error')
   or e->>'path' not in ('/','/legal.html','/reclamos.html','/eliminar-cuenta.html') or e->>'device' not in ('mobile','tablet','desktop') then continue;end if;
  if coalesce(e->>'source','') !~ '^[a-zA-Z0-9_-]{0,64}$' or coalesce(e->>'campaign','') !~ '^[a-zA-Z0-9_-]{0,64}$' or coalesce(e->>'medium','') !~ '^[a-zA-Z0-9_-]{0,64}$' then continue;end if;
  insert into waki_private.web_events(id,session_id,event,path,device,source,medium,campaign,referrer)
  values((e->>'id')::uuid,(e->>'session_id')::uuid,e->>'event',e->>'path',e->>'device',coalesce(nullif(e->>'source',''),'direct'),coalesce(e->>'medium',''),coalesce(e->>'campaign',''),
  case when e->>'referrer' ~ '^[a-z0-9.-]{1,120}$' then e->>'referrer' else '' end) on conflict do nothing;
 end loop;return jsonb_build_object('accepted',true);
end $$;
create function public.waki_ingest_web_events(p_bucket text,p_events jsonb) returns jsonb language sql security invoker set search_path='' as $$select waki_private.ingest_web_events(p_bucket,p_events)$$;
revoke all on function waki_private.ingest_web_events(text,jsonb),public.waki_ingest_web_events(text,jsonb) from public,anon,authenticated;
grant execute on function waki_private.ingest_web_events(text,jsonb),public.waki_ingest_web_events(text,jsonb) to service_role;

create function waki_private.launch_dashboard(p_from date,p_to date) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not coalesce(public.is_waki_admin(),false) then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 if p_from is null or p_to is null or p_from>p_to or p_to-p_from>90 then raise exception 'INVALID_DATES';end if;
 with events as materialized(select *, (created_at at time zone 'America/Lima')::date local_day from waki_private.web_events where created_at>=p_from::timestamp at time zone 'America/Lima' and created_at<(p_to+1)::timestamp at time zone 'America/Lima'),
 daily as(select local_day,count(*) filter(where event='page_view') views,count(distinct session_id) sessions,count(*) filter(where event='hero_search') searches,count(*) filter(where event='partner_submitted') applications from events group by local_day order by local_day),
 sources as(select source,medium,campaign,count(distinct session_id) sessions,count(*) filter(where event='page_view') views from events group by source,medium,campaign order by sessions desc limit 15),
 devices as(select device,count(distinct session_id) sessions from events group by device),
 funnel as(select event,count(*) events,count(distinct session_id) sessions from events group by event)
 select jsonb_build_object('web',jsonb_build_object('views',count(*) filter(where event='page_view'),'sessions',count(distinct session_id),'searches',count(*) filter(where event='hero_search'),'applications',count(*) filter(where event='partner_submitted'),'errors',count(*) filter(where event='client_error')),
 'daily',coalesce((select jsonb_agg(to_jsonb(daily)) from daily),'[]'),'sources',coalesce((select jsonb_agg(to_jsonb(sources)) from sources),'[]'),
 'devices',coalesce((select jsonb_agg(to_jsonb(devices)) from devices),'[]'),'funnel',coalesce((select jsonb_agg(to_jsonb(funnel)) from funnel),'[]')) into result from events;
 return result || jsonb_build_object('operations',jsonb_build_object(
 'payment_review',(select count(*) from waki_private.izipay_attempts where state='review'),
 'paid_inconsistent',(select count(*) from public.reservations where payment_status='paid' and (status='pending_payment' or (status='confirmed' and qr_token is null))),
 'unconfigured_commissions',(select count(*) from public.hotels h where h.approval_status='approved' and not exists(select 1 from waki_private.hotel_finance_settings s where s.hotel_id=h.id)),
 'mail_pending',(select count(*) from waki_private.communication_outbox where state in ('pending','unconfigured')),
 'mail_unknown',(select count(*) from waki_private.communication_outbox where state in ('unknown','failed') or (state='sending' and attempted_at<now()-interval '10 minutes')),
 'payout_mail_pending',(select count(*) from waki_private.payout_notifications where state<>'sent'),
 'hotel_pending',(select count(*) from public.hotels where approval_status='pending_review')),
 'communications',coalesce((select jsonb_agg(to_jsonb(m)) from (select id,kind,audience,state,error_code,created_at,sent_at from waki_private.communication_outbox order by created_at desc limit 25) m),'[]'),
 'payment_reviews',coalesce((select jsonb_agg(to_jsonb(r)) from (select a.id,a.reservation_id,h.name hotel_name,a.state,a.review_reason,a.created_at from waki_private.izipay_attempts a join public.reservations b on b.id=a.reservation_id join public.hotels h on h.id=b.hotel_id where a.state='review' order by a.created_at desc limit 25) r),'[]'),
 'collected_since',(select min(created_at) from waki_private.web_events));
end $$;
create function public.admin_launch_dashboard(p_from date,p_to date) returns jsonb language sql security invoker set search_path='' as $$select waki_private.launch_dashboard(p_from,p_to)$$;
revoke all on function waki_private.launch_dashboard(date,date),public.admin_launch_dashboard(date,date) from public,anon,authenticated;
grant execute on function waki_private.launch_dashboard(date,date),public.admin_launch_dashboard(date,date) to authenticated;

-- Fixed retention without a paid external analytics dependency.
create function waki_private.prune_telemetry() returns void language sql security definer set search_path='' as $$
 delete from waki_private.web_events where created_at<now()-interval '90 days';
 delete from waki_private.telemetry_rate where expires_at<now();
 delete from waki_private.communication_outbox where state in ('sent','skipped') and created_at<now()-interval '90 days';
 delete from public.hotel_booking_notices where created_at<now()-interval '30 days';
$$;
revoke all on function waki_private.prune_telemetry() from public,anon,authenticated;
-- Event-driven hotel notices: no new polling channel.
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='hotel_booking_notices') then
  alter publication supabase_realtime add table public.hotel_booking_notices;
 end if;
 if exists(select 1 from pg_namespace where nspname='cron') then
  perform cron.schedule('waki-prune-telemetry','15 8 * * *','select waki_private.prune_telemetry()');
 end if;
end $$;
