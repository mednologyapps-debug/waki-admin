import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function HotelDossierVerification({ hotelId, onVerified, allowVerify = true }) {
  const [dossier, setDossier] = useState(null)
  const [showAccount, setShowAccount] = useState(false)
  const [contractChecked, setContractChecked] = useState(false)
  const [bankChecked, setBankChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function load() {
    if (!hotelId) return
    const { data, error: issue } = await supabase.rpc('hotel_dossier_control', { p_hotel: hotelId })
    if (issue) {
      setError('No fue posible consultar el expediente privado.')
      onVerified?.(false)
      return
    }
    setDossier(data)
    onVerified?.(Boolean(data?.contract_verified && data?.bank_verified))
  }
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId])

  async function openDocument(path) {
    if (!path) return
    const tab = window.open('about:blank','_blank')
    const { data, error: issue } = await supabase.storage.from('hotel-affiliations').createSignedUrl(path, 120)
    if (issue || !data?.signedUrl) {
      tab?.close()
      setError('No fue posible abrir el PDF. Revisa tus permisos.')
      return
    }
    if (tab) tab.location.replace(data.signedUrl)
    else window.location.assign(data.signedUrl)
  }

  async function verify() {
    if (!contractChecked || !bankChecked) return
    setError(''); setSuccess(''); setBusy(true)
    try {
      const { error: issue } = await supabase.rpc('hotel_dossier_control', {
        p_hotel: hotelId, p_action: 'verify',
        p_data: { contract_verified: true, bank_verified: true }
      })
      if (issue) throw issue
      await load()
      setSuccess('Expediente verificado y registrado con tu usuario y fecha.')
    } catch {
      setError('No se pudo verificar el expediente. Comprueba los documentos.')
    } finally { setBusy(false) }
  }
  const done = Boolean(dossier?.contract_verified && dossier?.bank_verified)
  return (
    <section aria-label="Expediente de afiliación" className="control-panel" style={{
      border: '1px solid #e8e3f2', borderRadius: 14, padding: 18, marginBlock: 16,
      background: 'var(--surface, #fff)'
    }}>
      <h3 style={{ marginTop: 0 }}>Expediente de afiliación</h3>
      <p className="control-hint">Contrato firmado y datos bancarios del hotel. Acceso exclusivo para administradores autorizados.</p>
      {error && <p role="alert" style={{ color: '#b42318' }}>{error}</p>}
      {success && <p role="status" style={{ color: '#18764a' }}>{success}</p>}
      {!dossier ? <p>Cargando expediente…</p> : (
        <>
          <p><strong>Contrato:</strong> {dossier.contract_verified ? 'Verificado' : dossier.contract_ready ? 'Cargado, pendiente de verificar' : 'No cargado'}</p>
          {dossier.signed_contract_path && <button type="button" className="control-btn secondary"
            onClick={() => void openDocument(dossier.signed_contract_path)}>Abrir contrato firmado (PDF privado)</button>}
          {dossier.bank_document_path && <button type="button" className="control-btn secondary"
            onClick={() => void openDocument(dossier.bank_document_path)}>Abrir constancia bancaria</button>}
          <p><strong>Cuenta bancaria:</strong> {dossier.bank_verified ? 'Verificada' : dossier.bank_ready ? 'Registrada, pendiente de verificar' : 'Incompleta'}</p>
          {dossier.bank_ready && <>
            <p><strong>Banco:</strong> {dossier.bank_name} · {dossier.account_type} · PEN</p>
            <p><strong>Titular:</strong> {dossier.account_holder} · RUC {dossier.holder_ruc}</p>
            <button type="button" className="control-btn secondary" onClick={() => setShowAccount(s => !s)}>
              {showAccount ? 'Ocultar cuenta y CCI' : 'Mostrar cuenta y CCI'}
            </button>
            {showAccount && <div role="region" aria-label="Datos bancarios sensibles">
              <p><strong>Cuenta:</strong> {dossier.account_number}</p>
              <p><strong>CCI:</strong> {dossier.cci}</p>
            </div>}
          </>}
          {done && <p style={{ color: '#18764a' }}>Contrato y cuenta bancaria verificados para la aprobación.</p>}
          {allowVerify && !done && <>
            <label className="control-check"><input type="checkbox" checked={contractChecked}
              onChange={e => setContractChecked(e.target.checked)} disabled={!dossier.contract_ready || busy} />
              Revisé el PDF del contrato firmado y corresponde al hotel.</label>
            <label className="control-check"><input type="checkbox" checked={bankChecked}
              onChange={e => setBankChecked(e.target.checked)} disabled={!dossier.bank_ready || busy} />
              Confirmé que la cuenta, el CCI y el titular son correctos.</label>
            <button className="control-btn primary" type="button" onClick={() => void verify()}
              disabled={busy || !contractChecked || !bankChecked || !dossier.contract_ready || !dossier.bank_ready}>
              {busy ? 'Verificando…' : 'Registrar verificación'}
            </button>
          </>}
          <p className="control-hint">La subida del PDF o los datos por el hotel no equivalen a una aprobación automática.</p>
        </>
      )}
    </section>
  )
}
