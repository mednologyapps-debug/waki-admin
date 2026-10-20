import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
const pen = (v) => "S/ " + Number(v || 0).toFixed(2);
const clean = (v) =>
  String(v ?? "")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, " ")
    .replace(/[\r\n]/g, " ");
const day = (v) =>
  v
    ? new Date(
        String(v).length === 10 ? v + "T12:00:00Z" : v,
      ).toLocaleDateString("es-PE", { timeZone: "America/Lima" })
    : "—";
export async function payoutPdf(receipt) {
  const doc = await PDFDocument.create(),
    regular = await doc.embedFont(StandardFonts.Helvetica),
    bold = await doc.embedFont(StandardFonts.HelveticaBold),
    purple = rgb(0.44, 0.2, 0.86),
    muted = rgb(0.48, 0.44, 0.55);
  let page, y;
  const text = (
    value,
    x,
    yy,
    size = 10,
    font = regular,
    color = rgb(0.18, 0.14, 0.24),
    max = 510,
  ) => {
    let s = clean(value);
    while (font.widthOfTextAtSize(s, size) > max && s.length)
      s = s.slice(0, -1);
    page.drawText(s, { x, y: yy, size, font, color });
  };
  const start = () => {
    page = doc.addPage([595.28, 841.89]);
    page.drawRectangle({ x: 0, y: 755, width: 596, height: 87, color: purple });
    text("WAKI", 40, 791, 28, bold, rgb(1, 1, 1));
    text("Resumen de liquidación", 40, 766, 11, regular, rgb(1, 1, 1));
    y = 725;
  };
  const columns = () => {
    for (const [v, x] of [
      ["Reserva / fecha", 40],
      ["Bruto", 265],
      ["Tasa", 340],
      ["Comisión", 390],
      ["Neto hotel", 480],
    ])
      text(v, x, y, 9, bold, muted);
    y -= 22;
  };
  start();
  if (receipt.demo) {
    text(
      "DEMOSTRACIÓN - Sin transferencia ni validez bancaria",
      40,
      y,
      10,
      bold,
      purple,
    );
    y -= 24;
  }
  text(receipt.hotel_name, 40, y, 19, bold);
  y -= 27;
  text(
    "Liquidación " + String(receipt.id).slice(0, 8).toUpperCase(),
    40,
    y,
    10,
    bold,
  );
  y -= 20;
  text(
    "Depósito: " +
      day(receipt.paid_on) +
      "  |  Operación: " +
      receipt.reference,
    40,
    y,
  );
  y -= 20;
  text(
    "Período de ventas: " +
      day(receipt.period_from) +
      " al " +
      day(receipt.period_to),
    40,
    y,
  );
  y -= 29;
  page.drawRectangle({
    x: 40,
    y: y - 64,
    width: 515,
    height: 82,
    color: rgb(0.96, 0.94, 0.99),
  });
  text("Ventas incluidas", 54, y - 4, 9, regular, muted);
  text(pen(receipt.gross), 54, y - 26, 17, bold);
  text("Comisión WAKI", 225, y - 4, 9, regular, muted);
  text(pen(receipt.commission), 225, y - 26, 17, bold);
  text("Depositado al hotel", 402, y - 4, 9, regular, muted);
  text(pen(receipt.amount), 402, y - 26, 17, bold, purple);
  y -= 101;
  columns();
  for (const item of receipt.items || []) {
    if (y < 100) {
      start();
      columns();
    }
    text(item.booking_code, 40, y, 10, bold, undefined, 210);
    text(pen(item.gross), 265, y, 9);
    text(item.rate + "%", 340, y, 9);
    text(pen(item.commission), 390, y, 9);
    text(pen(item.net), 480, y, 9, bold);
    y -= 15;
    text(
      day(item.paid_at) +
        " · " +
        (item.source_kind === "extension" ? "Ampliación" : "Reserva"),
      40,
      y,
      8,
      regular,
      muted,
    );
    y -= 22;
    page.drawLine({
      start: { x: 40, y: y + 9 },
      end: { x: 555, y: y + 9 },
      thickness: 0.5,
      color: rgb(0.91, 0.89, 0.94),
    });
  }
  if (y < 160) start();
  y -= 15;
  text("Total depositado: " + pen(receipt.amount), 40, y, 14, bold, purple);
  y -= 24;
  text(
    "Cada operación conserva su comisión histórica.",
    40,
    y,
    9,
    regular,
    muted,
  );
  y -= 18;
  text(
    "Resumen administrativo. No reemplaza el comprobante del banco ni una factura.",
    40,
    y,
    8,
    regular,
    muted,
  );
  const pages = doc.getPages();
  for (let i = 0; i < pages.length; i++) {
    page = pages[i];
    text("WAKI · Liquidaciones de hoteles", 40, 35, 8, regular, muted);
    text(i + 1 + " / " + pages.length, 510, 35, 8, regular, muted);
  }
  return doc.save();
}
export function payoutHtml(r) {
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  return `<div style="background:#f6f3fb;padding:30px;font-family:Arial,sans-serif;color:#30213e"><div style="max-width:580px;margin:auto;background:white;border-radius:20px;overflow:hidden"><div style="background:#7137db;color:white;padding:28px;font-size:30px;font-weight:bold">WAKI</div><div style="padding:30px"><h1 style="font-size:24px">Tu liquidación está lista</h1><p>Hola, equipo de ${esc(r.hotel_name)}.</p><p>Registramos el depósito del ${esc(day(r.paid_on))} por:</p><p style="font-size:34px;font-weight:bold;color:#7137db">${pen(r.amount)}</p><p>Operación: <strong>${esc(r.reference)}</strong></p><p>Ventas: ${pen(r.gross)}<br>Comisión WAKI: ${pen(r.commission)}<br>Operaciones incluidas: ${r.items.length}</p><p>Adjuntamos el PDF con el detalle de las reservas, comisiones y total depositado.</p><p style="color:#85778f;font-size:12px">Conserva este resumen junto al comprobante de tu banco. Si necesitas ayuda, escríbenos a hola@wakipe.com.</p></div></div></div>`;
}
