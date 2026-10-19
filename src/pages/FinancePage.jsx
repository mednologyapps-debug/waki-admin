import { useEffect, useRef, useState } from "react";
import AdminSidebar from "../components/admin/AdminSidebar";
import { supabase } from "../lib/supabase";
import {
  exportFinance,
  financeError,
  limaDate,
  money,
  statuses,
  todayLima,
} from "../lib/finance";
import "./FinancePage.css";

function Dialog({ title, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`finance-dialog ${wide ? "finance-wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="finance-dialog-title"
    >
      <header>
        <div>
          <span className="finance-eyebrow">WAKI · FINANZAS</span>
          <h2 id="finance-dialog-title">{title}</h2>
        </div>
        <button
          type="button"
          className="finance-close"
          onClick={onClose}
          aria-label="Cerrar"
        >
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}

export default function FinancePage() {
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    search: "",
    status: "all",
    page: 0,
  });
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [settings, setSettings] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailPage, setDetailPage] = useState(0);
  const [detailError, setDetailError] = useState("");
  const [action, setAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [mutationError, setMutationError] = useState("");
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: result, error: err } = await supabase.rpc(
        "admin_finance_overview",
        {
          p_from: filters.from || null,
          p_to: filters.to || null,
          p_search: filters.search,
          p_status: filters.status,
          p_page: filters.page,
        },
      );
      if (cancelled) return;
      setData(err ? null : result);
      setError(err ? financeError(err) : "");
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [filters, revision]);
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    async function load() {
      const { data: result, error: err } = await supabase.rpc(
        "admin_finance_detail",
        {
          p_hotel: selected.hotel_id,
          p_from: filters.from || null,
          p_to: filters.to || null,
          p_page: detailPage,
        },
      );
      if (cancelled) return;
      setDetail(err ? null : result);
      setDetailError(err ? financeError(err) : "");
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selected, detailPage, filters.from, filters.to, revision]);
  function apply(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    if (f.from && f.to && f.from > f.to) {
      setError("La fecha inicial no puede ser posterior a la final.");
      return;
    }
    setLoading(true);
    setFilters({ ...f, page: 0 });
  }
  function refresh() {
    setLoading(true);
    setRevision((v) => v + 1);
  }
  function openHotel(row) {
    setSelected(row);
    setDetail(null);
    setDetailPage(0);
    setDetailError("");
    setAction(null);
    setMutationError("");
  }
  async function save(e, kind) {
    e.preventDefault();
    if (busy) return;
    const values = Object.fromEntries(new FormData(e.currentTarget));
    const hotel = settings || selected;
    const payload = { ...values, hotel_id: hotel.hotel_id };
    if (kind === "reconcile") payload.sale_id = action.sale.id;
    if (kind === "payout")
      Object.assign(payload, {
        token: detail.quote.token,
        amount: detail.quote.amount,
        from: filters.from,
        to: filters.to,
      });
    setBusy(true);
    setMutationError("");
    try {
      const { error: err } = await supabase.rpc("admin_finance_action", {
        p_action: kind,
        p_data: payload,
      });
      if (err) throw err;
      setNotice(
        kind === "commission"
          ? "Comisión guardada para futuros cobros."
          : kind === "payout"
            ? "Depósito registrado. Las ventas incluidas ya no están pendientes."
            : "Cobro conciliado y agregado al saldo del hotel.",
      );
      setAction(null);
      setSettings(null);
      setDetail(null);
      refresh();
    } catch (err) {
      setMutationError(financeError(err));
    } finally {
      setBusy(false);
    }
  }
  const summary = data?.summary;
  const closeDetail = () => {
    if (!busy) {
      setSelected(null);
      setAction(null);
    }
  };
  return (
    <div className="hotel-setup-layout">
      <AdminSidebar />
      <main className="finance-main">
        <header className="finance-header">
          <div>
            <span className="finance-eyebrow">CONTROL DE INGRESOS</span>
            <h1>Ventas y liquidaciones</h1>
            <p>Todo lo que WAKI cobra. Todo lo que tu hotel debe recibir.</p>
          </div>
          <button
            className="finance-button"
            onClick={refresh}
            disabled={loading || busy}
          >
            Actualizar
          </button>
        </header>
        {notice && (
          <div className="finance-notice" role="status">
            {notice}
            <button onClick={() => setNotice("")} aria-label="Ocultar mensaje">
              ×
            </button>
          </div>
        )}
        <section className="finance-stats" aria-label="Resumen del periodo">
          {[
            [
              "Cobrado y conciliado",
              summary?.gross,
              "Ventas verificadas, sin pruebas",
            ],
            [
              "Comisión WAKI",
              summary?.commission,
              "Comisión histórica por operación",
            ],
            [
              "Ya depositado",
              summary?.deposited,
              "De las ventas de este periodo",
            ],
            [
              "Pendiente a hoteles",
              summary?.pending,
              "Saldo listo para liquidar",
            ],
          ].map(([label, value, hint], i) => (
            <article className={i === 3 ? "finance-highlight" : ""} key={label}>
              <span>{label}</span>
              <strong>
                {loading ? "…" : value == null ? "—" : money(value)}
              </strong>
              <small>{hint}</small>
            </article>
          ))}
        </section>
        <section className="finance-panel">
          <div className="finance-panel-heading">
            <div>
              <h2>Liquidaciones por hotel</h2>
              <p>
                Cobrado − comisión WAKI − depósitos registrados = pendiente.
              </p>
            </div>
            <button
              className="finance-button"
              disabled={loading || !data?.rows?.length}
              onClick={() => exportFinance(data.rows)}
            >
              Exportar página CSV
            </button>
          </div>
          <form className="finance-filters" onSubmit={apply}>
            <label className="finance-search">
              Buscar hotel
              <input
                name="search"
                placeholder="Nombre o distrito"
                maxLength={100}
              />
            </label>
            <label>
              Desde
              <input type="date" name="from" />
            </label>
            <label>
              Hasta
              <input type="date" name="to" />
            </label>
            <label>
              Mostrar
              <select name="status">
                <option value="all">Todos los hoteles</option>
                <option value="pending">Con saldo pendiente</option>
                <option value="review">Por conciliar / revisar</option>
                <option value="paid">Con depósitos</option>
                <option value="test">Con pruebas</option>
              </select>
            </label>
            <button
              className="finance-button finance-primary"
              disabled={loading}
            >
              Aplicar filtros
            </button>
          </form>
          <p className="finance-context">
            {filters.from || filters.to
              ? `Cobros del ${filters.from ? limaDate(filters.from) : "inicio"} al ${filters.to ? limaDate(filters.to) : "día de hoy"}`
              : "Todos los cobros · saldo histórico acumulado"}{" "}
            · Hora de Lima · PEN
          </p>
          {error ? (
            <div role="alert" className="finance-error">
              {error}
              <button className="finance-button" onClick={refresh}>
                Reintentar
              </button>
            </div>
          ) : loading ? (
            <div className="finance-empty" role="status">
              Cargando liquidaciones…
            </div>
          ) : (
            <>
              <div className="finance-table-wrap">
                <table className="finance-table">
                  <thead>
                    <tr>
                      <th>Hotel</th>
                      <th>Ventas</th>
                      <th>Cobrado</th>
                      <th>Comisión WAKI</th>
                      <th>Depositado</th>
                      <th>Por depositar</th>
                      <th>
                        <span className="finance-sr">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.rows?.map((row) => (
                      <tr key={row.hotel_id}>
                        <td>
                          <strong>{row.name}</strong>
                          <small>{row.district || "Sin distrito"}</small>
                          <div className="finance-flags">
                            {row.review_count > 0 && (
                              <span>{row.review_count} por conciliar</span>
                            )}
                            {row.held_count > 0 && (
                              <span className="finance-held">
                                {row.held_count} en revisión
                              </span>
                            )}
                            {row.test_count > 0 && (
                              <span className="finance-test">
                                {row.test_count} pruebas
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          {row.sales_count}
                          <small>conciliadas</small>
                        </td>
                        <td>{money(row.gross)}</td>
                        <td>
                          {money(row.commission)}
                          <small>
                            {row.min_rate == null
                              ? "Sin ventas conciliadas"
                              : row.min_rate === row.max_rate
                                ? `${row.min_rate}% aplicado`
                                : "Varias tasas aplicadas"}
                          </small>
                          <button
                            className="finance-text-button"
                            onClick={() => {
                              setSettings(row);
                              setMutationError("");
                            }}
                          >
                            {row.commission_rate == null
                              ? "Configurar comisión"
                              : `Futuros cobros: ${row.commission_rate}%`}
                          </button>
                        </td>
                        <td>{money(row.deposited)}</td>
                        <td className="finance-amount">{money(row.pending)}</td>
                        <td>
                          <button
                            className="finance-button"
                            onClick={() => openHotel(row)}
                          >
                            Ver detalle
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data?.rows?.length && (
                <div className="finance-empty">
                  <h3>No hay hoteles con estos filtros</h3>
                  <p>Cambia el periodo o el estado para ampliar tu búsqueda.</p>
                </div>
              )}
              <div className="finance-pagination">
                <span>
                  {data?.total || 0} hoteles · Página {filters.page + 1}
                </span>
                <div>
                  <button
                    className="finance-button"
                    disabled={filters.page === 0}
                    onClick={() => {
                      setLoading(true);
                      setFilters((f) => ({ ...f, page: f.page - 1 }));
                    }}
                  >
                    Anterior
                  </button>
                  <button
                    className="finance-button"
                    disabled={(filters.page + 1) * 25 >= (data?.total || 0)}
                    onClick={() => {
                      setLoading(true);
                      setFilters((f) => ({ ...f, page: f.page + 1 }));
                    }}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
        <p className="finance-footnote">
          Los pagos de prueba y los cobros por conciliar no suman al saldo
          disponible. Las reservas canceladas o con incidencias quedan en
          revisión. Las ampliaciones se registran como operaciones separadas.
        </p>
        {settings && (
          <Dialog
            title={`Comisión · ${settings.name}`}
            onClose={() => {
              if (!busy) setSettings(null);
            }}
          >
            <form
              className="finance-form"
              onSubmit={(e) => save(e, "commission")}
            >
              <p>
                Se aplicará a los próximos cobros. Las comisiones de ventas
                anteriores conservarán su porcentaje.
              </p>
              <label>
                Comisión WAKI (%)
                <select
                  name="rate"
                  required
                  defaultValue={settings.commission_rate ?? ""}
                >
                  <option value="" disabled>
                    Selecciona una comisión
                  </option>
                  <option value="4">4%</option>
                  <option value="8">8%</option>
                </select>
              </label>
              <small>
                Ejemplo: con 8%, por cada S/ 100 WAKI recibe S/ 8 y el hotel S/
                92.
              </small>
              {mutationError && (
                <p className="finance-error" role="alert">
                  {mutationError}
                </p>
              )}
              <button
                className="finance-button finance-primary"
                disabled={busy}
              >
                {busy ? "Guardando…" : "Guardar comisión"}
              </button>
            </form>
          </Dialog>
        )}
        {selected && (
          <Dialog wide title={selected.name} onClose={closeDetail}>
            <p className="finance-context">
              Mismo periodo de la tabla · Fechas de cobro en Lima
            </p>
            {detailError ? (
              <p className="finance-error" role="alert">
                {detailError}
              </p>
            ) : !detail ? (
              <div className="finance-empty" role="status">
                Cargando operaciones…
              </div>
            ) : (
              <>
                <div className="finance-balance">
                  <div>
                    <span>Listo para depositar</span>
                    <strong>{money(detail.quote.amount)}</strong>
                    <small>{detail.quote.count} operaciones conciliadas</small>
                  </div>
                  <button
                    className="finance-button finance-primary"
                    disabled={
                      busy || Number(detail.quote.amount) <= 0 || !!action
                    }
                    onClick={() => {
                      setAction({ kind: "payout" });
                      setMutationError("");
                    }}
                  >
                    Registrar depósito
                  </button>
                </div>
                {action && (
                  <form
                    className="finance-form finance-action"
                    onSubmit={(e) => save(e, action.kind)}
                  >
                    <h3>
                      {action.kind === "payout"
                        ? "Registrar depósito realizado"
                        : "Conciliar cobro recibido"}
                    </h3>
                    {action.kind === "payout" ? (
                      <>
                        <p>
                          Registra una transferencia que ya realizaste a este
                          hotel por{" "}
                          <strong>{money(detail.quote.amount)}</strong>. Esto no
                          envía dinero desde WAKI.
                        </p>
                        <label>
                          Referencia de la transferencia
                          <input
                            name="reference"
                            required
                            minLength={3}
                            maxLength={120}
                            placeholder="Número de operación bancaria"
                          />
                        </label>
                        <label>
                          Fecha del depósito
                          <input
                            name="paid_on"
                            type="date"
                            required
                            max={todayLima()}
                            defaultValue={todayLima()}
                          />
                        </label>
                        <label>
                          Notas (opcional)
                          <textarea name="notes" maxLength={1000} rows={2} />
                        </label>
                        <label className="finance-check">
                          <input type="checkbox" required />
                          Confirmo que el hotel recibió este importe y revisé
                          las operaciones incluidas.
                        </label>
                      </>
                    ) : (
                      <>
                        <p>
                          Confirma que WAKI recibió{" "}
                          <strong>{money(action.sale.gross)}</strong> en su
                          cuenta principal. Verifica el movimiento antes de
                          continuar.
                        </p>
                        <label>
                          Comisión aplicada (%)
                          <select
                            name="rate"
                            required
                            defaultValue={action.sale.commission_rate ?? ""}
                          >
                            <option value="" disabled>
                              Selecciona una comisión
                            </option>
                            {action.sale.commission_rate != null ? (
                              <option value={action.sale.commission_rate}>
                                {action.sale.commission_rate}% · tasa histórica
                              </option>
                            ) : (
                              <>
                                <option value="4">4%</option>
                                <option value="8">8%</option>
                              </>
                            )}
                          </select>
                        </label>
                        <label>
                          Referencia del cobro verificado
                          <input
                            name="reference"
                            required
                            minLength={3}
                            maxLength={120}
                          />
                        </label>
                        <label className="finance-check">
                          <input type="checkbox" required />
                          Verifiqué el ingreso real y la comisión acordada con
                          el hotel.
                        </label>
                      </>
                    )}
                    {mutationError && (
                      <p className="finance-error" role="alert">
                        {mutationError}
                      </p>
                    )}
                    <div className="finance-inline-actions">
                      <button
                        type="button"
                        className="finance-button"
                        disabled={busy}
                        onClick={() => setAction(null)}
                      >
                        Cancelar
                      </button>
                      <button
                        className="finance-button finance-primary"
                        disabled={busy}
                      >
                        {busy
                          ? "Guardando…"
                          : action.kind === "payout"
                            ? "Confirmar registro del depósito"
                            : "Confirmar conciliación"}
                      </button>
                    </div>
                  </form>
                )}
                <h3>Detalle de operaciones</h3>
                <div className="finance-table-wrap">
                  <table className="finance-table">
                    <thead>
                      <tr>
                        <th>Reserva / cobro</th>
                        <th>Importe</th>
                        <th>Comisión</th>
                        <th>Neto hotel</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.rows.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <strong>{s.booking_code}</strong>
                            <small>
                              {s.source_kind === "extension"
                                ? "Ampliación"
                                : "Reserva"}{" "}
                              · {limaDate(s.paid_at)}
                            </small>
                            <small>
                              {s.provider || "Pasarela no registrada"}
                            </small>
                          </td>
                          <td>
                            {s.currency === "PEN"
                              ? money(s.gross)
                              : `${s.currency} ${s.gross}`}
                          </td>
                          <td>
                            {s.commission_rate == null
                              ? "Por definir"
                              : `${s.currency === "PEN" ? money(s.commission) : s.currency + " " + s.commission} (${s.commission_rate}%)`}
                          </td>
                          <td>
                            {s.net == null
                              ? "—"
                              : s.currency === "PEN"
                                ? money(s.net)
                                : `${s.currency} ${s.net}`}
                          </td>
                          <td>
                            <span
                              className={`finance-status finance-${s.finance_status}`}
                            >
                              {statuses[s.finance_status]}
                            </span>
                            {s.hold_reason && <small>{s.hold_reason}</small>}
                            {s.payout_id && (
                              <small>Depósito: {s.payout_id.slice(0, 8)}</small>
                            )}
                            {s.finance_status === "review" &&
                              s.currency === "PEN" &&
                              !s.verified_at && (
                                <button
                                  className="finance-text-button"
                                  disabled={busy || !!action}
                                  onClick={() => {
                                    setAction({ kind: "reconcile", sale: s });
                                    setMutationError("");
                                  }}
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
                {detail.rows.length === 0 && (
                  <p className="finance-empty">Sin cobros en este periodo.</p>
                )}
                <div className="finance-pagination">
                  <span>
                    {detail.total} operaciones · Página {detailPage + 1}
                  </span>
                  <div>
                    <button
                      className="finance-button"
                      disabled={busy || !!action || detailPage === 0}
                      onClick={() => {
                        setDetail(null);
                        setDetailPage((p) => p - 1);
                      }}
                    >
                      Anterior
                    </button>
                    <button
                      className="finance-button"
                      disabled={
                        busy ||
                        !!action ||
                        (detailPage + 1) * 50 >= detail.total
                      }
                      onClick={() => {
                        setDetail(null);
                        setDetailPage((p) => p + 1);
                      }}
                    >
                      Siguiente
                    </button>
                  </div>
                </div>
                <h3>Últimos depósitos del hotel</h3>
                {detail.payouts.length ? (
                  <div className="finance-table-wrap">
                    <table className="finance-table">
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Referencia</th>
                          <th>Importe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.payouts.map((p) => (
                          <tr key={p.id}>
                            <td>
                              {limaDate(p.paid_on)}
                              <small>{p.id.slice(0, 8)}</small>
                            </td>
                            <td>
                              {p.reference}
                              {p.notes && <small>{p.notes}</small>}
                            </td>
                            <td>{money(p.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="finance-empty">
                    Aún no hay depósitos registrados.
                  </p>
                )}
              </>
            )}
          </Dialog>
        )}
      </main>
    </div>
  );
}
