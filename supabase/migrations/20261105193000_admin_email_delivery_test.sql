-- Prueba operativa de entrega: exclusivamente al correo verificado del admin global.
-- Máximo un diagnóstico por administrador y hora; no permite destinatarios arbitrarios.
create or replace function waki_private.queue_admin_mail_test()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  recipient_email text;
  target_key text;
  new_id uuid;
begin
  if auth.uid() is null or not coalesce(public.is_waki_admin(),false) then
    raise exception 'NOT_AUTHORIZED' using errcode='42501';
  end if;
  select u.email into recipient_email
  from auth.users u
  join public.profiles p on p.id=u.id
  where u.id=auth.uid() and u.email_confirmed_at is not null
    and not coalesce(u.is_anonymous,false) and p.account_status='active';
  if recipient_email is null then raise exception 'ADMIN_EMAIL_NOT_VERIFIED'; end if;
  target_key := 'admin_mail_test:' || auth.uid()::text || ':' ||
    to_char(now() at time zone 'UTC','YYYYMMDDHH24');
  insert into waki_private.communication_outbox(
    event_key,kind,audience,user_id,recipient,payload)
  values(target_key,'mail_test','user',auth.uid(),recipient_email,
    jsonb_build_object('requested_at',now()))
  on conflict(event_key) do nothing
  returning id into new_id;
  return jsonb_build_object('queued',new_id is not null,
    'already_requested',new_id is null,
    'message','El correo de prueba se envía solo al email verificado del administrador');
end $$;
create or replace function public.waki_request_email_test()
returns jsonb language sql security invoker set search_path='' as $$
  select waki_private.queue_admin_mail_test()
$$;
revoke all on function waki_private.queue_admin_mail_test(),
  public.waki_request_email_test() from public,anon,authenticated;
grant execute on function waki_private.queue_admin_mail_test(),
  public.waki_request_email_test() to authenticated;
