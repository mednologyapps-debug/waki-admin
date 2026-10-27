-- Record of attempted hardening: Supabase-owned extension objects may retain platform grants.
-- net is NOT exposed in PostgREST (verified PGRST106). Do not expose this schema.
revoke usage on schema net from public,anon,authenticated;
revoke all on all tables in schema net from public,anon,authenticated;
revoke all on all functions in schema net from public,anon,authenticated;
grant usage on schema net to service_role;
grant execute on all functions in schema net to service_role;
