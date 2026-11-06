import { useState } from "react";
import {
  AdminPage,
  Pager,
  Feedback,
} from "../components/admin/AdminUI";
import { useAdminQuery } from "../lib/useAdminQuery";
import { supabase } from "../lib/supabase";
import { Link } from "react-router-dom";
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
  plan_changed: "Actualizó plan comercial",
  subscription_paid: "Cobró mensualidad",
  subscription_waived: "Condonó mensualidad",
};
export default function SettingsPage() {
  const q = useAdminQuery("settings");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
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
      <Feedback error={error || q.error} notice={notice} />
      <section className="control-card">
        <h2>Comisión de WAKI</h2>
        <p>
          La comisión se administra desde el acuerdo comercial del hotel: 8% + S/99 mensuales o 12% sin cuota. Las operaciones históricas mantienen su porcentaje.
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
                    <Link className="control-btn" to={"/hoteles/"+h.id+"/detalle"}>
                      Ver y gestionar plan
                    </Link>
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
    </AdminPage>
  );
}
