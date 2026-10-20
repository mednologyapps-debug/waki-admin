import { Link } from "react-router-dom";
import { AdminPage, Feedback } from "../components/admin/AdminUI";
import { useAdminQuery } from "../lib/useAdminQuery";
import { money } from "../lib/finance";
export default function DashboardPage() {
  const q = useAdminQuery("overview");
  const d = q.data || {};
  return (
    <AdminPage
      title="Todo WAKI, en un lugar"
      subtitle="Tu resumen para revisar accesos, operaciones y pagos pendientes."
      actions={
        <button className="control-btn" onClick={q.refresh}>
          Actualizar
        </button>
      }
    >
      <Feedback error={q.error} />
      <div className="control-metrics">
        {[
          ["Hoteles", d.hotels, "/hoteles"],
          ["Usuarios por aprobar", d.pending_users, "/usuarios"],
          ["Reservas este mes", d.reservations, "/reservas"],
          [
            "Por depositar",
            d.pending_payout === undefined ? "—" : money(d.pending_payout),
            "/finanzas",
          ],
        ].map(([l, v, url]) => (
          <Link className="control-metric" key={l} to={url}>
            <span>{l}</span>
            <strong>{q.loading ? "…" : (v ?? "—")}</strong>
            <small>Ver detalle</small>
          </Link>
        ))}
      </div>
      <section className="control-card control-welcome">
        <div>
          <h2>Tu próxima revisión</h2>
          <p>
            {d.pending_users || 0} cuentas pendientes de aprobación y{" "}
            {d.pending_hotels || 0} hoteles en revisión.
          </p>
          <p>
            Hay {d.active_reservations || 0} reservas confirmadas o en estadía.
            El saldo pendiente incluye únicamente ventas conciliadas.
          </p>
        </div>
        <div className="control-actions">
          <Link className="control-btn primary" to="/usuarios">
            Revisar usuarios
          </Link>
          <Link className="control-btn" to="/hoteles">
            Gestionar hoteles
          </Link>
          <Link className="control-btn" to="/reservas">
            Ver reservas
          </Link>
        </div>
      </section>
      <div className="control-grid">
        <section className="control-card">
          <h2>Operación</h2>
          <p>
            Busca reservas por hotel, verifica pagos y revisa cada cambio de
            estado.
          </p>
          <Link to="/reservas">Abrir reservas</Link>
        </section>
        <section className="control-card">
          <h2>Finanzas con control</h2>
          <p>
            Configura comisiones de 4% u 8%, concilia cobros y registra
            depósitos sin duplicarlos.
          </p>
          <Link to="/finanzas">Abrir liquidaciones</Link>
        </section>
        <section className="control-card">
          <h2>Accesos y auditoría</h2>
          <p>
            Los cambios sensibles requieren confirmación y motivo. Consulta
            quién los realizó.
          </p>
          <Link to="/configuracion">Ver configuración</Link>
        </section>
      </div>
    </AdminPage>
  );
}
