-- A private random scheduler token, never a service role key, crosses the cron HTTP boundary.
create table waki_private.communication_scheduler(singleton boolean primary key default true check(singleton),token text not null,anon_key text not null);
alter table waki_private.communication_scheduler enable row level security;
revoke all on waki_private.communication_scheduler from public,anon,authenticated;
create function waki_private.communication_scheduler_control(p_action text,p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'NOT_AUTHORIZED';end if;
 if p_action='init' then
  if p_token is null or length(p_token)<100 then raise exception 'INVALID_PUBLIC_KEY';end if;
  insert into waki_private.communication_scheduler(singleton,token,anon_key) values(true,replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),p_token)
  on conflict(singleton) do update set anon_key=excluded.anon_key;
  return jsonb_build_object('ok',true);
 elsif p_action='verify' then
  return jsonb_build_object('valid',exists(select 1 from waki_private.communication_scheduler where token=p_token));
 end if;raise exception 'INVALID_ACTION';
end $$;
create function public.waki_communication_scheduler(p_action text,p_token text) returns jsonb language sql security invoker set search_path='' as $$select waki_private.communication_scheduler_control(p_action,p_token)$$;
revoke all on function waki_private.communication_scheduler_control(text,text),public.waki_communication_scheduler(text,text) from public,anon,authenticated;
grant execute on function waki_private.communication_scheduler_control(text,text),public.waki_communication_scheduler(text,text) to service_role;
create function waki_private.dispatch_communication_tick() returns void language plpgsql security definer set search_path='' as $$
declare config waki_private.communication_scheduler;
begin
 if not exists(select 1 from waki_private.communication_outbox where state in ('pending','unconfigured') and attempts<5) then return;end if;
 select * into config from waki_private.communication_scheduler where singleton;
 if config.token is null then return;end if;
 perform net.http_post(url:='https://ipakrrcjrpfcnjvtwhvp.supabase.co/functions/v1/waki-communications',
 headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||config.anon_key,'apikey',config.anon_key,'x-waki-scheduler-token',config.token),
 body:=jsonb_build_object('action','dispatch'),timeout_milliseconds:=120000);
end $$;
revoke all on function waki_private.dispatch_communication_tick() from public,anon,authenticated;
do $$begin
 if exists(select 1 from pg_namespace where nspname='cron') and exists(select 1 from pg_namespace where nspname='net') then
  perform cron.schedule('waki-dispatch-communications','*/5 * * * *','select waki_private.dispatch_communication_tick()');
 end if;
end $$;
