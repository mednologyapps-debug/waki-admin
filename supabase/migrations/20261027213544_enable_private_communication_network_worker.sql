-- pg_net is required for conditional cron dispatch; no client receives outbound-network privileges.
create extension if not exists pg_net;
revoke usage on schema net from public,anon,authenticated;
revoke all on all tables in schema net from public,anon,authenticated;
revoke all on all functions in schema net from public,anon,authenticated;
grant usage on schema net to service_role;
grant execute on all functions in schema net to service_role;
select cron.schedule('waki-dispatch-communications','*/5 * * * *','select waki_private.dispatch_communication_tick()');
