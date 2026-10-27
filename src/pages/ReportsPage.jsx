import { AdminPage, Feedback } from "../components/admin/AdminUI";
import { useAdminQuery } from "../lib/useAdminQuery";
import { downloadCsv } from "../lib/adminControl";
import { money, todayLima } from "../lib/finance";
const initial = {
  page: 0,
  from: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  to: todayLima(),
};
export default function ReportsPage() {
  const q = useAdminQuery("reports", initial);
  return (
    <AdminPage
      title="Reportes"
      subtitle="Actividad por hotel y ventas conciliadas, con fechas de Lima."
    >
      <Feedback error={q.error} />
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
        <label>
          Desde
          <input type="date" name="from" required defaultValue={initial.from} />
        </label>
        <label>
          Hasta
          <input
            type="date"
            name="to"
            required
            max={todayLima()}
            defaultValue={initial.to}
          />
        </label>
        <button className="control-btn primary">Consultar</button>
      </form>
      {q.loading ? (
        <p>Cargando reporte…</p>
      ) : (
        q.data && (
          <>
            <div className="control-metrics">
              {[
                ["Ventas conciliadas", money(q.data.finance.gross)],
                ["Comisión WAKI", money(q.data.finance.commission)],
                ["Por depositar del período", money(q.data.finance.pending)],
                ["Operaciones de prueba excluidas", q.data.finance.test_count],
              ].map(([l, v]) => (
                <div className="control-metric" key={l}>
                  <span>{l}</span>
                  <strong>{v}</strong>
                </div>
              ))}
            </div>
            <section className="control-card">
              <div className="control-section-head">
                <div>
                  <h2>Actividad por hotel</h2>
                  <p>
                    Reservas creadas en el período. Los conteos operativos
                    incluyen pruebas; los importes financieros las excluyen.
                  </p>
                </div>
                <button
                  className="control-btn"
                  onClick={() =>
                    downloadCsv("waki-actividad-hoteles.csv", [
                      [
                        "Hotel",
                        "Reservas",
                        "Con pago registrado",
                        "Canceladas",
                      ],
                      ...q.data.hotels.map((r) => [
                        r.name,
                        r.reservations,
                        r.paid_count,
                        r.cancelled,
                      ]),
                    ])
                  }
                >
                  Exportar CSV
                </button>
              </div>
              <div className="control-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Hotel</th>
                      <th>Reservas</th>
                      <th>Con pago registrado</th>
                      <th>Canceladas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.hotels.map((r, i) => (
                      <tr key={i}>
                        <td>{r.name}</td>
                        <td>{r.reservations}</td>
                        <td>{r.paid_count}</td>
                        <td>{r.cancelled}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="control-card">
              <h2>Actividad diaria</h2>
              <div className="control-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Día · Lima</th>
                      <th>Reservas</th>
                      <th>Con pago registrado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.daily.map((r) => (
                      <tr key={r.day}>
                        <td>{r.day}</td>
                        <td>{r.reservations}</td>
                        <td>{r.paid_count}</td>
                      </tr>
                    ))}
                    {!q.data.daily.length && (
                      <tr>
                        <td colSpan="3">No hay actividad en este período.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )
      )}
    </AdminPage>
  );
}
