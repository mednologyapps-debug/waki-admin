# Operación y soporte WAKI

## Al comenzar un turno

Hotel: abrir Reservas, activar sonido WAKI y comprobar el volumen del equipo. El aviso abre la reserva correspondiente. Registrar la atención presencial como bloqueo antes de comprometer una habitación. El portal requiere permanecer abierto; una notificación web no sustituye push con navegador cerrado. Revisar la pantalla al recuperar conexión.

Admin: abrir Monitoreo y correos. Revisar pagos observados, cobros sin confirmación/QR, correos inciertos, liquidaciones pendientes y hoteles sin comisión. No pedir al cliente un segundo pago sin conciliar el primero.

## Envío automático

Configurar en Supabase Edge Functions Secrets un proveedor: RESEND_API_KEY con dominio remitente validado, o SMTP_HOST, SMTP_PORT, SMTP_USER y SMTP_PASS. WAKI_FROM_EMAIL (comunicaciones) y PAYOUT_FROM_EMAIL (PDF) deben ser remitentes autorizados. Los secretos del servidor web de Hostinger NO se copian automáticamente a Supabase. Nunca poner secretos en VITE_, Android, repositorios o el chat.

Después de configurar, el administrador pulsa «Procesar pendientes» una vez. Esto inicializa un token privado de cron y procesa hasta 10 mensajes. Luego cron comprueba cada 5 minutos si hay mensajes por enviar y solo invoca la función cuando hay pendientes. No copia la clave service_role al cron. Máximo dos entregas simultáneas. La cola se crea en la misma transacción de la reserva, cancelación pagada, ampliación o revisión del hotel; claves únicas evitan encolados repetidos.

Solo se envía correo de reservas a hoteles y a la cuenta registrada, verificada y activa que sea dueña de la reserva. Nunca al correo escrito por un invitado. Se verifica de nuevo la elegibilidad al reclamar el envío. No hay correo promocional automático.

Si el resultado de la entrega no es claro, queda unknown y no se reintenta automáticamente. Verificar primero en el proveedor. El campo «enviado» acredita aceptación SMTP/API, no llegada a bandeja de entrada. Configurar SPF, DKIM y DMARC para el remitente. Probar entrega y spam con cuentas del propietario antes del lanzamiento. Los PDF se envían desde el flujo de liquidaciones existente.

## Incidencia con pago

1. Pedir código de reserva/referencia, nunca tarjeta completa ni CVV.
2. Consultar el estado del proveedor y el registro privado desde Admin; no usar el mensaje del cliente como confirmación de pago.
3. Si el proveedor cobró y no se pudo confirmar disponibilidad, mantener la operación en revisión. Coordinar solución/devolución con el propietario de la cuenta de cobro. No forzar otra reserva sobre un bloqueo.
4. Registrar el caso y su solución. Una devolución requiere evidencia del proveedor; cambiar un estado visual no devuelve dinero.

## Seguridad

Suspender acceso operativo desde Admin con motivo. Revisar sesiones y revocar credenciales comprometidas desde Supabase. Activar protección contra contraseñas filtradas y configurar MFA de las cuentas privilegiadas antes de exigir AAL2: exigirlo sin enrolamiento bloquearía al operador. Verificar la rotación de claves, dominios permitidos para OAuth y claves Maps restringidas.

Las alertas de funciones SECURITY DEFINER se revisan por autorización real; su presencia no prueba una fuga. No revocar indiscriminadamente el acceso de invitados: las reservas invitadas tienen su propia identidad y propiedad. No desplegar un barrido de permisos sin pruebas de recepción/QR/pagos.

## Monitoreo externo

scripts/check-public-health.mjs comprueba páginas públicas y endpoints sin credenciales. El workflow horario public-health.yml solo se ejecutará periódicamente cuando esté en la rama predeterminada y Actions esté habilitado. Activar las notificaciones de fallos de Actions en la cuenta del propietario. No se ha configurado un servicio de vigilancia externo ni se garantiza aviso por correo sin esa preferencia. La analítica del navegador no recoge estas comprobaciones HTTP.

## Respaldo e incidentes mayores

Confirmar el plan real de backups/PITR y hacer una restauración aislada de prueba antes de anunciar objetivos de recuperación. No se ha hecho una restauración de producción. Si hay una filtración, contener accesos, preservar evidencia mínima, rotar secretos afectados, evaluar alcance y realizar comunicaciones exigibles con asesoría adecuada. Mantener un responsable y un contacto de guardia. No restaurar cuentas que hayan solicitado eliminación.
