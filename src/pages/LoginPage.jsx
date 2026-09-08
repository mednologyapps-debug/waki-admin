import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

import wakiLogo from '../assets/waki_logo_full.png'
import adminMascot from '../assets/waki_admin_access.png'

function MailIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

function EyeIcon({ visible }) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
      <circle cx="12" cy="12" r="2.5" />

      {!visible && (
        <path d="M4 4l16 16" />
      )}
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function LoginPage() {
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()

    setLoading(true)
    setErrorMessage('')

    try {
      const {
        data: signInData,
        error: signInError
      } = await supabase.auth.signInWithPassword({
        email,
        password
      })

      if (signInError) {
        throw signInError
      }

      const user = signInData.user

      if (!user) {
        throw new Error(
          'No se pudo obtener el usuario autenticado.'
        )
      }

      const {
        data: profile,
        error: profileError
      } = await supabase
        .from('profiles')
        .select(
          'id, full_name, role, account_status'
        )
        .eq('id', user.id)
        .single()

      if (profileError) {
        await supabase.auth.signOut()

        throw new Error(
          'No se pudo validar el perfil del usuario.'
        )
      }

      if (profile.account_status !== 'active') {
        await supabase.auth.signOut()

        throw new Error(
          'Tu cuenta no se encuentra activa.'
        )
      }

      if (
        profile.role !== 'super_admin' &&
        profile.role !== 'admin'
      ) {
        await supabase.auth.signOut()

        throw new Error(
          'Este usuario no tiene permisos para acceder al administrador de WAKI.'
        )
      }

      navigate('/dashboard')
    } catch (error) {
      setErrorMessage(
        error.message ||
          'No se pudo iniciar sesión.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="waki-login-page">
      <section className="waki-login-visual">
        <div className="login-decoration login-decoration-one" />
        <div className="login-decoration login-decoration-two" />
        <div className="login-spark login-spark-one">✦</div>
        <div className="login-spark login-spark-two">✦</div>

        <div className="login-visual-content">
          <img
            src={adminMascot}
            alt="WAKI"
            className="login-admin-mascot"
          />

          <div className="login-welcome-copy">
            <h1>
              Bienvenido a WAKI Admin
            </h1>

            <p>
              Gestiona hoteles, reservas y usuarios
              desde un solo lugar.
            </p>
          </div>
        </div>

        <div className="login-left-footer">
          © {new Date().getFullYear()} WAKI.
          Todos los derechos reservados.
        </div>
      </section>

      <section className="waki-login-form-side">
        <div className="login-form-card-new">
          <div className="login-logo-wrapper">
            <img
              src={wakiLogo}
              alt="WAKI"
              className="login-official-logo"
            />
          </div>

          <div className="login-title-area">
            <h2>Iniciar sesión</h2>

            <p>
              Accede al panel administrador de WAKI
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="login-form-new"
          >
            <div className="form-field">
              <label>
                Correo electrónico
              </label>

              <div className="input-with-icon">
                <span className="field-leading-icon">
                  <MailIcon />
                </span>

                <input
                  type="email"
                  placeholder="admin@wakipe.com"
                  value={email}
                  onChange={(event) =>
                    setEmail(event.target.value)
                  }
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <div className="form-field">
              <label>
                Contraseña
              </label>

              <div className="input-with-icon">
                <span className="field-leading-icon">
                  <LockIcon />
                </span>

                <input
                  type={
                    showPassword
                      ? 'text'
                      : 'password'
                  }
                  placeholder="Ingresa tu contraseña"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  autoComplete="current-password"
                  required
                />

                <button
                  className="password-toggle"
                  type="button"
                  onClick={() =>
                    setShowPassword(
                      (current) => !current
                    )
                  }
                  aria-label="Mostrar contraseña"
                >
                  <EyeIcon
                    visible={showPassword}
                  />
                </button>
              </div>
            </div>

            {errorMessage && (
              <div className="form-error">
                {errorMessage}
              </div>
            )}

            <button
              className="login-submit-button"
              type="submit"
              disabled={loading}
            >
              {loading
                ? 'Validando...'
                : 'Ingresar'}
            </button>
          </form>

          <div className="admin-security-message">
            <ShieldIcon />

            <span>
              Acceso seguro para administradores
              autorizados
            </span>
          </div>
        </div>
      </section>
    </main>
  )
}

export default LoginPage