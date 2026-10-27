create function waki_private.approve_hotel_affiliation(p_hotel uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare h public.hotels;rate numeric;
begin
 if auth.uid() is null or not coalesce(public.is_waki_admin(),false) then raise exception 'NOT_AUTHORIZED';end if;
 select * into h from public.hotels where id=p_hotel for update;
 if h.id is null or h.approval_status not in ('draft','pending_review','rejected') then raise exception 'INVALID_REVIEW_STATUS';end if;
 perform waki_private.hotel_affiliation(p_hotel,'review',p_data);
 select commission_rate into rate from waki_private.hotel_finance_settings where hotel_id=p_hotel;
 if rate is null then
  rate:=(p_data->>'rate')::numeric;if rate is null or rate not in (4,8) then raise exception 'INVALID_RATE';end if;
  perform public.admin_finance_action('commission',jsonb_build_object('hotel_id',p_hotel,'rate',rate));
 end if;
 update public.hotels set approval_status='approved',is_active=true,approved_by=auth.uid(),approved_at=now(),reviewed_at=now(),rejection_reason=null where id=p_hotel;
 insert into public.hotel_review_events(hotel_id,action,comment,created_by) values(p_hotel,'approved','Aprobación con acuerdo comercial, cuenta bancaria, capacitación y comisión verificados.',auth.uid());
 return jsonb_build_object('ok',true,'commission_rate',rate);
end $$;
create function public.admin_approve_hotel_affiliation(p_hotel uuid,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$select waki_private.approve_hotel_affiliation(p_hotel,p_data)$$;
revoke all on function waki_private.approve_hotel_affiliation(uuid,jsonb),public.admin_approve_hotel_affiliation(uuid,jsonb) from public,anon,authenticated;
grant execute on function waki_private.approve_hotel_affiliation(uuid,jsonb),public.admin_approve_hotel_affiliation(uuid,jsonb) to authenticated;
create function waki_private.enqueue_extension_notice() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.reservations;h public.hotels;email text;payload jsonb;
begin
 if new.status<>'paid' or (tg_op='UPDATE' and old.status='paid') then return new;end if;
 select * into r from public.reservations where id=new.reservation_id;select * into h from public.hotels where id=r.hotel_id;
 payload:=jsonb_build_object('hotel_name',h.name,'booking_code',r.booking_code,'start_at',r.start_at,'end_at',new.new_end_at,'amount',new.amount,'currency',new.currency);
 if h.contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
 insert into waki_private.communication_outbox(event_key,kind,audience,hotel_id,reservation_id,recipient,payload)
 values('extension:'||new.id||':hotel','extension_confirmed','hotel',r.hotel_id,r.id,h.contact_email,payload) on conflict do nothing;
 end if;
 select u.email into email from auth.users u join public.profiles p on p.id=u.id where u.id=r.user_id and not coalesce(u.is_anonymous,false) and u.email_confirmed_at is not null and p.account_status='active';
 if email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
 insert into waki_private.communication_outbox(event_key,kind,audience,user_id,hotel_id,reservation_id,recipient,payload)
 values('extension:'||new.id||':user','extension_confirmed','user',r.user_id,r.hotel_id,r.id,email,payload) on conflict do nothing;
 end if;return new;
end $$;
create trigger enqueue_extension_notice after insert or update of status on public.reservation_extensions for each row execute function waki_private.enqueue_extension_notice();
revoke all on function waki_private.enqueue_extension_notice() from public,anon,authenticated;
