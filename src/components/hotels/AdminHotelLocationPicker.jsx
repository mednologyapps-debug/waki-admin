import {
  useEffect,
  useRef,
  useState
} from 'react'


let googleMapsPromise = null


function loadGoogleMaps() {
  if (
    window.google
      ?.maps
      ?.importLibrary
  ) {
    return Promise.resolve(
      window.google
    )
  }

  if (googleMapsPromise) {
    return googleMapsPromise
  }

  const apiKey =
    import.meta.env
      .VITE_GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    return Promise.reject(
      new Error(
        'Falta configurar VITE_GOOGLE_MAPS_API_KEY.'
      )
    )
  }

  googleMapsPromise =
    new Promise(
      (resolve, reject) => {
        const script =
          document.createElement(
            'script'
          )

        script.src =
          'https://maps.googleapis.com/maps/api/js' +
          '?key=' +
          encodeURIComponent(
            apiKey
          ) +
          '&v=weekly' +
          '&loading=async'

        script.async =
          true

        script.defer =
          true

        script.onload =
          () => resolve(
            window.google
          )

        script.onerror =
          () => reject(
            new Error(
              'No pudimos cargar Google Maps.'
            )
          )

        document.head.appendChild(
          script
        )
      }
    )

  return googleMapsPromise
}


function addressPart(
  components,
  types
) {
  const item =
    components?.find(
      (component) =>
        types.some(
          (type) =>
            component.types
              ?.includes(
                type
              )
        )
    )

  return item?.longText ||
    item?.long_name ||
    ''
}


export default function AdminHotelLocationPicker({
  latitude,
  longitude,
  address,
  onSelect
}) {
  const mapContainerRef =
    useRef(null)

  const autocompleteContainerRef =
    useRef(null)

  const mapRef =
    useRef(null)

  const markerRef =
    useRef(null)

  const [errorMessage, setErrorMessage] =
    useState('')


  useEffect(() => {
    let cancelled =
      false

    async function initialize() {
      try {
        setErrorMessage('')

        const google =
          await loadGoogleMaps()

        if (
          cancelled ||
          !mapContainerRef.current ||
          !autocompleteContainerRef.current
        ) {
          return
        }

        const {
          Map
        } =
          await google.maps
            .importLibrary(
              'maps'
            )

        const {
          PlaceAutocompleteElement
        } =
          await google.maps
            .importLibrary(
              'places'
            )

        const initialPosition =
          latitude != null &&
          longitude != null
            ? {
                lat:
                  Number(
                    latitude
                  ),

                lng:
                  Number(
                    longitude
                  )
              }
            : {
                lat:
                  -12.0464,

                lng:
                  -77.0428
              }

        const map =
          new Map(
            mapContainerRef.current,
            {
              center:
                initialPosition,

              zoom:
                latitude != null &&
                longitude != null
                  ? 17
                  : 12,

              streetViewControl:
                false,

              fullscreenControl:
                false,

              mapTypeControl:
                false
            }
          )

        mapRef.current =
          map

        const marker =
          new google.maps.Marker({
            map,
            position:
              initialPosition,

            visible:
              latitude != null &&
              longitude != null
          })

        markerRef.current =
          marker

        const autocomplete =
          new PlaceAutocompleteElement()

        autocomplete.placeholder =
          'Busca el hotel o escribe la dirección exacta'

        autocomplete.includedRegionCodes =
          [
            'pe'
          ]

        autocomplete.locationBias =
          {
            center: {
              lat:
                -12.0464,

              lng:
                -77.0428
            },

            radius:
              40000
          }

        autocompleteContainerRef
          .current
          .replaceChildren(
            autocomplete
          )

        autocomplete
          .addEventListener(
            'gmp-select',
            async (
              event
            ) => {
              try {
                const place =
                  event
                    .placePrediction
                    .toPlace()

                await place
                  .fetchFields({
                    fields: [
                      'displayName',
                      'formattedAddress',
                      'location',
                      'viewport',
                      'addressComponents'
                    ]
                  })

                if (
                  !place.location
                ) {
                  throw new Error(
                    'Google Maps no devolvió coordenadas.'
                  )
                }

                marker.setPosition(
                  place.location
                )

                marker.setVisible(
                  true
                )

                if (
                  place.viewport
                ) {
                  map.fitBounds(
                    place.viewport
                  )
                } else {
                  map.setCenter(
                    place.location
                  )

                  map.setZoom(
                    17
                  )
                }

                const components =
                  place.addressComponents ||
                  []

                onSelect({
                  latitude:
                    place.location.lat(),

                  longitude:
                    place.location.lng(),

                  address:
                    place.formattedAddress ||
                    address ||
                    '',

                  district:
                    addressPart(
                      components,
                      [
                        'sublocality_level_1',
                        'locality'
                      ]
                    ),

                  province:
                    addressPart(
                      components,
                      [
                        'administrative_area_level_2'
                      ]
                    ),

                  department:
                    addressPart(
                      components,
                      [
                        'administrative_area_level_1'
                      ]
                    )
                })
              } catch (
                error
              ) {
                setErrorMessage(
                  error?.message ||
                  'No pudimos seleccionar esa ubicación.'
                )
              }
            }
          )

        map.addListener(
          'click',
          (
            event
          ) => {
            if (
              !event.latLng
            ) {
              return
            }

            marker.setPosition(
              event.latLng
            )

            marker.setVisible(
              true
            )

            onSelect({
              latitude:
                event.latLng.lat(),

              longitude:
                event.latLng.lng(),

              address:
                null,

              district:
                null,

              province:
                null,

              department:
                null
            })
          }
        )
      } catch (
        error
      ) {
        setErrorMessage(
          error?.message ||
          'No pudimos cargar Google Maps.'
        )
      }
    }

    initialize()

    return () => {
      cancelled =
        true
    }
  }, [])


  useEffect(() => {
    if (
      !mapRef.current ||
      !markerRef.current ||
      latitude == null ||
      longitude == null
    ) {
      return
    }

    const position =
      {
        lat:
          Number(
            latitude
          ),

        lng:
          Number(
            longitude
          )
      }

    markerRef.current
      .setPosition(
        position
      )

    markerRef.current
      .setVisible(
        true
      )
  }, [
    latitude,
    longitude
  ])


  return (
    <div className="admin-hotel-location-picker">

      <div className="admin-hotel-location-picker__copy">

        <strong>
          Ubicación exacta en Google Maps
        </strong>

        <span>
          Busca por nombre o dirección y selecciona el resultado correcto.
        </span>

      </div>


      <div
        ref={
          autocompleteContainerRef
        }
        className="admin-hotel-location-picker__search"
      />


      <div
        ref={
          mapContainerRef
        }
        className="admin-hotel-location-picker__map"
      />


      <div className="admin-hotel-location-picker__status">

        {latitude != null &&
        longitude != null
          ? (
            <>
              Punto seleccionado:
              {' '}
              <strong>
                {
                  Number(
                    latitude
                  )
                    .toFixed(
                      6
                    )
                }

                {' · '}

                {
                  Number(
                    longitude
                  )
                    .toFixed(
                      6
                    )
                }
              </strong>
            </>
          )
          : 'Selecciona un resultado para guardar las coordenadas.'
        }

      </div>


      {errorMessage && (

        <div className="brand-form-message error">

          {errorMessage}

        </div>

      )}

    </div>
  )
}
