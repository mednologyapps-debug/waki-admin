import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create schema waki_private;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.profiles(id uuid primary key,role text,account_status text);
create function public.is_waki_admin() returns boolean language sql as $$select exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','super_admin') and account_status='active')$$;
create table public.hotels(id uuid primary key,name text,district text);
create table public.reservations(id uuid primary key,hotel_id uuid references public.hotels,booking_code text,total_amount numeric,currency text,status text,payment_status text,paid_at timestamptz,created_at timestamptz default now(),payment_provider text);
create table public.reservation_extensions(id uuid primary key,reservation_id uuid references public.reservations,amount numeric,currency text,status text,paid_at timestamptz,created_at timestamptz default now(),payment_provider text);
insert into profiles values('00000000-0000-0000-0000-000000000001','super_admin','active');
insert into hotels values('00000000-0000-0000-0000-000000000010','Hotel 1','Lima'),('00000000-0000-0000-0000-000000000020','Hotel 2','Lima');`);
await db.exec(
  await fs.readFile(
    new URL(
      "../supabase/migrations/20261019161140_hotel_settlements.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await assert.rejects(
  db.query("select public.admin_finance_overview()"),
  /NOT_AUTHORIZED/,
);
await db.exec(
  `set request.jwt.claim.sub='00000000-0000-0000-0000-000000000001'`,
);
const h1 = "00000000-0000-0000-0000-000000000010",
  h2 = "00000000-0000-0000-0000-000000000020";
const action = async (a, d) =>
  (
    await db.query("select public.admin_finance_action($1,$2) data", [
      a,
      JSON.stringify(d),
    ])
  ).rows[0].data;
await action("commission", { hotel_id: h1, rate: 8 });
await action("commission", { hotel_id: h2, rate: 4 });
async function sale(h, amount, provider = "izipay_online") {
  return (
    await db.query(
      `insert into reservations values(gen_random_uuid(),$1,'WAKI-TEST',$2,'PEN','completed','paid',now(),now(),$3) returning id`,
      [h, amount, provider],
    )
  ).rows[0].id;
}
for (let i = 0; i < 5; i++) await sale(h1, 60);
for (let i = 0; i < 10; i++) await sale(h2, 100);
await sale(h1, 999, "izipay_online_test");
let sales = (
  await db.query("select * from waki_private.hotel_sales where not is_test")
).rows;
for (const s of sales)
  await action("reconcile", {
    hotel_id: s.hotel_id,
    sale_id: s.id,
    reference: "Cobro verificado",
  });
const overview = async () =>
  (await db.query("select public.admin_finance_overview() data")).rows[0].data;
let o = await overview();
let a = o.rows.find((x) => x.hotel_id === h1),
  b = o.rows.find((x) => x.hotel_id === h2);
assert.equal(a.pending, 276);
assert.equal(a.commission, 24);
assert.equal(a.sales_count, 5);
assert.equal(a.test_count, 1);
assert.equal(b.pending, 960);
assert.equal(b.commission, 40);
await action("commission", { hotel_id: h1, rate: 4 });
assert.equal(
  (await overview()).rows.find((x) => x.hotel_id === h1).pending,
  276,
);
const detail = async (h) =>
  (await db.query("select public.admin_finance_detail($1) data", [h])).rows[0]
    .data;
let d = await detail(h1);
const payout = {
  hotel_id: h1,
  reference: "DEP-001",
  paid_on: new Date().toISOString().slice(0, 10),
  amount: d.quote.amount,
  token: d.quote.token,
};
await assert.rejects(
  action("payout", { ...payout, amount: 1 }),
  /BALANCE_CHANGED/,
);
await action("payout", payout);
await assert.rejects(action("payout", payout), /DUPLICATE_REFERENCE/);
a = (await overview()).rows.find((x) => x.hotel_id === h1);
assert.equal(a.pending, 0);
assert.equal(a.deposited, 276);
// Extension is separate; reservation total already includes it.
const base = await sale(h1, 100);
await db.query("update reservations set total_amount=150 where id=$1", [base]);
await db.query(
  `insert into reservation_extensions values(gen_random_uuid(),$1,50,'PEN','paid',now(),now(),'izipay_online')`,
  [base],
);
assert.equal(
  Number(
    (
      await db.query(
        "select sum(gross) gross from waki_private.hotel_sales where reservation_id=$1",
        [base],
      )
    ).rows[0].gross,
  ),
  150,
);
await db.query(`update reservations set status='cancelled' where id=$1`, [
  base,
]);
assert.equal(
  (
    await db.query(
      "select count(*)::int count from waki_private.hotel_sales_status where reservation_id=$1 and finance_status='held'",
      [base],
    )
  ).rows[0].count,
  2,
);
// Historical missing rate requires explicit approved percentage; tests cannot be reconciled.
const test = (
  await db.query(
    "select id from waki_private.hotel_sales where is_test limit 1",
  )
).rows[0].id;
await assert.rejects(
  action("reconcile", { hotel_id: h1, sale_id: test, reference: "Not real" }),
  /SALE_NOT_RECONCILABLE/,
);
// Two admins reading the same quote cannot liquidate it twice; new sales invalidate stale quotes.
const d2 = await detail(h2);
const additional = await sale(h2, 10.01);
const added = (
  await db.query("select id from waki_private.hotel_sales where source_id=$1", [
    additional,
  ])
).rows[0].id;
await action("reconcile", {
  hotel_id: h2,
  sale_id: added,
  reference: "Cobro adicional",
});
await assert.rejects(
  action("payout", {
    hotel_id: h2,
    reference: "STALE",
    paid_on: new Date().toISOString().slice(0, 10),
    amount: d2.quote.amount,
    token: d2.quote.token,
  }),
  /BALANCE_CHANGED/,
);
const addedRow = (
  await db.query(
    "select commission,net from waki_private.hotel_sales where id=$1",
    [added],
  )
).rows[0];
assert.equal(addedRow.commission, "0.40");
assert.equal(addedRow.net, "9.61");
await assert.rejects(
  action("commission", { hotel_id: h1, rate: -1 }),
  /INVALID_RATE/,
);
await assert.rejects(
  action("commission", { hotel_id: h1, rate: 101 }),
  /INVALID_RATE/,
);
await assert.rejects(
  action("commission", { hotel_id: h1, rate: 4.123 }),
  /INVALID_RATE/,
);
await db.exec(
  `insert into profiles values('00000000-0000-0000-0000-000000000002','user','active');set request.jwt.claim.sub='00000000-0000-0000-0000-000000000002'`,
);
await assert.rejects(
  db.query("select public.admin_finance_overview()"),
  /NOT_AUTHORIZED/,
);
await assert.rejects(
  action("commission", { hotel_id: h1, rate: 1 }),
  /NOT_AUTHORIZED/,
);
// Check actual SQL role grants, not just the business guard.
await db.exec("set role authenticated");
await assert.rejects(
  db.query("select * from waki_private.hotel_sales"),
  /permission denied/,
);
await db.exec("reset role;set role anon");
await assert.rejects(
  db.query("select public.admin_finance_overview()"),
  /permission denied/,
);
await db.exec("reset role");
await db.exec(`set request.jwt.claim.sub=''`);
await assert.rejects(
  action("commission", { hotel_id: h1, rate: 1 }),
  /NOT_AUTHORIZED/,
);
console.log(
  "PASS: 300/8%=276; 1000/4%=960; frozen rates; test exclusion; tampered totals; duplicate deposits; extensions counted once; cancelled sales held; authorization.",
);
await db.close();
