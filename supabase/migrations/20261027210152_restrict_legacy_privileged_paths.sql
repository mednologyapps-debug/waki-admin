-- All privilege changes must pass the audited backend, including superadmin changes.
create function waki_private.guard_profile_update() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user not in ('postgres','supabase_admin','service_role') and
 (old.role is distinct from new.role or old.account_status is distinct from new.account_status) then
  raise exception 'PROFILE_SECURITY_FIELDS_FORBIDDEN' using errcode='42501';
 end if;return new;
end $$;
create trigger guard_profile_update before update on public.profiles for each row execute function waki_private.guard_profile_update();
revoke all on function waki_private.guard_profile_update() from public,anon,authenticated;
revoke all on function public.set_profile_role(uuid,text) from public,anon,authenticated;
-- Expired/claimed bearer invitations must not keep exposing contact PII.
create or replace function public.get_sales_hotel_invite(target_invite_token uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare payload jsonb;
begin
 select jsonb_build_object('valid',true,'status',oc.status,'hotel_name',p.name,'district',p.district,'address',p.address,
 'contact_name',oc.contact_name,'contact_role',oc.contact_role,'contact_phone',oc.contact_phone,'contact_email',oc.contact_email,
 'invite_expires_at',oc.invite_expires_at,'claimed',false) into payload
 from public.sales_hotel_onboarding_cases oc join public.sales_places p on p.id=oc.place_id
 where oc.invite_token=target_invite_token and oc.status in ('started','invited') and oc.invite_expires_at>now() limit 1;
 return coalesce(payload,jsonb_build_object('valid',false,'status','unavailable'));
end $$;
