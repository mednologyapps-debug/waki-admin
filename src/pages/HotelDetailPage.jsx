import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

import AdminSidebar from '../components/admin/AdminSidebar'

function Icon({ type, size = 19 }) {
  const icons = {
    back: <path d="m15 18-6-6 6-6" />,

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
    ),

    pause: (
      <>
        <rect x="6" y="5" width="4" height="14" rx="1" />
        <rect x="14" y="5" width="4" height="14" rx="1" />
      </>
    ),

    play: <path d="m8 5 11 7-11 7Z" />,

    draft: (
      <>
        <path d="M6 3h9l3 3v15H6z" />
        <path d="M14 3v4h4M9 12h6M9 16h4" />
      </>
    ),

    check: <path d="m5 12 4 4L19 6" />,

    close: (
      <>
        <path d="m6 6 12 12" />
        <path d="M18 6 6 18" />
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

function HotelDetailPage() {
  const navigate = useNavigate()
  const { hotelId } = useParams()

  const [hotel, setHotel] = useState(null)
  const [rooms, setRooms] = useState([])
  const [reviewEvents, setReviewEvents] = useState([])

  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const [actionModal, setActionModal] = useState(null)
  const [actionComment, setActionComment] = useState('')

  const loadHotel = async () => {
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
          slug,
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
          rating,
          review_count,
          created_at,
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
          display_order,
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
        .order('display_order', {
          ascending: true
        })

      if (roomError) {
        throw roomError
      }

      const {
        data: reviewData,
        error: reviewError
      } = await supabase
        .from('hotel_review_events')
        .select(`
          id,
          action,
          comment,
          created_at,
          created_by,
          profiles (
            full_name
          )
        `)
        .eq('hotel_id', hotelId)
        .order('created_at', {
          ascending: false
        })

      if (reviewError) {
        throw reviewError
      }

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

      setReviewEvents(
        reviewData || []
      )
    } catch (error) {
      console.error(
        'Error cargando hotel:',
        error
      )

      setErrorMessage(
        'No se pudo cargar la información del hotel.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHotel()
  }, [hotelId])

  const totals = useMemo(() => {
    const inventory = rooms.reduce(
      (total, room) =>
        total +
        Number(
          room.inventory_count || 0
        ),
      0
    )

    const rates = rooms.reduce(
      (total, room) =>
        total +
        (
          room.rate_plans?.length ||
          0
        ),
      0
    )

    const photos = rooms.reduce(
      (total, room) =>
        total +
        (
          room.room_type_images?.length ||
          0
        ),
      0
    )

    return {
      rooms: rooms.length,
      inventory,
      rates,
      photos
    }
  }, [rooms])

  const updateHotelStatus = async ({
    approvalStatus,
    isActive,
    action,
    comment = null,
    successText
  }) => {
    try {
      setUpdating(true)
      setErrorMessage('')
      setSuccessMessage('')

      const {
        data: { user }
      } = await supabase.auth.getUser()

      const {
        error: hotelError
      } = await supabase
        .from('hotels')
        .update({
          approval_status:
            approvalStatus,

          is_active:
            isActive,

          reviewed_at:
            new Date().toISOString()
        })
        .eq('id', hotelId)

      if (hotelError) {
        throw hotelError
      }

      const {
        data: newEvent,
        error: eventError
      } = await supabase
        .from('hotel_review_events')
        .insert({
          hotel_id:
            hotelId,

          action,

          comment:
            comment?.trim() ||
            null,

          created_by:
            user?.id ||
            null
        })
        .select(`
          id,
          action,
          comment,
          created_at,
          created_by
        `)
        .single()

      if (eventError) {
        throw eventError
      }

      const eventWithProfile = {
        ...newEvent,

        profiles: {
          full_name:
            user?.user_metadata
              ?.full_name ||
            'Admin WAKI'
        }
      }

      setHotel((current) => ({
        ...current,

        approval_status:
          approvalStatus,

        is_active:
          isActive,

        reviewed_at:
          new Date().toISOString()
      }))

      setReviewEvents(
        (current) => [
          eventWithProfile,
          ...current
        ]
      )

      setActionModal(null)
      setActionComment('')

      setSuccessMessage(
        successText
      )
    } catch (error) {
      console.error(
        'Error cambiando estado:',
        error
      )

      setErrorMessage(
        error.message ||
          'No se pudo actualizar el estado del hotel.'
      )
    } finally {
      setUpdating(false)
    }
  }

  const handleApprove = () => {
    updateHotelStatus({
      approvalStatus:
        'approved',

      isActive:
        true,

      action:
        'approved',

      successText:
        'El hotel fue aprobado y publicado.'
    })
  }

  const handleReject = () => {
    if (!actionComment.trim()) {
      setErrorMessage(
        'Ingresa una observación antes de rechazar.'
      )

      return
    }

    updateHotelStatus({
      approvalStatus:
        'rejected',

      isActive:
        false,

      action:
        'rejected',

      comment:
        actionComment,

      successText:
        'El hotel fue rechazado y la observación quedó registrada.'
    })
  }

  const handleSuspend = () => {
    if (!actionComment.trim()) {
      setErrorMessage(
        'Ingresa el motivo de la suspensión.'
      )

      return
    }

    updateHotelStatus({
      approvalStatus:
        'suspended',

      isActive:
        false,

      action:
        'suspended',

      comment:
        actionComment,

      successText:
        'El hotel fue suspendido.'
    })
  }

  const handleReactivate = () => {
    updateHotelStatus({
      approvalStatus:
        'approved',

      isActive:
        true,

      action:
        'reactivated',

      successText:
        'El hotel fue reactivado.'
    })
  }

  const handleReturnToDraft = () => {
    updateHotelStatus({
      approvalStatus:
        'draft',

      isActive:
        false,

      action:
        'returned_to_draft',

      successText:
        'El hotel volvió a borrador.'
    })
  }

  const handleEditBrand = () => {
    navigate(
      `/hoteles/nuevo?brandId=${hotel.brand_id}`
    )
  }

  const handleEditLocation = () => {
    navigate(
      `/hoteles/nuevo/${hotel.brand_id}/sede?hotelId=${hotel.id}`
    )
  }

  const handleEditRooms = () => {
    navigate(
      `/hoteles/${hotel.id}/habitaciones`
    )
  }

  const handleEditRates = () => {
    navigate(
      `/hoteles/${hotel.id}/tarifas`
    )
  }

  if (loading) {
    return (
      <div className="admin-auth-loading">
        <div className="admin-auth-loader" />

        <span>
          Cargando hotel...
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

  return (
    <div className="hotel-setup-layout">
      <AdminSidebar />

      <main className="hotel-detail-main">

        <section className="hotel-detail-header">
          <div className="hotel-detail-title-area">

            <button
              type="button"
              className="hotel-detail-back"
              onClick={() =>
                navigate('/hoteles')
              }
            >
              <Icon
                type="back"
                size={17}
              />

              Volver a hoteles
            </button>

            <span className="hotel-detail-eyebrow">
              FICHA ADMINISTRATIVA
            </span>

            <div className="hotel-detail-title-row">
              <div>
                <h1>
                  {hotel.name}
                </h1>

                <p>
                  {hotel.hotel_brands
                    ?.commercial_name}
                  {' · '}
                  {hotel.district},
                  {' '}
                  {hotel.province}
                </p>
              </div>

              <span
                className={`hotel-detail-status status-${hotel.approval_status}`}
              >
                {getStatusLabel(
                  hotel.approval_status
                )}
              </span>
            </div>
          </div>

          <div className="hotel-detail-actions">

            {hotel.approval_status ===
              'pending_review' && (
              <>
                <button
                  type="button"
                  className="hotel-action-primary"
                  disabled={updating}
                  onClick={handleApprove}
                >
                  Aprobar
                </button>

                <button
                  type="button"
                  className="hotel-action-secondary danger"
                  disabled={updating}
                  onClick={() => {
                    setActionModal(
                      'reject'
                    )

                    setActionComment('')
                  }}
                >
                  Rechazar
                </button>
              </>
            )}

            {hotel.approval_status ===
              'approved' &&
              hotel.is_active && (
                <button
                  type="button"
                  className="hotel-action-secondary danger"
                  disabled={updating}
                  onClick={() => {
                    setActionModal(
                      'suspend'
                    )

                    setActionComment('')
                  }}
                >
                  <Icon
                    type="pause"
                    size={16}
                  />

                  Suspender
                </button>
              )}

            {hotel.approval_status ===
              'suspended' && (
                <button
                  type="button"
                  className="hotel-action-primary"
                  disabled={updating}
                  onClick={
                    handleReactivate
                  }
                >
                  <Icon
                    type="play"
                    size={16}
                  />

                  Reactivar
                </button>
              )}

            {(hotel.approval_status ===
              'rejected' ||
              hotel.approval_status ===
              'approved' ||
              hotel.approval_status ===
              'suspended') && (
                <button
                  type="button"
                  className="hotel-action-secondary"
                  disabled={updating}
                  onClick={
                    handleReturnToDraft
                  }
                >
                  <Icon
                    type="draft"
                    size={16}
                  />

                  Volver a borrador
                </button>
              )}
          </div>
        </section>

        {errorMessage && (
          <div className="brand-form-message error hotel-detail-message">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="brand-form-message success hotel-detail-message">
            {successMessage}
          </div>
        )}

        <section className="hotel-detail-kpis">

          <article>
            <span>
              Tipos de habitación
            </span>

            <strong>
              {totals.rooms}
            </strong>
          </article>

          <article>
            <span>
              Inventario total
            </span>

            <strong>
              {totals.inventory}
            </strong>
          </article>

          <article>
            <span>
              Tarifas configuradas
            </span>

            <strong>
              {totals.rates}
            </strong>
          </article>

          <article>
            <span>
              Fotografías
            </span>

            <strong>
              {totals.photos}
            </strong>
          </article>
        </section>

        <div className="hotel-detail-grid">

          <div className="hotel-detail-content">

            <DetailSection
              icon="hotel"
              title="Marca"
              description="Información comercial y legal."
              onEdit={
                handleEditBrand
              }
            >
              <div className="hotel-detail-data-grid">

                <DetailField
                  label="Nombre comercial"
                  value={
                    hotel.hotel_brands
                      ?.commercial_name
                  }
                />

                <DetailField
                  label="Razón social"
                  value={
                    hotel.hotel_brands
                      ?.legal_name
                  }
                />

                <DetailField
                  label="RUC"
                  value={
                    hotel.hotel_brands
                      ?.ruc
                  }
                />

                <DetailField
                  label="Correo"
                  value={
                    hotel.hotel_brands
                      ?.contact_email
                  }
                />

                <DetailField
                  label="Teléfono"
                  value={
                    hotel.hotel_brands
                      ?.phone
                  }
                />

                <DetailField
                  label="Web"
                  value={
                    hotel.hotel_brands
                      ?.website_url
                  }
                />
              </div>
            </DetailSection>

            <DetailSection
              icon="location"
              title="Sede"
              description="Ubicación y datos operativos."
              onEdit={
                handleEditLocation
              }
            >
              <div className="hotel-detail-data-grid">

                <DetailField
                  label="Dirección"
                  value={
                    hotel.address
                  }
                  full
                />

                <DetailField
                  label="Distrito"
                  value={
                    hotel.district
                  }
                />

                <DetailField
                  label="Provincia"
                  value={
                    hotel.province
                  }
                />

                <DetailField
                  label="Departamento"
                  value={
                    hotel.department
                  }
                />

                <DetailField
                  label="Teléfono"
                  value={
                    hotel.phone
                  }
                />

                <DetailField
                  label="Correo"
                  value={
                    hotel.contact_email
                  }
                />

                <DetailField
                  label="WhatsApp"
                  value={
                    hotel.whatsapp
                  }
                />
              </div>
            </DetailSection>

            <DetailSection
              icon="room"
              title="Habitaciones"
              description="Tipos, inventario, capacidad y fotografías."
              onEdit={
                handleEditRooms
              }
            >
              <div className="hotel-detail-room-list">

                {rooms.map(
                  (room) => (
                    <article
                      className="hotel-detail-room-card"
                      key={
                        room.id
                      }
                    >
                      <div className="hotel-detail-room-image">
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
                          <span>
                            Sin foto
                          </span>
                        )}
                      </div>

                      <div className="hotel-detail-room-info">
                        <h3>
                          {room.name}
                        </h3>

                        <div>
                          <span>
                            Inventario
                          </span>

                          <strong>
                            {
                              room.inventory_count
                            }
                          </strong>
                        </div>

                        <div>
                          <span>
                            Capacidad
                          </span>

                          <strong>
                            {
                              room.max_guests
                            }
                          </strong>
                        </div>

                        {room.bed_type && (
                          <div>
                            <span>
                              Cama
                            </span>

                            <strong>
                              {
                                room.bed_type
                              }
                            </strong>
                          </div>
                        )}

                        {room.size_m2 && (
                          <div>
                            <span>
                              Tamaño
                            </span>

                            <strong>
                              {
                                room.size_m2
                              } m²
                            </strong>
                          </div>
                        )}
                      </div>
                    </article>
                  )
                )}
              </div>
            </DetailSection>

            <DetailSection
              icon="money"
              title="Tarifas"
              description="Duraciones y precios publicados."
              onEdit={
                handleEditRates
              }
            >
              <div className="hotel-detail-rate-list">

                {rooms.map(
                  (room) => (
                    <article
                      className="hotel-detail-rate-room"
                      key={
                        room.id
                      }
                    >
                      <h3>
                        {room.name}
                      </h3>

                      <div className="hotel-detail-rate-grid">

                        {room.rate_plans
                          ?.map(
                            (rate) => {
                              const weekend =
                                rate.rate_rules
                                  ?.find(
                                    (rule) =>
                                      rule.name ===
                                      'Fin de semana'
                                  )

                              return (
                                <div
                                  className="hotel-detail-rate-card"
                                  key={
                                    rate.id
                                  }
                                >
                                  <span>
                                    {rate.duration_minutes /
                                      60}
                                    {' '}
                                    horas
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
                    </article>
                  )
                )}
              </div>
            </DetailSection>
          </div>

          <aside className="hotel-detail-side">

            <div className="hotel-detail-side-heading">
              <span>
                <Icon
                  type="check"
                  size={16}
                />
              </span>

              <div>
                <strong>
                  Estado actual
                </strong>

                <p>
                  Control administrativo del hotel.
                </p>
              </div>
            </div>

            <div className="hotel-detail-state-block">
              <span>
                Publicación
              </span>

              <strong>
                {getStatusLabel(
                  hotel.approval_status
                )}
              </strong>
            </div>

            <div className="hotel-detail-state-block">
              <span>
                Operación
              </span>

              <strong
                className={
                  hotel.is_active
                    ? 'state-active'
                    : 'state-inactive'
                }
              >
                {hotel.is_active
                  ? 'Activo'
                  : 'Inactivo'}
              </strong>
            </div>

            <div className="hotel-detail-state-block">
              <span>
                Rating
              </span>

              <strong>
                {Number(
                  hotel.rating || 0
                ).toFixed(1)}
              </strong>

              <small>
                {hotel.review_count || 0}
                {' '}
                reseñas
              </small>
            </div>

            <div className="hotel-review-history">

              <div className="hotel-review-history-heading">
                <strong>
                  Historial
                </strong>

                <span>
                  {reviewEvents.length}
                </span>
              </div>

              {reviewEvents.length === 0 ? (
                <p className="hotel-review-empty">
                  Aún no hay acciones registradas.
                </p>
              ) : (
                <div className="hotel-review-event-list">

                  {reviewEvents.map(
                    (event) => (
                      <article
                        key={
                          event.id
                        }
                        className="hotel-review-event"
                      >
                        <span
                          className={`review-event-dot action-${event.action}`}
                        />

                        <div>
                          <strong>
                            {getReviewActionLabel(
                              event.action
                            )}
                          </strong>

                          {event.profiles
                            ?.full_name && (
                            <span className="review-event-user">
                              {
                                event.profiles
                                  .full_name
                              }
                            </span>
                          )}

                          {event.comment && (
                            <p>
                              {
                                event.comment
                              }
                            </p>
                          )}

                          <small>
                            {new Date(
                              event.created_at
                            ).toLocaleString(
                              'es-PE'
                            )}
                          </small>
                        </div>
                      </article>
                    )
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              className="hotel-detail-review-button"
              onClick={() =>
                navigate(
                  `/hoteles/${hotel.id}/revision`
                )
              }
            >
              Ver revisión completa
            </button>
          </aside>
        </div>

        {actionModal && (
          <div className="hotel-action-modal-backdrop">

            <div className="hotel-action-modal">

              <button
                type="button"
                className="hotel-action-modal-close"
                onClick={() => {
                  if (updating) {
                    return
                  }

                  setActionModal(null)
                  setActionComment('')
                }}
              >
                <Icon
                  type="close"
                  size={18}
                />
              </button>

              <span className="hotel-action-modal-eyebrow">
                {actionModal ===
                'reject'
                  ? 'RECHAZAR HOTEL'
                  : 'SUSPENDER HOTEL'}
              </span>

              <h2>
                {actionModal ===
                'reject'
                  ? '¿Qué debe corregirse?'
                  : '¿Por qué deseas suspenderlo?'}
              </h2>

              <p>
                Esta observación quedará registrada
                en el historial administrativo del hotel.
              </p>

              <textarea
                value={
                  actionComment
                }
                onChange={(event) =>
                  setActionComment(
                    event.target.value
                  )
                }
                placeholder={
                  actionModal ===
                  'reject'
                    ? 'Ej. Mejorar las fotografías de la Suite Deluxe y completar los datos de contacto.'
                    : 'Ej. Suspensión temporal solicitada por administración.'
                }
              />

              <div className="hotel-action-modal-actions">

                <button
                  type="button"
                  className="hotel-modal-cancel"
                  disabled={updating}
                  onClick={() => {
                    setActionModal(null)
                    setActionComment('')
                  }}
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  className="hotel-modal-confirm"
                  disabled={
                    updating ||
                    !actionComment.trim()
                  }
                  onClick={
                    actionModal ===
                    'reject'
                      ? handleReject
                      : handleSuspend
                  }
                >
                  {updating
                    ? 'Guardando...'
                    : actionModal ===
                      'reject'
                    ? 'Rechazar hotel'
                    : 'Suspender hotel'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function DetailSection({
  icon,
  title,
  description,
  onEdit,
  children
}) {
  return (
    <section className="hotel-detail-section">
      <header>
        <div className="hotel-detail-section-icon">
          <Icon
            type={icon}
            size={19}
          />
        </div>

        <div>
          <h2>
            {title}
          </h2>

          <p>
            {description}
          </p>
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
      </header>

      <div className="hotel-detail-section-body">
        {children}
      </div>
    </section>
  )
}

function DetailField({
  label,
  value,
  full = false
}) {
  return (
    <div
      className={
        full
          ? 'hotel-detail-field full'
          : 'hotel-detail-field'
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

function getStatusLabel(
  status
) {
  const labels = {
    draft:
      'Borrador',

    pending_review:
      'Pendiente',

    approved:
      'Aprobado',

    rejected:
      'Rechazado',

    suspended:
      'Suspendido'
  }

  return (
    labels[status] ||
    status
  )
}

function getReviewActionLabel(
  action
) {
  const labels = {
    submitted:
      'Enviado a revisión',

    approved:
      'Aprobado',

    rejected:
      'Rechazado',

    suspended:
      'Suspendido',

    reactivated:
      'Reactivado',

    returned_to_draft:
      'Devuelto a borrador'
  }

  return (
    labels[action] ||
    action
  )
}

export default HotelDetailPage