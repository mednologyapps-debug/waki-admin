export const money = (value) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(
    Number(value || 0),
  );
export const limaDate = (value) =>
  value
    ? new Intl.DateTimeFormat("es-PE", {
        timeZone: "America/Lima",
        dateStyle: "medium",
      }).format(new Date(value.length === 10 ? value + "T12:00:00Z" : value))
    : "—";
export const todayLima = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const statuses = {
  pending: "Por depositar",
  paid: "Depositado",
  review: "Por conciliar",
  test: "Prueba",
  held: "En revisión",
};
export function financeError(error) {
  const code = Object.keys(errors).find((key) => error?.message?.includes(key));
  return (
    errors[code] || "No pudimos completar la operación. Inténtalo nuevamente."
  );
}
const errors = {
  NOT_AUTHORIZED:
    "Solo los administradores globales activos pueden acceder a finanzas.",
  BALANCE_CHANGED:
    "El saldo cambió. Actualiza el detalle y revisa el nuevo importe antes de registrar el depósito.",
  DUPLICATE_REFERENCE: "Esta referencia ya fue registrada para el hotel.",
  NO_PENDING_SALES: "No hay ventas pendientes de depositar en este periodo.",
  SALE_NOT_RECONCILABLE:
    "Esta venta ya cambió de estado o requiere una revisión especial.",
  INVALID_RATE:
    "La comisión debe estar entre 0 y 100, con un máximo de dos decimales.",
  INVALID_RECONCILIATION: "Revisa la comisión y la referencia del cobro.",
  INVALID_PAYOUT: "Revisa la referencia, la fecha y las notas del depósito.",
  INVALID_DATES: "La fecha inicial debe ser anterior o igual a la final.",
};
export function exportFinance(rows) {
  const escape = (value) =>
    '"' +
    String(value ?? "")
      .replace(/^[-=+@]/, "'" + "$&")
      .replaceAll('"', '""') +
    '"';
  const content = [
    [
      "Hotel",
      "Distrito",
      "Ventas conciliadas",
      "Cobrado PEN",
      "Comisión WAKI PEN",
      "Depositado PEN",
      "Pendiente PEN",
      "Por conciliar",
      "Pruebas",
      "En revisión",
    ],
    ...rows.map((r) => [
      r.name,
      r.district,
      r.sales_count,
      r.gross,
      r.commission,
      r.deposited,
      r.pending,
      r.review_count,
      r.test_count,
      r.held_count,
    ]),
  ]
    .map((row) => row.map(escape).join(";"))
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "waki-liquidaciones-pagina.csv";
  link.click();
  URL.revokeObjectURL(url);
}
