import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminPage, AdminDialog, Feedback } from "../components/admin/AdminUI";
import { supabase } from "../lib/supabase";
import {
  money,
  limaDate,
  todayLima,
  financeError,
  statuses,
  exportFinance,
} from "../lib/finance";
import { createFinanceDemo, demoDetail, demoPayout } from "../lib/financeDemo";
import {
  payoutRequest,
  downloadReceipt,
  emailStates,
} from "../lib/payoutClient";
import "./FinancePage.css";
const tabs = [
  ["pending", "Pendientes de pago"],
  ["paid", "Historial de pagos"],
  ["review", "Por revisar"],
  ["all", "Todos"],
];
function Metric({ label, value, hint }) {
  return (
    <article className="control-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </article>
  );
}
export default function FinancePage() {
  const [filter, setFilter] = useState({
      from: "",
      to: "",
      search: "",
      status: "pending",
      page: 0,
    }),
    [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0),
    [selected, setSelected] = useState(null),
    [detail, setDetail] = useState(null),
    [detailError, setDetailError] = useState(""),
    [page, setPage] = useState(0),
    [view, setView] = useState("sales"),
    [action, setAction] = useState(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [mutationError, setMutationError] = useState(""),
    [receipt, setReceipt] = useState(null);
  const [demo, setDemo] = useState(() => {
    try {
      return (
        JSON.parse(sessionStorage.getItem("waki-finance-demo-v1")) ||
        createFinanceDemo()
      );
    } catch {
      return createFinanceDemo();
    }
  });
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: r, error: e } = await supabase.rpc(
        "admin_finance_overview",
        {
          p_from: filter.from || null,
          p_to: filter.to || null,
          p_search: filter.search,
          p_status: filter.status,
          p_page: filter.page,
        },
      );
      if (!cancelled) {
        setData(e ? null : r);
        setError(e ? financeError(e) : "");
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [filter, revision]);
  useEffect(() => {
    if (!selected || selected.hotel_id === "demo-waki") return;
    let cancelled = false;
    async function load() {
      const { data: r, error: e } = await supabase.rpc("admin_finance_detail", {
        p_hotel: selected.hotel_id,
        p_from: filter.from || null,
        p_to: filter.to || null,
        p_page: page,
      });
      if (!cancelled) {
        setDetail(e ? null : r);
        setDetailError(e ? financeError(e) : "");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selected, page, filter.from, filter.to, revision, view]);
  const isDemo = selected?.hotel_id === "demo-waki",
    d = isDemo ? demoDetail(demo, page) : detail;
  const refresh = () => {
    setLoading(true);
    setRevision((v) => v + 1);
  };
  function open(row) {
    setSelected(row);
    setDetail(null);
    setDetailError("");
    setPage(0);
    setView("sales");
    setAction(null);
    setReceipt(null);
    setMutationError("");
  }
  function changeTab(status) {
    setLoading(true);
    setFilter((f) => ({ ...f, status, page: 0 }));
  }
  function apply(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    if (f.from && f.to && f.from > f.to) {
      setError("Revisa el intervalo de fechas.");
      return;
    }
    setLoading(true);
    setFilter((current) => ({ ...current, ...f, page: 0 }));
  }
  async function save(e) {
    e.preventDefault();
    if (busy) return;
    const values = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setMutationError("");
    try {
      if (isDemo) {
        const next = demoPayout(demo, values);
        setDemo(next);
        sessionStorage.setItem("waki-finance-demo-v1", JSON.stringify(next));
        setNotice(
          "Simulación completada. El depósito se agregó al historial de demostración. No se envió dinero ni correo.",
        );
        setView("history");
        setPage(0);
      } else {
        const payload = { ...values, hotel_id: selected.hotel_id };
        if (action.kind === "payout")
          Object.assign(payload, {
            amount: d.quote.amount,
            token: d.quote.token,
            from: filter.from,
            to: filter.to,
          });
        else payload.sale_id = action.sale.id;
        const { data: r, error: e } = await supabase.rpc(
          "admin_finance_action",
          { p_action: action.kind, p_data: payload },
        );
        if (e) throw e;
        if (action.kind === "payout") {
          setNotice("Depósito registrado. Preparando el correo…");
          try {
            const mail = await payoutRequest("send", r.payout_id);
            setNotice(
              "Depósito registrado. " +
                (emailStates[mail.email_status] ||
                  "Revisa el estado del correo en el historial") +
                ".",
            );
          } catch {
            setNotice(
              "Depósito registrado. No se pudo confirmar el envío del correo; revisa el historial antes de reintentar.",
            );
          }
          setView("history");
          setPage(0);
        } else
          setNotice("Cobro conciliado. Ya forma parte del saldo pendiente.");
        setDetail(null);
        refresh();
      }
      setAction(null);
    } catch (err) {
      setMutationError(financeError(err));
    } finally {
      setBusy(false);
    }
  }
  async function pdf(p) {
    setBusy(true);
    setMutationError("");
    try {
      await downloadReceipt(isDemo ? p : p.id);
    } catch {
      setMutationError("No se pudo descargar el PDF. Inténtalo nuevamente.");
    } finally {
      setBusy(false);
    }
  }
  async function showReceipt(p) {
    setBusy(true);
    setMutationError("");
    try {
      if (isDemo) setReceipt(p);
      else {
        const { data: r, error: e } = await supabase.rpc(
          "admin_payout_receipt",
          { p_id: p.id },
        );
        if (e) throw e;
        setReceipt(r);
      }
    } catch {
      setMutationError("No se pudo cargar el detalle del pago.");
    } finally {
      setBusy(false);
    }
  }
  async function resend(p) {
    setBusy(true);
    setMutationError("");
    try {
      const r = await payoutRequest("send", p.id);
      setNotice(emailStates[r.email_status] || "Revisa el estado del correo.");
      setDetail(null);
      refresh();
    } catch {
      setMutationError(
        "No se pudo confirmar el envío. Actualiza el historial.",
      );
    } finally {
      setBusy(false);
    }
  }
  const s = data?.summary;
  const close = () => {
    if (!busy) setSelected(null);
  };
  return (
    <AdminPage
      title="Ventas y liquidaciones"
      subtitle="Revisa qué hoteles faltan pagar y conserva cada depósito en su historial."
      actions={
        <>
          <button className="control-btn" onClick={() => open(demo.hotel)}>
            Ver hotel de demostración
          </button>
          <button
            className="control-btn"
            disabled={loading || busy}
            onClick={refresh}
          >
            Actualizar
          </button>
        </>
      }
    >
      <Feedback error={error} notice={notice} />
      <div className="control-metrics">
        <Metric
          label="Pendiente de depositar"
          value={loading ? "…" : money(s?.pending)}
          hint="Ventas conciliadas aún sin liquidar"
        />
        <Metric
          label="Ya depositado"
          value={loading ? "…" : money(s?.deposited)}
          hint="Historial del período seleccionado"
        />
        <Metric
          label="Comisión WAKI"
          value={loading ? "…" : money(s?.commission)}
          hint="Se respeta la tasa de cada venta"
        />
        <Metric
          label="Hoteles pendientes"
          value={loading ? "…" : (data?.counts?.pending ?? "—")}
          hint="Revisa esta lista al volver mañana"
        />
      </div>
      <section className="control-card">
        <div className="control-section-head">
          <div>
            <h2>Pagos a hoteles</h2>
            <p>
              Las nuevas ventas se suman a lo pendiente. Lo que ya pagaste
              permanece en el historial.
            </p>
          </div>
          <button
            className="control-btn"
            disabled={!data?.rows?.length || loading}
            onClick={() => exportFinance(data.rows)}
          >
            Exportar página
          </button>
        </div>
        <div
          className="payout-tabs"
          role="group"
          aria-label="Estado de liquidación"
        >
          {tabs.map(([id, label]) => (
            <button
              key={id}
              className={filter.status === id ? "active" : ""}
              aria-pressed={filter.status === id}
              onClick={() => changeTab(id)}
            >
              {label}
              <span>{data?.counts?.[id] ?? "—"}</span>
            </button>
          ))}
        </div>
        <form className="control-filters" onSubmit={apply}>
          <input
            name="search"
            placeholder="Buscar hotel o distrito"
            aria-label="Hotel o distrito"
          />
          <label>
            Ventas desde
            <input type="date" name="from" />
          </label>
          <label>
            Hasta
            <input type="date" name="to" />
          </label>
          <button className="control-btn primary">Filtrar</button>
        </form>
        <p className="payout-context">
          {filter.from || filter.to
            ? "Ventas del período seleccionado"
            : "Todo el saldo acumulado, sin límite de fechas"}{" "}
          · PEN · Lima
        </p>
        <div className="control-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Hotel</th>
                <th>Comisión acordada</th>
                <th>Pendiente de pago</th>
                <th>Ya depositado</th>
                <th>Último depósito</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {!loading &&
                data?.rows?.map((h) => (
                  <tr key={h.hotel_id}>
                    <td>
                      <strong>{h.name}</strong>
                      <small>{h.district}</small>
                      {h.review_count + h.held_count > 0 && (
                        <span className="control-badge pending">
                          {h.review_count + h.held_count} por revisar
                        </span>
                      )}
                    </td>
                    <td>
                      {h.commission_rate == null ? (
                        <Link to="/configuracion">Configurar comisión</Link>
                      ) : (
                        <>
                          <strong>{h.commission_rate}%</strong>
                          <small>Se conserva la tasa histórica</small>
                        </>
                      )}
                    </td>
                    <td>
                      <strong className="payout-pending">
                        {money(h.pending)}
                      </strong>
                      <small>{h.pending_count} operaciones pendientes</small>
                    </td>
                    <td>{money(h.deposited)}</td>
                    <td>{limaDate(h.last_paid_on)}</td>
                    <td>
                      <button
                        className={
                          "control-btn " + (h.pending > 0 ? "primary" : "")
                        }
                        onClick={() => open(h)}
                      >
                        {h.pending > 0 ? "Revisar y pagar" : "Ver historial"}
                      </button>
                    </td>
                  </tr>
                ))}
              {(loading || !data?.rows?.length) && (
                <tr>
                  <td colSpan="6" className="payout-empty">
                    {loading
                      ? "Cargando liquidaciones…"
                      : filter.status === "pending"
                        ? "No hay hoteles pendientes de pago con estos filtros."
                        : "No hay hoteles con estos filtros."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="control-pager">
          <span>
            {data?.total || 0} hoteles · Página {filter.page + 1}
          </span>
          <div>
            <button
              className="control-btn"
              disabled={loading || !filter.page}
              onClick={() => {
                setLoading(true);
                setFilter((f) => ({ ...f, page: f.page - 1 }));
              }}
            >
              Anterior
            </button>
            <button
              className="control-btn"
              disabled={loading || (filter.page + 1) * 25 >= (data?.total || 0)}
              onClick={() => {
                setLoading(true);
                setFilter((f) => ({ ...f, page: f.page + 1 }));
              }}
            >
              Siguiente
            </button>
          </div>
        </div>
      </section>
      <p className="payout-context">
        Las pruebas, incidencias y cobros sin conciliar no se pagan. Confirmar
        un depósito registra una transferencia que ya realizaste.
      </p>
      {selected && (
        <AdminDialog title={selected.name} busy={busy} onClose={close}>
          <div className="payout-detail">
            <Feedback error={detailError || mutationError} notice={notice} />
            {isDemo && (
              <div className="payout-demo">
                Hotel de demostración · Movimientos ficticios. Puedes simular el
                depósito y descargar el PDF sin afectar dinero, hoteles ni
                correos reales.
              </div>
            )}
            {!d ? (
              <p>Cargando historial y saldo…</p>
            ) : (
              <>
                <div className="payout-summary">
                  <Metric
                    label={
                      filter.from || filter.to
                        ? "Pendiente del período"
                        : "Pendiente de pago"
                    }
                    value={money(d.quote.amount)}
                    hint={d.quote.count + " operaciones listas para liquidar"}
                  />
                  <Metric
                    label="Total ya depositado"
                    value={money(d.summary.deposited)}
                    hint={
                      d.summary.payout_count + " depósitos · historial completo"
                    }
                  />
                </div>
                <div className="payout-recipient">
                  <span>
                    Comisión:{" "}
                    <strong>
                      {selected.commission_rate == null
                        ? "Sin configurar"
                        : selected.commission_rate + "%"}
                    </strong>{" "}
                    · Cada venta conserva su tasa.
                  </span>
                  <span>
                    Resumen a:{" "}
                    <strong>
                      {d.summary.contact_email ||
                        "Hotel sin correo de contacto"}
                    </strong>
                  </span>
                </div>
                <div
                  className="payout-tabs"
                  role="group"
                  aria-label="Detalle del hotel"
                >
                  <button
                    className={view === "sales" ? "active" : ""}
                    onClick={() => {
                      if (view !== "sales") {
                        setView("sales");
                        setPage(0);
                        setDetail(null);
                        setReceipt(null);
                      }
                    }}
                  >
                    Ventas y saldo
                  </button>
                  <button
                    className={view === "history" ? "active" : ""}
                    onClick={() => {
                      if (view !== "history") {
                        setView("history");
                        setPage(0);
                        setDetail(null);
                      }
                    }}
                  >
                    Historial de pagos <span>{d.summary.payout_count}</span>
                  </button>
                </div>
                {!action && (
                  <div className="payout-paybar">
                    <p>
                      {d.quote.count
                        ? `Puedes agrupar las ${d.quote.count} operaciones pendientes en un depósito.`
                        : "Este hotel no tiene operaciones conciliadas pendientes en el período."}
                    </p>
                    <button
                      className="control-btn primary"
                      disabled={busy || d.quote.amount <= 0}
                      onClick={() => {
                        setAction({ kind: "payout" });
                        setReceipt(null);
                        setMutationError("");
                      }}
                    >
                      {isDemo ? "Simular depósito" : "Confirmar depósito"}
                    </button>
                  </div>
                )}
                {action && (
                  <form className="control-form payout-confirm" onSubmit={save}>
                    <h3>
                      {action.kind === "payout"
                        ? "Confirmar depósito de " + money(d.quote.amount)
                        : "Conciliar cobro"}
                    </h3>
                    {action.kind === "payout" ? (
                      <>
                        <p>
                          Hotel: <strong>{selected.name}</strong>. Confirma solo
                          después de realizar la transferencia. Se guardará el
                          pago y se enviará el resumen PDF a{" "}
                          <strong>
                            {d.summary.contact_email ||
                              "su correo de contacto (debes configurarlo)"}
                          </strong>
                          .
                        </p>
                        <label>
                          Número de operación bancaria
                          <input
                            name="reference"
                            required
                            minLength="3"
                            maxLength="120"
                          />
                        </label>
                        <label>
                          Fecha de depósito
                          <input
                            type="date"
                            name="paid_on"
                            required
                            max={todayLima()}
                            defaultValue={todayLima()}
                          />
                        </label>
                        <label>
                          Notas opcionales
                          <textarea name="notes" maxLength="1000" />
                        </label>
                      </>
                    ) : (
                      <>
                        <p>
                          Verifica el ingreso de{" "}
                          <strong>{money(action.sale.gross)}</strong> a la
                          cuenta de WAKI. Comisión aplicada:{" "}
                          <strong>
                            {action.sale.commission_rate ??
                              selected.commission_rate}
                            %
                          </strong>
                          .
                        </p>
                        <input
                          type="hidden"
                          name="rate"
                          value={
                            action.sale.commission_rate ??
                            selected.commission_rate ??
                            ""
                          }
                        />
                        <label>
                          Referencia del cobro recibido
                          <input
                            name="reference"
                            required
                            minLength="3"
                            maxLength="120"
                          />
                        </label>
                      </>
                    )}
                    <label className="control-check">
                      <input type="checkbox" required />
                      {isDemo
                        ? "Entiendo que es una simulación."
                        : "Revisé el hotel, las operaciones y el importe; confirmo el movimiento realizado."}
                    </label>
                    <div className="control-actions">
                      <button
                        className="control-btn"
                        type="button"
                        disabled={busy}
                        onClick={() => setAction(null)}
                      >
                        Cancelar
                      </button>
                      <button className="control-btn primary" disabled={busy}>
                        {busy
                          ? "Guardando…"
                          : action.kind === "payout"
                            ? "Guardar depósito y enviar resumen"
                            : "Confirmar conciliación"}
                      </button>
                    </div>
                  </form>
                )}
                {view === "sales" ? (
                  <>
                    <h3>Operaciones del período</h3>
                    <div className="control-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Reserva / fecha</th>
                            <th>Bruto</th>
                            <th>Comisión</th>
                            <th>Neto hotel</th>
                            <th>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.rows.map((r) => (
                            <tr key={r.id}>
                              <td>
                                <strong>{r.booking_code}</strong>
                                <small>
                                  {limaDate(r.paid_at)} ·{" "}
                                  {r.source_kind === "extension"
                                    ? "Ampliación"
                                    : "Reserva"}
                                </small>
                              </td>
                              <td>
                                {r.currency} {Number(r.gross).toFixed(2)}
                              </td>
                              <td>
                                {r.commission_rate == null
                                  ? "Por revisar"
                                  : money(r.commission) +
                                    " · " +
                                    r.commission_rate +
                                    "%"}
                              </td>
                              <td>{r.net == null ? "—" : money(r.net)}</td>
                              <td>
                                <span
                                  className={
                                    "control-badge " +
                                    (r.finance_status === "paid"
                                      ? "active"
                                      : "")
                                  }
                                >
                                  {statuses[r.finance_status]}
                                </span>
                                {r.hold_reason && (
                                  <small>{r.hold_reason}</small>
                                )}
                                {r.finance_status === "review" &&
                                  r.currency === "PEN" &&
                                  !r.verified_at && (
                                    <button
                                      className="finance-text-button"
                                      disabled={
                                        busy ||
                                        !!action ||
                                        selected.commission_rate == null
                                      }
                                      onClick={() =>
                                        setAction({
                                          kind: "reconcile",
                                          sale: r,
                                        })
                                      }
                                    >
                                      Conciliar cobro
                                    </button>
                                  )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <>
                    <h3>Historial de depósitos</h3>
                    <p className="payout-context">
                      Cada depósito agrupa las ventas liquidadas en esa fecha.
                      El historial incluye todos los períodos.
                    </p>
                    <div className="control-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Fecha / operación</th>
                            <th>Depositado</th>
                            <th>Resumen por correo</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {d.payouts.map((p) => (
                            <tr key={p.id}>
                              <td>
                                <strong>{limaDate(p.paid_on)}</strong>
                                <small>{p.reference}</small>
                              </td>
                              <td>
                                <strong>{money(p.amount)}</strong>
                              </td>
                              <td>
                                <span className="control-badge">
                                  {emailStates[p.email_status] ||
                                    "Sin envío registrado"}
                                </span>
                                {p.recipient && <small>{p.recipient}</small>}
                                {p.email_status === "unknown" && (
                                  <small>
                                    Verifica el buzón antes de gestionar otro
                                    envío.
                                  </small>
                                )}
                                {!isDemo &&
                                  [
                                    "pending",
                                    "failed",
                                    "unconfigured",
                                    "sending",
                                  ].includes(p.email_status) && (
                                    <button
                                      className="finance-text-button"
                                      disabled={busy}
                                      onClick={() => resend(p)}
                                    >
                                      {p.email_status === "sending"
                                        ? "Consultar envío"
                                        : "Reintentar solo correo"}
                                    </button>
                                  )}
                              </td>
                              <td>
                                <div className="control-actions">
                                  <button
                                    className="control-btn"
                                    disabled={busy}
                                    onClick={() => showReceipt(p)}
                                  >
                                    Ver resumen
                                  </button>
                                  <button
                                    className="control-btn"
                                    disabled={busy}
                                    onClick={() => pdf(p)}
                                  >
                                    PDF
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {!d.payouts.length && (
                            <tr>
                              <td colSpan="4">
                                Aún no hay depósitos registrados.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    {receipt && (
                      <section className="payout-receipt">
                        <div className="control-section-head">
                          <div>
                            <h3>Resumen · {receipt.reference}</h3>
                            <p>
                              Depositado:{" "}
                              <strong>{money(receipt.amount)}</strong> ·
                              Comisión WAKI: {money(receipt.commission)}
                            </p>
                          </div>
                          <button
                            className="control-btn"
                            onClick={() => setReceipt(null)}
                          >
                            Cerrar resumen
                          </button>
                        </div>
                        <div className="control-table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>Reserva</th>
                                <th>Bruto</th>
                                <th>Comisión</th>
                                <th>Neto</th>
                              </tr>
                            </thead>
                            <tbody>
                              {receipt.items.map((r) => (
                                <tr key={r.id}>
                                  <td>{r.booking_code}</td>
                                  <td>{money(r.gross)}</td>
                                  <td>
                                    {money(r.commission)} · {r.rate}%
                                  </td>
                                  <td>{money(r.net)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </section>
                    )}
                  </>
                )}
                <div className="control-pager">
                  <span>
                    Página {page + 1} ·{" "}
                    {view === "sales"
                      ? d.total + " operaciones"
                      : d.summary.payout_count + " depósitos"}
                  </span>
                  <div>
                    <button
                      className="control-btn"
                      disabled={busy || !!action || !page}
                      onClick={() => {
                        setDetail(null);
                        setReceipt(null);
                        setPage((p) => p - 1);
                      }}
                    >
                      Anterior
                    </button>
                    <button
                      className="control-btn"
                      disabled={
                        busy ||
                        !!action ||
                        (page + 1) * (view === "sales" ? 50 : 25) >=
                          (view === "sales" ? d.total : d.summary.payout_count)
                      }
                      onClick={() => {
                        setDetail(null);
                        setReceipt(null);
                        setPage((p) => p + 1);
                      }}
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </AdminDialog>
      )}
    </AdminPage>
  );
}
