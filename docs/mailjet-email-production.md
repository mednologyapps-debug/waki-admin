# Mailjet en WAKI · Correos transaccionales

## Alcance

El backend de WAKI utiliza Mailjet Send API v3.1 por HTTPS cuando están configuradas ambas credenciales `MAILJET_API_KEY` y `MAILJET_SECRET_KEY`. Se mantiene el fallback anterior de Resend/SMTP cuando Mailjet aún no está configurado.

- Confirmaciones y cancelaciones de reservas para usuarios registrados con correo verificado.
- Avisos de nuevas reservas y aceptación/rechazo de hoteles.
- Ampliaciones de reserva.
- Prueba de correo desde Admin → Monitoreo y correos.
- PDF de liquidación a hoteles desde el flujo de finanzas.

Los correos de autenticación de Supabase (alta de usuario, restablecer contraseña, magic links) **no** pasan por la Edge Function de WAKI. Deben configurar SMTP adicionalmente en el área Authentication de Supabase.

## 1. Secretos de Edge Functions

Abre https://supabase.com/dashboard/project/ipakrrcjrpfcnjvtwhvp/settings/functions y busca **Edge Function Secrets**. Registra:

| Nombre | Valor |
|---|---|
| `MAILJET_API_KEY` | Mailjet → API Key Management → API Key |
| `MAILJET_SECRET_KEY` | Secret Key asociada a esa API Key |
| `WAKI_FROM_EMAIL` | Correo de envío activo/verificado, ej. `notificaciones@wakipe.com` |
| `WAKI_FROM_NAME` | `WAKI` (opcional) |
| `PAYOUT_FROM_EMAIL` | Correo verificado para liquidaciones (opcional; usa WAKI_FROM_EMAIL si falta) |

No coloques las claves en `.env.local` del frontend, GitHub, documentos públicos ni mensajes.

Los secretos `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` y `RESEND_API_KEY` siguen compatibles con instalaciones anteriores, pero Mailjet tiene prioridad **solo si ambas claves están presentes**.

## 2. Configurar Supabase Auth con Mailjet SMTP (separado)

Supabase Dashboard → Authentication → SMTP Settings / Custom SMTP:

- Sender name: WAKI
- Sender email: la dirección validada (por ejemplo `notificaciones@wakipe.com`)
- Host: `in-v3.mailjet.com`
- Port: `587`
- Username: Mailjet API Key
- Password: Mailjet Secret Key

Usar SMTP solo para mensajes de Auth desde Supabase. No cambies los MX de Hostinger: Mailjet envía, Hostinger sigue recibiendo. Ajusta límites de envío Auth según uso real.

Documentación: https://supabase.com/docs/guides/auth/auth-smtp
Mailjet: https://dev.mailjet.com/docs/email-api/send-api-v31/send-basic-email

## 3. Prueba operativa real

1. Ingresa a https://admin.wakipe.com/monitoreo con una cuenta de administrador **activa, con correo confirmado**.
2. Presiona **Comprobar proveedor**: debe indicar `mailjet` (solo confirma presencia de credenciales, no que sean válidas).
3. Presiona **Enviar prueba a mi correo**. El sistema permite una prueba por administrador y hora.
4. El estado **Aceptado por proveedor** significa que Mailjet recibió la solicitud HTTP. Revisa el mensaje en tu bandeja y spam.
5. En Mailjet consulta el historial de eventos y utiliza `CustomID=waki-notice-<id>` o la referencia `MessageUUID` en el panel de WAKI para rastrear el mensaje.
6. Prueba un flujo de **reserva de prueba sin cobro real** en un entorno controlado y verifica que llegue tanto al usuario registrado como al hotel. Evita generar pagos reales no previstos.
7. Para liquidaciones, envía un PDF solo cuando exista un depósito **real y verificado**; la API conserva su referencia y no mueve dinero.

El primer procesamiento manual configura el despachador automático existente (cron cada 5 minutos). Los envíos inciertos no se reintentan automáticamente para evitar duplicados.

## 4. Diagnóstico

| Estado o código | Interpretación y siguiente paso |
|---|---|
| `provider=none` | Falta la pareja de claves Mailjet (o un proveedor alternativo) |
| `MAILJET_HTTP_401` | Claves incorrectas o de subcuenta distinta |
| `MAILJET_HTTP_400` | Verifica sender activo y payload; revisar Mailjet |
| `MAILJET_HTTP_429` | Límite temporal; revisar en Mailjet antes de repetir |
| `MAILJET_HTTP_5xx` | Estado incierto; revisar logs de Mailjet |
| `DELIVERY_UNCERTAIN` | Timeout o error de red; no reintentar sin verificación |
| `sent` | Proveedor aceptó el correo, **no** garantiza entrega en inbox |
| `failed` | Fallo explícito; revisar configuración antes de nueva operación |
| `unknown` | Resultado no verificable; requiere inspección humana |

La base de datos privada guarda `provider` y `provider_message_id`. No hay acciones públicas para modificar esos campos.
