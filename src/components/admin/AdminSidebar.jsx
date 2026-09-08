import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

import wakiLogo from '../../assets/waki_logo_full.png'
import wakiMascot from '../../assets/waki_admin_access.png'

function Icon({ type, size = 20 }) {
  const icons = {
    dashboard: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8.5 13.5 11 11l2 1.5 3-4" />
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
        <path d="M8 14h2M12 14h2M16 14h1M8 17h2M12 17h2" />
      </>
    ),

    guests: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-4 2.5-6 6-6s6 2 6 6" />
        <circle cx="17" cy="9" r="2" />
        <path d="M16 15c3 0 5 1.5 5 5" />
      </>
    ),

    finance: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="2" />
        <path d="M9 8h6M9 12h6M9 16h4" />
      </>
    ),

    reports: (
      <>
        <path d="M6 3h9l3 3v15H6z" />
        <path d="M14 3v4h4" />
        <path d="M9 12h6M9 16h6" />
      </>
    ),

    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1-2.8 2.8-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1.1 1.7V21H10v-.1A1.8 1.8 0 0 0 8.9 19a1.8 1.8 0 0 0-2 .4l-.1.1L4 16.7l.1-.1a1.8 1.8 0 0 0 .4-2A1.8 1.8 0 0 0 2.8 13H2v-4h.8a1.8 1.8 0 0 0 1.7-1.1 1.8 1.8 0 0 0-.4-2L4 5.8 6.8 3l.1.1a1.8 1.8 0 0 0 2 .4A1.8 1.8 0 0 0 10 1.8V1h4v.8a1.8 1.8 0 0 0 1.1 1.7 1.8 1.8 0 0 0 2-.4l.1-.1L20 5.8l-.1.1a1.8 1.8 0 0 0-.4 2A1.8 1.8 0 0 0 21.2 9h.8v4h-.8a1.8 1.8 0 0 0-1.8 2Z" />
      </>
    ),

    play: (
      <path d="m9 7 8 5-8 5z" />
    ),

    logout: (
      <>
        <path d="M10 17l5-5-5-5" />
        <path d="M15 12H3" />
        <path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" />
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

function getInitials(name) {
  if (!name) {
    return 'WA'
  }

  const parts = name
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

function AdminSidebar() {
  const navigate = useNavigate()

  const [adminName, setAdminName] = useState('Admin WAKI')

  useEffect(() => {
    let mounted = true

    const loadAdminProfile = async () => {
      try {
        const {
          data: { user }
        } = await supabase.auth.getUser()

        if (!user) {
          return
        }

        const {
          data,
          error
        } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single()

        if (error) {
          console.error(
            'Error cargando perfil del administrador:',
            error
          )
          return
        }

        if (
          mounted &&
          data?.full_name
        ) {
          setAdminName(data.full_name)
        }
      } catch (error) {
        console.error(
          'Error cargando administrador:',
          error
        )
      }
    }

    loadAdminProfile()

    return () => {
      mounted = false
    }
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()

    navigate('/login', {
      replace: true
    })
  }

  return (
    <aside className="hotel-setup-sidebar">
      <div className="setup-sidebar-logo">
        <img
          src={wakiLogo}
          alt="WAKI"
        />
      </div>

      <nav className="setup-sidebar-navigation">
        <button
          type="button"
          onClick={() =>
            navigate('/dashboard')
          }
        >
          <Icon
            type="dashboard"
            size={18}
          />

          <span>
            Dashboard
          </span>
        </button>

        <button
          type="button"
          className="active"
          onClick={() =>
            navigate('/hoteles')
          }
        >
          <Icon
            type="hotel"
            size={18}
          />

          <span>
            Hoteles
          </span>
        </button>

        <button
          type="button"
          disabled
        >
          <Icon
            type="calendar"
            size={18}
          />

          <span>
            Reservas
          </span>
        </button>

        <button
          type="button"
          disabled
        >
          <Icon
            type="guests"
            size={18}
          />

          <span>
            Huéspedes
          </span>
        </button>

        <button
          type="button"
          disabled
        >
          <Icon
            type="finance"
            size={18}
          />

          <span>
            Finanzas
          </span>
        </button>

        <button
          type="button"
          disabled
        >
          <Icon
            type="reports"
            size={18}
          />

          <span>
            Reportes
          </span>
        </button>

        <button
          type="button"
          disabled
        >
          <Icon
            type="settings"
            size={18}
          />

          <span>
            Configuración
          </span>
        </button>
      </nav>

      <div className="setup-sidebar-grow" />

      <div className="setup-sidebar-mascot">
        <img
          src={wakiMascot}
          alt=""
          aria-hidden="true"
        />

        <div className="setup-sidebar-helper-card">
          <strong>
            ¡Bienvenido a WAKI!
          </strong>

          <p>
            Tu aliado para
            <br />
            gestionar y crecer.
          </p>

          <button
            type="button"
            disabled
          >
            <Icon
              type="play"
              size={14}
            />

            <span>
              Ver guía rápida
            </span>
          </button>
        </div>
      </div>

      <div className="setup-sidebar-user">
        <div className="setup-sidebar-avatar">
          {getInitials(adminName)}
        </div>

        <div className="setup-sidebar-user-copy">
          <strong>
            {adminName}
          </strong>

          <span>
            Super administrador
          </span>
        </div>
      </div>

      <button
        type="button"
        className="setup-sidebar-logout"
        onClick={handleLogout}
      >
        <Icon
          type="logout"
          size={18}
        />

        <span>
          Cerrar sesión
        </span>
      </button>
    </aside>
  )
}

export default AdminSidebar