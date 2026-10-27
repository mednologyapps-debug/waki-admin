-- Least privilege: RLS does not protect TRUNCATE. No browser needs these privileges.
revoke truncate,references,trigger on all tables in schema public from anon,authenticated;
alter default privileges for role postgres in schema public revoke truncate,references,trigger on tables from anon,authenticated;

-- Trigger must remain INVOKER: distinguish direct API writes from trusted server RPCs.
create function waki_private.guard_profile_insert() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user not in ('postgres','supabase_admin','service_role') and
    (new.role is distinct from 'user' or new.account_status is distinct from 'active') then
   raise exception 'PROFILE_SECURITY_FIELDS_FORBIDDEN' using errcode='42501';
 end if;
 return new;
end $$;
create trigger guard_profile_insert before insert on public.profiles for each row execute function waki_private.guard_profile_insert();
revoke all on function waki_private.guard_profile_insert() from public,anon,authenticated;

create function waki_private.guard_hotel_review_fields() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user not in ('postgres','supabase_admin','service_role') and not coalesce(public.is_waki_admin(),false) and
    (new.approval_status is distinct from old.approval_status or new.is_active is distinct from old.is_active
     or new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at
     or new.reviewed_at is distinct from old.reviewed_at or new.rejection_reason is distinct from old.rejection_reason
     or new.rating is distinct from old.rating or new.rating_total is distinct from old.rating_total
     or new.review_count is distinct from old.review_count or new.brand_id is distinct from old.brand_id) then
   raise exception 'HOTEL_REVIEW_FIELDS_FORBIDDEN' using errcode='42501';
 end if;
 return new;
end $$;
create trigger guard_hotel_review_fields before update on public.hotels for each row execute function waki_private.guard_hotel_review_fields();
revoke all on function waki_private.guard_hotel_review_fields() from public,anon,authenticated;
