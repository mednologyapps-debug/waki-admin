import { useState } from "react";
import {
  AdminPage,
  AdminDialog,
  Pager,
  Feedback,
} from "../components/admin/AdminUI";
import { useAdminQuery } from "../lib/useAdminQuery";
import { supabase } from "../lib/supabase";
import { financeError } from "../lib/finance";
const labels = {
  send_activation: "Solicitó enlace de acceso",
  create_user: "Creó usuario",
  update_user: "Actualizó usuario",
  approve_user: "Aprobó usuario",
  reject_user: "Rechazó usuario",
  reservation: "Cambió reserva",
  commission: "Cambió comisión",
  reconcile: "Concilió cobro",
  payout: "Registró depósito",
};
export default function SettingsPage() {
  const q = useAdminQuery("settings"),
    [hotel, setHotel] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function commission(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const f = Object.fromEntries(new FormData(e.currentTarget));
      const { error: err } = await supabase.rpc("admin_finance_action", {
        p_action: "commission",
        p_data: { hotel_id: hotel.id, rate: Number(f.rate) },
      });
      if (err) throw err;
      setNotice(
        "Comisión actualizada para nuevas ventas. Las ventas anteriores conservan su comisión.",
      );
      setHotel(null);
      q.refresh();
    } catch (err) {
      setError(financeError(err));
    } finally {
      setBusy(false);
    }
  }
  async function password(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = Object.fromEntries(new FormData(e.currentTarget));
    if (f.password !== f.confirm) {
      setError("Las contraseñas no coinciden.");
      setBusy(false);
      return;
    }
    const form = e.currentTarget;
    try {
      const { error: err } = await supabase.auth.updateUser({
        password: f.password,
      });
      if (err) throw err;
      setNotice("Tu contraseña se actualizó.");
      form.reset();
    } catch {
      setError(
        "No se pudo actualizar la contraseña. Inicia sesión nuevamente e inténtalo.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AdminPage
      title="Configuración"
      subtitle="Comisiones por hotel, seguridad de tu cuenta y registro de cambios."
    >
      <Feedback error={!hotel ? error || q.error : q.error} notice={notice} />
      <section className="control-card">
        <h2>Comisión de WAKI</h2>
        <p>
          Solo 4% u 8%. Cada venta conserva la comisión que tenía al
          registrarse.
        </p>
        <div className="control-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Hotel</th>
                <th>Comisión</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.data?.commissions?.map((h) => (
                <tr key={h.id}>
                  <td>{h.name}</td>
                  <td>
                    {h.commission_rate == null
                      ? "Sin configurar"
                      : h.commission_rate + "%"}
                  </td>
                  <td>
                    <button
                      className="control-btn"
                      onClick={() => {
                        setError("");
                        setHotel(h);
                      }}
                    >
                      Configurar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="control-card">
        <h2>Cambiar mi contraseña</h2>
        <form className="control-form control-password" onSubmit={password}>
          <label>
            Nueva contraseña
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength="12"
              maxLength="128"
              required
            />
          </label>
          <label>
            Repetir contraseña
            <input
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength="12"
              required
            />
          </label>
          <button className="control-btn primary" disabled={busy}>
            Actualizar contraseña
          </button>
        </form>
      </section>
      <section className="control-card">
        <h2>Auditoría</h2>
        <p>Cambios de cuentas, reservas, comisiones y liquidaciones.</p>
        <div className="control-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha · Lima</th>
                <th>Administrador</th>
                <th>Acción</th>
                <th>Motivo / detalle</th>
              </tr>
            </thead>
            <tbody>
              {q.data?.rows?.map((r, i) => (
                <tr key={i}>
                  <td>
                    {new Date(r.created_at).toLocaleString("es-PE", {
                      timeZone: "America/Lima",
                    })}
                  </td>
                  <td>{r.actor_name || "Administrador"}</td>
                  <td>{labels[r.action] || r.action}</td>
                  <td>
                    {r.reason}
                    <small>Registro: {r.target_id}</small>
                  </td>
                </tr>
              ))}
              {!q.loading && !q.data?.rows?.length && (
                <tr>
                  <td colSpan="4">Aún no hay cambios registrados.</td>
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
      {hotel && (
        <AdminDialog
          title={"Comisión · " + hotel.name}
          onClose={() => setHotel(null)}
          busy={busy}
        >
          <form onSubmit={commission} className="control-form">
            <Feedback error={error} />
            <p>
              Actual:{" "}
              {hotel.commission_rate == null
                ? "Sin configurar"
                : hotel.commission_rate + "%"}
              . El cambio aplica a nuevas ventas.
            </p>
            <label>
              Nueva comisión
              <select
                name="rate"
                required
                defaultValue={hotel.commission_rate || ""}
              >
                <option value="" disabled>
                  Seleccionar
                </option>
                <option value="4">4%</option>
                <option value="8">8%</option>
              </select>
            </label>
            <label className="control-check">
              <input type="checkbox" required /> Revisé el hotel y la comisión.
            </label>
            <button className="control-btn primary" disabled={busy}>
              Confirmar comisión
            </button>
          </form>
        </AdminDialog>
      )}
    </AdminPage>
  );
}
