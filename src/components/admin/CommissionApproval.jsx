import { useEffect, useState } from "react";
import { AdminDialog, Feedback } from "./AdminUI";
import { supabase } from "../../lib/supabase";
export default function CommissionApproval({ hotelId, onClose, onApprove }) {
  const [affiliation,setAffiliation]=useState(null);
  const [rate, setRate] = useState(null),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([supabase.rpc("admin_finance_detail", { p_hotel: hotelId }),supabase.rpc("hotel_affiliation_control",{p_hotel:hotelId})])
      .then(([{data,error:e},review]) => {
        if(review.error){setError("No se pudo consultar la revisión de afiliación.");return}
        setAffiliation(review.data);
        if (active) {
          if (e)
            setError(
              "No se pudo consultar la comisión. Cierra y vuelve a intentar.",
            );
          else {
            setRate(data.summary.commission_rate);
            setReady(true);
          }
        }
      });
    return () => {
      active = false;
    };
  }, [hotelId]);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const form=new FormData(e.currentTarget);
      const {error:approvalError}=await supabase.rpc("admin_approve_hotel_affiliation",{p_hotel:hotelId,p_data:{rate:rate??Number(form.get("rate")),agreement_reference:form.get("agreement_reference"),bank_verified:form.get("bank_verified")==="on",training_verified:form.get("training_verified")==="on"}});
      if(approvalError)throw approvalError;
      await onApprove();
      onClose();
    } catch {
      setError("No se pudo completar la aprobación. Revisa la configuración.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AdminDialog
      title="Comisión y aprobación del hotel"
      onClose={onClose}
      busy={busy}
    >
      <form className="control-form" onSubmit={save}>
        <Feedback error={error} />
        {!ready ? (
          <p>Consultando comisión…</p>
        ) : (
          <>
            {rate == null ? (
              <label>
                Comisión acordada
                <select name="rate" required defaultValue="">
                  <option value="" disabled>
                    Seleccionar
                  </option>
                  <option value="4">4%</option>
                  <option value="8">8%</option>
                </select>
              </label>
            ) : (
              <p>
                Comisión configurada: <strong>{rate}%</strong>. Se conservará
                este acuerdo.
              </p>
            )}
            <p className="control-hint">Aceptación del hotel: <strong>{affiliation?.accepted?"Registrada":"Pendiente: el representante debe aceptarla en su portal"}</strong>.</p>
            <label>Referencia del acuerdo comercial<input name="agreement_reference" minLength="5" maxLength="160" required defaultValue={affiliation?.review?.agreement_reference||""} placeholder="Contrato o expediente acordado con el hotel" /></label>
            <label className="control-check"><input name="bank_verified" type="checkbox" required defaultChecked={Boolean(affiliation?.review?.bank_verified)}/> Verifiqué la titularidad y los datos bancarios del hotel.</label>
            <label className="control-check"><input name="training_verified" type="checkbox" required defaultChecked={Boolean(affiliation?.review?.training_verified)}/> Verifiqué la documentación y la capacitación del personal para gestionar reservas y bloqueos.</label>
            <p className="control-hint">
              La comisión se aplicará a las nuevas ventas. Cada operación
              conservará su tasa histórica al liquidarla.
            </p>
            <label className="control-check">
              <input type="checkbox" required /> Revisé el hotel y su comisión
              antes de aprobarlo.
            </label>
            <button className="control-btn primary" disabled={busy || !affiliation?.accepted}>
              {busy ? "Guardando…" : "Aprobar hotel"}
            </button>
          </>
        )}
      </form>
    </AdminDialog>
  );
}
