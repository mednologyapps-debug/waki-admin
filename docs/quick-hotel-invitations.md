# WAKI · Alta Express por invitación (Ventas + Admin)

## Objetivo
Un único formulario de **Agregar hotel** en la esquina superior derecha de Ventas → Hoteles y Admin → Hoteles:
- Nombre comercial del hotel.
- Nombre del representante.
- Correo del hotel (del representante que tendrá acceso).

Al confirmar, una RPC autorizada crea una invitación privada con token UUID aleatorio que vence en 14 días, sin pedir GPS, RUC, dirección, teléfono ni datos bancarios al comercial. También encola **un** correo WAKI Hotel vía Mailjet. La interfaz confirma *En cola*, no entrega definitiva.

## Flujo
1. Creador: usuario Admin activo o miembro de Sales activo. Registro privado con created_by, estado y caducidad.
2. Mensaje: `hotel_invitation` en `waki_private.communication_outbox`, usando el despachador `waki-communications` y Mailjet. El email ofrece el enlace `https://ventas.wakipe.com/hotel/invitacion/<token>`.
3. Invitado: página pública existente `get_sales_hotel_invite` reconoce `source=quick`; formulario exige RUC real de 11 dígitos, razón social, teléfono y contraseña.
4. Identidad: Supabase Auth genera mensaje de confirmación desde Mailjet SMTP; el enlace regresa al mismo registro del hotel. Antes de verificar correo no hay hotel ni acceso en portal.
5. Activación: `claim_quick_hotel_invitation` exige que sesión verificada corresponda exactamente al correo invitado y que cuenta tenga rol user/hotel, luego crea marca/hotel inactivo, en borrador, y una asignación `hotel_staff` como admin. El RUC permanece único.
6. El representante entra a `https://hotel.wakipe.com/login` y completa ubicación, habitaciones, tarifas, expediente legal y datos bancarios. WAKI Admin deberá aprobar posteriormente. **Nunca hay publicación automática**.
7. Ventas y Admin pueden revisar `list_quick_hotel_invitations`: en cola, aceptado por proveedor, error, vencido o hotel registrado. Mailjet aceptar un envío no equivale a entrega al buzón.

## Seguridad
- Tabla privada con RLS activado y todos los permisos de browser revocados.
- Las RPC de creación y listado comprueban perfil Admin activo o Sales activo y vigente.
- Lista de Sales solamente muestra invitaciones creadas por el vendedor; Admin puede ver todas.
- Email con nombre+hotel duplicado aún vigente queda rechazado, como hotel ya existente con el mismo email. Límite 25 invitaciones por Sales o 60 por Admin / 24 h, y máximo 3 por email / 24 h.
- Invitación de un solo uso, token de 128 bits, caducidad 14 días, consulta pública sólo por token; reclamar exige inicio de sesión y email confirmado.
- No se permite reclamar el hotel con la cuenta Admin o Sales existente para evitar que una prueba cambie su rol.
- No modificar pagos, liquidaciones, reservas ni comisiones; hoteles creados en `draft` con `is_active=false`.

## Certificación de producción
- No crear invitaciones de prueba a correos de terceros sin autorización.
- En Supabase → Authentication → URL Configuration comprobar redirección permitida `https://ventas.wakipe.com/hotel/invitacion/**` para el enlace de confirmación.
- Crear una invitación real con un correo de QA no registrado y confirmar en Mailjet la entrega (no sólo aceptación).
- Recorrer verificación + activación, iniciar sesión en Portal Hotel y comprobar `draft`.
- Comprobar que un mismo hotel+email no recibe envíos duplicados, y que otra cuenta/rol no reclama invitación.
- La migración `20261106212500_quick_hotel_invitations.sql` debe estar aplicada antes de publicar los frontend; y `waki-communications/templates.js` debe desplegarse para el nuevo tipo de correo.
