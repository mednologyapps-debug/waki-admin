import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

import AdminSidebar from '../components/admin/AdminSidebar'
import HotelSetupBottomBar from '../components/hotels/HotelSetupBottomBar'

function Icon({ type, size = 19 }) {
  const icons = {
    check: (
      <path d="m5 12 4 4L19 6" />
    ),

    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </>
    ),

    hotel: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3" />
      </>
    ),

    location: (
      <>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),

    room: (
      <>
        <path d="M4 12h16v8H4z" />
        <path d="M6 12V8h5a3 3 0 0 1 3 3v1" />
        <path d="M4 18h16M7 20v2M17 20v2" />
      </>
    ),

    money: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M15 8.5c-.7-.7-1.7-1-3-1-1.7 0-3 .8-3 2s1.1 1.8 3 2.3c1.9.5 3 1.1 3 2.5s-1.3 2.2-3 2.2c-1.4 0-2.5-.4-3.3-1.3M12 5v14" />
      </>
    ),

    edit: (
      <>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
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

function HotelReviewPage() {
  const navigate = useNavigate()
  const { hotelId } = useParams()

  const [hotel, setHotel] = useState(null)
  const [rooms, setRooms] = useState([])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    let mounted = true

    const loadReview = async () => {
      try {
        setLoading(true)
        setErrorMessage('')

        const {
          data: hotelData,
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
            is_active,
            submitted_at,
            reviewed_at,
            hotel_brands (
              id,
              commercial_name,
              legal_name,
              ruc,
              contact_email,
              phone,
              billing_email,
              website_url
            )
          `)
          .eq('id', hotelId)
          .single()

        if (hotelError) {
          throw hotelError
        }

        const {
          data: roomData,
          error: roomError
        } = await supabase
          .from('room_types')
          .select(`
            id,
            name,
            description,
            inventory_count,
            max_guests,
            bed_type,
            size_m2,
            room_type_images (
              id,
              image_url,
              is_cover,
              display_order
            ),
            rate_plans (
              id,
              name,
              duration_minutes,
              base_price,
              currency,
              display_order,
              rate_rules (
                id,
                name,
                days_of_week,
                price,
                is_active
              )
            )
          `)
          .eq('hotel_id', hotelId)
          .eq('is_active', true)
          .order('display_order', {
            ascending: true
          })

        if (roomError) {
          throw roomError
        }

        if (mounted) {
          setHotel(hotelData)

          setRooms(
            (roomData || []).map((room) => ({
              ...room,

              room_type_images:
                [...(room.room_type_images || [])]
                  .sort(
                    (a, b) =>
                      a.display_order -
                      b.display_order
                  ),

              rate_plans:
                [...(room.rate_plans || [])]
                  .sort(
                    (a, b) =>
                      a.display_order -
                      b.display_order
                  )
            }))
          )
        }
      } catch (error) {
        console.error(
          'Error cargando revisión:',
          error
        )

        if (mounted) {
          setErrorMessage(
            'No se pudo cargar la revisión del hotel.'
          )
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadReview()

    return () => {
      mounted = false
    }
  }, [hotelId])

  const completion = useMemo(() => {
    if (!hotel) {
      return {
        brand: false,
        location: false,
        rooms: false,
        rates: false
      }
    }

    const brand =
      Boolean(
        hotel.hotel_brands?.commercial_name &&
        hotel.hotel_brands?.legal_name &&
        hotel.hotel_brands?.ruc
      )

    const location =
      Boolean(
        hotel.name &&
        hotel.address &&
        hotel.district &&
        hotel.province &&
        hotel.department
      )

    const roomsComplete =
      rooms.length > 0 &&
      rooms.every(
        (room) =>
          room.name &&
          room.inventory_count > 0 &&
          room.max_guests > 0
      )

    const ratesComplete =
      rooms.length > 0 &&
      rooms.every(
        (room) =>
          room.rate_plans &&
          room.rate_plans.length > 0
      )

    return {
      brand,
      location,
      rooms: roomsComplete,
      rates: ratesComplete
    }
  }, [hotel, rooms])

  const isComplete =
    completion.brand &&
    completion.location &&
    completion.rooms &&
    completion.rates

  const handleBack = () => {
    navigate(
      `/hoteles/${hotelId}/tarifas`
    )
  }

  const handleSaveDraft = async () => {
    try {
      setSaving(true)
      setErrorMessage('')
      setSuccessMessage('')

      const {
        error
      } = await supabase
        .from('hotels')
        .update({
          approval_status: 'draft',
          is_active: false
        })
        .eq('id', hotelId)

      if (error) {
        throw error
      }

      setHotel((current) => ({
        ...current,
        approval_status: 'draft',
        is_active: false
      }))

      setSuccessMessage(
        'El hotel se mantuvo como borrador.'
      )
    } catch (error) {
      console.error(
        'Error guardando borrador:',
        error
      )

      setErrorMessage(
        error.message ||
          'No se pudo guardar el hotel como borrador.'
      )
    } finally {
      setSaving(false)
    }
  }

  const handleSubmitForReview = async () => {
    if (!isComplete) {
      setErrorMessage(
        'Completa Marca, Sede, Habitaciones y Tarifas antes de enviar a revisión.'
      )

      return
    }

    try {
      setSaving(true)
      setErrorMessage('')
      setSuccessMessage('')

      const {
        data: { user }
      } = await supabase.auth.getUser()

      const now = new Date().toISOString()

      const {
        error: hotelError
      } = await supabase
        .from('hotels')
        .update({
          approval_status: 'pending_review',
          is_active: false,
          submitted_at: now
        })
        .eq('id', hotelId)

      if (hotelError) {
        throw hotelError
      }

      const {
        error: eventError
      } = await supabase
        .from('hotel_review_events')
        .insert({
          hotel_id: hotelId,
          action: 'submitted',
          comment: 'Hotel enviado a revisión.',
          created_by: user?.id || null
        })

      if (eventError) {
        throw eventError
      }

      navigate('/hoteles')
    } catch (error) {
      console.error(
        'Error enviando hotel a revisión:',
        error
      )

      setErrorMessage(
        error.message ||
          'No se pudo enviar el hotel a revisión.'
      )
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!isComplete) {
      setErrorMessage(
        'Completa Marca, Sede, Habitaciones y Tarifas antes de publicar.'
      )

      return
    }

    try {
      setSaving(true)
      setErrorMessage('')
      setSuccessMessage('')

      const {
        data: { user }
      } = await supabase.auth.getUser()

      const now = new Date().toISOString()

      const {
        error: hotelError
      } = await supabase
        .from('hotels')
        .update({
          approval_status: 'approved',
          is_active: true,
          reviewed_at: now
        })
        .eq('id', hotelId)

      if (hotelError) {
        throw hotelError
      }

      const {
        error: eventError
      } = await supabase
        .from('hotel_review_events')
        .insert({
          hotel_id: hotelId,
          action: 'approved',
          comment: 'Hotel aprobado y publicado.',
          created_by: user?.id || null
        })

      if (eventError) {
        throw eventError
      }

      navigate('/hoteles')
    } catch (error) {
      console.error(
        'Error publicando hotel:',
        error
      )

      setErrorMessage(
        error.message ||
          'No se pudo aprobar y publicar el hotel.'
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="admin-auth-loading">
        <div className="admin-auth-loader" />

        <span>
          Cargando revisión...
        </span>
      </div>
    )
  }

  if (!hotel) {
    return (
      <div className="admin-auth-loading">
        Hotel no encontrado.
      </div>
    )
  }

  const isDraft =
    hotel.approval_status === 'draft'

  const isPending =
    hotel.approval_status === 'pending_review'

  const isApproved =
    hotel.approval_status === 'approved'

  return (
    <div className="hotel-setup-layout">
      <AdminSidebar />

      <main className="hotel-setup-main">

        <section className="hotel-brand-heading">
          <span>
            Configuración / Paso 5
          </span>

          <h1>
            Revisión
          </h1>

          <p>
            Verifica la configuración completa del hotel
            antes de enviarlo a revisión o publicarlo en WAKI.
          </p>

          <div className="location-brand-chip">
            <Icon
              type="hotel"
              size={15}
            />

            Hotel:

            <strong>
              {hotel.name}
            </strong>
          </div>
        </section>

        <div className="review-layout">

          <div className="review-main-column">

            <ReviewSection
              number="1"
              icon="hotel"
              title="Marca"
              completed={completion.brand}
              onEdit={() =>
                navigate(
                  `/hoteles/nuevo?brandId=${hotel.brand_id}`
                )
              }
            >
              <div className="review-data-grid">

                <ReviewField
                  label="Nombre comercial"
                  value={
                    hotel.hotel_brands
                      ?.commercial_name
                  }
                />

                <ReviewField
                  label="Razón social"
                  value={
                    hotel.hotel_brands
                      ?.legal_name
                  }
                />

                <ReviewField
                  label="RUC"
                  value={
                    hotel.hotel_brands
                      ?.ruc
                  }
                />

                <ReviewField
                  label="Correo"
                  value={
                    hotel.hotel_brands
                      ?.contact_email
                  }
                />

                <ReviewField
                  label="Teléfono"
                  value={
                    hotel.hotel_brands
                      ?.phone
                  }
                />

                <ReviewField
                  label="Sitio web"
                  value={
                    hotel.hotel_brands
                      ?.website_url
                  }
                />
              </div>
            </ReviewSection>

            <ReviewSection
              number="2"
              icon="location"
              title="Sede"
              completed={completion.location}
              onEdit={() =>
                navigate(
                  `/hoteles/nuevo/${hotel.brand_id}/sede?hotelId=${hotelId}`
                )
              }
            >
              <div className="review-data-grid">

                <ReviewField
                  label="Nombre de sede"
                  value={
                    hotel.name
                  }
                />

                <ReviewField
                  label="Distrito"
                  value={
                    hotel.district
                  }
                />

                <ReviewField
                  label="Dirección"
                  value={
                    hotel.address
                  }
                  full
                />

                <ReviewField
                  label="Provincia"
                  value={
                    hotel.province
                  }
                />

                <ReviewField
                  label="Departamento"
                  value={
                    hotel.department
                  }
                />

                <ReviewField
                  label="Teléfono"
                  value={
                    hotel.phone
                  }
                />

                <ReviewField
                  label="WhatsApp"
                  value={
                    hotel.whatsapp
                  }
                />
              </div>
            </ReviewSection>

            <ReviewSection
              number="3"
              icon="room"
              title={`Habitaciones (${rooms.length})`}
              completed={completion.rooms}
              onEdit={() =>
                navigate(
                  `/hoteles/${hotelId}/habitaciones`
                )
              }
            >
              <div className="review-room-list">

                {rooms.map(
                  (room) => (
                    <article
                      className="review-room-card"
                      key={
                        room.id
                      }
                    >
                      <div className="review-room-photo">
                        {room
                          .room_type_images
                          ?.length >
                        0 ? (
                          <img
                            src={
                              room
                                .room_type_images[0]
                                .image_url
                            }
                            alt={
                              room.name
                            }
                          />
                        ) : (
                          <div>
                            Sin foto
                          </div>
                        )}
                      </div>

                      <div className="review-room-copy">
                        <strong>
                          {room.name}
                        </strong>

                        <span>
                          Inventario:
                          {' '}
                          {
                            room.inventory_count
                          }
                        </span>

                        <span>
                          Capacidad:
                          {' '}
                          {
                            room.max_guests
                          }
                        </span>

                        {room.bed_type && (
                          <span>
                            Cama:
                            {' '}
                            {
                              room.bed_type
                            }
                          </span>
                        )}
                      </div>
                    </article>
                  )
                )}
              </div>
            </ReviewSection>

            <ReviewSection
              number="4"
              icon="money"
              title="Tarifas"
              completed={completion.rates}
              onEdit={() =>
                navigate(
                  `/hoteles/${hotelId}/tarifas`
                )
              }
            >
              <div className="review-rate-list">

                {rooms.map(
                  (room) => (
                    <div
                      className="review-rate-room"
                      key={
                        room.id
                      }
                    >
                      <strong>
                        {room.name}
                      </strong>

                      <div className="review-rate-pills">

                        {room.rate_plans?.map(
                          (rate) => {
                            const weekend =
                              rate.rate_rules?.find(
                                (rule) =>
                                  rule.name ===
                                  'Fin de semana'
                              )

                            return (
                              <div
                                className="review-rate-pill"
                                key={
                                  rate.id
                                }
                              >
                                <span>
                                  {rate.duration_minutes /
                                    60}
                                  h
                                </span>

                                <strong>
                                  S/{' '}
                                  {Number(
                                    rate.base_price
                                  ).toFixed(
                                    2
                                  )}
                                </strong>

                                {weekend && (
                                  <small>
                                    Fin de semana:
                                    {' '}
                                    S/{' '}
                                    {Number(
                                      weekend.price
                                    ).toFixed(
                                      2
                                    )}
                                  </small>
                                )}
                              </div>
                            )
                          }
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            </ReviewSection>
          </div>

          <aside className="review-side-card">

            <div className="brand-guide-heading">
              <span>
                <Icon
                  type="info"
                  size={18}
                />
              </span>

              <h2>
                Estado del hotel
              </h2>
            </div>

            <p className="brand-guide-intro">
              Verifica que todos los módulos estén
              completos antes de continuar.
            </p>

            <StatusItem
              completed={
                completion.brand
              }
              label="Marca"
            />

            <StatusItem
              completed={
                completion.location
              }
              label="Sede"
            />

            <StatusItem
              completed={
                completion.rooms
              }
              label="Habitaciones"
            />

            <StatusItem
              completed={
                completion.rates
              }
              label="Tarifas"
            />

            <div
              className={
                isComplete
                  ? 'review-ready-box ready'
                  : 'review-ready-box'
              }
            >
              {isComplete
                ? isDraft
                  ? 'Todo listo para enviar a revisión'
                  : isPending
                  ? 'Hotel pendiente de aprobación'
                  : isApproved
                  ? 'Hotel aprobado y publicado'
                  : 'Configuración completa'
                : 'Aún hay información por completar'}
            </div>
          </aside>
        </div>

        {errorMessage && (
          <div className="brand-form-message error rooms-page-message">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="brand-form-message success rooms-page-message">
            {successMessage}
          </div>
        )}

        <HotelSetupBottomBar
          progress={100}
          saving={saving}
          onBack={handleBack}
          onSaveDraft={handleSaveDraft}
          onContinue={
            isDraft
              ? handleSubmitForReview
              : handlePublish
          }
          backLabel="Volver a Tarifas"
          continueLabel={
            isDraft
              ? 'Enviar a revisión'
              : isPending
              ? 'Aprobar y publicar'
              : 'Guardar y publicar'
          }
        />
      </main>
    </div>
  )
}

function ReviewSection({
  number,
  icon,
  title,
  completed,
  onEdit,
  children
}) {
  return (
    <section className="review-section-card">
      <div className="review-section-heading">

        <div className="review-section-number">
          {number}
        </div>

        <div className="review-section-title">
          <span>
            <Icon
              type={icon}
              size={17}
            />

            {completed
              ? 'Completo'
              : 'Pendiente'}
          </span>

          <h2>
            {title}
          </h2>
        </div>

        <button
          type="button"
          onClick={onEdit}
        >
          <Icon
            type="edit"
            size={15}
          />

          Editar
        </button>
      </div>

      <div className="review-section-content">
        {children}
      </div>
    </section>
  )
}

function ReviewField({
  label,
  value,
  full = false
}) {
  return (
    <div
      className={
        full
          ? 'review-field full'
          : 'review-field'
      }
    >
      <span>
        {label}
      </span>

      <strong>
        {value || '—'}
      </strong>
    </div>
  )
}

function StatusItem({
  completed,
  label
}) {
  return (
    <div className="review-status-item">

      <span
        className={
          completed
            ? 'review-status-check complete'
            : 'review-status-check'
        }
      >
        {completed && (
          <Icon
            type="check"
            size={13}
          />
        )}
      </span>

      <strong>
        {label}
      </strong>
    </div>
  )
}

export default HotelReviewPage