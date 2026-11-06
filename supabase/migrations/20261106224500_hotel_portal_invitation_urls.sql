-- New invitations go directly to the official WAKI Hotel portal.
-- Previously issued tokens remain valid; compatibility is handled separately.
CREATE OR REPLACE FUNCTION public.create_quick_hotel_invitation(p_hotel_name text, p_representative_name text, p_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 uid uuid := auth.uid();
 name_clean text := nullif(trim(coalesce(p_hotel_name,'')),'');
 rep_clean text := nullif(trim(coalesce(p_representative_name,'')),'');
 email_clean text := lower(nullif(trim(coalesce(p_email,'')),''));
 staff uuid;
 is_admin boolean;
 created waki_private.quick_hotel_invitations;
 invite_url text;
begin
 if uid is null then raise exception 'AUTH_REQUIRED';end if;
 select coalesce(public.is_waki_admin(),false) into is_admin;
 select ss.id into staff
 from public.sales_staff ss join public.profiles pf on pf.id=ss.user_id
 where ss.user_id=uid and ss.is_active and pf.account_status='active'
 limit 1;
 if not is_admin and staff is null then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 if name_clean is null or length(name_clean) not between 3 and 120 then
  raise exception 'INVALID_HOTEL_NAME';end if;
 if rep_clean is null or length(rep_clean) not between 2 and 120 then
  raise exception 'INVALID_REPRESENTATIVE';end if;
 if email_clean is null or length(email_clean)>254 or
    email_clean !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
  raise exception 'INVALID_CONTACT_EMAIL';end if;

 -- Serialize simultaneous double-clicks / submissions for the same candidate.
 perform pg_advisory_xact_lock(hashtextextended('quick-hotel:'||lower(name_clean)||':'||email_clean,0));
 if exists(select 1 from waki_private.quick_hotel_invitations q
  where lower(q.hotel_name)=lower(name_clean) and lower(q.contact_email)=email_clean
    and q.status='pending' and q.expires_at>now())
 then raise exception 'INVITE_ALREADY_PENDING';end if;
 if exists(select 1 from public.hotels h
  where lower(h.name)=lower(name_clean) and lower(coalesce(h.contact_email,''))=email_clean)
 then raise exception 'HOTEL_ALREADY_REGISTERED';end if;
 if (select count(*) from waki_private.quick_hotel_invitations q
  where q.created_by=uid and q.created_at>now()-interval '24 hours') >=
    (case when is_admin then 60 else 25 end)
 then raise exception 'DAILY_INVITE_LIMIT_REACHED';end if;
 if (select count(*) from waki_private.quick_hotel_invitations q
  where lower(q.contact_email)=email_clean and q.created_at>now()-interval '24 hours') >= 3
 then raise exception 'EMAIL_INVITE_LIMIT_REACHED';end if;

 insert into waki_private.quick_hotel_invitations(
  hotel_name,representative_name,contact_email,created_by,sales_staff_id
 ) values(name_clean,rep_clean,email_clean,uid,staff)
 returning * into created;
 invite_url:='https://hotel.wakipe.com/invitacion/'||created.invite_token::text;
 insert into waki_private.communication_outbox(
  event_key,kind,audience,recipient,payload
 ) values(
  'quick-hotel-invite:'||created.id::text,'hotel_invitation','hotel',email_clean,
  jsonb_build_object('hotel_name',name_clean,'representative_name',rep_clean,
   'invitation_url',invite_url,'expires_at',created.expires_at)
 );
 -- Fire an asynchronous pg_net dispatch after transaction COMMIT, not a
 -- synchronous Mailjet request on the user-facing signup transaction.
 -- If pg_net is temporarily unavailable, preserve the invitation in the
 -- outbox; the five-minute cron remains the safety net.
 begin
   perform waki_private.dispatch_communication_tick();
 exception when others then
   raise log 'WAKI quick hotel invitation dispatch deferred to scheduler: %', sqlstate;
 end;
 return jsonb_build_object('id',created.id,'status','pending','delivery_status','pending',
  'contact_email',email_clean,'invitation_url',invite_url,'expires_at',created.expires_at);
end $function$
