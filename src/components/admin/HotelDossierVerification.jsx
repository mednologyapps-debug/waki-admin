import { useEffect, useState } from 'react'
import { Building2, FileText, ShieldCheck } from 'lucide-react'
import './HotelDossierVerification.css'
import { supabase } from '../../lib/supabase'

export default function HotelDossierVerification({ hotelId, onVerified, allowVerify = true, allowPublish = false }) {
  const [dossier, setDossier] = useState(null)
  const [offer, setOffer] = useState(null)
  const [file, setFile] = useState(null)
  const [showAccount, setShowAccount] = useState(false)
  const [contractChecked, setContractChecked] = useState(false)
  const [bankChecked, setBankChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function load() {
    if (!hotelId) return
    const [{ data, error: issue }, contract] = await Promise.all([
      supabase.rpc('hotel_dossier_control', { p_hotel: hotelId }),
      supabase.rpc('hotel_contract_offer', { p_hotel: hotelId })
    ])
    if (issue) {
      setError('No fue posible consultar el expediente privado.')
      onVerified?.(false)
      return
    }
    setDossier(data)
    setOffer(contract.data)
    if (contract.error) setError('No se pudo consultar el contrato publicado.')
    onVerified?.(Boolean(data?.contract_verified && data?.bank_verified))
  }
  useEffect(() => {
    const task = setTimeout(() => { void load() }, 0)
    return () => clearTimeout(task)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId])

  async function openDocument(path) {
    if (!path) return
    const tab = window.open('about:blank','_blank')
    if (tab) tab.opener = null
    const { data, error: issue } = await supabase.storage.from('hotel-affiliations').createSignedUrl(path, 120)
    if (issue || !data?.signedUrl) {
      tab?.close()
      setError('No fue posible abrir el PDF. Revisa tus permisos.')
      return
    }
    if (tab) tab.location.replace(data.signedUrl)
    else window.location.assign(data.signedUrl)
  }

  async function publish() {
    if (busy || !file) return
    if (file.type !== 'application/pdf' || file.size === 0 || file.size > 10 * 1024 * 1024) {
      setError('Selecciona un PDF de hasta 10 MB.')
      return
    }
    setBusy(true); setError(''); setSuccess('')
    try {
      const path = hotelId + '/contracts/' + crypto.randomUUID() + '.pdf'
      const { error: uploadIssue } = await supabase.storage.from('hotel-affiliations')
        .upload(path, file, { contentType: 'application/pdf', upsert: false, cacheControl: '0' })
      if (uploadIssue) throw uploadIssue
      const { error: issue } = await supabase.rpc('hotel_contract_offer', {
        p_hotel: hotelId, p_action: 'publish', p_path: path
      })
      if (issue) throw issue
      setFile(null); setContractChecked(false)
      await load()
      setSuccess('PDF disponible en WAKI Hotel para la aceptación del representante.')
    } catch (issue) {
      setError(issue?.message === 'CONTRACT_ALREADY_ACCEPTED'
        ? 'El representante ya aceptó el contrato publicado.'
        : 'No se pudo publicar el contrato. Revisa el archivo y el estado del hotel.')
    } finally { setBusy(false) }
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
  const documentPath = offer?.document_path || dossier?.signed_contract_path
  return (
    <section aria-label="Expediente de afiliación" className="waki-review-dossier">
      <header className="waki-review-dossier__heading">
        <span className="waki-review-dossier__icon"><ShieldCheck size={21}/></span>
        <div><h3>Expediente de afiliación</h3><p>Contrato y cuenta de abono del hotel.</p></div>
      </header>
      {error && <p role="alert" className="control-error">{error}</p>}
      {success && <p role="status" className="control-success">{success}</p>}
      {!dossier ? <p>{error ? 'Expediente no disponible.' : 'Cargando expediente…'}</p> : (
        <>
          <div className="waki-review-dossier__grid">
            <article>
              <h4><FileText size={17}/> Contrato de afiliación</h4>
              <span className="waki-review-dossier__status" data-done={dossier.contract_verified}>
                {dossier.contract_verified ? 'Verificado' : offer?.accepted_at ? 'Aceptado por el hotel' : offer?.document_path ? 'Pendiente de aceptación' : dossier.contract_ready ? 'PDF registrado' : 'Pendiente de publicar'}
              </span>
              {offer?.accepted_at && <p>Aceptado el {new Date(offer.accepted_at).toLocaleString('es-PE', { timeZone: 'America/Lima' })}.</p>}
              {documentPath && <button type="button" className="control-btn secondary" onClick={() => void openDocument(documentPath)}>Abrir PDF privado</button>}
              {allowPublish && !offer?.accepted_at && !dossier.contract_ready && (
                <div className="waki-review-dossier__publish">
                  <label>PDF de WAKI
                    <input key={offer?.document_path || 'new'} type="file" accept="application/pdf,.pdf" disabled={busy} onChange={e => setFile(e.target.files?.[0] || null)}/>
                  </label>
                  <button type="button" className="control-btn primary" disabled={!file || busy} onClick={() => void publish()}>
                    {busy ? 'Guardando…' : 'Publicar para aceptación'}
                  </button>
                </div>
              )}
            </article>
            <article>
              <h4><Building2 size={17}/> Cuenta bancaria</h4>
              <span className="waki-review-dossier__status" data-done={dossier.bank_verified}>
                {dossier.bank_verified ? 'Verificada' : dossier.bank_ready ? 'Pendiente de verificar' : 'Incompleta'}
              </span>
              {dossier.bank_ready && <>
                <p><strong>{dossier.bank_name}</strong> · {dossier.account_type} · PEN</p>
                <p>{dossier.account_holder} · RUC {dossier.holder_ruc}</p>
                <button type="button" className="control-btn secondary" aria-expanded={showAccount} onClick={() => setShowAccount(value => !value)}>
                  {showAccount ? 'Ocultar cuenta y CCI' : 'Mostrar cuenta y CCI'}
                </button>
                {showAccount && <div aria-label="Datos bancarios sensibles">
                  <p><strong>Cuenta</strong> {dossier.account_number}</p>
                  <p><strong>CCI</strong> {dossier.cci}</p>
                </div>}
              </>}
            </article>
          </div>
          {done && <p className="control-success">Expediente verificado.</p>}
          {allowVerify && !done && <div className="waki-review-dossier__checks">
            <label className="control-check"><input type="checkbox" checked={contractChecked}
              onChange={e => setContractChecked(e.target.checked)} disabled={!dossier.contract_ready || busy}/>
              Revisé el contrato registrado y corresponde a este hotel.</label>
            <label className="control-check"><input type="checkbox" checked={bankChecked}
              onChange={e => setBankChecked(e.target.checked)} disabled={!dossier.bank_ready || busy}/>
              Confirmé la titularidad, la cuenta y el CCI.</label>
            <button className="control-btn primary" type="button" onClick={() => void verify()}
              disabled={busy || !contractChecked || !bankChecked || !dossier.contract_ready || !dossier.bank_ready}>
              {busy ? 'Verificando…' : 'Registrar verificación'}
            </button>
          </div>}
        </>
      )}
    </section>
  )
}
