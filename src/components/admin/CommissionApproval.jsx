import { useEffect, useState } from "react";
import { AdminDialog, Feedback } from "./AdminUI";
import { supabase } from "../../lib/supabase";
export default function CommissionApproval({ hotelId, onClose, onApprove }) {
  const [rate, setRate] = useState(null),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    supabase
      .rpc("admin_finance_detail", { p_hotel: hotelId })
      .then(({ data, error: e }) => {
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
      if (rate == null) {
        const f = new FormData(e.currentTarget);
        const { error: e } = await supabase.rpc("admin_finance_action", {
          p_action: "commission",
          p_data: { hotel_id: hotelId, rate: Number(f.get("rate")) },
        });
        if (e) throw e;
      }
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
            <p className="control-hint">
              La comisión se aplicará a las nuevas ventas. Cada operación
              conservará su tasa histórica al liquidarla.
            </p>
            <label className="control-check">
              <input type="checkbox" required /> Revisé el hotel y su comisión
              antes de aprobarlo.
            </label>
            <button className="control-btn primary" disabled={busy}>
              {busy ? "Guardando…" : "Aprobar hotel"}
            </button>
          </>
        )}
      </form>
    </AdminDialog>
  );
}
