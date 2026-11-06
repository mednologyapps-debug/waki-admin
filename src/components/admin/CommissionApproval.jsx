import {useEffect,useState} from 'react';
import {AdminDialog,Feedback} from './AdminUI';
import {supabase} from '../../lib/supabase';
import {PLAN_OPTIONS,planTitle} from '../../lib/commercialPlans';
import HotelDossierVerification from './HotelDossierVerification';

export default function CommissionApproval({hotelId,onClose,onApprove}){
 const [affiliation,setAffiliation]=useState(null);
 const [rate,setRate]=useState(null);
 const [plan,setPlan]=useState('');
 const [dossierVerified,setDossierVerified]=useState(false);
 const [ready,setReady]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  Promise.all([
   supabase.rpc('admin_finance_detail',{p_hotel:hotelId}),
   supabase.rpc('hotel_affiliation_control',{p_hotel:hotelId}),
   supabase.rpc('admin_hotel_commercial_plan',{p_hotel:hotelId})
  ]).then(([finance,review,commercial])=>{
   if(!active)return;
   if(finance.error||review.error||commercial.error){setError('No se pudo cargar el acuerdo comercial. Actualiza y reintenta.');return;}
   setRate(finance.data?.summary?.commission_rate??null);
   setAffiliation(review.data);setPlan(commercial.data?.plan?.code||'');
   setReady(true);
  }).catch(()=>{if(active)setError('No se pudo consultar la solicitud.');});
  return ()=>{active=false;};
 },[hotelId]);
 async function approve(event){
  event.preventDefault();if(!plan||busy)return;
  setBusy(true);setError('');
  try{
   const form=new FormData(event.currentTarget);
   const {error:e}=await supabase.rpc('admin_approve_hotel_affiliation',{
    p_hotel:hotelId,p_data:{
     plan_code:plan,plan_reason:'Plan aprobado al afiliar el hotel',
     agreement_reference:form.get('agreement_reference'),
     bank_verified:dossierVerified,training_verified:form.get('training_verified')==='on'
    }
   });
   if(e)throw e;
   await onApprove();
   onClose();
  }catch(e){
   setError(e?.message?.includes('PLAN_REQUIRED')?'Selecciona el plan comercial para aprobar.'
    :'No se pudo aprobar. Comprueba contrato, cuenta bancaria, capacitación y plan seleccionado.');
  }finally{setBusy(false);}
 }
 return <AdminDialog title="Aprobar hotel y asignar plan" onClose={onClose} busy={busy}>
  <form className="control-form" onSubmit={approve}>
   <Feedback error={error}/>
   {!ready?<p>Consultando solicitud, contrato y condiciones comerciales…</p>:<>
    <label>Plan comercial del hotel
     <select value={plan} onChange={e=>setPlan(e.target.value)} required>
      <option value="">Selecciona el plan acordado</option>
      {PLAN_OPTIONS.map(p=><option key={p.code} value={p.code}>{p.title} · {p.rate}% {p.monthly?'+ S/99 al mes':'sin cuota mensual'}</option>)}
     </select>
    </label>
    {plan&&<p className="control-hint"><strong>{planTitle(plan)}</strong>: {plan==='socio'?'WAKI retiene 8 % por cada reserva y factura una cuota de S/99 por ciclo mensual desde la activación del hotel.':'WAKI retiene 12 % de cada reserva; no existe cuota fija.'} Las reservas presenciales solo bloquean inventario y no generan comisión.</p>}
    {rate!=null&&<p className="control-hint">Tasa anterior registrada: {rate} %. Las reservas ya cobradas conservan su comisión; el plan escogido regirá en las nuevas reservas.</p>}
    <p className="control-hint">Aceptación del hotel: <strong>{affiliation?.accepted?'Registrada':'Pendiente de aceptación por el representante'}</strong>.</p>
    <label>Referencia del acuerdo comercial
     <input name="agreement_reference" minLength="5" maxLength="160" required
      defaultValue={affiliation?.review?.agreement_reference||''}
      placeholder="Código o referencia del contrato aceptado"/>
    </label>
    <HotelDossierVerification hotelId={hotelId} onVerified={setDossierVerified}/>
    {!dossierVerified&&<p className="control-hint" role="alert">Es obligatorio verificar contrato firmado y cuenta bancaria antes de aprobar.</p>}
    <label className="control-check"><input name="training_verified" type="checkbox" required
      defaultChecked={Boolean(affiliation?.review?.training_verified)}/>
      Verifiqué la documentación y capacitación del hotel para gestionar reservas y bloqueos.</label>
    <label className="control-check"><input type="checkbox" required/>
      Confirmo que el plan seleccionado corresponde al contrato y que los importes de liquidación se calcularán según la tasa histórica de cada venta.</label>
    <button className="control-btn primary" disabled={busy||!plan||!affiliation?.accepted||!dossierVerified}>
     {busy?'Aprobando…':'Aprobar hotel y activar plan'}
    </button>
   </>}
  </form>
 </AdminDialog>;
}
