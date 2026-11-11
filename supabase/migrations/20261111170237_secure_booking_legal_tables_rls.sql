-- Expose neither legal checkout table directly to browser roles.
-- The application uses the authenticated SECURITY DEFINER RPCs for these operations.
alter table waki_private.booking_legal_acceptances enable row level security;
alter table waki_private.legal_checkout_policy enable row level security;

revoke all on table waki_private.booking_legal_acceptances from anon, authenticated, public;
revoke all on table waki_private.legal_checkout_policy from anon, authenticated, public;
