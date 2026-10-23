import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

import wakiLogo from '../assets/waki_logo_full.png'
import adminMascot from '../assets/waki_admin_access.png'

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

    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
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
    >
      {paths[type]}
    </svg>
  )
}

function DashboardPage() {
  const navigate = useNavigate()

  const [stats, setStats] = useState({
    hotels_active: 0,
    hotels_pending: 0,
    reservations_month: 0,
    users_total: 0,
    revenue_month: 0
  })

  const [statsLoading, setStatsLoading] = useState(true)
  const [adminName, setAdminName] = useState('Admin WAKI')

  useEffect(() => {
    let mounted = true

    const loadDashboard = async () => {
      try {
        setStatsLoading(true)

        const {
          data: { user },
          error: userError
        } = await supabase.auth.getUser()

        if (userError) {
          throw userError
        }

        if (user) {
          const {
            data: profile,
            error: profileError
          } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .single()

          if (!profileError && profile?.full_name && mounted) {
            setAdminName(profile.full_name)
          }
        }

        const {
          data,
          error
        } = await supabase.rpc(
          'get_admin_dashboard_stats'
        )

        if (error) {
          throw error
        }

        if (data && mounted) {
          setStats({
            hotels_active:
              Number(data.hotels_active) || 0,

            hotels_pending:
              Number(data.hotels_pending) || 0,

            reservations_month:
              Number(data.reservations_month) || 0,

            users_total:
              Number(data.users_total) || 0,

            revenue_month:
              Number(data.revenue_month) || 0
          })
        }
      } catch (error) {
        console.error(
          'Error cargando Dashboard:',
          error
        )
      } finally {
        if (mounted) {
          setStatsLoading(false)
        }
      }
    }

    loadDashboard()

    return () => {
      mounted = false
    }
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const getInitials = () => {
    if (!adminName) {
      return 'WA'
    }

    const parts = adminName
      .trim()
      .split(/\s+/)
      .filter(Boolean)

    if (parts.length === 0) {
      return 'WA'
    }

    if (parts.length === 1) {
      return parts[0]
        .substring(0, 2)
        .toUpperCase()
    }

    return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  }

  return (
    <div className="waki-admin-layout">
      <aside className="waki-sidebar">
        <div className="sidebar-brand">
          <img
            src={wakiLogo}
            alt="WAKI"
          />
        </div>

        <nav className="waki-sidebar-menu">
          <button className="sidebar-menu-item active">
            <Icon type="dashboard" />
            <span>Dashboard</span>
          </button>

          <button
            className="sidebar-menu-item"
            onClick={() => navigate('/hoteles')}
          >
            <Icon type="hotel" />
            <span>Hoteles</span>
          </button>

          <button
            className="sidebar-menu-item"
            onClick={() => navigate('/reclamos')}
          >
            <Icon type="calendar" />
            <span>Libro de Reclamaciones</span>
          </button>

          <button
            className="sidebar-menu-item disabled"
            disabled
          >
            <Icon type="calendar" />
            <span>Reservas</span>
          </button>

          <button
            className="sidebar-menu-item disabled"
            disabled
          >
            <Icon type="users" />
            <span>Usuarios</span>
          </button>

          <button
            className="sidebar-menu-item disabled"
            disabled
          >
            <Icon type="money" />
            <span>Finanzas</span>
          </button>

          <button
            className="sidebar-menu-item disabled"
            disabled
          >
            <Icon type="settings" />
            <span>Configuración</span>
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
            onClick={handleLogout}
          >
            Cerrar sesión
          </button>

          <div className="sidebar-copyright">
            © {new Date().getFullYear()} WAKI
          </div>
        </div>
      </aside>

      <main className="waki-dashboard-main">
        <header className="dashboard-topbar">
          <div className="dashboard-heading">
            <h1>Dashboard</h1>

            <p>
              Resumen general de la plataforma
            </p>
          </div>

          <div className="dashboard-top-actions">
            <div className="dashboard-search">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>

              <input
                placeholder="Buscar hoteles, reservas, usuarios..."
              />
            </div>

            <button
              className="notification-button"
              type="button"
            >
              <Icon
                type="bell"
                size={19}
              />

              <span className="notification-dot">
                0
              </span>
            </button>

            <div className="top-admin">
              <div>
                <strong>
                  {adminName}
                </strong>

                <span>
                  Super administrador
                </span>
              </div>

              <div className="top-admin-avatar">
                {getInitials()}
              </div>
            </div>
          </div>
        </header>

        <section className="dashboard-stat-grid">
          <article className="dashboard-stat-card">
            <div className="stat-icon">
              <Icon type="hotel" />
            </div>

            <div>
              <span className="stat-name">
                Hoteles
              </span>

              <strong className="stat-number">
                {statsLoading
                  ? '—'
                  : stats.hotels_active}
              </strong>

              <small>
                Sedes activas
              </small>
            </div>
          </article>

          <article className="dashboard-stat-card">
            <div className="stat-icon">
              <Icon type="calendar" />
            </div>

            <div>
              <span className="stat-name">
                Pendientes
              </span>

              <strong className="stat-number">
                {statsLoading
                  ? '—'
                  : stats.hotels_pending}
              </strong>

              <small>
                Solicitudes
              </small>
            </div>
          </article>

          <article className="dashboard-stat-card">
            <div className="stat-icon">
              <Icon type="calendar" />
            </div>

            <div>
              <span className="stat-name">
                Reservas
              </span>

              <strong className="stat-number">
                {statsLoading
                  ? '—'
                  : stats.reservations_month}
              </strong>

              <small>
                Este mes
              </small>
            </div>
          </article>

          <article className="dashboard-stat-card">
            <div className="stat-icon">
              <Icon type="users" />
            </div>

            <div>
              <span className="stat-name">
                Usuarios
              </span>

              <strong className="stat-number">
                {statsLoading
                  ? '—'
                  : stats.users_total}
              </strong>

              <small>
                Registrados
              </small>
            </div>
          </article>

          <article className="dashboard-stat-card">
            <div className="stat-icon">
              <Icon type="money" />
            </div>

            <div>
              <span className="stat-name">
                Ingresos
              </span>

              <strong className="stat-number">
                {statsLoading
                  ? '—'
                  : `S/ ${stats.revenue_month.toLocaleString(
                      'es-PE'
                    )}`}
              </strong>

              <small>
                Este mes
              </small>
            </div>
          </article>
        </section>

        <section className="dashboard-middle-grid">
          <article className="dashboard-panel revenue-panel">
            <div className="panel-heading">
              <div>
                <h2>
                  Reservas e ingresos
                </h2>

                <p>
                  Aquí aparecerá el rendimiento
                  mensual cuando comencemos a
                  procesar reservas.
                </p>
              </div>

              <button
                className="small-filter-button"
                type="button"
              >
                Este mes
              </button>
            </div>

            <div className="empty-chart">
              <div className="empty-chart-lines">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>

              <div className="empty-chart-content">
                <div className="chart-empty-icon">
                  <Icon type="calendar" />
                </div>

                <strong>
                  Aún no hay reservas
                </strong>

                <p>
                  Los datos aparecerán aquí
                  automáticamente.
                </p>
              </div>
            </div>
          </article>

          <article className="dashboard-panel requests-panel">
            <div className="panel-heading">
              <div>
                <h2>
                  Solicitudes pendientes
                </h2>

                <p>
                  Hoteles por revisar
                </p>
              </div>

              <button
                className="text-purple-button"
                type="button"
                onClick={() =>
                  navigate('/hoteles')
                }
              >
                Ver todas
              </button>
            </div>

            <div className="requests-empty">
              <div className="requests-empty-icon">
                <Icon type="hotel" />
              </div>

              <strong>
                {statsLoading
                  ? 'Cargando solicitudes...'
                  : stats.hotels_pending > 0
                    ? `${stats.hotels_pending} solicitud${
                        stats.hotels_pending === 1
                          ? ''
                          : 'es'
                      } pendiente${
                        stats.hotels_pending === 1
                          ? ''
                          : 's'
                      }`
                    : 'Sin solicitudes pendientes'}
              </strong>

              <p>
                {stats.hotels_pending > 0
                  ? 'Ingresa a Hoteles para revisarlas y aprobarlas.'
                  : 'Los nuevos hoteles aparecerán aquí para su aprobación.'}
              </p>
            </div>
          </article>
        </section>

        <section className="dashboard-bottom-grid">
          <article className="dashboard-panel activity-panel">
            <div className="panel-heading">
              <div>
                <h2>
                  Actividad reciente
                </h2>

                <p>
                  Últimos movimientos de WAKI
                </p>
              </div>
            </div>

            <div className="activity-empty">
              Aún no hay actividad registrada.
            </div>
          </article>

          <article className="waki-welcome-panel">
            <div className="welcome-panel-copy">
              <span className="welcome-mini-label">
                WAKI ADMIN
              </span>

              <h2>
                Todo WAKI desde un solo lugar
              </h2>

              <p>
                Gestiona la oferta hotelera,
                revisa solicitudes y administra
                las operaciones de la plataforma.
              </p>

              <button
                type="button"
                onClick={() =>
                  navigate('/hoteles')
                }
              >
                Gestionar hoteles
              </button>
            </div>

            <img
              src={adminMascot}
              alt="WAKI Admin"
              className="welcome-mascot"
            />
          </article>
        </section>
      </main>
    </div>
  )
}

export default DashboardPage