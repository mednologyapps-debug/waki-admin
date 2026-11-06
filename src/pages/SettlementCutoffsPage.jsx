import {useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {AlertTriangle,CalendarCheck2,CheckCircle2,Download,RefreshCw,Wallet} from 'lucide-react';
import {AdminDialog,AdminPage,Feedback} from '../components/admin/AdminUI';
import HotelPlanEditor from '../components/admin/HotelPlanEditor';
import {supabase} from '../lib/supabase';
import {money,limaDate} from '../lib/finance';
import {downloadCsv} from '../lib/adminControl';
import {planTitle} from '../lib/commercialPlans';
import '../components/admin/CommercialFinance.css';

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

export default function SettlementCutoffsPage(){
 const [data,setData]=useState(null);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [search,setSearch]=useState('');
 const [filter,setFilter]=useState('attention');
 const [selected,setSelected]=useState(null);
 async function load(){
  setLoading(true);
  const {data:r,error:e}=await supabase.rpc('admin_settlement_cutoff');
  setLoading(false);
  if(e){setError('No se pudo cargar la conciliación. Verifica la sesión administrativa.');return;}
  setData(r);setError('');
 }
 useEffect(()=>{let current=true;(async()=>{
  const {data:r,error:e}=await supabase.rpc('admin_settlement_cutoff');
  if(!current)return;
  setData(e?null:r);setError(e?'No se pudo cargar el reporte financiero.':'');setLoading(false);
 })();return()=>{current=false;};},[]);
 const rows=useMemo(()=>{
  const all=data?.rows||[];
  return all.filter(h=>{
   const q=search.trim().toLocaleLowerCase('es-PE');
   if(q&&!(h.name||'').toLocaleLowerCase('es-PE').includes(q) && !(h.district||'').toLocaleLowerCase('es-PE').includes(q))return false;
   if(filter==='attention')return Number(h.hotel_net)>0||Number(h.subscription_due)>0||Number(h.issues)>0||h.needs_invoice||!h.plan_code;
   if(filter==='payout')return Number(h.hotel_net)>0;
   if(filter==='subscriptions')return Number(h.subscription_due)>0||h.needs_invoice;
   return true;
  });
 },[data,filter,search]);
 async function generate(){
  setBusy(true);setNotice('');setError('');
  try{
   const {data:r,error:e}=await supabase.rpc('admin_generate_subscription_charges');
   if(e)throw e;
   await load();
   setNotice('Mensualidades preparadas: '+(r?.created||0)+' nuevo(s) cargo(s). Ningún dinero fue cobrado automáticamente.');
  }catch{setError('No se pudieron generar los cargos pendientes.');}
  finally{setBusy(false);}
 }
 function exportCsv(){
  const h=['Hotel','Distrito','Plan','Comisión actual %','Reservas por liquidar','Cobro bruto PEN','Comisión WAKI PEN','Transferir hotel PEN','Mensualidad por cobrar PEN','Incidencias','Expediente bancario completo'];
  const values=rows.map(x=>[x.name,x.district,planTitle(x.plan_code),x.commission_rate,x.reservations,x.gross,x.commission,x.hotel_net,x.subscription_due,x.issues,x.bank_ready?'Sí':'No']);
  downloadCsv('waki-revision-corte-'+(data?.cutoff_date||'actual')+'.csv',[h,...values]);
 }
 const s=data?.summary||{};
 return <AdminPage title="Centro de cortes y liquidaciones"
  subtitle="Miércoles y domingos. Revisa ventas conciliadas, lo que WAKI retiene y lo que corresponde a cada hotel.">
   <Feedback error={error} notice={notice}/>
   <section className={'waki-cutoff-banner '+(data?.is_cutoff_today?'is-due':'')}>
     <div>
       <h2><CalendarCheck2 size={18} style={{verticalAlign:'middle'}}/> {data?.is_cutoff_today?'Hoy toca corte':'Último corte disponible'} · {limaDate(data?.cutoff_date)}</h2>
       <p>Se incluyen ventas verificadas aún no depositadas y pagadas hasta el {limaDate(data?.through_date)} (hora de Lima), incluyendo saldos anteriores. Las reservas de prueba y las ventas sin conciliación no entran al monto por transferir.</p>
     </div>
     <div className="control-actions">
       <button className="control-btn" type="button" disabled={loading||busy} onClick={load}><RefreshCw size={15}/> Actualizar</button>
       <button className="control-btn primary" type="button" disabled={loading||busy} onClick={generate}>Preparar mensualidades</button>
     </div>
   </section>
   <div className="waki-cutoff-cards">
     <article><span>Reservas conciliadas pendientes</span><strong>{Number(s.reservations||0).toLocaleString('es-PE')}</strong><small>Solo movimientos elegibles para liquidación</small></article>
     <article><span>Total por transferir a hoteles</span><strong>{money(s.hotel_net)}</strong><small>Bruto menos comisión WAKI, sin cuota mensual</small></article>
     <article><span>Comisiones WAKI retenidas</span><strong>{money(s.commission)}</strong><small>Antes de Izipay e impuestos</small></article>
     <article><span>Mensualidades por cobrar</span><strong>{money(s.subscription_due)}</strong><small>Separadas del saldo de los hoteles</small></article>
   </div>
   {(Number(s.issues)>0||Number(s.hotels_unbilled)>0||Number(s.hotels_without_plan)>0)&&<div className="waki-cutoff-banner is-due">
     <AlertTriangle size={21}/>
     <p>{s.issues||0} venta(s) requieren conciliación · {s.hotels_unbilled||0} hotel(es) necesitan generar mensualidades · {s.hotels_without_plan||0} hotel(es) aún no tienen plan comercial. No efectúes depósitos sobre operaciones sin verificar.</p>
   </div>}
   <div className="waki-cutoff-controls">
     <label>Buscar hotel <input aria-label="Buscar hotel" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nombre o distrito" /></label>
     <label>Mostrar <select value={filter} onChange={e=>setFilter(e.target.value)}>
       <option value="attention">Solo por gestionar</option>
       <option value="payout">Con transferencias pendientes</option>
       <option value="subscriptions">Con mensualidades pendientes</option>
       <option value="all">Todos los hoteles</option>
     </select></label>
     <button className="control-btn" disabled={!data||!rows.length} onClick={exportCsv}><Download size={15}/> Exportar CSV</button>
   </div>
   <section className="control-card">
     <h2>Montos por hotel</h2>
     <p className="waki-cutoff-help">El plan determina la comisión de ventas futuras. Las ventas del corte conservan el porcentaje vigente al cobrarse. El costo de Izipay requiere conciliación por separado y no se resta automáticamente al hotel.</p>
     <div className="control-table-wrap">
       <table className="waki-cutoff-table"><thead><tr>
         <th>Hotel / plan</th><th>Reservas</th><th>Cobrado</th><th>Comisión WAKI</th><th>A transferir</th><th>Mensualidades</th><th>Revisión</th><th>Acciones</th>
       </tr></thead><tbody>
       {rows.map(h=><tr key={h.hotel_id}>
         <td><strong>{h.name}</strong><small>{h.district||'Sin distrito'} · {planTitle(h.plan_code)}{h.commission_rate?' ('+h.commission_rate+' %)':''}</small></td>
         <td>{Number(h.reservations||0)}</td>
         <td>{money(h.gross)}</td>
         <td>{money(h.commission)}</td>
         <td className="waki-positive">{money(h.hotel_net)}</td>
         <td>{money(h.subscription_due)}{h.needs_invoice&&<small>Generar ciclo pendiente</small>}</td>
         <td>{h.issues>0?<><AlertTriangle size={14}/> {h.issues} incidencia(s)</>:h.hotel_net>0&&!h.bank_ready?<>Expediente sin verificar</>:<><CheckCircle2 size={14}/> Sin alertas</>}</td>
         <td><div className="waki-cutoff-actions">
           <Link className="control-btn" to={'/finanzas?buscar='+encodeURIComponent(h.name)+'&hasta='+encodeURIComponent(data.through_date)}>
             <Wallet size={14}/> Liquidar
           </Link>
           <button className="control-btn" onClick={()=>setSelected(h)} type="button">Plan / Cobros</button>
         </div></td>
       </tr>)}
       {!loading&&!rows.length&&<tr><td colSpan="8">Sin hoteles para este filtro. Prueba «Todos los hoteles».</td></tr>}
       {loading&&<tr><td colSpan="8">Consultando movimientos financieros…</td></tr>}
       </tbody></table>
     </div>
   </section>
   <p className="waki-cutoff-help">Esta vista es una lista de trabajo, no una orden bancaria. En «Liquidar» puedes confirmar una transferencia únicamente después de verificar el abono de Izipay, la cuenta bancaria del hotel y efectuar el depósito real. La mensualidad de S/99 se cobra y registra por separado.</p>
   {selected&&<AdminDialog title={'Gestión comercial · '+selected.name} onClose={()=>setSelected(null)} busy={busy}>
     <HotelPlanEditor hotelId={selected.hotel_id} compact onUpdated={load}/>
     <div className="control-actions"><button className="control-btn" onClick={()=>setSelected(null)}>Cerrar</button>
       <Link className="control-btn" to={'/hoteles/'+selected.hotel_id+'/detalle'}>Ficha del hotel</Link></div>
   </AdminDialog>}
 </AdminPage>;
}
