import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

import wakiLogo from '../assets/waki_logo_full.png'

function Icon({
  type,
  size = 21
}) {
  const paths = {
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),

    hotel: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3" />
      </>
    ),

    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
      </>
    ),

    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-4 2.5-6 6-6s6 2 6 6" />
        <circle cx="17" cy="9" r="2" />
        <path d="M16 15c3 0 5 1.5 5 5" />
      </>
    ),

    money: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M15 8.5c-.7-.7-1.7-1-3-1-1.7 0-3 .8-3 2s1.1 1.8 3 2.3c1.9.5 3 1.1 3 2.5s-1.3 2.2-3 2.2c-1.4 0-2.5-.4-3.3-1.3M12 5v14" />
      </>
    ),

    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1-2.8 2.8-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1.1 1.7V21H10v-.1A1.8 1.8 0 0 0 8.9 19a1.8 1.8 0 0 0-2 .4l-.1.1L4 16.7l.1-.1a1.8 1.8 0 0 0 .4-2A1.8 1.8 0 0 0 2.8 13H2v-4h.8a1.8 1.8 0 0 0 1.7-1.1 1.8 1.8 0 0 0-.4-2L4 5.8 6.8 3l.1.1a1.8 1.8 0 0 0 2 .4A1.8 1.8 0 0 0 10 1.8V1h4v.8a1.8 1.8 0 0 0 1.1 1.7 1.8 1.8 0 0 0 2-.4l.1-.1L20 5.8l-.1.1a1.8 1.8 0 0 0-.4 2A1.8 1.8 0 0 0 21.2 9h.8v4h-.8a1.8 1.8 0 0 0-1.8 2Z" />
      </>
    ),

    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),

    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
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
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[type]}
    </svg>
  )
}

function HotelsPage() {
  const navigate = useNavigate()

  const [hotels, setHotels] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [adminName, setAdminName] = useState('Admin WAKI')

  useEffect(() => {
    let mounted = true

    const loadHotels = async () => {
      try {
        setLoading(true)
        setErrorMessage('')

        const {
          data: { user }
        } = await supabase.auth.getUser()

        if (user) {
          const {
            data: profile
          } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .single()

          if (
            mounted &&
            profile?.full_name
          ) {
            setAdminName(
              profile.full_name
            )
          }
        }

        const {
          data,
          error
        } = await supabase
          .from('hotels')
          .select(`
            id,
            brand_id,
            name,
            slug,
            district,
            province,
            department,
            phone,
            contact_email,
            approval_status,
            is_active,
            rating,
            review_count,
            created_at,
            hotel_brands (
              id,
              commercial_name,
              legal_name
            )
          `)
          .order(
            'created_at',
            {
              ascending: false
            }
          )

        if (error) {
          throw error
        }

        if (mounted) {
          setHotels(
            data || []
          )
        }
      } catch (error) {
        console.error(
          'Error cargando hoteles:',
          error
        )

        if (mounted) {
          setErrorMessage(
            'No se pudieron cargar los hoteles.'
          )
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadHotels()

    return () => {
      mounted = false
    }
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()

    navigate(
      '/login',
      {
        replace: true
      }
    )
  }

  const handleHotelClick = (
  hotel
) => {
  if (
    hotel.approval_status ===
    'draft'
  ) {
    navigate(
      `/hoteles/nuevo/${hotel.brand_id}/sede?hotelId=${hotel.id}`
    )

    return
  }

  if (
    hotel.approval_status ===
    'pending_review'
  ) {
    navigate(
      `/hoteles/${hotel.id}/revision`
    )

    return
  }

  navigate(
    `/hoteles/${hotel.id}/detalle`
  )
}

  const getInitials = () => {
    const parts = adminName
      .trim()
      .split(/\s+/)
      .filter(Boolean)

    if (
      parts.length === 0
    ) {
      return 'WA'
    }

    if (
      parts.length === 1
    ) {
      return parts[0]
        .substring(
          0,
          2
        )
        .toUpperCase()
    }

    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }

  const counts =
    useMemo(() => {
      return {
        all:
          hotels.length,

        pending:
          hotels.filter(
            (hotel) =>
              hotel.approval_status ===
              'pending_review'
          ).length,

        approved:
          hotels.filter(
            (hotel) =>
              hotel.approval_status ===
              'approved'
          ).length,

        suspended:
          hotels.filter(
            (hotel) =>
              hotel.approval_status ===
              'suspended'
          ).length,

        rejected:
          hotels.filter(
            (hotel) =>
              hotel.approval_status ===
              'rejected'
          ).length
      }
    }, [hotels])

  const filteredHotels =
    useMemo(() => {
      let result = [
        ...hotels
      ]

      if (
        activeFilter !==
        'all'
      ) {
        const statusMap = {
          pending:
            'pending_review',

          approved:
            'approved',

          suspended:
            'suspended',

          rejected:
            'rejected'
        }

        result =
          result.filter(
            (hotel) =>
              hotel.approval_status ===
              statusMap[
                activeFilter
              ]
          )
      }

      const term =
        search
          .trim()
          .toLowerCase()

      if (term) {
        result =
          result.filter(
            (hotel) =>
              hotel.name
                ?.toLowerCase()
                .includes(term) ||

              hotel.district
                ?.toLowerCase()
                .includes(term) ||

              hotel.hotel_brands
                ?.commercial_name
                ?.toLowerCase()
                .includes(term)
          )
      }

      return result
    }, [
      hotels,
      activeFilter,
      search
    ])

  const getStatusLabel = (
    status
  ) => {
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

  return (
    <div className="waki-admin-layout">

      {/* =========================
          SIDEBAR
      ========================= */}

      <aside className="waki-sidebar">

        <div className="sidebar-brand">
          <img
            src={wakiLogo}
            alt="WAKI"
          />
        </div>

        <nav className="waki-sidebar-menu">

          <button
            className="sidebar-menu-item"
            onClick={() =>
              navigate(
                '/dashboard'
              )
            }
          >
            <Icon
              type="dashboard"
            />

            <span>
              Dashboard
            </span>
          </button>

          <button
            className="sidebar-menu-item active"
          >
            <Icon
              type="hotel"
            />

            <span>
              Hoteles
            </span>
          </button>

          <button
            className="sidebar-menu-item disabled"
            disabled
          >
            <Icon
              type="calendar"
            />

            <span>
              Reservas
            </span>
          </button>

          <button
            className="sidebar-menu-item disabled"
            disabled
          >
            <Icon
              type="users"
            />

            <span>
              Usuarios
            </span>
          </button>

          <button
            className="sidebar-menu-item disabled"
            disabled
          >
            <Icon
              type="money"
            />

            <span>
              Finanzas
            </span>
          </button>

          <button
            className="sidebar-menu-item disabled"
            disabled
          >
            <Icon
              type="settings"
            />

            <span>
              Configuración
            </span>
          </button>
        </nav>

        <div className="sidebar-bottom">

          <div className="sidebar-admin-profile">

            <div className="admin-avatar">
              {getInitials()}
            </div>

            <div className="admin-user-copy">
              <strong>
                {adminName}
              </strong>

              <span>
                Super administrador
              </span>
            </div>
          </div>

          <button
            className="sidebar-logout"
            onClick={
              handleLogout
            }
          >
            Cerrar sesión
          </button>

          <div className="sidebar-copyright">
            ©{' '}
            {new Date().getFullYear()}
            {' '}
            WAKI
          </div>
        </div>
      </aside>

      {/* =========================
          CONTENIDO
      ========================= */}

      <main className="waki-hotels-main">

        <header className="hotels-page-header">

          <div>
            <span className="hotels-eyebrow">
              GESTIÓN DE OFERTA
            </span>

            <h1>
              Hoteles
            </h1>

            <p>
              Administra marcas, sedes,
              habitaciones y tarifas de WAKI.
            </p>
          </div>

          <button
            className="hotels-add-button"
            onClick={() =>
              navigate(
                '/hoteles/nuevo'
              )
            }
          >
            <Icon
              type="plus"
              size={18}
            />

            <span>
              Agregar hotel
            </span>
          </button>
        </header>

        {/* =========================
            RESUMEN
        ========================= */}

        <section className="hotels-summary-grid">

          <article className="hotel-summary-card">
            <span>
              Todos
            </span>

            <strong>
              {loading
                ? '—'
                : counts.all}
            </strong>
          </article>

          <article className="hotel-summary-card">
            <span>
              Pendientes
            </span>

            <strong>
              {loading
                ? '—'
                : counts.pending}
            </strong>
          </article>

          <article className="hotel-summary-card">
            <span>
              Aprobados
            </span>

            <strong>
              {loading
                ? '—'
                : counts.approved}
            </strong>
          </article>

          <article className="hotel-summary-card">
            <span>
              Suspendidos
            </span>

            <strong>
              {loading
                ? '—'
                : counts.suspended}
            </strong>
          </article>
        </section>

        {/* =========================
            LISTADO
        ========================= */}

        <section className="hotels-list-panel">

          <div className="hotels-toolbar">

            <div className="hotels-tabs-new">

              <button
                className={
                  activeFilter ===
                  'all'
                    ? 'active'
                    : ''
                }
                onClick={() =>
                  setActiveFilter(
                    'all'
                  )
                }
              >
                Todos
                <span>
                  {counts.all}
                </span>
              </button>

              <button
                className={
                  activeFilter ===
                  'pending'
                    ? 'active'
                    : ''
                }
                onClick={() =>
                  setActiveFilter(
                    'pending'
                  )
                }
              >
                Pendientes
                <span>
                  {counts.pending}
                </span>
              </button>

              <button
                className={
                  activeFilter ===
                  'approved'
                    ? 'active'
                    : ''
                }
                onClick={() =>
                  setActiveFilter(
                    'approved'
                  )
                }
              >
                Aprobados
                <span>
                  {counts.approved}
                </span>
              </button>

              <button
                className={
                  activeFilter ===
                  'suspended'
                    ? 'active'
                    : ''
                }
                onClick={() =>
                  setActiveFilter(
                    'suspended'
                  )
                }
              >
                Suspendidos
                <span>
                  {counts.suspended}
                </span>
              </button>

              <button
                className={
                  activeFilter ===
                  'rejected'
                    ? 'active'
                    : ''
                }
                onClick={() =>
                  setActiveFilter(
                    'rejected'
                  )
                }
              >
                Rechazados
                <span>
                  {counts.rejected}
                </span>
              </button>
            </div>

            <div className="hotels-search">
              <Icon
                type="search"
                size={18}
              />

              <input
                value={search}
                onChange={(event) =>
                  setSearch(
                    event.target.value
                  )
                }
                placeholder="Buscar hotel, marca o distrito..."
              />
            </div>
          </div>

          {errorMessage && (
            <div className="hotels-error">
              {errorMessage}
            </div>
          )}

          {loading && (
            <div className="hotels-loading-state">

              <div className="admin-auth-loader" />

              <span>
                Cargando hoteles...
              </span>
            </div>
          )}

          {!loading &&
            !errorMessage &&
            filteredHotels.length ===
              0 && (
              <div className="hotels-empty-state">

                <div className="hotels-empty-icon">
                  <Icon
                    type="hotel"
                    size={26}
                  />
                </div>

                <h2>
                  {hotels.length ===
                  0
                    ? 'Aún no hay hoteles registrados'
                    : 'No encontramos hoteles'}
                </h2>

                <p>
                  {hotels.length ===
                  0
                    ? 'Crea el primer hotel de WAKI y configura su marca, sede, habitaciones y tarifas.'
                    : 'Prueba con otro filtro o término de búsqueda.'}
                </p>

                {hotels.length ===
                  0 && (
                  <button
                    className="hotels-empty-button"
                    onClick={() =>
                      navigate(
                        '/hoteles/nuevo'
                      )
                    }
                  >
                    <Icon
                      type="plus"
                      size={17}
                    />

                    Agregar primer hotel
                  </button>
                )}
              </div>
            )}

          {!loading &&
            !errorMessage &&
            filteredHotels.length >
              0 && (
              <div className="hotels-table-wrapper">

                <table className="hotels-table">

                  <thead>
                    <tr>
                      <th>
                        Hotel
                      </th>

                      <th>
                        Marca
                      </th>

                      <th>
                        Ubicación
                      </th>

                      <th>
                        Estado
                      </th>

                      <th>
                        Operación
                      </th>

                      <th>
                        Rating
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredHotels.map(
                      (hotel) => (
                        <tr
                          key={
                            hotel.id
                          }
                          onClick={() =>
                            handleHotelClick(
                              hotel
                            )
                          }
                        >
                          <td>
                            <div className="hotel-name-cell">

                              <div className="hotel-table-icon">
                                <Icon
                                  type="hotel"
                                  size={18}
                                />
                              </div>

                              <div>
                                <strong>
                                  {
                                    hotel.name
                                  }
                                </strong>

                                <span>
                                  {
                                    hotel.slug
                                  }
                                </span>
                              </div>
                            </div>
                          </td>

                          <td>
                            {hotel
                              .hotel_brands
                              ?.commercial_name ||
                              '—'}
                          </td>

                          <td>
                            <strong className="hotel-location-main">
                              {hotel.district ||
                                '—'}
                            </strong>

                            <span className="hotel-location-secondary">
                              {hotel.province ||
                                hotel.department ||
                                '—'}
                            </span>
                          </td>

                          <td>
                            <span
                              className={`hotel-status-badge status-${hotel.approval_status}`}
                            >
                              {getStatusLabel(
                                hotel.approval_status
                              )}
                            </span>
                          </td>

                          <td>
                            <span
                              className={
                                hotel.is_active
                                  ? 'hotel-operational active'
                                  : 'hotel-operational inactive'
                              }
                            >
                              <span />

                              {hotel.is_active
                                ? 'Activo'
                                : 'Inactivo'}
                            </span>
                          </td>

                          <td>
                            <strong>
                              {Number(
                                hotel.rating ||
                                  0
                              ).toFixed(
                                1
                              )}
                            </strong>

                            <span className="hotel-review-count">
                              {hotel.review_count ||
                                0}{' '}
                              reseñas
                            </span>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            )}
        </section>
      </main>
    </div>
  )
}

export default HotelsPage