import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

import AdminSidebar from '../components/admin/AdminSidebar'
import HotelSetupBottomBar from '../components/hotels/HotelSetupBottomBar'


function Icon({ type, size = 19 }) {
  const icons = {
    room: (
      <>
        <path d="M4 12h16v8H4z" />
        <path d="M6 12V8h5a3 3 0 0 1 3 3v1" />
        <path d="M4 18h16M7 20v2M17 20v2" />
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

    upload: (
      <>
        <path d="M12 16V4" />
        <path d="m7 9 5-5 5 5" />
        <path d="M5 20h14" />
      </>
    ),

    star: (
      <path d="m12 3 2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.9-5.4 2.9 1-6-4.3-4.2 6-.9Z" />
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

function createEmptyRoom() {
  return {
    localId: crypto.randomUUID(),
    databaseId: null,

    name: '',
    description: '',
    inventory_count: 1,
    max_guests: 2,
    bed_type: '',
    size_m2: '',

    existingImages: [],
    newImages: []
  }
}

function HotelRoomsPage() {
  const navigate = useNavigate()
  const { hotelId } = useParams()

  const [hotel, setHotel] = useState(null)

  const [rooms, setRooms] = useState([
    createEmptyRoom()
  ])

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
            approval_status,
            hotel_brands (
              commercial_name
            )
          `)
          .eq('id', hotelId)
          .single()

        if (hotelError) {
          throw hotelError
        }

        if (mounted) {
          setHotel(hotelData)
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
              storage_path,
              is_cover,
              display_order
            )
          `)
          .eq('hotel_id', hotelId)
          .order('display_order', {
            ascending: true
          })

        if (roomError) {
          throw roomError
        }

        if (
          mounted &&
          roomData &&
          roomData.length > 0
        ) {
          setRooms(
            roomData.map((room) => ({
              localId: crypto.randomUUID(),

              databaseId: room.id,

              name:
                room.name || '',

              description:
                room.description || '',

              inventory_count:
                room.inventory_count ?? 1,

              max_guests:
                room.max_guests ?? 2,

              bed_type:
                room.bed_type || '',

              size_m2:
                room.size_m2 || '',

              existingImages:
                [...(room.room_type_images || [])]
                  .sort(
                    (a, b) =>
                      a.display_order -
                      b.display_order
                  ),

              newImages: []
            }))
          )
        }
      } catch (error) {
        console.error(
          'Error cargando habitaciones:',
          error
        )

        if (mounted) {
          setErrorMessage(
            'No se pudo cargar la información de habitaciones.'
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

  const updateRoom = (
    localId,
    field,
    value
  ) => {
    setRooms((current) =>
      current.map((room) =>
        room.localId === localId
          ? {
              ...room,
              [field]: value
            }
          : room
      )
    )

    setErrorMessage('')
    setSuccessMessage('')
  }

  const addRoom = () => {
    setRooms((current) => [
      ...current,
      createEmptyRoom()
    ])
  }

  const removeRoom = async (
    room
  ) => {
    if (rooms.length === 1) {
      return
    }

    try {
      if (room.databaseId) {
        const {
          error
        } = await supabase
          .from('room_types')
          .delete()
          .eq(
            'id',
            room.databaseId
          )

        if (error) {
          throw error
        }
      }

      setRooms((current) =>
        current.filter(
          (item) =>
            item.localId !==
            room.localId
        )
      )
    } catch (error) {
      console.error(
        'Error eliminando habitación:',
        error
      )

      setErrorMessage(
        'No se pudo eliminar la habitación.'
      )
    }
  }

  const handleImageSelect = (
    localId,
    files
  ) => {
    const selected =
      Array.from(files || [])

    if (selected.length === 0) {
      return
    }

    const validImages =
      selected.filter((file) =>
        file.type.startsWith('image/')
      )

    const prepared =
      validImages.map((file) => ({
        localId:
          crypto.randomUUID(),

        file,

        previewUrl:
          URL.createObjectURL(file)
      }))

    setRooms((current) =>
      current.map((room) =>
        room.localId === localId
          ? {
              ...room,

              newImages: [
                ...room.newImages,
                ...prepared
              ].slice(0, 8)
            }
          : room
      )
    )
  }

  const removeNewImage = (
    roomLocalId,
    imageLocalId
  ) => {
    setRooms((current) =>
      current.map((room) => {
        if (
          room.localId !==
          roomLocalId
        ) {
          return room
        }

        const image =
          room.newImages.find(
            (item) =>
              item.localId ===
              imageLocalId
          )

        if (image?.previewUrl) {
          URL.revokeObjectURL(
            image.previewUrl
          )
        }

        return {
          ...room,

          newImages:
            room.newImages.filter(
              (item) =>
                item.localId !==
                imageLocalId
            )
        }
      })
    )
  }

  const removeExistingImage =
    async (
      roomLocalId,
      image
    ) => {
      try {
        if (image.storage_path) {
          await supabase.storage
            .from('room-images')
            .remove([
              image.storage_path
            ])
        }

        const {
          error
        } = await supabase
          .from('room_type_images')
          .delete()
          .eq('id', image.id)

        if (error) {
          throw error
        }

        setRooms((current) =>
          current.map((room) =>
            room.localId ===
            roomLocalId
              ? {
                  ...room,

                  existingImages:
                    room.existingImages.filter(
                      (item) =>
                        item.id !==
                        image.id
                    )
                }
              : room
          )
        )
      } catch (error) {
        console.error(
          'Error eliminando imagen:',
          error
        )

        setErrorMessage(
          'No se pudo eliminar la imagen.'
        )
      }
    }

  const checklist = useMemo(() => {
    const validNames =
      rooms.every(
        (room) =>
          room.name.trim() !== ''
      )

    const validInventory =
      rooms.every(
        (room) =>
          Number(
            room.inventory_count
          ) >= 1
      )

    const validCapacity =
      rooms.every(
        (room) =>
          Number(
            room.max_guests
          ) >= 1
      )

    const withPhotos =
      rooms.every(
        (room) =>
          room.existingImages
            .length +
            room.newImages.length >
          0
      )

    return {
      roomTypes:
        rooms.length > 0 &&
        validNames,

      inventory:
        validInventory,

      capacity:
        validCapacity,

      photos:
        withPhotos
    }
  }, [rooms])

  const validateRooms = () => {
    if (rooms.length === 0) {
      return 'Agrega al menos un tipo de habitación.'
    }

    for (
      let index = 0;
      index < rooms.length;
      index += 1
    ) {
      const room =
        rooms[index]

      if (!room.name.trim()) {
        return `Ingresa el nombre de la habitación ${index + 1}.`
      }

      if (
        Number(
          room.inventory_count
        ) < 1
      ) {
        return `El inventario de la habitación ${index + 1} debe ser mayor a 0.`
      }

      if (
        Number(
          room.max_guests
        ) < 1
      ) {
        return `La capacidad de la habitación ${index + 1} debe ser mayor a 0.`
      }
    }

    return null
  }

  const uploadRoomImages =
    async (
      roomTypeId,
      room
    ) => {
      const alreadyCount =
        room.existingImages.length

      for (
        let index = 0;
        index <
        room.newImages.length;
        index += 1
      ) {
        const item =
          room.newImages[index]

        const extension =
          item.file.name
            .split('.')
            .pop()
            ?.toLowerCase() ||
          'jpg'

        const path =
          `${hotelId}/${roomTypeId}/${crypto.randomUUID()}.${extension}`

        const {
          error: uploadError
        } = await supabase.storage
          .from('room-images')
          .upload(
            path,
            item.file,
            {
              cacheControl: '3600',
              upsert: false
            }
          )

        if (uploadError) {
          throw uploadError
        }

        const {
          data: publicUrlData
        } = supabase.storage
          .from('room-images')
          .getPublicUrl(path)

        const {
          error: imageInsertError
        } = await supabase
          .from('room_type_images')
          .insert({
            room_type_id:
              roomTypeId,

            image_url:
              publicUrlData
                .publicUrl,

            storage_path:
              path,

            is_cover:
              alreadyCount === 0 &&
              index === 0,

            display_order:
              alreadyCount +
              index +
              1
          })

        if (imageInsertError) {
          throw imageInsertError
        }
      }
    }

  const saveRooms = async () => {
    const validationError =
      validateRooms()

    if (validationError) {
      throw new Error(
        validationError
      )
    }

    const updatedRooms = []

    for (
      let index = 0;
      index < rooms.length;
      index += 1
    ) {
      const room =
        rooms[index]

      const payload = {
        hotel_id:
          hotelId,

        name:
          room.name.trim(),

        description:
          room.description.trim() ||
          null,

        inventory_count:
          Number(
            room.inventory_count
          ),

        max_guests:
          Number(
            room.max_guests
          ),

        bed_type:
          room.bed_type.trim() ||
          null,

        size_m2:
          room.size_m2
            ? Number(
                room.size_m2
              )
            : null,

        is_active:
          true,

        display_order:
          index + 1
      }

      let roomTypeId =
        room.databaseId

      if (roomTypeId) {
        const {
          error
        } = await supabase
          .from('room_types')
          .update(payload)
          .eq(
            'id',
            roomTypeId
          )

        if (error) {
          throw error
        }
      } else {
        const {
          data,
          error
        } = await supabase
          .from('room_types')
          .insert(payload)
          .select('id')
          .single()

        if (error) {
          throw error
        }

        roomTypeId =
          data.id
      }

      await uploadRoomImages(
        roomTypeId,
        room
      )

      updatedRooms.push({
        ...room,

        databaseId:
          roomTypeId,

        newImages: []
      })
    }

    setRooms(updatedRooms)

    return updatedRooms
  }

  const handleSaveDraft =
    async () => {
      setErrorMessage('')
      setSuccessMessage('')

      try {
        setSaving(true)

        await saveRooms()

        setSuccessMessage(
          'Habitaciones guardadas correctamente.'
        )
      } catch (error) {
        console.error(
          'Error guardando habitaciones:',
          error
        )

        setErrorMessage(
          error.message ||
            'No se pudieron guardar las habitaciones.'
        )
      } finally {
        setSaving(false)
      }
    }

  const handleBack = () => {
    if (!hotel?.brand_id) {
      return
    }

    navigate(
      `/hoteles/nuevo/${hotel.brand_id}/sede?hotelId=${hotelId}`
    )
  }

  const handleContinue =
    async () => {
      setErrorMessage('')
      setSuccessMessage('')

      try {
        setSaving(true)

        await saveRooms()

        navigate(
          `/hoteles/${hotelId}/tarifas`
        )
      } catch (error) {
        console.error(
          'Error continuando a tarifas:',
          error
        )

        setErrorMessage(
          error.message ||
            'No se pudieron guardar las habitaciones.'
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
          Cargando habitaciones...
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
            Configuración / Paso 3
          </span>

          <h1>
            Habitaciones
          </h1>

          <p>
            Configura los tipos de habitación que
            esta sede ofrecerá en WAKI, sus
            características, capacidad e imágenes.
          </p>

          {hotel && (
            <div className="location-brand-chip">
              <Icon
                type="room"
                size={15}
              />

              Sede:

              <strong>
                {hotel.name}
              </strong>
            </div>
          )}
        </section>

        <div className="rooms-setup-layout">

          <section className="rooms-main-card">

            <div className="rooms-setup-header">
              <div>
                <span>
                  TIPOS CONFIGURADOS
                </span>

                <h2>
                  {rooms.length}{' '}
                  {rooms.length === 1
                    ? 'habitación'
                    : 'habitaciones'}
                </h2>

                <p>
                  Cada tarjeta representa una categoría
                  de habitación, no una habitación física.
                </p>
              </div>

              <button
                type="button"
                className="rooms-add-guided-button"
                onClick={addRoom}
              >
                <Icon
                  type="plus"
                  size={17}
                />

                Agregar tipo
              </button>
            </div>

            <div className="rooms-guided-list">

              {rooms.map(
                (room, index) => (
                  <article
                    className="guided-room-card"
                    key={
                      room.localId
                    }
                  >

                    <div className="guided-room-card-top">
                      <div className="guided-room-number">
                        {index + 1}
                      </div>

                      <div className="guided-room-title">
                        <span>
                          TIPO DE HABITACIÓN
                        </span>

                        <h3>
                          {room.name.trim() ||
                            `Habitación ${index + 1}`}
                        </h3>
                      </div>

                      <button
                        type="button"
                        className="guided-room-delete"
                        onClick={() =>
                          removeRoom(room)
                        }
                        disabled={
                          rooms.length === 1
                        }
                      >
                        <Icon
                          type="trash"
                          size={17}
                        />
                      </button>
                    </div>

                    <div className="guided-room-body">

                      <div className="guided-room-fields">
                        <div className="brand-form-grid">

                          <div className="brand-form-field full">
                            <label>
                              Nombre del tipo *
                            </label>

                            <input
                              value={
                                room.name
                              }
                              onChange={(event) =>
                                updateRoom(
                                  room.localId,
                                  'name',
                                  event.target.value
                                )
                              }
                              placeholder="Ej. Suite Deluxe"
                            />
                          </div>

                          <div className="brand-form-field full">
                            <label>
                              Descripción
                            </label>

                            <textarea
                              className="room-guided-description"
                              value={
                                room.description
                              }
                              onChange={(event) =>
                                updateRoom(
                                  room.localId,
                                  'description',
                                  event.target.value
                                )
                              }
                              placeholder="Ej. Suite amplia con cama king, jacuzzi y aire acondicionado."
                            />
                          </div>

                          <div className="brand-form-field">
                            <label>
                              Inventario disponible *
                            </label>

                            <input
                              type="number"
                              min="1"
                              value={
                                room.inventory_count
                              }
                              onChange={(event) =>
                                updateRoom(
                                  room.localId,
                                  'inventory_count',
                                  event.target.value
                                )
                              }
                            />
                          </div>

                          <div className="brand-form-field">
                            <label>
                              Capacidad máxima *
                            </label>

                            <input
                              type="number"
                              min="1"
                              value={
                                room.max_guests
                              }
                              onChange={(event) =>
                                updateRoom(
                                  room.localId,
                                  'max_guests',
                                  event.target.value
                                )
                              }
                            />
                          </div>

                          <div className="brand-form-field">
                            <label>
                              Tipo de cama
                            </label>

                            <input
                              value={
                                room.bed_type
                              }
                              onChange={(event) =>
                                updateRoom(
                                  room.localId,
                                  'bed_type',
                                  event.target.value
                                )
                              }
                              placeholder="Ej. King"
                            />
                          </div>

                          <div className="brand-form-field">
                            <label>
                              Tamaño aproximado (m²)
                            </label>

                            <input
                              type="number"
                              min="1"
                              step="0.1"
                              value={
                                room.size_m2
                              }
                              onChange={(event) =>
                                updateRoom(
                                  room.localId,
                                  'size_m2',
                                  event.target.value
                                )
                              }
                              placeholder="Ej. 32"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="guided-room-media">

                        <div className="guided-room-media-heading">
                          <div>
                            <strong>
                              Fotos de la habitación
                            </strong>

                            <span>
                              Hasta 8 imágenes
                            </span>
                          </div>

                          <span className="guided-photo-count">
                            {room.existingImages.length +
                              room.newImages.length}
                            /8
                          </span>
                        </div>

                        <div className="guided-room-gallery">

                          {room.existingImages.map(
                            (image) => (
                              <div
                                className="guided-room-photo"
                                key={
                                  image.id
                                }
                              >
                                <img
                                  src={
                                    image.image_url
                                  }
                                  alt=""
                                />

                                {image.is_cover && (
                                  <span className="guided-cover-badge">
                                    <Icon
                                      type="star"
                                      size={11}
                                    />

                                    Portada
                                  </span>
                                )}

                                <button
                                  type="button"
                                  onClick={() =>
                                    removeExistingImage(
                                      room.localId,
                                      image
                                    )
                                  }
                                >
                                  ×
                                </button>
                              </div>
                            )
                          )}

                          {room.newImages.map(
                            (image) => (
                              <div
                                className="guided-room-photo"
                                key={
                                  image.localId
                                }
                              >
                                <img
                                  src={
                                    image.previewUrl
                                  }
                                  alt=""
                                />

                                <button
                                  type="button"
                                  onClick={() =>
                                    removeNewImage(
                                      room.localId,
                                      image.localId
                                    )
                                  }
                                >
                                  ×
                                </button>
                              </div>
                            )
                          )}

                          {room.existingImages.length +
                            room.newImages.length <
                            8 && (
                            <label className="guided-room-upload">
                              <Icon
                                type="upload"
                                size={21}
                              />

                              <strong>
                                Agregar fotos
                              </strong>

                              <span>
                                JPG, PNG o WEBP
                              </span>

                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={(event) =>
                                  handleImageSelect(
                                    room.localId,
                                    event.target.files
                                  )
                                }
                              />
                            </label>
                          )}
                        </div>

                        <p className="guided-photo-tip">
                          La primera imagen que subas se
                          utilizará como portada de esta
                          habitación.
                        </p>
                      </div>
                    </div>
                  </article>
                )
              )}
            </div>
          </section>

          <aside className="hotel-brand-guide-card rooms-guide-card">
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
              Configura cada tipo de habitación con
              información suficiente para que el huésped
              pueda comparar opciones.
            </p>

            <GuideItem
              completed={
                checklist.roomTypes
              }
              title="Tipos de habitación"
              description="Agrega todas las categorías comerciales de esta sede."
            />

            <GuideItem
              completed={
                checklist.inventory
              }
              title="Inventario"
              description="Indica cuántas habitaciones de cada tipo pueden venderse."
            />

            <GuideItem
              completed={
                checklist.capacity
              }
              title="Capacidad"
              description="Define el máximo de huéspedes permitido."
            />

            <GuideItem
              completed={
                checklist.photos
              }
              title="Fotografías"
              description="Recomendamos al menos una foto clara por cada tipo."
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
          progress={60}
          saving={saving}
          onBack={handleBack}
          onSaveDraft={handleSaveDraft}
          onContinue={handleContinue}
          backLabel="Volver a Sede"
          continueLabel="Continuar a tarifas"
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

export default HotelRoomsPage