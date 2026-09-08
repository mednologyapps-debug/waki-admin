import { useNavigate } from 'react-router-dom'

function Icon({ type, size = 19 }) {
  const icons = {
    star: (
      <path d="m12 2 2.9 6 6.6.9-4.8 4.7 1.2 6.6-5.9-3.1-5.9 3.1 1.2-6.6L2.5 8.9 9.1 8Z" />
    ),

    message: (
      <>
        <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
        <path d="M8 9h8M8 13h5" />
      </>
    ),

    back: (
      <path d="m15 18-6-6 6-6" />
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

function HotelSetupTopbar({
  currentStep = 1,
  totalSteps = 5
}) {
  const navigate = useNavigate()

  const progress = Math.round(
    (currentStep / totalSteps) * 100
  )

  return (
    <div className="hotel-setup-top-row">
      <section className="hotel-setup-progress-card">
        <div className="setup-progress-intro">
          <div className="setup-progress-star">
            <Icon
              type="star"
              size={22}
            />
          </div>

          <div>
            <strong>
              Configuración del hotel
            </strong>

            <p>
              Completa los pasos para dejar tu hotel listo
              <br />
              y empezar a recibir reservas.
            </p>
          </div>
        </div>

        <div className="setup-progress-divider" />

        <div className="setup-progress-status">
          <span>
            Paso {currentStep} de {totalSteps}
          </span>

          <div className="setup-progress-line-row">
            <div className="setup-progress-line">
              <span
                style={{
                  width: `${progress}%`
                }}
              />
            </div>

            <strong>
              {progress}%
            </strong>
          </div>
        </div>

        <div className="setup-progress-divider" />

        <div className="setup-support-copy">
          <strong>
            ¿Necesitas ayuda en algún paso?
          </strong>

          <span>
            Estamos listos para ayudarte.
          </span>

          <button
            type="button"
            disabled
          >
            <Icon
              type="message"
              size={15}
            />

            <span>
              Contactar soporte
            </span>
          </button>
        </div>
      </section>

      <button
        type="button"
        className="setup-back-hotels-button"
        onClick={() =>
          navigate('/hoteles')
        }
      >
        <Icon
          type="back"
          size={18}
        />

        <span>
          Volver a hoteles
        </span>
      </button>
    </div>
  )
}

export default HotelSetupTopbar