import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

import AdminSidebar from '../components/admin/AdminSidebar'
import HotelSetupBottomBar from '../components/hotels/HotelSetupBottomBar'

function Icon({ type, size = 19 }) {
  const icons = {
    money: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M15 8.5c-.7-.7-1.7-1-3-1-1.7 0-3 .8-3 2s1.1 1.8 3 2.3c1.9.5 3 1.1 3 2.5s-1.3 2.2-3 2.2c-1.4 0-2.5-.4-3.3-1.3M12 5v14" />
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

    plus: (
      <path d="M12 5v14M5 12h14" />
    ),

    trash: (
      <>
        <path d="M3 6h18" />
        <path d="M8 6V4h8v2" />
        <path d="M19 6l-1 14H6L5 6" />
      </>
    ),

    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),

    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
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

function createEmptyRate() {
  return {
    localId: crypto.randomUUID(),
    databaseId: null,

    name: '',
    durationHours: '',
    basePrice: '',

    weekendEnabled: false,
    weekendPrice: ''
  }
}

function HotelRatesPage() {
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

    const loadData = async () => {
      try {
        setLoading(true)

        const {
          data: hotelData,
          error: hotelError
        } = await supabase
          .from('hotels')
          .select(`
            id,
            brand_id,
            name,
            district,
            hotel_brands (
              commercial_name
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
            inventory_count,
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
                priority,
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
              id: room.id,
              name: room.name,
              inventory_count:
                room.inventory_count,

              rates:
                room.rate_plans?.length
                  ? [...room.rate_plans]
                      .sort(
                        (a, b) =>
                          a.display_order -
                          b.display_order
                      )
                      .map((rate) => {
                        const weekendRule =
                          rate.rate_rules?.find(
                            (rule) =>
                              Array.isArray(
                                rule.days_of_week
                              ) &&
                              rule.days_of_week.includes(6) &&
                              rule.days_of_week.includes(7)
                          )

                        return {
                          localId:
                            crypto.randomUUID(),

                          databaseId:
                            rate.id,

                          name:
                            rate.name || '',

                          durationHours:
                            rate.duration_minutes
                              ? (
                                  rate.duration_minutes / 60
                                ).toString()
                              : '',

                          basePrice:
                            rate.base_price?.toString() ||
                            '',

                          weekendEnabled:
                            Boolean(
                              weekendRule
                            ),

                          weekendPrice:
                            weekendRule?.price?.toString() ||
                            ''
                        }
                      })
                  : [
                      createEmptyRate()
                    ]
            }))
          )
        }
      } catch (error) {
        console.error(
          'Error cargando tarifas:',
          error
        )

        if (mounted) {
          setErrorMessage(
            'No se pudo cargar la configuración de tarifas.'
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
  }, [hotelId])

  const updateRate = (
    roomId,
    localId,
    field,
    value
  ) => {
    setRooms((current) =>
      current.map((room) =>
        room.id === roomId
          ? {
              ...room,

              rates:
                room.rates.map((rate) =>
                  rate.localId === localId
                    ? {
                        ...rate,
                        [field]: value
                      }
                    : rate
                )
            }
          : room
      )
    )

    setErrorMessage('')
    setSuccessMessage('')
  }

  const addRate = (roomId) => {
    setRooms((current) =>
      current.map((room) =>
        room.id === roomId
          ? {
              ...room,

              rates: [
                ...room.rates,
                createEmptyRate()
              ]
            }
          : room
      )
    )
  }

  const removeRate = async (
    roomId,
    rate
  ) => {
    const targetRoom =
      rooms.find(
        (room) =>
          room.id === roomId
      )

    if (
      !targetRoom ||
      targetRoom.rates.length === 1
    ) {
      return
    }

    try {
      if (rate.databaseId) {
        const {
          error
        } = await supabase
          .from('rate_plans')
          .delete()
          .eq(
            'id',
            rate.databaseId
          )

        if (error) {
          throw error
        }
      }

      setRooms((current) =>
        current.map((room) =>
          room.id === roomId
            ? {
                ...room,

                rates:
                  room.rates.filter(
                    (item) =>
                      item.localId !==
                      rate.localId
                  )
              }
            : room
        )
      )
    } catch (error) {
      console.error(
        'Error eliminando tarifa:',
        error
      )

      setErrorMessage(
        'No se pudo eliminar la tarifa.'
      )
    }
  }

  const checklist = useMemo(() => {
    const allHaveRates =
      rooms.length > 0 &&
      rooms.every(
        (room) =>
          room.rates.length > 0
      )

    const durationsComplete =
      rooms.every((room) =>
        room.rates.every(
          (rate) =>
            Number(
              rate.durationHours
            ) > 0
        )
      )

    const pricesComplete =
      rooms.every((room) =>
        room.rates.every(
          (rate) =>
            Number(
              rate.basePrice
            ) > 0
        )
      )

    const weekendValid =
      rooms.every((room) =>
        room.rates.every(
          (rate) =>
            !rate.weekendEnabled ||
            Number(
              rate.weekendPrice
            ) > 0
        )
      )

    return {
      rooms:
        allHaveRates,

      durations:
        durationsComplete,

      prices:
        pricesComplete,

      weekend:
        weekendValid
    }
  }, [rooms])

  const validateRates = () => {
    if (rooms.length === 0) {
      return 'Este hotel no tiene tipos de habitación configurados.'
    }

    for (const room of rooms) {
      if (
        !room.rates ||
        room.rates.length === 0
      ) {
        return `Agrega al menos una tarifa para ${room.name}.`
      }

      for (
        let index = 0;
        index < room.rates.length;
        index += 1
      ) {
        const rate =
          room.rates[index]

        if (
          Number(
            rate.durationHours
          ) <= 0
        ) {
          return `Ingresa una duración válida en ${room.name}.`
        }

        if (
          Number(
            rate.basePrice
          ) <= 0
        ) {
          return `Ingresa un precio base válido en ${room.name}.`
        }

        if (
          rate.weekendEnabled &&
          Number(
            rate.weekendPrice
          ) <= 0
        ) {
          return `Ingresa el precio de fin de semana en ${room.name}.`
        }
      }
    }

    return null
  }

  const saveRates = async () => {
    const validationError =
      validateRates()

    if (validationError) {
      throw new Error(
        validationError
      )
    }

    const updatedRooms = []

    for (const room of rooms) {
      const updatedRates = []

      for (
        let index = 0;
        index < room.rates.length;
        index += 1
      ) {
        const rate =
          room.rates[index]

        const hours =
          Number(
            rate.durationHours
          )

        const durationMinutes =
          Math.round(
            hours * 60
          )

        const generatedName =
          rate.name.trim() ||
          `${hours} ${hours === 1 ? 'hora' : 'horas'}`

        const payload = {
          room_type_id:
            room.id,

          name:
            generatedName,

          duration_minutes:
            durationMinutes,

          base_price:
            Number(
              rate.basePrice
            ),

          currency:
            'PEN',

          is_active:
            true,

          display_order:
            index + 1
        }

        let ratePlanId =
          rate.databaseId

        if (ratePlanId) {
          const {
            error
          } = await supabase
            .from('rate_plans')
            .update(payload)
            .eq(
              'id',
              ratePlanId
            )

          if (error) {
            throw error
          }
        } else {
          const {
            data,
            error
          } = await supabase
            .from('rate_plans')
            .insert(payload)
            .select('id')
            .single()

          if (error) {
            throw error
          }

          ratePlanId =
            data.id
        }

        /*
         * Eliminamos reglas de fin
         * de semana anteriores.
         */
        const {
          error: deleteRulesError
        } = await supabase
          .from('rate_rules')
          .delete()
          .eq(
            'rate_plan_id',
            ratePlanId
          )
          .eq(
            'name',
            'Fin de semana'
          )

        if (deleteRulesError) {
          throw deleteRulesError
        }

        /*
         * Si el hotel habilitó
         * precio de fin de semana,
         * creamos una regla nueva.
         *
         * 6 = sábado
         * 7 = domingo
         */
        if (
          rate.weekendEnabled
        ) {
          const {
            error: ruleError
          } = await supabase
            .from('rate_rules')
            .insert({
              rate_plan_id:
                ratePlanId,

              name:
                'Fin de semana',

              days_of_week:
                [6, 7],

              price:
                Number(
                  rate.weekendPrice
                ),

              priority:
                20,

              is_active:
                true
            })

          if (ruleError) {
            throw ruleError
          }
        }

        updatedRates.push({
          ...rate,

          databaseId:
            ratePlanId,

          name:
            generatedName
        })
      }

      updatedRooms.push({
        ...room,
        rates:
          updatedRates
      })
    }

    setRooms(
      updatedRooms
    )

    return updatedRooms
  }

  const handleSaveDraft =
    async () => {
      setErrorMessage('')
      setSuccessMessage('')

      try {
        setSaving(true)

        await saveRates()

        setSuccessMessage(
          'Tarifas guardadas correctamente.'
        )
      } catch (error) {
        console.error(
          'Error guardando tarifas:',
          error
        )

        setErrorMessage(
          error.message ||
            'No se pudieron guardar las tarifas.'
        )
      } finally {
        setSaving(false)
      }
    }

  const handleBack = () => {
    navigate(
      `/hoteles/${hotelId}/habitaciones`
    )
  }

  const handleContinue =
    async () => {
      setErrorMessage('')
      setSuccessMessage('')

      try {
        setSaving(true)

        await saveRates()

        navigate(
          `/hoteles/${hotelId}/revision`
        )
      } catch (error) {
        console.error(
          'Error continuando a revisión:',
          error
        )

        setErrorMessage(
          error.message ||
            'No se pudieron guardar las tarifas.'
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
          Cargando tarifas...
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
            Configuración / Paso 4
          </span>

          <h1>
            Tarifas
          </h1>

          <p>
            Define cuánto cuesta cada duración por tipo
            de habitación y, si corresponde, configura
            un precio especial para fines de semana.
          </p>

          {hotel && (
            <div className="location-brand-chip">
              <Icon
                type="money"
                size={15}
              />

              Sede:

              <strong>
                {hotel.name}
              </strong>
            </div>
          )}
        </section>

        <div className="rates-setup-layout">

          <section className="rates-main-card">

            <div className="rates-intro-card">
              <div className="rates-intro-icon">
                <Icon
                  type="clock"
                  size={23}
                />
              </div>

              <div>
                <strong>
                  Tarifas por duración
                </strong>

                <p>
                  WAKI permite que cada tipo de habitación
                  tenga sus propias duraciones. Por ejemplo:
                  3 h, 6 h y 12 h.
                </p>
              </div>
            </div>

            <div className="rates-room-list">

              {rooms.map(
                (room, roomIndex) => (
                  <article
                    className="rate-room-card"
                    key={room.id}
                  >

                    <div className="rate-room-heading">
                      <div className="rate-room-number">
                        {roomIndex + 1}
                      </div>

                      <div>
                        <span>
                          TIPO DE HABITACIÓN
                        </span>

                        <h2>
                          {room.name}
                        </h2>

                        <p>
                          Inventario:
                          {' '}
                          {room.inventory_count}
                        </p>
                      </div>

                      <button
                        type="button"
                        className="rate-add-button"
                        onClick={() =>
                          addRate(
                            room.id
                          )
                        }
                      >
                        <Icon
                          type="plus"
                          size={16}
                        />

                        Agregar duración
                      </button>
                    </div>

                    <div className="rate-plan-list">

                      {room.rates.map(
                        (
                          rate,
                          rateIndex
                        ) => (
                          <div
                            className="rate-plan-card"
                            key={
                              rate.localId
                            }
                          >

                            <div className="rate-plan-topline">
                              <span>
                                TARIFA {rateIndex + 1}
                              </span>

                              <button
                                type="button"
                                onClick={() =>
                                  removeRate(
                                    room.id,
                                    rate
                                  )
                                }
                                disabled={
                                  room.rates.length === 1
                                }
                              >
                                <Icon
                                  type="trash"
                                  size={16}
                                />
                              </button>
                            </div>

                            <div className="rate-plan-grid">

                              <div className="brand-form-field">
                                <label>
                                  Nombre de tarifa
                                </label>

                                <input
                                  value={
                                    rate.name
                                  }
                                  onChange={(event) =>
                                    updateRate(
                                      room.id,
                                      rate.localId,
                                      'name',
                                      event.target.value
                                    )
                                  }
                                  placeholder="Ej. Escapada 3 horas"
                                />
                              </div>

                              <div className="brand-form-field">
                                <label>
                                  Duración *
                                </label>

                                <div className="rate-unit-field">
                                  <input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={
                                      rate.durationHours
                                    }
                                    onChange={(event) =>
                                      updateRate(
                                        room.id,
                                        rate.localId,
                                        'durationHours',
                                        event.target.value
                                      )
                                    }
                                    placeholder="3"
                                  />

                                  <span>
                                    horas
                                  </span>
                                </div>
                              </div>

                              <div className="brand-form-field">
                                <label>
                                  Precio base *
                                </label>

                                <div className="rate-money-field">
                                  <span>
                                    S/
                                  </span>

                                  <input
                                    type="number"
                                    min="1"
                                    step="0.01"
                                    value={
                                      rate.basePrice
                                    }
                                    onChange={(event) =>
                                      updateRate(
                                        room.id,
                                        rate.localId,
                                        'basePrice',
                                        event.target.value
                                      )
                                    }
                                    placeholder="60.00"
                                  />
                                </div>
                              </div>

                              <div className="rate-weekend-block">
                                <div className="rate-weekend-toggle-row">
                                  <div>
                                    <Icon
                                      type="calendar"
                                      size={17}
                                    />

                                    <div>
                                      <strong>
                                        Precio de fin de semana
                                      </strong>

                                      <span>
                                        Sábado y domingo
                                      </span>
                                    </div>
                                  </div>

                                  <button
                                    type="button"
                                    className={
                                      rate.weekendEnabled
                                        ? 'rate-toggle active'
                                        : 'rate-toggle'
                                    }
                                    onClick={() =>
                                      updateRate(
                                        room.id,
                                        rate.localId,
                                        'weekendEnabled',
                                        !rate.weekendEnabled
                                      )
                                    }
                                  >
                                    <span />
                                  </button>
                                </div>

                                {rate.weekendEnabled && (
                                  <div className="rate-weekend-price">
                                    <label>
                                      Precio especial *
                                    </label>

                                    <div className="rate-money-field">
                                      <span>
                                        S/
                                      </span>

                                      <input
                                        type="number"
                                        min="1"
                                        step="0.01"
                                        value={
                                          rate.weekendPrice
                                        }
                                        onChange={(event) =>
                                          updateRate(
                                            room.id,
                                            rate.localId,
                                            'weekendPrice',
                                            event.target.value
                                          )
                                        }
                                        placeholder="70.00"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </article>
                )
              )}
            </div>
          </section>

          <aside className="hotel-brand-guide-card rates-guide-card">
            <div className="brand-guide-heading">
              <span>
                <Icon
                  type="info"
                  size={18}
                />
              </span>

              <h2>
                Antes de continuar
              </h2>
            </div>

            <p className="brand-guide-intro">
              Define al menos una duración y precio
              por cada tipo de habitación.
            </p>

            <GuideItem
              completed={
                checklist.rooms
              }
              title="Habitaciones"
              description="Cada tipo debe tener por lo menos una tarifa."
            />

            <GuideItem
              completed={
                checklist.durations
              }
              title="Duraciones"
              description="Configura las horas disponibles para cada opción."
            />

            <GuideItem
              completed={
                checklist.prices
              }
              title="Precios base"
              description="Define el precio regular de cada duración."
            />

            <GuideItem
              completed={
                checklist.weekend
              }
              title="Fin de semana"
              description="Si activas una tarifa especial, completa su precio."
            />
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
          progress={80}
          saving={saving}
          onBack={handleBack}
          onSaveDraft={handleSaveDraft}
          onContinue={handleContinue}
          backLabel="Volver a Habitaciones"
          continueLabel="Continuar a revisión"
        />
      </main>
    </div>
  )
}

function GuideItem({
  completed,
  title,
  description
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
        </strong>

        <p>
          {description}
        </p>
      </div>
    </div>
  )
}

export default HotelRatesPage