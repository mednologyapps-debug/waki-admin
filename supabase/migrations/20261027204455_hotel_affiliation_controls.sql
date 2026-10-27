create table waki_private.hotel_legal_acceptances(
 hotel_id uuid not null references public.hotels(id) on delete cascade,user_id uuid not null references auth.users(id),
 document_version text not null,accepted_at timestamptz not null default now(),primary key(hotel_id,user_id,document_version)
);
create table waki_private.hotel_affiliation_reviews(
 hotel_id uuid primary key references public.hotels(id) on delete cascade,agreement_reference text not null,
 bank_verified boolean not null default false,training_verified boolean not null default false,
 reviewed_by uuid not null references auth.users(id),reviewed_at timestamptz not null default now()
);
alter table waki_private.hotel_legal_acceptances enable row level security;
alter table waki_private.hotel_affiliation_reviews enable row level security;
revoke all on waki_private.hotel_legal_acceptances,waki_private.hotel_affiliation_reviews from public,anon,authenticated;
create function waki_private.hotel_affiliation(p_hotel uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare legal_ok boolean;review_row waki_private.hotel_affiliation_reviews;
begin
 if auth.uid() is null or not (coalesce(public.user_can_manage_hotel(p_hotel),false) or coalesce(public.is_waki_admin(),false)) then raise exception 'NOT_AUTHORIZED' using errcode='42501';end if;
 if p_action='accept' then
  if not coalesce(public.user_can_manage_hotel(p_hotel),false) or p_data->>'version' is distinct from '2026-10-27-hotels-v1' or p_data->>'accepted' is distinct from 'true' then raise exception 'LEGAL_ACCEPTANCE_REQUIRED';end if;
  insert into waki_private.hotel_legal_acceptances(hotel_id,user_id,document_version) values(p_hotel,auth.uid(),'2026-10-27-hotels-v1') on conflict do nothing;
 elsif p_action='review' then
  if not coalesce(public.is_waki_admin(),false) then raise exception 'NOT_AUTHORIZED';end if;
  if length(trim(coalesce(p_data->>'agreement_reference','')))<5 or length(p_data->>'agreement_reference')>160 or p_data->>'bank_verified' is distinct from 'true' or p_data->>'training_verified' is distinct from 'true' then raise exception 'AFFILIATION_REVIEW_REQUIRED';end if;
  insert into waki_private.hotel_affiliation_reviews(hotel_id,agreement_reference,bank_verified,training_verified,reviewed_by) values(p_hotel,trim(p_data->>'agreement_reference'),true,true,auth.uid())
  on conflict(hotel_id) do update set agreement_reference=excluded.agreement_reference,bank_verified=true,training_verified=true,reviewed_by=auth.uid(),reviewed_at=now();
 elsif p_action<>'read' then raise exception 'INVALID_ACTION';end if;
 select exists(select 1 from waki_private.hotel_legal_acceptances where hotel_id=p_hotel and document_version='2026-10-27-hotels-v1') into legal_ok;
 select * into review_row from waki_private.hotel_affiliation_reviews where hotel_id=p_hotel;
 return jsonb_build_object('accepted',legal_ok,'version','2026-10-27-hotels-v1','review_complete',review_row.hotel_id is not null,
 'review',case when public.is_waki_admin() then to_jsonb(review_row) else null end);
end $$;
create function public.hotel_affiliation_control(p_hotel uuid,p_action text default 'read',p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select waki_private.hotel_affiliation(p_hotel,p_action,p_data)$$;
revoke all on function waki_private.hotel_affiliation(uuid,text,jsonb),public.hotel_affiliation_control(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function waki_private.hotel_affiliation(uuid,text,jsonb),public.hotel_affiliation_control(uuid,text,jsonb) to authenticated;
create function waki_private.require_affiliation_readiness() returns trigger language plpgsql security definer set search_path='' as $$
declare readiness jsonb;
begin
 if new.approval_status is distinct from old.approval_status and new.approval_status in ('pending_review','approved') then
  if not exists(select 1 from waki_private.hotel_legal_acceptances where hotel_id=new.id and document_version='2026-10-27-hotels-v1') then raise exception 'HOTEL_LEGAL_ACCEPTANCE_REQUIRED';end if;
  if new.approval_status='approved' then
   if not exists(select 1 from waki_private.hotel_affiliation_reviews where hotel_id=new.id and bank_verified and training_verified) then raise exception 'AFFILIATION_REVIEW_REQUIRED';end if;
   readiness:=public.get_hotel_onboarding_status(new.id);
   if not coalesce((readiness->>'is_ready')::boolean,false) or new.latitude is null or new.longitude is null or new.latitude not between -90 and 90 or new.longitude not between -180 and 180
    or not exists(select 1 from public.room_types rt join public.room_units ru on ru.room_type_id=rt.id where rt.hotel_id=new.id and rt.is_active and ru.is_active) then raise exception 'HOTEL_ONBOARDING_INCOMPLETE';end if;
  end if;
 end if;return new;
end $$;
create trigger require_affiliation_readiness before update of approval_status on public.hotels for each row execute function waki_private.require_affiliation_readiness();
revoke all on function waki_private.require_affiliation_readiness() from public,anon,authenticated;
