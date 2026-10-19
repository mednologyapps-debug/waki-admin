process.on("uncaughtException", (error) => {
  console.error(error.message);
  process.exit(1);
});
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema waki_private;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,last_sign_in_at timestamptz,is_anonymous boolean default false);
create table profiles(id uuid primary key,full_name text,phone text,role text default 'user',account_status text default 'active',created_at timestamptz default now(),updated_at timestamptz default now());
create function public.is_waki_admin() returns boolean language sql as $$select exists(select 1 from public.profiles where id=auth.uid() and role in('admin','super_admin') and account_status='active')$$;
create table hotels(id uuid primary key,name text,district text,approval_status text);
create table hotel_staff(id uuid default gen_random_uuid() primary key,hotel_id uuid references hotels,user_id uuid references profiles,staff_role text,is_active boolean default true,created_at timestamptz default now(),updated_at timestamptz default now(),unique(hotel_id,user_id));
create table room_types(id uuid primary key,name text);
create table reservations(id uuid primary key default gen_random_uuid(),hotel_id uuid references hotels,booking_code text,total_amount numeric,currency text,status text,payment_status text,paid_at timestamptz,created_at timestamptz default now(),payment_provider text,guest_name text,guest_email text,guest_phone text,room_type_id uuid,start_at timestamptz,end_at timestamptz,payment_reference text,updated_at timestamptz default now(),documents_verified_at timestamptz,access_verified_at timestamptz,checked_in_at timestamptz,completed_at timestamptz,cancelled_at timestamptz);
create table reservation_extensions(id uuid primary key,reservation_id uuid references reservations,amount numeric,currency text,status text,paid_at timestamptz,created_at timestamptz default now(),payment_provider text);`);
for (const name of [
  "20261019161140_hotel_settlements.sql",
  "20261019163022_admin_control_center.sql",
])
  await db.exec(
    await fs.readFile(
      new URL("../supabase/migrations/" + name, import.meta.url),
      "utf8",
    ),
  );
const id = (n) => "00000000-0000-0000-0000-" + String(n).padStart(12, "0"),
  superId = id(1),
  adminId = id(2),
  userId = id(3),
  hotelId = id(10);
for (const [n, role] of [
  [1, "super_admin"],
  [2, "admin"],
  [3, "user"],
  [4, "user"],
]) {
  await db.query("insert into profiles(id,full_name,role)values($1,$2,$3)", [
    id(n),
    "Persona " + n,
    role,
  ]);
  await db.query("insert into auth.users(id,email)values($1,$2)", [
    id(n),
    "persona" + n + "@example.test",
  ]);
}
await db.query("insert into hotels values($1,$2,$3,$4)", [
  hotelId,
  "Hotel prueba",
  "Lima",
  "pending_review",
]);
const read = async (mode, filter = {}) =>
  (
    await db.query("select public.admin_control_read($1,$2) data", [
      mode,
      JSON.stringify(filter),
    ])
  ).rows[0].data;
await assert.rejects(read("users"), /NOT_AUTHORIZED/);
await db.exec(
  `set request.jwt.claim.sub='${superId}';set request.jwt.claim.role='authenticated'`,
);
for (const mode of ["users", "reservations", "overview", "reports", "settings"])
  assert.ok(await read(mode));
assert.equal((await read("users")).total, 4);
await assert.rejects(
  read("reports", { from: "2020-01-01", to: "2026-01-01" }),
  /INVALID_DATES/,
);
const finance = async (rate) =>
  db.query("select public.admin_finance_action($1,$2)", [
    "commission",
    JSON.stringify({ hotel_id: hotelId, rate }),
  ]);
for (const rate of [0, 5, 7.99, 100, -1])
  await assert.rejects(finance(rate), /INVALID_RATE/);
await finance(4);
await finance(8);
assert.equal((await read("settings")).commissions[0].commission_rate, 8);
const stamp = async (who) =>
  (await db.query("select updated_at from profiles where id=$1", [who])).rows[0]
    .updated_at;
const action = async (actor, name, data) =>
  (
    await db.query("select public.admin_control_action($1,$2,$3) data", [
      actor,
      name,
      JSON.stringify({ reason: "Prueba de protección", ...data }),
    ])
  ).rows[0].data;
await assert.rejects(
  action(superId, "update_user", {
    id: userId,
    updated_at: await stamp(userId),
    account_status: "suspended",
  }),
  /NOT_AUTHORIZED/,
);
await db.exec("set request.jwt.claim.role='service_role'");
await assert.rejects(
  action(superId, "update_user", {
    id: superId,
    updated_at: await stamp(superId),
    account_status: "blocked",
  }),
  /SELF_CHANGE_FORBIDDEN/,
);
await assert.rejects(
  action(adminId, "update_user", {
    id: userId,
    updated_at: await stamp(userId),
    role: "super_admin",
  }),
  /SUPER_ADMIN_REQUIRED/,
);
await assert.rejects(
  action(superId, "update_user", { id: userId, updated_at: "2000-01-01" }),
  /RECORD_CHANGED/,
);
await assert.rejects(
  action(superId, "update_user", {
    id: userId,
    updated_at: await stamp(userId),
    role: "owner",
  }),
  /INVALID_SELECTION/,
);
await action(superId, "create_user", {
  id: userId,
  full_name: "Hotel colaborador",
  role: "hotel",
  hotel_id: hotelId,
  staff_role: "reception",
});
assert.equal((await read("users", { status: "pending" })).total, 1);
assert.equal(
  (
    await db.query("select is_active from hotel_staff where user_id=$1", [
      userId,
    ])
  ).rows[0].is_active,
  false,
);
await assert.rejects(
  action(superId, "update_user", {
    id: userId,
    updated_at: await stamp(userId),
    account_status: "active",
  }),
  /APPROVAL_REQUIRED/,
);
await action(superId, "approve_user", {
  id: userId,
  updated_at: await stamp(userId),
  hotel_id: hotelId,
  staff_role: "reception",
});
assert.equal(
  (
    await db.query("select is_active from hotel_staff where user_id=$1", [
      userId,
    ])
  ).rows[0].is_active,
  true,
);
await assert.rejects(
  action(superId, "approve_user", {
    id: userId,
    updated_at: await stamp(userId),
  }),
  /NOT_PENDING/,
);
await action(superId, "update_user", {
  id: userId,
  updated_at: await stamp(userId),
  account_status: "suspended",
  hotel_id: hotelId,
  staff_role: "reception",
});
assert.equal(
  (
    await db.query("select is_active from hotel_staff where user_id=$1", [
      userId,
    ])
  ).rows[0].is_active,
  false,
);
await assert.rejects(
  action(userId, "update_user", { id: id(4), updated_at: await stamp(id(4)) }),
  /NOT_AUTHORIZED/,
);
await action(superId, "create_user", { id: id(4), role: "user" });
await action(superId, "reject_user", {
  id: id(4),
  updated_at: await stamp(id(4)),
});
assert.equal(
  (await db.query("select account_status from profiles where id=$1", [id(4)]))
    .rows[0].account_status,
  "blocked",
);
const r = (
  await db.query(
    `insert into reservations(hotel_id,booking_code,status,payment_status,total_amount,currency,start_at,end_at)values($1,'WAKI-1','confirmed','paid',100,'PEN',now()-interval '1 hour',now()+interval '1 hour')returning id,updated_at`,
    [hotelId],
  )
).rows[0];
assert.equal((await read("reservations", { hotel_id: hotelId })).total, 1);
assert.equal((await read("reservations", { hotel_id: id(99) })).total, 0);
await assert.rejects(
  action(superId, "reservation", { ...r, status: "checked_in" }),
  /CHECKIN_NOT_READY/,
);
await assert.rejects(
  action(superId, "reservation", { ...r, status: "completed" }),
  /INVALID_TRANSITION/,
);
await assert.rejects(
  action(superId, "reservation", { ...r, status: "no_show" }),
  /INVALID_TRANSITION/,
);
await db.query(
  "update reservations set documents_verified_at=now(),access_verified_at=now() where id=$1",
  [r.id],
);
await action(superId, "reservation", { ...r, status: "checked_in" });
await assert.rejects(
  action(superId, "reservation", { ...r, status: "cancelled" }),
  /RECORD_CHANGED/,
);
r.updated_at = (
  await db.query("select updated_at from reservations where id=$1", [r.id])
).rows[0].updated_at;
await action(superId, "reservation", { ...r, status: "completed" });
assert.ok((await read("settings")).total >= 8);
assert.ok((await read("reports")).hotels.length);
// SQL role grants are a separate boundary from session claims.
assert.equal(
  (
    await db.query(
      "select has_function_privilege('authenticated','public.admin_control_action(uuid,text,jsonb)','execute') allowed",
    )
  ).rows[0].allowed,
  false,
);
assert.equal(
  (
    await db.query(
      "select has_function_privilege('anon','public.admin_control_read(text,jsonb)','execute') allowed",
    )
  ).rows[0].allowed,
  false,
);
await db.close();
console.log(
  "Admin: consultas, filtros, comisión 4/8, permisos, aprobaciones, asignaciones, concurrencia y estados de reservas verificados.",
);
