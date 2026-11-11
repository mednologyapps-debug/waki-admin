import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Mail, Send, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { PLAN_OPTIONS } from '../lib/commercialPlans'
import './QuickHotelInvitation.css'

const blank = { hotel: '', representative: '', email: '', legalName: '', ruc: '', planCode: 'socio' }

function errorMessage(error) {
  const code = String(error?.message || '')
  const messages = {
    INVALID_HOTEL_NAME: 'Ingresa el nombre completo del hotel (mínimo 3 caracteres).',
    INVALID_REPRESENTATIVE: 'Ingresa el nombre de la persona responsable.',
    INVALID_CONTACT_EMAIL: 'Ingresa un correo electrónico válido.',
    INVALID_LEGAL_NAME: 'Ingresa la razón social del hotel.',
    INVALID_RUC: 'El RUC debe tener 11 dígitos.',
    INVALID_PLAN: 'Selecciona un plan comercial.',
    RUC_ALREADY_REGISTERED: 'Ese RUC ya está registrado en WAKI.',
    INVITE_ALREADY_PENDING: 'Este hotel ya tiene una invitación activa para ese correo. Revisa las invitaciones recientes.',
    HOTEL_ALREADY_REGISTERED: 'Este hotel ya se encuentra registrado con ese correo.',
    DAILY_INVITE_LIMIT_REACHED: 'Alcanzaste el límite de invitaciones del día.',
    EMAIL_INVITE_LIMIT_REACHED: 'Se alcanzó el límite de invitaciones a este correo. Inténtalo otro día.',
    NOT_AUTHORIZED: 'Tu cuenta no tiene permisos para invitar hoteles.'
  }
  return Object.entries(messages).find(([key]) => code.includes(key))?.[1]
    || 'No se pudo generar la invitación. Comprueba los datos y vuelve a intentar.'
}

export default function QuickHotelInvitationDialog({ onClose, onCreated }) {
  const ref = useRef(null)
  const [form, setForm] = useState(blank)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const dialog = ref.current
    const previous = document.body.style.overflow
    dialog?.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      if (dialog?.open) dialog.close()
      document.body.style.overflow = previous
    }
  }, [])

  async function handleCreate(event) {
    event.preventDefault()
    if (saving) return
    setError('')
    setSaving(true)
    try {
      const { data, error: requestError } = await supabase.rpc('create_quick_hotel_invitation', {
        p_hotel_name: form.hotel.trim(),
        p_representative_name: form.representative.trim(),
        p_email: form.email.trim().toLowerCase(),
        p_legal_name: form.legalName.trim(),
        p_ruc: form.ruc.replace(/\D/g, ''),
        p_plan_code: form.planCode
      })
      if (requestError) throw requestError
      if (!data?.id) throw new Error('MISSING_INVITE')
      setResult(data)
      onCreated?.()
    } catch (failure) {
      setError(errorMessage(failure))
    } finally {
      setSaving(false)
    }
  }

  async function copyInvitation() {
    if (!result?.invitation_url) return
    try {
      await navigator.clipboard.writeText(result.invitation_url)
      setCopied(true)
    } catch {
      setError('No se pudo copiar el enlace. Puedes consultarlo desde el registro de invitaciones.')
    }
  }

  return (
    <dialog
      className="waki-quick-modal"
      ref={ref}
      aria-labelledby="waki-quick-title"
      onCancel={(event) => { event.preventDefault(); if (!saving) onClose() }}
      onClick={(event) => { if (event.target === event.currentTarget && !saving) onClose() }}
    >
      <div className="waki-quick-modal__header">
        <div className="waki-quick-modal__glyph"><Mail size={20} /></div>
        <button type="button" className="waki-quick-icon-btn" aria-label="Cerrar" onClick={onClose} disabled={saving}><X size={19} /></button>
      </div>
      {result ? (
        <div className="waki-quick-modal__success" role="status">
          <div className="waki-quick-modal__success-icon"><Check size={24} /></div>
          <h2 id="waki-quick-title">Invitación preparada</h2>
          <p>Registramos la invitación de <strong>{form.hotel.trim()}</strong> para <strong>{result.contact_email}</strong>.</p>
          <p>Razón social: <strong>{form.legalName.trim()}</strong> · RUC <strong>{form.ruc}</strong> · Plan <strong>{PLAN_OPTIONS.find(p => p.code === form.planCode)?.title}</strong>.</p>
          <div className="waki-quick-modal__note">
            La invitación se envía automáticamente. El representante podrá abrir el enlace y completar el registro de su hotel.
          </div>
          <div className="waki-quick-modal__actions">
            <button type="button" className="waki-quick-secondary" onClick={copyInvitation}>
              {copied ? <Check size={16}/> : <Copy size={16}/>}
              {copied ? 'Enlace copiado' : 'Copiar invitación'}
            </button>
            <button type="button" className="waki-quick-primary" onClick={onClose}>Listo</button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleCreate} className="waki-quick-modal__form">
          <h2 id="waki-quick-title">Agregar hotel</h2>
          <p className="waki-quick-muted">
            Define los datos legales y el plan que aparecerán en el contrato. El representante recibirá un enlace para crear su acceso y confirmar el teléfono en WAKI Hotel.
          </p>
          <label>Nombre del hotel
            <input type="text" value={form.hotel} maxLength={120} minLength={3} autoFocus required
              placeholder="Ej. Hotel Miraflores" onChange={e => setForm(s => ({ ...s, hotel: e.target.value }))} />
          </label>
          <label>Nombre del representante
            <input type="text" value={form.representative} maxLength={120} minLength={2} required
              placeholder="Nombre y apellido" onChange={e => setForm(s => ({ ...s, representative: e.target.value }))} />
          </label>
          <label>Razón social
            <input type="text" value={form.legalName} maxLength={160} minLength={3} required
              placeholder="Razón social registrada en SUNAT" onChange={e => setForm(s => ({ ...s, legalName: e.target.value }))} />
          </label>
          <label>RUC
            <input type="text" inputMode="numeric" value={form.ruc} maxLength={11} minLength={11} required
              placeholder="11 dígitos" onChange={e => setForm(s => ({ ...s, ruc: e.target.value.replace(/\D/g, '').slice(0, 11) }))} />
          </label>
          <label>Plan comercial
            <select value={form.planCode} onChange={e => setForm(s => ({ ...s, planCode: e.target.value }))} required>
              {PLAN_OPTIONS.map(plan => <option key={plan.code} value={plan.code}>
                {plan.title} · {plan.rate}% + IGV{plan.monthly ? ' · S/99 + IGV al mes' : ' · sin cuota mensual'}
              </option>)}
            </select>
          </label>
          <label>Correo del hotel
            <input type="email" value={form.email} maxLength={254} required autoComplete="email"
              placeholder="contacto@hotel.com" onChange={e => setForm(s => ({ ...s, email: e.target.value }))} />
          </label>
          {error && <p role="alert" className="waki-quick-error">{error}</p>}
          <div className="waki-quick-modal__actions">
            <button type="button" className="waki-quick-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="waki-quick-primary" disabled={saving}>
              <Send size={16}/>{saving ? 'Preparando...' : 'Enviar invitación'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}

const deliveryLabels = {
  pending: 'Envío solicitado', sending: 'Contactando Mailjet', unconfigured: 'Sin configurar',
  sent: 'Aceptado por Mailjet', failed: 'Error de envío',
  unknown: 'Revisar envío', skipped: 'No enviado'
}

export function QuickHotelInvitationList({ refreshKey = 0 }) {
  const [invites, setInvites] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function refresh() {
      const { data, error: failure } = await supabase.rpc('list_quick_hotel_invitations', { p_limit: 12 })
      if (!active) return
      if (failure) {
        setError('No se pudieron consultar las invitaciones recientes.')
        return
      }
      setError('')
      const now = Date.now()
      setInvites(Array.isArray(data) ? data.map(invite => ({
        ...invite,
        is_expired: invite.status === 'pending' && Date.parse(invite.expires_at) < now
      })) : [])
    }
    void refresh()
    // Only after creating an invitation, refresh once more to surface the
    // Mailjet receipt without constant polling or extra network traffic.
    const followUp = refreshKey > 0 ? window.setTimeout(() => { void refresh() }, 4000) : null
    return () => {
      active = false
      if (followUp !== null) window.clearTimeout(followUp)
    }
  }, [refreshKey])

  if (!invites.length && !error) return null

  return (
    <section className="waki-quick-list" aria-label="Invitaciones recientes de hoteles">
      <div className="waki-quick-list__heading">
        <div><h2>Invitaciones recientes</h2><p>Hoteles invitados que aún están completando su registro.</p></div>
        <span>{invites.length}</span>
      </div>
      {error && <p className="waki-quick-error">{error}</p>}
      <div className="waki-quick-list__rows">
        {invites.map(invite => {
          const expired = invite.is_expired
          const stage = invite.status === 'claimed' ? 'Hotel registrado' : expired ? 'Invitación vencida' : 'Pendiente de registro'
          return (
            <div className="waki-quick-list__row" key={invite.id}>
              <div className="waki-quick-list__hotel">
                <strong>{invite.hotel_name}</strong>
                <span>{invite.representative_name} · {invite.contact_email}</span>
              </div>
              <div className="waki-quick-list__statuses">
                <span className={invite.status === 'claimed' ? 'waki-quick-tag is-done' : 'waki-quick-tag'}>{stage}</span>
                <small>{deliveryLabels[invite.delivery_status] || 'Sin registro de envío'}</small>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
