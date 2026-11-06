import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Download, RefreshCw, Search } from "lucide-react";
import { AdminDialog, AdminPage, Feedback } from "../components/admin/AdminUI";
import HotelPlanEditor from "../components/admin/HotelPlanEditor";
import { supabase } from "../lib/supabase";
import { money, limaDate } from "../lib/finance";
import { downloadCsv } from "../lib/adminControl";
import { planTitle } from "../lib/commercialPlans";
import "../components/admin/CommercialFinance.css";

export function CutoffReminder({short=false}){
 const [data,setData]=useState(null);
 const [error,setError]=useState(false);
 useEffect(()=>{let active=true;(async()=>{
   const {data:r,error:e}=await supabase.rpc('admin_settlement_cutoff');
   if(active){setData(e?null:r);setError(Boolean(e));}
 })();return()=>{active=false;};},[]);
 if(error||!data)return null;
 const summary=data.summary||{};
 const due=data.is_cutoff_today||Number(summary.hotel_net)>0||Number(summary.subscription_due)>0||Number(summary.hotels_unbilled)>0;
 return <section className={'waki-cutoff-banner '+(due?'is-due':'')}>
   <div>
     <h2>{due?'Revisión de corte y cobros pendiente':'Próximo control financiero'}</h2>
     <p>{data.is_cutoff_today?'Hoy corresponde revisar el corte de WAKI. ':'Último corte disponible: '+limaDate(data.cutoff_date)+'. '}
       {summary.hotels_due||0} hotel(es) con saldo conciliado por liquidar ·
       {money(summary.hotel_net)} para hoteles ·
       {money(summary.subscription_due)} de mensualidades por cobrar.
       {Number(summary.hotels_unbilled)>0?' Hay ciclos mensuales por generar.':''}
     </p>
   </div>
   <Link to="/cortes" className="control-btn primary">{short?'Abrir cortes':'Revisar montos y hoteles'}</Link>
 </section>;
}


function hotelStatus(hotel) {
  if (Number(hotel.issues) > 0) return { label: "Revisar ventas", tone: "warning" };
  if (Number(hotel.hotel_net) > 0 && !hotel.bank_ready)
    return { label: "Verificar cuenta", tone: "warning" };
  if (!hotel.plan_code) return { label: "Sin plan", tone: "muted" };
  if (hotel.needs_invoice) return { label: "Generar cuota", tone: "warning" };
  if (Number(hotel.subscription_due) > 0)
    return { label: "Cuota pendiente", tone: "warning" };
  if (Number(hotel.hotel_net) > 0) return { label: "Por liquidar", tone: "accent" };
  return { label: "Al día", tone: "ok" };
}

function needsAction(hotel) {
  return Number(hotel.hotel_net) > 0 ||
    Number(hotel.subscription_due) > 0 ||
    Number(hotel.issues) > 0 ||
    hotel.needs_invoice ||
    !hotel.plan_code;
}

export default function SettlementCutoffsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const { data: result, error: requestError } = await supabase.rpc("admin_settlement_cutoff");
      if (requestError) throw requestError;
      setData(result);
      setError("");
    } catch {
      setError("No pudimos actualizar los cortes. Revisa la conexión e inténtalo nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function initialLoad() {
      const { data: result, error: requestError } = await supabase.rpc("admin_settlement_cutoff");
      if (!active) return;
      setData(requestError ? null : result);
      setError(requestError ? "No pudimos cargar los cortes. Inténtalo nuevamente." : "");
      setLoading(false);
    }
    void initialLoad();
    return () => { active = false; };
  }, []);

  const hotels = data?.rows || [];
  const attentionCount = hotels.filter(needsAction).length;
  const pendingPayouts = hotels.filter(h => Number(h.hotel_net) > 0).length;
  const pendingSubscriptions = hotels.filter(h => Number(h.subscription_due) > 0 || h.needs_invoice).length;
  const rows = useMemo(() => hotels.filter(hotel => {
    const query = search.trim().toLocaleLowerCase("es-PE");
    if (query && ![hotel.name, hotel.district].some(field =>
      String(field || "").toLocaleLowerCase("es-PE").includes(query))) return false;
    if (filter === "attention") return needsAction(hotel);
    if (filter === "payout") return Number(hotel.hotel_net) > 0;
    if (filter === "subscriptions")
      return Number(hotel.subscription_due) > 0 || hotel.needs_invoice;
    return true;
  }), [hotels, search, filter]);

  async function generate() {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data: result, error: requestError } = await supabase.rpc("admin_generate_subscription_charges");
      if (requestError) throw requestError;
      await load();
      setNotice(`Cargos preparados: ${result?.created || 0}. No se realizó ningún cobro automático.`);
    } catch {
      setError("No pudimos preparar las mensualidades. Inténtalo nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    const headings = ["Hotel", "Distrito", "Plan", "Comisión actual %", "Reservas por liquidar",
      "Cobro bruto PEN", "Comisión WAKI PEN", "Transferir hotel PEN", "Mensualidad por cobrar PEN",
      "Incidencias", "Expediente bancario completo"];
    const values = rows.map(h => [h.name, h.district, planTitle(h.plan_code), h.commission_rate,
      h.reservations, h.gross, h.commission, h.hotel_net, h.subscription_due,
      h.issues, h.bank_ready ? "Sí" : "No"]);
    downloadCsv("waki-corte-" + (data?.cutoff_date || "actual") + ".csv", [headings, ...values]);
  }

  return (
    <AdminPage title="Cortes y liquidaciones" pageClassName="waki-cutoff-main">
      <Feedback error={error} notice={notice} />
      <section className="waki-cutoff-workspace" aria-label="Control de cortes">
        <div className="waki-cutoff-toolbar">
          <div className="waki-cutoff-toolbar-label">
            <span className="waki-cutoff-date">
              <CalendarDays size={17} aria-hidden="true" />
              Corte {limaDate(data?.cutoff_date)}
            </span>
            {data?.is_cutoff_today && <span className="waki-cutoff-today">Hoy</span>}
            <span className="waki-cutoff-through">Ventas hasta {limaDate(data?.through_date)}</span>
          </div>
          <div className="waki-cutoff-toolbar-actions">
            <button type="button" className="control-btn" disabled={loading || busy} onClick={load}>
              <RefreshCw size={15} aria-hidden="true" /> Actualizar
            </button>
            <button type="button" className="control-btn primary" disabled={loading || busy}
              onClick={generate}>Preparar mensualidades</button>
          </div>
        </div>

        <div className="waki-cutoff-panel">
          <div className="waki-cutoff-panel-head">
            <div className="waki-cutoff-panel-title">
              <h2>Hoteles <span>{loading ? "…" : hotels.length}</span></h2>
            </div>
            <div className="waki-cutoff-panel-tools">
              <label className="waki-cutoff-search">
                <Search size={16} aria-hidden="true" />
                <input aria-label="Buscar hotel o distrito" placeholder="Buscar hotel o distrito"
                  value={search} onChange={event => setSearch(event.target.value)} />
              </label>
              <label className="waki-cutoff-filter">
                <span className="sr-only">Filtrar hoteles</span>
                <select aria-label="Filtrar hoteles" value={filter}
                  onChange={event => setFilter(event.target.value)}>
                  <option value="all">Todos ({hotels.length})</option>
                  <option value="attention">Por gestionar ({attentionCount})</option>
                  <option value="payout">Por liquidar ({pendingPayouts})</option>
                  <option value="subscriptions">Mensualidades ({pendingSubscriptions})</option>
                </select>
              </label>
              <button type="button" className="control-btn waki-cutoff-export"
                disabled={!data || rows.length === 0} onClick={exportCsv}>
                <Download size={15} aria-hidden="true" /> Exportar
              </button>
            </div>
          </div>

          <div className="control-table-wrap waki-cutoff-table-scroll">
            <table className="waki-cutoff-table waki-cutoff-table-compact">
              <thead><tr>
                <th scope="col">Hotel / plan</th>
                <th scope="col" className="waki-cutoff-number">Reservas</th>
                <th scope="col" className="waki-cutoff-number">Cobrado</th>
                <th scope="col" className="waki-cutoff-number">Comisión WAKI</th>
                <th scope="col" className="waki-cutoff-number">A transferir</th>
                <th scope="col" className="waki-cutoff-number">Mensualidad</th>
                <th scope="col">Estado</th>
                <th scope="col" className="waki-cutoff-right">Acciones</th>
              </tr></thead>
              <tbody>
                {!loading && rows.map(hotel => {
                  const status = hotelStatus(hotel);
                  return <tr key={hotel.hotel_id}>
                    <td className="waki-cutoff-hotel-cell">
                      <strong>{hotel.name}</strong>
                      <small>{hotel.district || "Sin distrito"} · {planTitle(hotel.plan_code)}
                        {hotel.commission_rate != null ? ` · ${hotel.commission_rate}%` : ""}
                      </small>
                    </td>
                    <td className="waki-cutoff-number">{Number(hotel.reservations || 0)}</td>
                    <td className="waki-cutoff-number">{money(hotel.gross)}</td>
                    <td className="waki-cutoff-number">{money(hotel.commission)}</td>
                    <td className="waki-cutoff-number waki-cutoff-amount">{money(hotel.hotel_net)}</td>
                    <td className="waki-cutoff-number">{money(hotel.subscription_due)}</td>
                    <td><span className={`waki-cutoff-state state-${status.tone}`}>{status.label}</span></td>
                    <td className="waki-cutoff-actions-cell">
                      <div className="waki-cutoff-row-actions">
                        <Link className="control-btn waki-cutoff-reconcile"
                          to={`/finanzas?buscar=${encodeURIComponent(hotel.name)}&hasta=${encodeURIComponent(data.through_date)}`}>
                          {Number(hotel.hotel_net) > 0 ? "Liquidar" : "Ver ventas"}
                        </Link>
                        <button className="waki-cutoff-plan-link" type="button" onClick={() => setSelected(hotel)}>
                          {hotel.plan_code ? "Plan / cobros" : "Asignar plan"}
                        </button>
                      </div>
                    </td>
                  </tr>;
                })}
                {loading && <tr><td colSpan={8} className="waki-cutoff-empty">Cargando hoteles…</td></tr>}
                {!loading && rows.length === 0 && <tr>
                  <td colSpan={8} className="waki-cutoff-empty">
                    {search ? "No encontramos hoteles con esa búsqueda." : "No hay hoteles para este filtro."}
                  </td>
                </tr>}
              </tbody>
            </table>
          </div>
          <div className="waki-cutoff-panel-footer">
            <span>{rows.length} de {hotels.length} hoteles</span>
            <span>Las transferencias se confirman en Ventas y liquidaciones.</span>
          </div>
        </div>
      </section>

      {selected && <AdminDialog title={selected.name} onClose={() => setSelected(null)} busy={busy}>
        <HotelPlanEditor hotelId={selected.hotel_id} compact onUpdated={load} />
        <div className="control-actions">
          <button type="button" className="control-btn" onClick={() => setSelected(null)}>Cerrar</button>
          <Link className="control-btn" to={"/hoteles/" + selected.hotel_id + "/detalle"}>Ficha del hotel</Link>
        </div>
      </AdminDialog>}
    </AdminPage>
  );
}
