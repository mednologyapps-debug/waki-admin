import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import './ComplaintsPage.css'

const statuses = {
  received: 'Recibido',
  in_review: 'En revisión',
  answered: 'Respondido',
  closed: 'Cerrado'
}

const displayDate = (value) => value
  ? new Date(value).toLocaleString('es-PE', {
      timeZone: 'America/Lima',
      dateStyle: 'short',
      timeStyle: 'short'
    })
  : '—'

function ComplaintsPage() {
  const [rows, setRows] = useState([])
  const [actions, setActions] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadRows = useCallback(async () => {
    setLoading(true)
    const { data, error: queryError } = await supabase
      .from('consumer_complaint_submissions')
      .select('id, receipt_code, classification, consumer_name, document_type, document_number, address, email, phone, minor_name, minor_document, product_service, amount, description, consumer_request, booking_code, status, received_at, responded_at')
      .order('received_at', { ascending: false })
      .limit(100)

    if (queryError) {
      setError('No se pudieron cargar los reclamos. Verifica tu acceso administrativo.')
    } else {
      setRows(data || [])
      setError('')
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadRows() }, [loadRows])

  const openRow = async (row) => {
    setSelected(row)
    setActions([])
    setNotice('')
    setError('')
    const { data, error: actionError } = await supabase
      .from('consumer_complaint_actions')
      .select('id, action_type, status, message, created_at')
      .eq('complaint_id', row.id)
      .order('created_at', { ascending: false })

    if (actionError) setError('No se pudo cargar el historial del reclamo.')
    else setActions(data || [])
  }

  const saveAction = async (event) => {
    event.preventDefault()
    if (!selected) return
    setSaving(true)
    setError('')
    setNotice('')

    const form = new FormData(event.currentTarget)
    const actionType = form.get('action_type')
    const nextStatus = form.get('status')
    const message = String(form.get('message') || '').trim()
    const { error: saveError } = await supabase.rpc(
      'admin_record_consumer_complaint_action',
      {
        p_complaint_id: selected.id,
        p_action_type: actionType,
        p_status: nextStatus,
        p_message: message
      }
    )

    if (saveError) {
      setError('No se pudo guardar la acción. Verifica tu acceso e intenta nuevamente.')
    } else {
      setNotice('Actualización guardada en el historial.')
      event.currentTarget.reset()
      await loadRows()
      await openRow({ ...selected, status: nextStatus })
    }
    setSaving(false)
  }

  return (
    <main className="complaints-page">
      <header className="complaints-header">
        <div>
          <span>WAKI ADMIN</span>
          <h1>Libro de Reclamaciones</h1>
          <p>Consulta los registros y guarda cada respuesta o cambio de estado.</p>
        </div>
        <Link to="/dashboard" className="complaints-back">Volver al panel</Link>
      </header>

      <p className="complaints-privacy">Estos datos son confidenciales. Úsalos solo para gestionar y responder cada caso.</p>
      {error && <div className="complaints-message error" role="alert">{error}</div>}
      {notice && <div className="complaints-message success" role="status">{notice}</div>}

      <section className="complaints-table-card" aria-label="Reclamos recibidos">
        <div className="complaints-table-scroll">
          <table>
            <thead>
              <tr><th>Constancia</th><th>Consumidor</th><th>Tipo y estado</th><th>Recibido</th><th /></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.receipt_code}</strong><small>{row.product_service}</small></td>
                  <td>{row.consumer_name}<small>{row.email}</small></td>
                  <td><span>{row.classification === 'reclamo' ? 'Reclamo' : 'Queja'}</span><small>{statuses[row.status] || row.status}</small></td>
                  <td>{displayDate(row.received_at)}</td>
                  <td><button type="button" onClick={() => openRow(row)}>Abrir</button></td>
                </tr>
              ))}
              {loading && <tr><td colSpan="5">Cargando registros…</td></tr>}
              {!loading && !rows.length && !error && <tr><td colSpan="5">Todavía no hay reclamos registrados.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {selected && (
        <section className="complaints-detail">
          <div className="complaints-detail-heading">
            <div><h2>{selected.receipt_code}</h2><p>{selected.classification === 'reclamo' ? 'Reclamo' : 'Queja'} · {displayDate(selected.received_at)}</p></div>
            <button type="button" onClick={() => setSelected(null)}>Cerrar</button>
          </div>
          <dl>
            {[
              ['Consumidor', selected.consumer_name],
              ['Documento', `${selected.document_type} ${selected.document_number}`],
              ['Dirección', selected.address],
              ['Correo', selected.email],
              ['Teléfono', selected.phone],
              ['Representante de menor', selected.minor_name],
              ['Documento del representante', selected.minor_document],
              ['Servicio', selected.product_service],
              ['Reserva', selected.booking_code],
              ['Monto', selected.amount == null ? '—' : `S/ ${Number(selected.amount).toFixed(2)}`],
              ['Hechos', selected.description],
              ['Solicitud', selected.consumer_request],
              ['Estado', statuses[selected.status] || selected.status]
            ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}
          </dl>

          <h3>Historial de atención</h3>
          {actions.length
            ? <ol>{actions.map((action) => (
                <li key={action.id}>
                  <strong>{action.action_type === 'response' ? 'Respuesta' : action.action_type === 'internal_note' ? 'Nota interna' : 'Cambio de estado'} · {displayDate(action.created_at)}</strong>
                  <p>{action.message}</p>
                </li>
              ))}</ol>
            : <p className="complaints-empty-history">No hay acciones registradas.</p>}

          <form onSubmit={saveAction}>
            <label>Acción
              <select name="action_type" defaultValue="response">
                <option value="response">Registrar respuesta</option>
                <option value="status">Cambio de estado</option>
                <option value="internal_note">Nota interna</option>
              </select>
            </label>
            <label>Estado
              <select name="status" defaultValue={selected.status}>
                {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>Respuesta o motivo
              <textarea name="message" minLength="2" maxLength="5000" required />
            </label>
            <button type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar en historial'}</button>
          </form>
        </section>
      )}
    </main>
  )
}

export default ComplaintsPage
