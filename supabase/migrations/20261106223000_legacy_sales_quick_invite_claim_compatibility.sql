CREATE OR REPLACE FUNCTION public.claim_sales_hotel_invite(target_invite_token uuid, target_legal_name text, target_ruc text, target_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  current_case public.sales_hotel_onboarding_cases;
  place_row public.sales_places;
  auth_email text;
  clean_legal_name text;
  clean_ruc text;
  clean_phone text;
  new_brand_id uuid;
  new_hotel_id uuid;
  new_slug text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Backwards compatibility for invitations already sent to Ventas:
  -- the old UI calls this RPC even for a new quick-hotel token.
  -- Delegate to the strongly validated quick-claim procedure so token
  -- ownership and confirmed email checks remain unchanged.
  if exists (
    select 1 from waki_private.quick_hotel_invitations q
    where q.invite_token = target_invite_token
  ) then
    return public.claim_quick_hotel_invitation(
      target_invite_token, target_legal_name, target_ruc, target_phone
    );
  end if;

  clean_legal_name := nullif(trim(coalesce(target_legal_name, '')), '');
  clean_ruc := regexp_replace(coalesce(target_ruc, ''), '[^0-9]', '', 'g');
  clean_phone := nullif(trim(coalesce(target_phone, '')), '');

  if clean_legal_name is null then
    raise exception 'LEGAL_NAME_REQUIRED';
  end if;

  if length(clean_ruc) <> 11 then
    raise exception 'VALID_RUC_REQUIRED';
  end if;

  if clean_phone is null then
    raise exception 'PHONE_REQUIRED';
  end if;

  select lower(u.email)
  into auth_email
  from auth.users u
  where u.id = auth.uid();

  select *
  into current_case
  from public.sales_hotel_onboarding_cases oc
  where oc.invite_token = target_invite_token
  for update;

  if current_case.id is null then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  if current_case.status = 'claimed' then
    if current_case.claimed_by = auth.uid() then
      select p.converted_hotel_id
      into new_hotel_id
      from public.sales_places p
      where p.id = current_case.place_id;

      return jsonb_build_object(
        'status', 'claimed',
        'hotel_id', new_hotel_id
      );
    end if;

    raise exception 'INVITE_ALREADY_CLAIMED';
  end if;

  if current_case.status not in ('started', 'invited') then
    raise exception 'INVITE_NOT_AVAILABLE';
  end if;

  if current_case.invite_expires_at <= now() then
    raise exception 'INVITE_EXPIRED';
  end if;

  if auth_email is null
     or auth_email <> lower(current_case.contact_email) then
    raise exception 'INVITE_EMAIL_MISMATCH';
  end if;

  if exists (
    select 1
    from public.hotel_brands hb
    where hb.ruc = clean_ruc
  ) then
    raise exception 'RUC_ALREADY_REGISTERED';
  end if;

  select *
  into place_row
  from public.sales_places p
  where p.id = current_case.place_id
  for update;

  if place_row.id is null then
    raise exception 'PLACE_NOT_FOUND';
  end if;

  if place_row.converted_hotel_id is not null then
    raise exception 'PLACE_ALREADY_CONVERTED';
  end if;

  insert into public.hotel_brands (
    commercial_name,
    legal_name,
    ruc,
    billing_email,
    contact_email,
    phone,
    website_url,
    approval_status
  )
  values (
    place_row.name,
    clean_legal_name,
    clean_ruc,
    current_case.contact_email,
    current_case.contact_email,
    clean_phone,
    place_row.website,
    'draft'
  )
  returning id into new_brand_id;

  new_slug :=
    trim(
      both '-' from
      regexp_replace(
        lower(coalesce(place_row.name, 'hotel')),
        '[^a-z0-9]+',
        '-',
        'g'
      )
    )
    || '-'
    || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into public.hotels (
    brand_id,
    name,
    slug,
    address,
    district,
    province,
    department,
    country_code,
    latitude,
    longitude,
    phone,
    contact_email,
    whatsapp,
    approval_status,
    is_active
  )
  values (
    new_brand_id,
    place_row.name,
    new_slug,
    coalesce(nullif(trim(place_row.address), ''), 'Dirección por completar'),
    coalesce(nullif(trim(place_row.district), ''), 'Lima'),
    coalesce(nullif(trim(place_row.province), ''), 'Lima'),
    coalesce(nullif(trim(place_row.department), ''), 'Lima'),
    'PE',
    place_row.latitude,
    place_row.longitude,
    clean_phone,
    current_case.contact_email,
    clean_phone,
    'draft',
    false
  )
  returning id into new_hotel_id;

  insert into public.hotel_staff (
    hotel_id,
    user_id,
    staff_role,
    is_active
  )
  values (
    new_hotel_id,
    auth.uid(),
    'admin',
    true
  );

  update public.sales_hotel_onboarding_cases
  set
    status = 'claimed',
    claimed_by = auth.uid(),
    claimed_at = now(),
    updated_at = now()
  where id = current_case.id;

  update public.sales_places
  set
    commercial_status = 'onboarding_started',
    converted_hotel_id = new_hotel_id,
    assigned_to = null,
    assignment_expires_at = null,
    updated_at = now()
  where id = place_row.id;

  update public.profiles
  set
    full_name = coalesce(
      nullif(trim(full_name), ''),
      current_case.contact_name
    ),
    phone = coalesce(
      nullif(trim(phone), ''),
      current_case.contact_phone,
      clean_phone
    ),
    role = 'hotel',
    updated_at = now()
  where id = auth.uid();

  return jsonb_build_object(
    'status', 'claimed',
    'hotel_id', new_hotel_id,
    'brand_id', new_brand_id
  );
end;
$function$
