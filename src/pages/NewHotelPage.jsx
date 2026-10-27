import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

import AdminSidebar from '../components/admin/AdminSidebar'
import HotelSetupBottomBar from '../components/hotels/HotelSetupBottomBar'

import wakiMascot from '../assets/waki_admin_access.png'

function Icon({ type, size = 19 }) {
  const icons = {
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </>
    ),

    check: <path d="m5 12 4 4L19 6" />,

    hotel: (
      <>
        <rect x="4" y="4" width="16" height="17" rx="2" />
        <path d="M8 8h2M14 8h2M8 12h2M14 12h2M10 21v-4h4v4" />
      </>
    )
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[type]}
    </svg>
  )
}

const EMPTY_FORM = {
  commercialName: '',
  legalName: '',
  ruc: '',
  contactEmail: '',
  phone: '',
  billingEmail: '',
  websiteUrl: ''
}

function NewHotelPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const brandIdFromUrl =
    searchParams.get('brandId')

  const [brandId, setBrandId] =
    useState(brandIdFromUrl || null)

  const [form, setForm] =
    useState(()=>{if(brandIdFromUrl)return EMPTY_FORM;try{return {...EMPTY_FORM,...JSON.parse(localStorage.getItem('waki-hotel-brand-draft')||'{}')}}catch{return EMPTY_FORM}})

  const [loading, setLoading] =
    useState(Boolean(brandIdFromUrl))

  const [saving, setSaving] =
    useState(false)

  const [errorMessage, setErrorMessage] =
    useState('')

  const [successMessage, setSuccessMessage] =
    useState('')

  useEffect(() => {
    if (!brandIdFromUrl) return

    const loadBrand = async () => {
      try {
        setLoading(true)

        const {
          data,
          error
        } = await supabase
          .from('hotel_brands')
          .select(`
            id,
            commercial_name,
            legal_name,
            ruc,
            billing_email,
            contact_email,
            phone,
            website_url,
            approval_status
          `)
          .eq('id', brandIdFromUrl)
          .single()

        if (error) {
          throw error
        }

        setBrandId(data.id)

        setForm({
          commercialName:
            data.commercial_name || '',

          legalName:
            data.legal_name || '',

          ruc:
            data.ruc || '',

          contactEmail:
            data.contact_email || '',

          phone:
            data.phone || '',

          billingEmail:
            data.billing_email || '',

          websiteUrl:
            data.website_url || ''
        })
      } catch (error) {
        console.error(
          'Error cargando marca:',
          error
        )

        setErrorMessage(
          'No se pudo cargar la información de la marca.'
        )
      } finally {
        setLoading(false)
      }
    }

    const timer=setTimeout(loadBrand,0)
    return ()=>clearTimeout(timer)
  }, [brandIdFromUrl])

  const updateField = (
    field,
    value
  ) => {
    setForm((current) => {
      const updated = {
        ...current,
        [field]: value
      }

      localStorage.setItem(
        'waki-hotel-brand-draft',
        JSON.stringify(updated)
      )

      return updated
    })

    setErrorMessage('')
    setSuccessMessage('')
  }

  const checklist = useMemo(() => {
    return {
      commercial:
        form.commercialName
          .trim() !== '',

      legal:
        form.legalName
          .trim() !== '' &&
        /^\d{11}$/.test(
          form.ruc.replace(/\D/g, '')
        ),

      contact:
        form.contactEmail
          .trim() !== '' &&
        form.phone
          .trim() !== '',

      website:
        form.websiteUrl
          .trim() !== ''
    }
  }, [form])

  const validateForm = () => {
    if (
      !form.commercialName.trim()
    ) {
      return 'Ingresa el nombre comercial.'
    }

    if (
      !form.legalName.trim()
    ) {
      return 'Ingresa la razón social.'
    }

    const normalizedRuc =
      form.ruc.replace(/\D/g, '')

    if (
      normalizedRuc.length !== 11
    ) {
      return 'El RUC debe tener 11 dígitos.'
    }

    if (
      !form.contactEmail.trim()
    ) {
      return 'Ingresa el correo de contacto.'
    }

    if (
      !form.phone.trim()
    ) {
      return 'Ingresa el teléfono de contacto.'
    }

    if (
      !form.billingEmail.trim()
    ) {
      return 'Ingresa el correo de facturación.'
    }

    return null
  }

  const saveBrandToSupabase =
    async () => {
      const validationError =
        validateForm()

      if (validationError) {
        throw new Error(
          validationError
        )
      }

      const payload = {
        commercial_name:
          form.commercialName.trim(),

        legal_name:
          form.legalName.trim(),

        ruc:
          form.ruc.replace(/\D/g, ''),

        billing_email:
          form.billingEmail.trim(),

        contact_email:
          form.contactEmail.trim(),

        phone:
          form.phone.trim(),

        website_url:
          form.websiteUrl.trim() ||
          null,

        approval_status:
          'draft'
      }

      if (brandId) {
        const {
          data,
          error
        } = await supabase
          .from('hotel_brands')
          .update(payload)
          .eq('id', brandId)
          .select('id')
          .single()

        if (error) {
          throw error
        }

        return data.id
      }

      const {
        data,
        error
      } = await supabase
        .from('hotel_brands')
        .insert(payload)
        .select('id')
        .single()

      if (error) {
        throw error
      }

      setBrandId(data.id)

      navigate(
        `/hoteles/nuevo?brandId=${data.id}`,
        {
          replace: true
        }
      )

      return data.id
    }

  const handleSaveDraft =
    async () => {
      setErrorMessage('')
      setSuccessMessage('')

      const validationError =
        validateForm()

      /*
       * Si los campos todavía están incompletos,
       * lo guardamos localmente.
       */
      if (validationError) {
        localStorage.setItem(
          'waki-hotel-brand-draft',
          JSON.stringify(form)
        )

        setSuccessMessage(
          'Borrador guardado en este navegador.'
        )

        return
      }

      try {
        setSaving(true)

        await saveBrandToSupabase()

        localStorage.removeItem(
          'waki-hotel-brand-draft'
        )

        setSuccessMessage(
          'Borrador guardado correctamente.'
        )
      } catch (error) {
        console.error(
          'Error guardando borrador:',
          error
        )

        if (
          error?.code === '23505'
        ) {
          setErrorMessage(
            'Ya existe una marca registrada con este RUC.'
          )
        } else {
          setErrorMessage(
            error.message ||
              'No se pudo guardar el borrador.'
          )
        }
      } finally {
        setSaving(false)
      }
    }

  const handleContinue =
    async () => {
      setErrorMessage('')
      setSuccessMessage('')

      try {
        setSaving(true)

        const savedBrandId =
          await saveBrandToSupabase()

        localStorage.removeItem(
          'waki-hotel-brand-draft'
        )

        navigate(
          `/hoteles/nuevo/${savedBrandId}/sede`
        )
      } catch (error) {
        console.error(
          'Error continuando:',
          error
        )

        if (
          error?.code === '23505'
        ) {
          setErrorMessage(
            'Ya existe una marca registrada con este RUC.'
          )
        } else {
          setErrorMessage(
            error.message ||
              'No se pudo guardar la información.'
          )
        }
      } finally {
        setSaving(false)
      }
    }

  if (loading) {
    return (
      <div className="admin-auth-loading">
        <div className="admin-auth-loader" />

        <span>
          Cargando información...
        </span>
      </div>
    )
  }

  return (
    <div className="hotel-setup-layout">
      <AdminSidebar />

      <main className="hotel-setup-main">

        <section className="hotel-brand-heading">
          <span>
            Configuración / Paso 1
          </span>

          <h1>
            Marca del hotel
          </h1>

          <p>
            Registra la información de tu marca comercial.
            Estos datos se usarán como base antes de crear
            tu propiedad.
          </p>
        </section>

        <div className="hotel-brand-content-grid">

          {/* FORMULARIO PRINCIPAL */}
          <section className="hotel-brand-form-card">

            {/* ILUSTRACIÓN WAKI */}
            <aside className="hotel-brand-visual">
              <div className="brand-visual-image">
                <img
                  src={wakiMascot}
                  alt="WAKI"
                />
              </div>

              <div className="brand-hotel-badge">
                <Icon
                  type="hotel"
                  size={27}
                />
              </div>

              <h2>
                Tu marca,
                <br />
                el primer paso para
                <br />
                una gran experiencia.
              </h2>

              <span className="brand-visual-line" />
            </aside>

            {/* CAMPOS */}
            <div className="hotel-brand-fields">
              <div className="brand-form-grid">

                {/* NOMBRE COMERCIAL */}
                <div className="brand-form-field">
                  <label>
                    Nombre comercial *
                  </label>

                  <input
                    value={
                      form.commercialName
                    }
                    onChange={(event) =>
                      updateField(
                        'commercialName',
                        event.target.value
                      )
                    }
                    placeholder="Ej. WAKI Hotel"
                  />
                </div>

                {/* RAZÓN SOCIAL */}
                <div className="brand-form-field">
                  <label>
                    Razón social *
                  </label>

                  <input
                    value={
                      form.legalName
                    }
                    onChange={(event) =>
                      updateField(
                        'legalName',
                        event.target.value
                      )
                    }
                    placeholder="Ej. WAKI Hoteles S.A.C."
                  />
                </div>

                {/* RUC */}
                <div className="brand-form-field full">
                  <label>
                    RUC *
                  </label>

                  <input
                    inputMode="numeric"
                    maxLength={11}
                    value={form.ruc}
                    onChange={(event) =>
                      updateField(
                        'ruc',
                        event.target.value
                          .replace(
                            /\D/g,
                            ''
                          )
                          .slice(
                            0,
                            11
                          )
                      )
                    }
                    placeholder="Ej. 20123456789"
                  />
                </div>

                {/* CORREO CONTACTO */}
                <div className="brand-form-field">
                  <label>
                    Correo de contacto *
                  </label>

                  <input
                    type="email"
                    value={
                      form.contactEmail
                    }
                    onChange={(event) =>
                      updateField(
                        'contactEmail',
                        event.target.value
                      )
                    }
                    placeholder="Ej. contacto@wakihotel.com"
                  />
                </div>

                {/* TELÉFONO */}
                <div className="brand-form-field">
                  <label>
                    Teléfono de contacto *
                  </label>

                  <div className="brand-phone-field">
                    <div className="brand-phone-prefix">
                      <span>
                        🇵🇪
                      </span>

                      <span>
                        +51
                      </span>
                    </div>

                    <input
                      value={form.phone}
                      onChange={(event) =>
                        updateField(
                          'phone',
                          event.target.value
                        )
                      }
                      placeholder="987 654 321"
                    />
                  </div>
                </div>

                {/* FACTURACIÓN */}
                <div className="brand-form-field">
                  <label>
                    Correo de facturación *
                  </label>

                  <input
                    type="email"
                    value={
                      form.billingEmail
                    }
                    onChange={(event) =>
                      updateField(
                        'billingEmail',
                        event.target.value
                      )
                    }
                    placeholder="Ej. facturacion@wakihotel.com"
                  />
                </div>

                {/* WEB */}
                <div className="brand-form-field">
                  <label>
                    Sitio web (opcional)
                  </label>

                  <input
                    value={
                      form.websiteUrl
                    }
                    onChange={(event) =>
                      updateField(
                        'websiteUrl',
                        event.target.value
                      )
                    }
                    placeholder="Ej. www.wakihotel.com"
                  />
                </div>
              </div>

              <div className="brand-required-note">
                <span>
                  *
                </span>

                Campos obligatorios
              </div>

              {errorMessage && (
                <div className="brand-form-message error">
                  {errorMessage}
                </div>
              )}

              {successMessage && (
                <div className="brand-form-message success">
                  {successMessage}
                </div>
              )}
            </div>
          </section>

          {/* GUÍA DERECHA */}
          <aside className="hotel-brand-guide-card">
            <div className="brand-guide-heading">
              <span>
                <Icon
                  type="info"
                  size={18}
                />
              </span>

              <h2>
                Información necesaria
              </h2>
            </div>

            <p className="brand-guide-intro">
              Completa los datos de tu marca para
              continuar con la creación de tu hotel.
            </p>

            <GuideItem
              completed={
                checklist.commercial
              }
              title="Nombre comercial"
              description="El nombre con el que te conocerán tus huéspedes."
            />

            <GuideItem
              completed={
                checklist.legal
              }
              title="Razón social y RUC"
              description="Información legal para emitir comprobantes y facturas."
            />

            <GuideItem
              completed={
                checklist.contact
              }
              title="Datos de contacto"
              description="Usaremos estos datos para comunicarnos contigo o con tus huéspedes."
            />

            <GuideItem
              completed={
                checklist.website
              }
              optional
              title="Sitio web"
              description="Ayuda a tus huéspedes a conocer más sobre tu marca."
            />
          </aside>
        </div>

        <HotelSetupBottomBar
          progress={20}
          saving={saving}
          onSaveDraft={
            handleSaveDraft
          }
          onContinue={
            handleContinue
          }
          continueLabel="Continuar a sede"
        />
      </main>
    </div>
  )
}

function GuideItem({
  completed,
  title,
  description,
  optional = false
}) {
  return (
    <div className="brand-guide-item">
      <span
        className={
          completed
            ? 'brand-guide-check completed'
            : 'brand-guide-check'
        }
      >
        {completed && (
          <Icon
            type="check"
            size={13}
          />
        )}
      </span>

      <div>
        <strong>
          {title}

          {optional && (
            <small>
              {' '}
              (opcional)
            </small>
          )}
        </strong>

        <p>
          {description}
        </p>
      </div>
    </div>
  )
}

export default NewHotelPage