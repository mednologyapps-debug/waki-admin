import { useCallback, useEffect, useState } from "react";
import { AdminPage, Feedback } from "../components/admin/AdminUI";
import { supabase } from "../lib/supabase";

const statusLabel = {
  received: "Recibido",
  in_review: "En revisión",
  answered: "Respondido",
  closed: "Cerrado",
};
const date = (value) => value
  ? new Date(value).toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "short", timeStyle: "short" })
  : "—";

export default function ComplaintsPage() {
  const [rows, setRows] = useState([]);
  const [actions, setActions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: queryError } = await supabase
      .from("consumer_complaint_submissions")
      .select("id, receipt_code, classification, consumer_type, consumer_name, document_type, document_number, address, email, phone, minor_name, minor_document, product_service, amount, description, consumer_request, booking_code, status, received_at, responded_at")
      .order("received_at", { ascending: false })
      .limit(100);
    if (queryError) setError(queryError.message);
    else {
      setRows(data || []);
      setError("");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function openComplaint(row) {
    setSelected(row);
    setNotice("");
    setError("");
    const { data, error: actionError } = await supabase
      .from("consumer_complaint_actions")
      .select("id, action_type, status, message, created_at")
      .eq("complaint_id", row.id)
      .order("created_at", { ascending: false });
    if (actionError) setError(actionError.message);
    else setActions(data || []);
  }

  async function saveAction(event) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const { error: saveError } = await supabase.rpc("admin_record_consumer_complaint_action", {
      p_complaint_id: selected.id,
      p_action_type: form.get("action_type"),
      p_status: form.get("status"),
      p_message: form.get("message"),
    });
    if (saveError) setError(saveError.message);
    else {
      setNotice("Actualización guardada en el historial.");
      event.currentTarget.reset();
      await load();
      await openComplaint(selected);
    }
    setBusy(false);
  }

  return (
    <AdminPage title="Libro de Reclamaciones" subtitle="Gestiona registros, respuestas y el plazo de atención de 15 días hábiles.">
      <Feedback error={error} notice={notice} />
      <section className="control-card">
        <div className="control-table-wrap">
          <table>
            <thead><tr><th>Constancia</th><th>Consumidor</th><th>Tipo / estado</th><th>Recibido</th><th /></tr></thead>
            <tbody>
              {!loading && rows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.receipt_code}</strong><small>{row.product_service}</small></td>
                  <td>{row.consumer_name}<small>{row.email}</small></td>
                  <td><span className="control-badge">{row.classification === "reclamo" ? "Reclamo" : "Queja"}</span><small>{statusLabel[row.status] || row.status}</small></td>
                  <td>{date(row.received_at)}</td>
                  <td><button className="control-btn" onClick={() => openComplaint(row)}>Abrir</button></td>
                </tr>
              ))}
              {(loading || !rows.length) && <tr><td colSpan="5">{loading ? "Cargando constancias…" : "Todavía no hay registros."}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {selected && (
        <section className="control-card" style={{ marginTop: 18, padding: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
            <div><h2 style={{ marginTop: 0 }}>{selected.receipt_code}</h2><p>{selected.classification === "reclamo" ? "Reclamo" : "Queja"} · recibido {date(selected.received_at)}</p></div>
            <button className="control-btn" onClick={() => setSelected(null)}>Cerrar</button>
          </div>
          <dl className="control-details">
            {[
              ["Persona", selected.consumer_name],
              ["Documento", selected.document_type + " " + selected.document_number],
              ["Dirección", selected.address],
              ["Correo", selected.email],
              ["Teléfono", selected.phone],
              ["Representante del menor", selected.minor_name],
              ["Documento de representante", selected.minor_document],
              ["Servicio", selected.product_service],
              ["Reserva", selected.booking_code],
              ["Monto", selected.amount == null ? "—" : "S/ " + Number(selected.amount).toFixed(2)],
              ["Hechos", selected.description],
              ["Solicitud", selected.consumer_request],
              ["Estado", statusLabel[selected.status]],
            ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}
          </dl>
          <h3>Historial y respuesta</h3>
          <ol>{actions.map((action) => <li key={action.id}><strong>{action.action_type === "response" ? "Respuesta" : action.action_type === "internal_note" ? "Nota interna" : "Estado"} · {date(action.created_at)}</strong><p>{action.message}</p></li>)}</ol>
          <form className="control-form" onSubmit={saveAction}>
            <label>Acción<select name="action_type" defaultValue="response"><option value="response">Registrar respuesta al consumidor</option><option value="status">Cambio de estado</option><option value="internal_note">Nota interna</option></select></label>
            <label>Estado<select name="status" defaultValue={selected.status}>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Mensaje / motivo<textarea name="message" required minLength="2" maxLength="5000" /></label>
            <button className="control-btn primary" disabled={busy}>{busy ? "Guardando…" : "Guardar en historial"}</button>
          </form>
          <p className="control-hint">Los datos del Libro son confidenciales y solo deben consultarse para gestionar y responder este caso. El sistema registra quién guardó cada acción.</p>
        </section>
      )}
    </AdminPage>
  );
}
