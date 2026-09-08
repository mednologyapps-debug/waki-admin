import wakiMascot from '../../assets/waki_admin_access.png'

function Icon({ type, size = 18 }) {
  const icons = {
    star: (
      <path d="m12 2 2.9 6 6.6.9-4.8 4.7 1.2 6.6-5.9-3.1-5.9 3.1 1.2-6.6L2.5 8.9 9.1 8Z" />
    ),

    booking: (
      <>
        <rect x="4" y="6" width="16" height="14" rx="2" />
        <path d="M8 3v6M16 3v6M4 10h16" />
      </>
    ),

    guest: (
      <>
        <circle cx="12" cy="8" r="3" />
        <path d="M5 21c0-4.5 2.8-7 7-7s7 2.5 7 7" />
      </>
    ),

    money: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M15 8.5c-.7-.7-1.7-1-3-1-1.7 0-3 .8-3 2s1.1 1.8 3 2.3c1.9.5 3 1.1 3 2.5s-1.3 2.2-3 2.2c-1.4 0-2.5-.4-3.3-1.3M12 5v14" />
      </>
    ),

    save: (
      <>
        <path d="M5 3h12l3 3v15H4V4a1 1 0 0 1 1-1Z" />
        <path d="M8 3v6h8V3M8 21v-7h8v7" />
      </>
    ),

    arrow: (
      <path d="m9 18 6-6-6-6" />
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

function HotelSetupBottomBar({
  progress = 20,
  saving = false,
  onSaveDraft,
  onContinue,
  onBack = null,
  continueLabel = 'Continuar',
  backLabel = 'Anterior'
}) {
  return (
    <section className="hotel-setup-bottom-bar">
      <div className="setup-tip-section">
        <img
          src={wakiMascot}
          alt=""
          aria-hidden="true"
        />

        <div className="setup-tip-copy">
          <div>
            <Icon
              type="star"
              size={15}
            />

            <strong>
              ¿Sabías que?
            </strong>
          </div>

          <p>
            Completar tu perfil al 100% mejora
            la calidad de tu publicación.
          </p>
        </div>
      </div>

      <div className="setup-bottom-divider" />

      <div className="setup-bottom-progress">
        <span>
          Progreso de configuración
        </span>

        <div>
          <div className="setup-bottom-progress-line">
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

      <div className="setup-bottom-divider" />

      <div className="setup-benefits">
        <div className="setup-benefits-label">
          Con tu hotel
          <br />
          activo podrás:
        </div>

        <div className="setup-benefit">
          <span>
            <Icon
              type="booking"
              size={15}
            />
          </span>

          <p>
            Recibir reservas
            <br />
            en línea 24/7
          </p>
        </div>

        <div className="setup-benefit">
          <span>
            <Icon
              type="guest"
              size={15}
            />
          </span>

          <p>
            Gestionar huéspedes
            <br />
            y estancias
          </p>
        </div>

        <div className="setup-benefit">
          <span>
            <Icon
              type="money"
              size={15}
            />
          </span>

          <p>
            Controlar tarifas
            <br />
            y disponibilidad
          </p>
        </div>
      </div>

      <div className="setup-bottom-divider" />

      <div className="setup-bottom-actions">
        {onBack && (
          <button
            type="button"
            className="setup-back-step-button"
            onClick={onBack}
            disabled={saving}
          >
            <Icon
              type="back"
              size={16}
            />

            {backLabel}
          </button>
        )}

        <button
          type="button"
          className="setup-save-draft"
          onClick={onSaveDraft}
          disabled={saving}
        >
          <Icon
            type="save"
            size={16}
          />

          Guardar borrador
        </button>

        <button
          type="button"
          className="setup-continue-button"
          onClick={onContinue}
          disabled={saving}
        >
          {saving
            ? 'Guardando...'
            : continueLabel}

          {!saving && (
            <Icon
              type="arrow"
              size={17}
            />
          )}
        </button>
      </div>
    </section>
  )
}

export default HotelSetupBottomBar