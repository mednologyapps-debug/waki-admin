-- Preserve immutable settlement totals when a customer exercises account deletion.
-- Only private ledger/evidence references become nullable; reservations themselves remain owned.
alter table waki_private.hotel_sales alter column reservation_id drop not null;
alter table waki_private.hotel_sales drop constraint hotel_sales_reservation_id_fkey;
alter table waki_private.hotel_sales add constraint hotel_sales_reservation_id_fkey foreign key(reservation_id) references public.reservations(id) on delete set null;
alter table waki_private.izipay_attempts alter column user_id drop not null,alter column reservation_id drop not null;
alter table waki_private.izipay_attempts drop constraint izipay_attempts_user_id_fkey,drop constraint izipay_attempts_reservation_id_fkey;
alter table waki_private.izipay_attempts add constraint izipay_attempts_user_id_fkey foreign key(user_id) references auth.users(id) on delete set null;
alter table waki_private.izipay_attempts add constraint izipay_attempts_reservation_id_fkey foreign key(reservation_id) references public.reservations(id) on delete set null;
create or replace function waki_private.delete_customer_account(target_user uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owned_reservation_ids uuid[];
begin
  perform 1 from auth.users where id=target_user for update;
  perform 1 from public.profiles where id=target_user for update;
  if jsonb_array_length(waki_private.customer_deletion_objects(target_user))>0 then
    raise exception 'STORAGE_DELETE_REQUIRED'; end if;
  select coalesce(array_agg(id),'{}'::uuid[]) into owned_reservation_ids from public.reservations where user_id=target_user;
  delete from waki_private.guest_reservation_links where guest_user_id=target_user
    or claimed_by=target_user or reservation_ids && owned_reservation_ids;
  -- Keep only payment reconciliation evidence, detached from the deleted identity.
  update waki_private.izipay_attempts set user_id=null,reservation_id=null,form_token=null
   where (user_id=target_user or reservation_id=any(owned_reservation_ids)) and state in ('paid','review');
  delete from waki_private.izipay_attempts where user_id=target_user or reservation_id=any(owned_reservation_ids);
  delete from waki_private.admin_user_approvals where user_id=target_user;
  delete from public.reservation_extensions where created_by=target_user;
  delete from public.reservation_events where user_id=target_user;
  delete from public.reservations where user_id=target_user;
  delete from public.hotel_favorites where user_id=target_user;
  -- Auth deletion cascades to profiles, identities, sessions and refresh tokens.
  delete from auth.users where id=target_user;
  return jsonb_build_object('deleted',true);
end $$;
