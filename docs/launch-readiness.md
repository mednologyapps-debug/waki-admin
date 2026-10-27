# WAKI — auditoría y cierre de lanzamiento, 27 de octubre de 2026

## Estado por frente

| Frente | Implementado y comprobado | Pendiente real |
|---|---|---|
| Admin | Consolidación de usuarios, reservas, comisiones 4/8, liquidaciones/PDF, mapas de sede y reclamaciones. Nuevas rutas /analitica y /monitoreo. Aprobación atómica con acuerdo, cuenta bancaria, capacitación, aceptación legal, ubicación e inventario físico. | Publicar el build en la instancia real de Admin y comprobar con el operador. El monitor detectó un hotel aprobado sin comisión: definirla según su acuerdo, sin inventar tasa. |
| Android | Revisión de fuentes completas de texto. Inicio invitado y servicios en la rama anterior; claves de release por entorno, bloqueo de clave privilegiada y firma ausente, HTTP sin cifrar deshabilitado, backups excluidos, ícono WAKI adaptativo y legado. Compilación debug, pruebas unitarias y lint aprobados en GitHub Actions. | assembleDebug, testDebugUnitTest y lintDebug completados en CI. No hay AAB firmado ni prueba en dispositivo real: ubicación, Google login, pago, QR, segundo plano y reinstalación siguen pendientes. |
| Google Play | Nombre, descripción corta/larga, novedades, ícono 512 RGB, arte promocional 1024×500, borrador de campos y guía de Seguridad de datos. Página pública para solicitar eliminación. | Cuenta Play Console, identidad/contratos, firma privada, pruebas de la cuenta, capturas reales, AAB, clasificación y declaración final. No se publicó ni se promete aprobación. |
| Incorporación | Solicitud pública por correo y registro/invitación comercial existentes. Aceptación de términos registrada por representante; revisión comercial y banco documentados; no publicar sin requisitos. | Los contratos/documentos bancarios deben verificarse por el operador. Los hoteles que estaban pendientes antes de este cambio necesitan aceptar los términos en su portal. No se falsificaron firmas ni verificaciones. |
| Comunicaciones | Reserva confirmada, cancelación pagada, ampliación pagada y revisión de hotel en cola transaccional. Solo hoteles/cuentas registradas verificadas activas. HTML WAKI, escape, enlaces, deduplicación y control de entregas inciertas. Cron condicional cada 5 minutos tras inicialización; no peticiones cuando no hay cola. Sonido original WAKI en portal con enlace al detalle, avisos visuales y lista reciente. | Configurar SMTP/Resend en Supabase; primer lote desde Admin inicializa scheduler. Probar entregabilidad real y PDF. Sonido web requiere activación y portal abierto; no es push con navegador cerrado. |
| Monitoreo | Incidencias de pagos, QR/reserva inconsistente, comisiones, cola y liquidaciones. /api/health público sin secretos; script de salud y workflow horario preparado. Retención de telemetría programada. | Workflow periódico solo en rama predeterminada; habilitar notificaciones de fallos. Elegir guardia, verificar backups/PITR y restauración aislada. No se hizo pentest externo ni restauración de producción. |
| Analítica | Páginas vistas, sesiones, búsquedas, formularios abiertos/enviados, canal/campaña/dispositivo, serie diaria y CSV. Datos de negocio desde pagos conciliados existentes. Batch de eventos, IDs para deduplicar, cuota por hash de dirección rotado por hora, SQL privado. Respeta DNT/GPC. | Las sesiones no son personas únicas ni presencia en tiempo real. Sin historia retroactiva. No se instrumentó aún el embudo Android completo: no confundir tráfico web con conversión real a reserva. |
| Seguridad | Revocados TRUNCATE/REFERENCES/TRIGGER innecesarios; guardas a privilegios de perfiles y autoaprobación hotelera; rol legacy restringido; invitaciones expiradas no exponen contactos. Eliminación conserva evidencia financiera desligada de identidad. Dependencias web auditadas y corregidas, Supabase fijado. | Protección de contraseñas filtradas está desactivada: habilitarla desde Supabase según plan. Enrolar MFA y después exigir AAL2 en acciones privilegiadas. Confirmar restricciones de Maps, rotación, recuperación y SDK de pago en producción. |

## Bloqueos que no deben ocultarse

- Izipay Android y backend revisados son **exclusivamente TEST**. La activity exige testpublickey y el servidor usa IZIPAY_TEST_* y evidencia TEST. No cambiar solo una clave para cobrar dinero real. Hace falta una activación coordinada de entorno, firma/HMAC y controles de evidencia, seguida de una transacción controlada.
- El buscador web tiene como destino por defecto ventas.wakipe.com. Ese repositorio es el CRM comercial de captación de hoteles, no una reserva de huéspedes. No se certifica un flujo de reserva web que no existe; debe implementarse o apuntar a un destino real antes de anunciarlo.
- La política legal de checkout sigue con is_enforced=false, conforme al despliegue por etapas anterior. El Android actual registra la aceptación; activar el gate después de publicar y validar el cliente compatible. No se cortó el acceso a clientes anteriores en producción.
- La eliminación de cuenta anterior intentaba borrar reservas referenciadas por liquidaciones: ahora preserva importes/evidencia técnica privada y elimina/desvincula identidad, sin borrar dinero del registro. Debe comunicarse la retención aplicable sin prometer borrado absoluto de respaldos o del proveedor.
- No se leyó ni publicó ninguna contraseña privada. La revisión del árbol actual detectó una cadena de contraseña de fixture de prueba en Android, no una credencial real. La .env de Ventas estaba versionada con variables públicas del cliente: se retiró del árbol; no se reescribió la historia. Las claves de navegador deben estar restringidas incluso si son públicas.

## Evidencia ejecutada

- test:finance: tasas históricas, 300/8%=276, 1000/4%=960, exclusión TEST, reconciliación y duplicados.
- test:admin: roles, cuentas, aprobación, concurrencia, estados de reservas y liquidaciones.
- test:payout: PDF, saldos demo, varias páginas y HTML escapado; sin enviar dinero/correos reales.
- test:launch: privilegios directos y legacy, límites de hoteles, aceptación/checklist, rollback de aprobación, avisos/colas, exclusión de correo invitado, ampliaciones, leases, scheduler privado y anon-key pública sin service key en cron, métricas y eliminación de cuenta preservando importes.
- Portal Hotel: test:operations pasó (bloqueos atómicos, permisos, cruce de horarios, checkout real sobre fixtures y servicios).
- Web: pruebas con transporte de correo simulado, validación/origen de solicitudes, cabeceras y health. No se enviaron correos a personas durante la auditoría.
- Builds de Admin, Hotel, Web y Ventas completados. Lint Admin sin errores (una advertencia de dependencias del selector de mapa heredado); Hotel sin errores.
- npm audit: cero avisos conocidos en los cuatro proyectos web después de actualizar los lockfiles. Esto no equivale a ausencia de vulnerabilidades desconocidas ni cubre todos los SDK Android.
- SQL vivo de solo lectura verificó Admin dashboard, permisos retirados, publicación Realtime y cron de retención. Se aplicaron migraciones; no se alteraron reservas/pagos comerciales para simular QA.
- Edge API: origen inválido rechazado con 403; payload vacío de analítica con JWT público válido rechazado 400; dispatcher no autenticado rechazado 401.
- TypeScript nuevo transpila; Edge Functions desplegadas con JWT activo. deno check local quedó bloqueado al descargar JSR, por lo que no se presenta como typecheck completo.
- No hay prueba visual automatizada completa: la descarga del navegador de Playwright falló. No se presenta revisión responsive del código como prueba visual en dispositivos.

## Continuación

Consultar docs/operations-runbook.md y release/play-store/publication-fields.md en Android. Reanudar por bloqueos verificados, sin volver a ejecutar migraciones aplicadas ni crear datos comerciales de prueba. No existe un evento accesible que permita detectar la renovación de créditos de Work y retomar automáticamente.

## Cierre de verificación adicional

- Android: ejecución 40586824578, commit 11823921a276f10e513318d35240f832fd581676: BUILD SUCCESSFUL. Se corrigieron la instalación del SDK, el nivel Android 36 y la referencia Base64 del script Gradle. Informes disponibles en https://github.com/mednologyapps-debug/waki-android/actions/runs/40586824578 . Esta compilación debug no acredita cobros productivos, firma release ni pruebas físicas.
- Se instaló pg_net y existe el trabajo waki-dispatch-communications cada cinco minutos. No envía nada hasta configurar el proveedor e inicializar el scheduler desde Admin; tampoco hace HTTP con cola vacía.
- Limitación de plataforma: los objetos de net pertenecen a supabase_admin y conservan permisos internos predeterminados pese al REVOKE ejecutado como postgres. No se presentan como permisos eliminados. El acceso externo se comprobó con JWT público: HTTP 406 / PGRST106, net no está expuesto; solo public y graphql_public. No agregar net a los esquemas de la API. Revisar estos grants con soporte de Supabase si se requiere aislamiento adicional para roles SQL internos.
- Hotel publicado: version.json apunta a 25956e8977220f15c8c3d548c273710ac6b27893; archivos .env y .git/HEAD devuelven 403. Navegación sin sesión a disponibilidad lleva al login.
- Web pública: revisión visual de la página de eliminación completada con navegador y recepción del evento page_view comprobada en base de datos. No se enviaron solicitudes ni correos de clientes reales.
- Admin preparado en deploy/admin (4f2cb11c3970d1f17c5792b3853ca0e70032ed33). Aún debe conectarse/publicarse en Hostinger: la nueva aprobación requiere esta UI porque las guardas del backend ya están activas.
