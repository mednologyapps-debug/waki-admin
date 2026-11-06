-- WAKI communication dispatcher compatibility with Supabase publishable keys.
-- The Edge Function performs its own authorization: user JWT or a private
-- 64-character scheduler token checked with a service-role-only RPC.
-- Never grant client roles access to the scheduler private table.
create or replace function waki_private.communication_scheduler_control(p_action text,p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then
  raise exception 'NOT_AUTHORIZED' using errcode='42501';
 end if;
 if p_action='init' then
  -- Old anon keys are JWTs; new publishable keys are deliberately shorter.
  if p_token is null or not (
   length(p_token)>=100 or p_token ~ '^sb_publishable_[A-Za-z0-9_-]{20,}$'
  ) then raise exception 'INVALID_PUBLIC_KEY';end if;
  insert into waki_private.communication_scheduler(singleton,token,anon_key)
  values(true,replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),p_token)
  on conflict(singleton) do update set anon_key=excluded.anon_key;
  return jsonb_build_object('ok',true);
 elsif p_action='verify' then
  return jsonb_build_object('valid',exists(
   select 1 from waki_private.communication_scheduler where token=p_token
  ));
 end if;
 raise exception 'INVALID_ACTION';
end $$;
revoke all on function waki_private.communication_scheduler_control(text,text)
 from public,anon,authenticated;
grant execute on function waki_private.communication_scheduler_control(text,text) to service_role;
