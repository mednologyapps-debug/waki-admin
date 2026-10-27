export function createFinanceDemo() {
  const hotel = {
    hotel_id: "demo-waki",
    name: "WAKI Casa Miraflores · DEMO",
    district: "Miraflores",
    commission_rate: 8,
  };
  const sales = [];
  const payouts = [];
  let k = 0;
  const items = (count, gross, date, payout) =>
    Array.from({ length: count }, () => {
      const rate = 8,
        commission = Math.round(gross * rate) / 100;
      const s = {
        id: "demo-sale-" + ++k,
        booking_code: "WAKI-DEMO-" + String(k).padStart(3, "0"),
        source_kind: "reservation",
        gross,
        commission_rate: rate,
        commission,
        net: gross - commission,
        paid_at: date + "T16:00:00Z",
        currency: "PEN",
        provider: "Demostración",
        finance_status: payout ? "paid" : "pending",
        payout_id: payout || null,
      };
      sales.push(s);
      return { ...s, rate };
    });
  for (const [id, count, gross, date] of [
    ["demo-pay-001", 5, 60, "2026-10-14"],
    ["demo-pay-002", 4, 80, "2026-10-17"],
  ]) {
    const rows = items(count, gross, date, id);
    payouts.push({
      id,
      hotel_name: hotel.name,
      recipient: "hotel@example.test",
      amount: rows.reduce((n, s) => n + s.net, 0),
      gross: rows.reduce((n, s) => n + s.gross, 0),
      commission: rows.reduce((n, s) => n + s.commission, 0),
      reference: "DEMO-OPERACION-" + date,
      paid_on: date,
      created_at: date + "T20:00:00Z",
      period_from: rows[0].paid_at,
      period_to: rows.at(-1).paid_at,
      items: rows,
      demo: true,
      email_status: "demo",
    });
  }
  items(6, 75, "2026-10-19");
  return { hotel, sales, payouts };
}
export function demoDetail(d, page = 0) {
  const rows = d.sales.filter((s) => s.finance_status === "pending");
  return {
    rows: d.sales
      .slice()
      .reverse()
      .slice(page * 50, page * 50 + 50),
    total: d.sales.length,
    quote: {
      amount: Math.round(rows.reduce((n, s) => n + s.net, 0) * 100) / 100,
      count: rows.length,
      token: "demo",
    },
    summary: {
      deposited: d.payouts.reduce((n, p) => n + p.amount, 0),
      payout_count: d.payouts.length,
      contact_email: "hotel@example.test",
    },
    payouts: d.payouts
      .slice()
      .reverse()
      .slice(page * 25, page * 25 + 25),
  };
}
export function demoPayout(d, values) {
  const rows = d.sales.filter((s) => s.finance_status === "pending"),
    id = "demo-pay-" + Date.now();
  if (!rows.length) throw new Error("NO_PENDING_SALES");
  const receipt = {
    ...values,
    id,
    hotel_name: d.hotel.name,
    recipient: "hotel@example.test",
    amount: Math.round(rows.reduce((n, s) => n + s.net, 0) * 100) / 100,
    gross: rows.reduce((n, s) => n + s.gross, 0),
    commission: rows.reduce((n, s) => n + s.commission, 0),
    items: rows.map((s) => ({ ...s, rate: s.commission_rate })),
    period_from: rows[0].paid_at,
    period_to: rows.at(-1).paid_at,
    demo: true,
    email_status: "demo",
  };
  return {
    ...d,
    sales: d.sales.map((s) =>
      rows.includes(s) ? { ...s, finance_status: "paid", payout_id: id } : s,
    ),
    payouts: [...d.payouts, receipt],
  };
}
