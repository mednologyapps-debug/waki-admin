-- Mailjet provider tracking: accepted by provider is not verified inbox delivery.
alter table waki_private.communication_outbox
  add column if not exists provider text,
  add column if not exists provider_message_id text;

CREATE OR REPLACE FUNCTION waki_private.communication_batch(p_action text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  update waki_private.communication_outbox set state=p_data->>'state',error_code=left(p_data->>'error_code',80),provider=case when p_data->>'provider' in ('mailjet','resend','smtp') then p_data->>'provider' else null end,provider_message_id=left(nullif(p_data->>'provider_message_id',''),96),sent_at=case when p_data->>'state'='sent' then now() end
   where id=(p_data->>'id')::uuid and lease=(p_data->>'lease')::uuid and state='sending';
  return jsonb_build_object('ok',found);
 end if;raise exception 'INVALID_ACTION';
end $function$


CREATE OR REPLACE FUNCTION waki_private.launch_dashboard(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
 'communications',coalesce((select jsonb_agg(to_jsonb(m)) from (select id,kind,audience,state,error_code,provider,provider_message_id,created_at,sent_at from waki_private.communication_outbox order by created_at desc limit 25) m),'[]'),
 'payment_reviews',coalesce((select jsonb_agg(to_jsonb(r)) from (select a.id,a.reservation_id,h.name hotel_name,a.state,a.review_reason,a.created_at from waki_private.izipay_attempts a join public.reservations b on b.id=a.reservation_id join public.hotels h on h.id=b.hotel_id where a.state='review' order by a.created_at desc limit 25) r),'[]'),
 'collected_since',(select min(created_at) from waki_private.web_events));
end $function$

