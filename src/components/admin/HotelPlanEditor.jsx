import {useEffect, useState} from 'react';
import {supabase} from '../../lib/supabase';
import {money, limaDate, todayLima} from '../../lib/finance';
import {PLAN_OPTIONS,planTitle} from '../../lib/commercialPlans';
import './CommercialFinance.css';

export default function HotelPlanEditor({hotelId,compact=false,onUpdated}) {
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [edit,setEdit]=useState(false);
  const [choice,setChoice]=useState('');
  const [reason,setReason]=useState('');
  const [chargeAction,setChargeAction]=useState(null);
  const [reference,setReference]=useState('');
  const [paidOn,setPaidOn]=useState(todayLima());
  const [waiverReason,setWaiverReason]=useState('');

  useEffect(()=>{
    let alive=true;
    async function load(){
      const {data:r,error:e}=await supabase.rpc('admin_hotel_commercial_plan',{p_hotel:hotelId});
      if(!alive)return;
      if(e)setError('No se pudo consultar el plan comercial.');
      else {setData(r);setChoice(r.plan?.code||'');}
      setLoading(false);
    }
    void load();
    return ()=>{alive=false;};
  },[hotelId]);

  async function refresh(){
    const {data:r,error:e}=await supabase.rpc('admin_hotel_commercial_plan',{p_hotel:hotelId});
    if(e)throw e;
    setData(r);setChoice(r.plan?.code||'');
    onUpdated?.();
  }

  async function changePlan(event){
    event.preventDefault();
    if(!choice||busy)return;
    if(data?.plan && choice!==data.plan.code && reason.trim().length<5){
      setError('Indica el motivo del cambio (mínimo 5 caracteres).');return;
    }
    setBusy(true);setError('');setSuccess('');
    try{
      const {error:e}=await supabase.rpc('admin_hotel_commercial_plan',{
        p_hotel:hotelId,p_action:'assign',p_data:{code:choice,reason:reason.trim()}
      });
      if(e)throw e;
      await refresh();setEdit(false);setReason('');
      setSuccess('Plan actualizado. La nueva comisión se aplicará solo a ventas futuras.');
    }catch(e){setError(e?.message?.includes('CHANGE_REASON_REQUIRED')
      ? 'Para modificar el acuerdo comercial debes indicar el motivo.'
      : 'No fue posible guardar el plan. Comprueba el estado del hotel.');}
    finally{setBusy(false);}
  }

  async function settleCharge(event){
    event.preventDefault();
    if(!chargeAction||busy)return;
    const action=chargeAction.mode;
    if(action==='paid' && (reference.trim().length<3 || !paidOn)){setError('Indica fecha y referencia del ingreso bancario.');return;}
    if(action==='waived' && waiverReason.trim().length<8){setError('La condonación exige un motivo de al menos 8 caracteres.');return;}
    setBusy(true);setError('');setSuccess('');
    try{
      const {error:e}=await supabase.rpc('admin_hotel_commercial_plan',{
        p_hotel:hotelId,p_action:action,p_data:{
          charge_id:chargeAction.charge.id,reference:reference.trim(),
          paid_on:paidOn,reason:waiverReason.trim()
        }
      });
      if(e)throw e;
      await refresh();
      setChargeAction(null);setReference('');setWaiverReason('');
      setSuccess(action==='paid'?'Cobro registrado con su referencia.':'Cargo condonado con trazabilidad.');
    }catch{setError('No se pudo registrar el cobro. Verifica la referencia o actualiza el historial.');}
    finally{setBusy(false);}
  }

  const plan=data?.plan;
  const outstanding=(data?.charges||[]).filter(x=>x.status==='pending');
  const totalDue=outstanding.reduce((acc,x)=>acc+Number(x.amount),0);
  return (
    <section className="waki-plan-card" aria-label="Plan comercial y mensualidades">
      <div className="waki-plan-header">
        <div>
          <span className="waki-plan-eyebrow">ACUERDO COMERCIAL</span>
          <h2>Plan y mensualidades</h2>
          <p>La cuota mensual no se descuenta de las transferencias al hotel.</p>
        </div>
        {!loading&&<button className="control-btn" type="button" onClick={()=>{setEdit(v=>!v);setError('');}} disabled={busy}>{edit?'Cerrar':'Editar plan'}</button>}
      </div>
      {loading?<p>Consultando condiciones comerciales…</p>:(
        <>
          <div className="waki-plan-stats">
            <article><span>Plan actual</span><strong>{planTitle(plan?.code)}</strong></article>
            <article><span>Comisión de nuevas reservas</span><strong>{plan?plan.commission_rate+' %':data?.legacy_rate==null?'—':data.legacy_rate+' % (histórica)'}</strong></article>
            <article><span>Cuota mensual</span><strong>{money(plan?.monthly_fee||0)}</strong></article>
            <article><span>Mensualidades por cobrar</span><strong>{money(totalDue)}</strong></article>
          </div>
          {!plan&&<p className="waki-plan-warning">Este hotel aún no tiene asignado uno de los nuevos planes. Las ventas antiguas conservan su tasa.</p>}
          {plan&&!plan.activated_on&&<p className="waki-plan-warning">El plan se activará al aprobar y publicar el hotel.</p>}
          {edit&&<form className="waki-plan-edit" onSubmit={changePlan}>
            <label>Plan del hotel
              <select value={choice} onChange={e=>setChoice(e.target.value)} required>
                <option value="">Selecciona un plan</option>
                {PLAN_OPTIONS.map(p=><option key={p.code} value={p.code}>{p.title} · {p.rate}% {p.monthly?'+ S/99 mensual':'sin mensualidad'}</option>)}
              </select>
            </label>
            {plan?.code!==choice&&plan&&<label>Motivo del cambio
              <textarea value={reason} onChange={e=>setReason(e.target.value)} minLength="5" maxLength="300" required placeholder="Ej. Nuevo acuerdo firmado con el hotel" />
            </label>}
            <p>Los cambios no recalculan ventas ya cobradas ni anulan mensualidades anteriores. Verifica el acuerdo firmado.</p>
            <button className="control-btn primary" disabled={busy||!choice||plan?.code===choice}>{busy?'Guardando…':'Guardar plan'}</button>
          </form>}
          {error&&<p role="alert" className="control-error">{error}</p>}
          {success&&<p role="status" className="control-success">{success}</p>}
          <div className="waki-plan-subheading">
            <h3>Control de mensualidades</h3>
            <span>{outstanding.length} cargo(s) pendiente(s)</span>
          </div>
          <p className="waki-plan-note">Los cargos se generan por ciclos desde la activación del plan Socio. El registro de cobro es manual y exige una referencia real. Este historial no reemplaza comprobantes tributarios.</p>
          <div className="control-table-wrap">
            <table className="waki-plan-table">
              <thead><tr><th>Período</th><th>Monto</th><th>Estado</th><th>Gestión</th></tr></thead>
              <tbody>
                {(data?.charges||[]).map(c=><tr key={c.id}>
                  <td>{limaDate(c.period_start)} al {limaDate(c.period_end)}</td>
                  <td>{money(c.amount)}</td>
                  <td>{c.status==='pending'?'Por cobrar':c.status==='paid'?'Cobrado':'Condonado'}{c.payment_reference&&<small>Ref. {c.payment_reference}</small>}</td>
                  <td>{c.status==='pending'?<button type="button" className="control-btn" disabled={busy} onClick={()=>{setChargeAction({charge:c,mode:'paid'});setError('');}}>Registrar cobro</button>:<span>Registrado</span>}</td>
                </tr>)}
                {!data?.charges?.length&&<tr><td colSpan="4">No hay mensualidades emitidas para este hotel.</td></tr>}
              </tbody>
            </table>
          </div>
          {chargeAction&&<form className="waki-plan-charge" onSubmit={settleCharge}>
            <h3>{chargeAction.mode==='paid'?'Registrar cobro recibido':'Condonar mensualidad'} · {money(chargeAction.charge.amount)}</h3>
            {chargeAction.mode==='paid'?<>
              <label>Referencia del pago recibido<input value={reference} onChange={e=>setReference(e.target.value)} minLength="3" maxLength="120" required placeholder="Número de operación bancaria" /></label>
              <label>Fecha de cobro<input type="date" value={paidOn} max={todayLima()} onChange={e=>setPaidOn(e.target.value)} required /></label>
              <button type="button" className="waki-plan-link" onClick={()=>setChargeAction({...chargeAction,mode:'waived'})}>Condonar en lugar de cobrar</button>
            </>:<label>Justificación de la condonación<textarea value={waiverReason} onChange={e=>setWaiverReason(e.target.value)} minLength="8" required /></label>}
            <div className="control-actions">
              <button type="button" className="control-btn" onClick={()=>setChargeAction(null)} disabled={busy}>Cancelar</button>
              <button className="control-btn primary" disabled={busy}>{busy?'Guardando…':chargeAction.mode==='paid'?'Confirmar cobro recibido':'Confirmar condonación'}</button>
            </div>
          </form>}
          {!compact&&data?.events?.length>0&&<details className="waki-plan-history"><summary>Ver historial de cambios de plan</summary>
            {data.events.map((e,i)=><p key={i}>{limaDate(e.created_at)} · {planTitle(e.old_plan)} → {planTitle(e.new_plan)}. {e.reason||'Asignación inicial'}</p>)}
          </details>}
        </>
      )}
    </section>
  );
}
