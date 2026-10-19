import { useState } from "react";
import {
  AdminPage,
  AdminDialog,
  Pager,
  Feedback,
} from "../components/admin/AdminUI";
import { useAdminQuery } from "../lib/useAdminQuery";
import {
  reservations,
  payments,
  adminAction,
  controlError,
} from "../lib/adminControl";
const date = (v) =>
  v
    ? new Date(v).toLocaleString("es-PE", {
        timeZone: "America/Lima",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";
export default function ReservationsPage() {
  const q = useAdminQuery("reservations"),
    [row, setRow] = useState(null),
    [openedAt, setOpenedAt] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await adminAction("reservation", {
        ...Object.fromEntries(new FormData(e.currentTarget)),
        id: row.id,
        updated_at: row.updated_at,
      });
      setNotice("Estado actualizado. El cambio quedó registrado en auditoría.");
      setRow(null);
      q.refresh();
    } catch (err) {
      setError(controlError(err));
    } finally {
      setBusy(false);
    }
  }
  const transitions = row
    ? [
        ...(row.status === "confirmed" &&
        row.payment_status === "paid" &&
        row.access_verified_at &&
        row.documents_verified_at &&
        openedAt < new Date(row.end_at)
          ? ["checked_in"]
          : []),
        ...(row.status === "checked_in" ? ["completed"] : []),
        ...(row.status === "confirmed" && openedAt >= new Date(row.end_at)
          ? ["no_show"]
          : []),
        ...(["confirmed", "pending_payment"].includes(row.status)
          ? ["cancelled"]
          : []),
      ]
    : [];
  return (
    <AdminPage
      title="Reservas"
      subtitle="Consulta cada hotel y supervisa las estadías con cambios de estado controlados."
    >
      <Feedback error={q.error} notice={notice} />
      <form
        className="control-filters"
        onSubmit={(e) => {
          e.preventDefault();
          q.apply({
            ...Object.fromEntries(new FormData(e.currentTarget)),
            page: 0,
          });
        }}
      >
        <input
          name="search"
          placeholder="Código o huésped"
          aria-label="Código o huésped"
        />
        <select name="hotel_id" aria-label="Hotel">
          <option value="">Todos los hoteles</option>
          {q.data?.hotels?.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
        <select name="status" aria-label="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(reservations).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select name="payment" aria-label="Pago">
          <option value="">Todos los pagos</option>
          {Object.entries(payments).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <label>
          Desde
          <input type="date" name="from" />
        </label>
        <label>
          Hasta
          <input type="date" name="to" />
        </label>
        <button className="control-btn primary">Filtrar</button>
      </form>
      <section className="control-card">
        <div className="control-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reserva / hotel</th>
                <th>Huésped</th>
                <th>Ingreso · Lima</th>
                <th>Estado</th>
                <th>Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!q.loading &&
                q.data?.rows?.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.booking_code}</strong>
                      <small>{r.hotel_name}</small>
                    </td>
                    <td>
                      {r.guest_name || "—"}
                      <small>{r.room_name}</small>
                    </td>
                    <td>
                      {date(r.start_at)}
                      <small>Salida: {date(r.end_at)}</small>
                    </td>
                    <td>
                      <span className="control-badge">
                        {reservations[r.status]}
                      </span>
                      <small>{payments[r.payment_status]}</small>
                    </td>
                    <td>
                      {r.currency} {Number(r.total_amount).toFixed(2)}
                    </td>
                    <td>
                      <button
                        className="control-btn"
                        onClick={() => {
                          setError("");
                          setOpenedAt(Date.now());
                          setRow(r);
                        }}
                      >
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              {(q.loading || !q.data?.rows?.length) && (
                <tr>
                  <td colSpan="6">
                    {q.loading
                      ? "Cargando reservas…"
                      : "No hay reservas con estos filtros."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pager
          page={q.filter.page}
          total={q.data?.total || 0}
          onPage={(page) => q.apply({ ...q.filter, page })}
        />
      </section>
      {row && (
        <AdminDialog
          title={"Reserva " + row.booking_code}
          onClose={() => setRow(null)}
          busy={busy}
        >
          <dl className="control-details">
            {[
              ["Hotel", row.hotel_name],
              ["Habitación", row.room_name],
              ["Huésped", row.guest_name],
              ["Correo", row.guest_email],
              ["Teléfono", row.guest_phone],
              ["Ingreso", date(row.start_at)],
              ["Salida", date(row.end_at)],
              ["Estado", reservations[row.status]],
              ["Pago", payments[row.payment_status]],
              ["Proveedor", row.payment_provider],
              ["Referencia", row.payment_reference],
              ["QR verificado", date(row.access_verified_at)],
              ["Documentos verificados", date(row.documents_verified_at)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v || "—"}</dd>
              </div>
            ))}
          </dl>
          <p className="control-hint">
            Para registrar el ingreso se requiere pago, QR y documentos
            verificados. Una cancelación no ejecuta un reembolso: debe revisarse
            por separado con la pasarela y en Liquidaciones.
          </p>
          {transitions.length > 0 && (
            <form className="control-form" onSubmit={save}>
              <Feedback error={error} />
              <label>
                Nuevo estado
                <select name="status" required defaultValue="">
                  <option value="" disabled>
                    Seleccionar acción
                  </option>
                  {transitions.map((v) => (
                    <option key={v} value={v}>
                      {reservations[v]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Motivo
                <textarea
                  name="reason"
                  required
                  minLength="5"
                  maxLength="500"
                />
              </label>
              <label className="control-check">
                <input type="checkbox" required /> Revisé la reserva y las
                consecuencias del cambio.
              </label>
              <button className="control-btn primary" disabled={busy}>
                {busy ? "Guardando…" : "Confirmar cambio"}
              </button>
            </form>
          )}
        </AdminDialog>
      )}
    </AdminPage>
  );
}
