import { useEffect, useMemo, useState } from 'react'
import {
  useNavigate,
  useParams,
  useSearchParams
} from 'react-router-dom'

import { supabase } from '../lib/supabase'

import AdminSidebar from '../components/admin/AdminSidebar'
import HotelSetupBottomBar from '../components/hotels/HotelSetupBottomBar'

import wakiMascot from '../assets/waki_admin_access.png'

function Icon({ type, size = 19 }) {
  const icons = {
    location: (
      <>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),

    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </>
    ),

    check: (
      <path d="m5 12 4 4L19 6" />
    ),

    hotel: (
      <>
        <rect
          x="4"
          y="4"
          width="16"
          height="17"
          rx="2"
        />
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
  hotelName: '',
  address: '',
  district: '',
  province: 'Lima',
  department: 'Lima',
  phone: '',
  contactEmail: '',
  whatsapp: '',
  description: ''
}

function HotelLocationPage() {
  const navigate = useNavigate()

  const { brandId } = useParams()

  const [searchParams] =
    useSearchParams()

  const hotelIdFromUrl =
    searchParams.get('hotelId')

  const [hotelId, setHotelId] =
    useState(
      hotelIdFromUrl || null
    )

  const [form, setForm] =
    useState(EMPTY_FORM)

  const [brandName, setBrandName] =
    useState('')

  const [loading, setLoading] =
    useState(true)

  const [saving, setSaving] =
    useState(false)

  const [
    errorMessage,
    setErrorMessage
  ] = useState('')

  const [
    successMessage,
    setSuccessMessage
  ] = useState('')

  useEffect(() => {
    let mounted = true

    const loadData = async () => {
      try {
        setLoading(true)

        /*
         * 1. Cargamos la marca.
         */
        const {
          data: brand,
          error: brandError
        } = await supabase
          .from('hotel_brands')
          .select(`
            id,
            commercial_name
          `)
          .eq('id', brandId)
          .single()

        if (brandError) {
          throw brandError
        }

        if (
          mounted &&
          brand?.commercial_name
        ) {
          setBrandName(
            brand.commercial_name
          )
        }

        /*
         * 2. Si ya tenemos hotelId,
         * cargamos esa sede.
         */
        if (hotelIdFromUrl) {
          const {
            data: hotel,
            error: hotelError
          } = await supabase
            .from('hotels')
            .select(`
              id,
              brand_id,
              name,
              description,
              address,
              district,
              province,
              department,
              phone,
              contact_email,
              whatsapp,
              approval_status,
              is_active
            `)
            .eq(
              'id',
              hotelIdFromUrl
            )
            .eq(
              'brand_id',
              brandId
            )
            .single()

          if (hotelError) {
            throw hotelError
          }

          if (mounted) {
            setHotelId(hotel.id)

            setForm({
              hotelName:
                hotel.name || '',

              address:
                hotel.address || '',

              district:
                hotel.district || '',

              province:
                hotel.province ||
                'Lima',

              department:
                hotel.department ||
                'Lima',

              phone:
                hotel.phone || '',

              contactEmail:
                hotel.contact_email ||
                '',

              whatsapp:
                hotel.whatsapp || '',

              description:
                hotel.description || ''
            })
          }

          return
        }

        /*
         * 3. Si no hay hotelId,
         * intentamos recuperar
         * borrador local.
         */
        const localDraft =
          localStorage.getItem(
            `waki-hotel-location-draft-${brandId}`
          )

        if (localDraft) {
          try {
            const parsed =
              JSON.parse(localDraft)

            if (mounted) {
              setForm({
                ...EMPTY_FORM,
                ...parsed
              })
            }
          } catch {
            localStorage.removeItem(
              `waki-hotel-location-draft-${brandId}`
            )
          }
        }
      } catch (error) {
        console.error(
          'Error cargando sede:',
          error
        )

        if (mounted) {
          setErrorMessage(
            'No se pudo cargar la información de la sede.'
          )
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadData()

    return () => {
      mounted = false
    }
  }, [
    brandId,
    hotelIdFromUrl
  ])

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
        `waki-hotel-location-draft-${brandId}`,
        JSON.stringify(updated)
      )

      return updated
    })

    setErrorMessage('')
    setSuccessMessage('')
  }

  const checklist = useMemo(() => {
    return {
      identity:
        form.hotelName
          .trim() !== '',

      location:
        form.address
          .trim() !== '' &&
        form.district
          .trim() !== '',

      region:
        form.province
          .trim() !== '' &&
        form.department
          .trim() !== '',

      contact:
        form.phone
          .trim() !== '',

      digital:
        form.contactEmail
          .trim() !== '' ||
        form.whatsapp
          .trim() !== ''
    }
  }, [form])

  const validateForm = () => {
    if (!form.hotelName.trim()) {
      return 'Ingresa el nombre de la sede.'
    }

    if (!form.address.trim()) {
      return 'Ingresa la dirección de la sede.'
    }

    if (!form.district.trim()) {
      return 'Ingresa el distrito.'
    }

    if (!form.province.trim()) {
      return 'Ingresa la provincia.'
    }

    if (!form.department.trim()) {
      return 'Ingresa el departamento.'
    }

    if (!form.phone.trim()) {
      return 'Ingresa el teléfono de la sede.'
    }

    return null
  }

  const slugify = (value) => {
    return value
      .toLowerCase()
      .normalize('NFD')
      .replace(
        /[\u0300-\u036f]/g,
        ''
      )
      .replace(
        /[^a-z0-9]+/g,
        '-'
      )
      .replace(
        /^-+|-+$/g,
        ''
      )
  }

  const buildSlug = () => {
    const base = slugify(
      `${form.hotelName}-${form.district}`
    )

    /*
     * Agregamos una pequeña parte
     * del brandId para reducir
     * posibles colisiones.
     */
    const brandPart =
      brandId
        ?.replaceAll('-', '')
        .slice(0, 6)

    return `${base}-${brandPart}`
  }

  const saveHotelToSupabase =
    async () => {
      const validationError =
        validateForm()

      if (validationError) {
        throw new Error(
          validationError
        )
      }

      const payload = {
        brand_id: brandId,

        name:
          form.hotelName.trim(),

        slug:
          buildSlug(),

        description:
          form.description.trim() ||
          null,

        address:
          form.address.trim(),

        district:
          form.district.trim(),

        province:
          form.province.trim(),

        department:
          form.department.trim(),

        country_code:
          'PE',

        phone:
          form.phone.trim(),

        contact_email:
          form.contactEmail
            .trim() ||
          null,

        whatsapp:
          form.whatsapp
            .trim() ||
          null,

        timezone:
          'America/Lima',

        approval_status:
          'draft',

        is_active:
          false
      }

      /*
       * EDICIÓN
       */
      if (hotelId) {
        const {
          data,
          error
        } = await supabase
          .from('hotels')
          .update(payload)
          .eq('id', hotelId)
          .select('id')
          .single()

        if (error) {
          throw error
        }

        return data.id
      }

      /*
       * CREACIÓN
       */
      const {
        data,
        error
      } = await supabase
        .from('hotels')
        .insert(payload)
        .select('id')
        .single()

      if (error) {
        throw error
      }

      setHotelId(data.id)

      navigate(
        `/hoteles/nuevo/${brandId}/sede?hotelId=${data.id}`,
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
       * Si faltan campos obligatorios,
       * conservamos borrador local.
       */
      if (validationError) {
        localStorage.setItem(
          `waki-hotel-location-draft-${brandId}`,
          JSON.stringify(form)
        )

        setSuccessMessage(
          'Borrador guardado en este navegador.'
        )

        return
      }

      try {
        setSaving(true)

        await saveHotelToSupabase()

        localStorage.removeItem(
          `waki-hotel-location-draft-${brandId}`
        )

        setSuccessMessage(
          'Sede guardada correctamente.'
        )
      } catch (error) {
        console.error(
          'Error guardando sede:',
          error
        )

        if (
          error?.code === '23505'
        ) {
          setErrorMessage(
            'Ya existe una sede con un identificador similar. Modifica el nombre o distrito.'
          )
        } else {
          setErrorMessage(
            error.message ||
              'No se pudo guardar la sede.'
          )
        }
      } finally {
        setSaving(false)
      }
    }

  const handleBack = () => {
    navigate(
      `/hoteles/nuevo?brandId=${brandId}`
    )
  }

  const handleContinue =
    async () => {
      setErrorMessage('')
      setSuccessMessage('')

      try {
        setSaving(true)

        const savedHotelId =
          await saveHotelToSupabase()

        localStorage.removeItem(
          `waki-hotel-location-draft-${brandId}`
        )

        navigate(
          `/hoteles/${savedHotelId}/habitaciones`
        )
      } catch (error) {
        console.error(
          'Error continuando a habitaciones:',
          error
        )

        if (
          error?.code === '23505'
        ) {
          setErrorMessage(
            'Ya existe una sede con un identificador similar.'
          )
        } else {
          setErrorMessage(
            error.message ||
              'No se pudo guardar la sede.'
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
          Cargando sede...
        </span>
      </div>
    )
  }

  return (
    <div className="hotel-setup-layout">
      <AdminSidebar />

      <main className="hotel-setup-main">

        {/* =========================
            TÍTULO
        ========================= */}

        <section className="hotel-brand-heading">
          <span>
            Configuración / Paso 2
          </span>

          <h1>
            Sede del hotel
          </h1>

          <p>
            Registra la ubicación y los datos de contacto
            de la propiedad que ofrecerá habitaciones en
            WAKI.
          </p>

          {brandName && (
            <div className="location-brand-chip">
              <Icon
                type="hotel"
                size={15}
              />

              Marca:
              <strong>
                {brandName}
              </strong>
            </div>
          )}
        </section>

        <div className="hotel-brand-content-grid">

          {/* =========================
              CARD PRINCIPAL
          ========================= */}

          <section className="hotel-brand-form-card">

            {/* VISUAL WAKI */}

            <aside className="hotel-brand-visual location-visual">
              <div className="brand-visual-image location-visual-image">
                <img
                  src={wakiMascot}
                  alt="WAKI"
                />

                <span className="location-pin-floating">
                  <Icon
                    type="location"
                    size={31}
                  />
                </span>
              </div>

              <div className="brand-hotel-badge">
                <Icon
                  type="location"
                  size={26}
                />
              </div>

              <h2>
                Una buena ubicación
                <br />
                empieza con datos
                <br />
                precisos.
              </h2>

              <p className="location-visual-copy">
                Esta información ayudará a
                tus huéspedes a encontrar
                fácilmente la propiedad.
              </p>

              <span className="brand-visual-line" />
            </aside>

            {/* CAMPOS */}

            <div className="hotel-brand-fields">

              <div className="brand-form-grid">

                {/* NOMBRE */}
                <div className="brand-form-field full">
                  <label>
                    Nombre de la sede *
                  </label>

                  <input
                    value={
                      form.hotelName
                    }
                    onChange={(event) =>
                      updateField(
                        'hotelName',
                        event.target.value
                      )
                    }
                    placeholder="Ej. Hotel Velmar Boutique"
                  />
                </div>

                {/* DIRECCIÓN */}
                <div className="brand-form-field full">
                  <label>
                    Dirección *
                  </label>

                  <input
                    value={
                      form.address
                    }
                    onChange={(event) =>
                      updateField(
                        'address',
                        event.target.value
                      )
                    }
                    placeholder="Ej. Av. Larco 123"
                  />
                </div>

                {/* DISTRITO */}
                <div className="brand-form-field">
                  <label>
                    Distrito *
                  </label>

                  <input
                    value={
                      form.district
                    }
                    onChange={(event) =>
                      updateField(
                        'district',
                        event.target.value
                      )
                    }
                    placeholder="Ej. Miraflores"
                  />
                </div>

                {/* PROVINCIA */}
                <div className="brand-form-field">
                  <label>
                    Provincia *
                  </label>

                  <input
                    value={
                      form.province
                    }
                    onChange={(event) =>
                      updateField(
                        'province',
                        event.target.value
                      )
                    }
                    placeholder="Ej. Lima"
                  />
                </div>

                {/* DEPARTAMENTO */}
                <div className="brand-form-field">
                  <label>
                    Departamento *
                  </label>

                  <input
                    value={
                      form.department
                    }
                    onChange={(event) =>
                      updateField(
                        'department',
                        event.target.value
                      )
                    }
                    placeholder="Ej. Lima"
                  />
                </div>

                {/* TELÉFONO */}
                <div className="brand-form-field">
                  <label>
                    Teléfono de sede *
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
                      value={
                        form.phone
                      }
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

                {/* CORREO */}
                <div className="brand-form-field">
                  <label>
                    Correo de sede
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
                    placeholder="Ej. miraflores@hotel.com"
                  />
                </div>

                {/* WHATSAPP */}
                <div className="brand-form-field">
                  <label>
                    WhatsApp
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
                      value={
                        form.whatsapp
                      }
                      onChange={(event) =>
                        updateField(
                          'whatsapp',
                          event.target.value
                        )
                      }
                      placeholder="987 654 321"
                    />
                  </div>
                </div>

                {/* DESCRIPCIÓN */}
                <div className="brand-form-field full">
                  <label>
                    Descripción breve de la sede
                  </label>

                  <textarea
                    className="location-description"
                    value={
                      form.description
                    }
                    onChange={(event) =>
                      updateField(
                        'description',
                        event.target.value
                      )
                    }
                    placeholder="Ej. Hotel boutique ubicado a pocos minutos del centro comercial y principales avenidas de Miraflores."
                  />
                </div>
              </div>

              <div className="brand-required-note">
                <span>*</span>
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

          {/* =========================
              GUÍA DERECHA
          ========================= */}

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
              Completa los datos de la propiedad para
              poder continuar con la configuración de
              habitaciones.
            </p>

            <GuideItem
              completed={
                checklist.identity
              }
              title="Nombre de la sede"
              description="Identifica claramente esta propiedad dentro de la marca."
            />

            <GuideItem
              completed={
                checklist.location
              }
              title="Dirección y distrito"
              description="Permitirá ubicar correctamente el hotel dentro de WAKI."
            />

            <GuideItem
              completed={
                checklist.region
              }
              title="Provincia y departamento"
              description="Nos permite organizar la oferta por ubicación."
            />

            <GuideItem
              completed={
                checklist.contact
              }
              title="Teléfono de sede"
              description="Canal principal de comunicación con la propiedad."
            />

            <GuideItem
              completed={
                checklist.digital
              }
              optional
              title="Contacto digital"
              description="Correo o WhatsApp para complementar la comunicación."
            />
          </aside>
        </div>

        {/* =========================
            BARRA INFERIOR
        ========================= */}

        <HotelSetupBottomBar
          progress={40}
          saving={saving}
          onBack={handleBack}
          onSaveDraft={
            handleSaveDraft
          }
          onContinue={
            handleContinue
          }
          backLabel="Volver a Marca"
          continueLabel="Continuar a habitaciones"
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

export default HotelLocationPage