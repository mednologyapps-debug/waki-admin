# Centro de administración WAKI

La rama `codex/hotel-sales-settlements` contiene el panel global y las ventas/liquidaciones. No es necesario copiar claves de servicio a Vite.

## Probar en Windows / Visual Studio Code

Desde la carpeta **waki-admin** (no waki-web ni waki-hotel):

```powershell
git fetch origin
git switch codex/hotel-sales-settlements
git pull origin codex/hotel-sales-settlements
npm install
npm run dev
```

Si la rama aún no existe localmente: `git switch --track origin/codex/hotel-sales-settlements`. Si Git avisa de cambios locales, guárdalos antes de cambiar de rama; no los elimines.

El proyecto necesita las variables públicas `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` del proyecto WAKI que ya usa el panel. Nunca uses `SUPABASE_SERVICE_ROLE_KEY` en variables VITE.

1. Ingresa con un perfil `admin` o `super_admin` activo.
2. **Usuarios:** busca cuentas, filtra rol/estado, crea una cuenta de prueba y revisa los permisos. Las cuentas creadas aquí quedan suspendidas y por aprobar. Reciben un enlace para definir contraseña; aprobar habilita el acceso correspondiente a su rol. Los usuarios normales que se registran en la app conservan su flujo existente, no pasan automáticamente a este estado pendiente.
3. **Usuarios → Enviar acceso:** reenvía un enlace para definir/recuperar contraseña. Requiere confirmación y registra la solicitud. Verifica la recepción y el destino antes de usarlo con personas reales.
4. **Configuración o Liquidaciones:** elige exclusivamente **4% u 8%**. El cambio aplica a nuevas ventas, sin recalcular las anteriores.
5. **Reservas:** filtra por hotel, fechas (ingreso, Lima), pago o estado. Abre el detalle. Ingreso requiere pago y QR/documentos verificados; finalizar requiere una estadía iniciada; no-show requiere que haya pasado la salida. Cancelar no ejecuta un reembolso.
6. **Reportes:** consulta hasta un año y exporta el resumen por hotel. Los conteos operativos incluyen pruebas; los importes financieros solo ventas conciliadas en PEN.
7. **Configuración → Auditoría:** comprueba los cambios registrados. Un cambio concurrente exige actualizar el registro antes de confirmar.

Las pruebas de creación/aprobación modifican datos reales del proyecto conectado. Usa un correo de prueba propio y revisa el rol/hotel antes de confirmar. No se han creado cuentas ni enviado correos durante la implementación.

## Servidor y enlaces de correo

Ya se aplicaron las migraciones `hotel_settlements` y `admin_control_center` en el proyecto WAKI y se desplegó la Edge Function `admin-control` con JWT habilitado. La función comprueba la sesión en Auth y vuelve a comprobar el perfil activo, permisos y concurrencia dentro de PostgreSQL. Las claves privadas solo existen en el entorno de Supabase.

**Antes de probar enlaces:** en Supabase → Authentication → URL Configuration → Redirect URLs, autoriza `http://localhost:5173/activar-cuenta` y `https://admin.wakipe.com/activar-cuenta` (y el puerto 5174 si lo usas). En producción, `ADMIN_APP_URL` puede cambiar el dominio canónico de Admin. El envío usa el proveedor SMTP de **Supabase Auth**, que es independiente del correo del formulario público de waki-web. Configura SMTP y su plantilla de recuperación si aún no lo has hecho. Las respuestas muestran si Supabase aceptó el envío; la entrega final debe probarse con un buzón propio.

Publicación del frontend: compilar con `npm run build`, desplegar `dist` y configurar fallback de rutas a `index.html`, incluida `/activar-cuenta`. Esta rama no se ha fusionado ni publicado en Hostinger.

## Límites y controles

- Administradores globales gestionan cuentas normales y personal de hotel; solo superadministradores pueden asignar o cambiar roles administrativos.
- Se bloquean cambios sobre la propia cuenta y la eliminación del último superadministrador activo dentro de este flujo.
- No se eliminan usuarios ni reservas desde el panel. Suspender/bloquear personal desactiva sus asignaciones; activar un colaborador exige revisar su hotel y permiso.
- Reasignar a otro hotel requiere resolver una asignación activa anterior. No se desactiva silenciosamente otro hotel.
- Listados de usuarios, reservas y auditoría: 25 registros por página. Los filtros se envían al servidor al pulsar Buscar/Filtrar, sin llamadas por pulsación. Las opciones de hotel se incluyen en la misma respuesta.
- No hay suscripciones ni sondeo permanente. Reportes limitados a un año.
- Las transferencias bancarias y los reembolsos siguen siendo operaciones externas verificadas; el panel registra depósitos y retiene ventas canceladas para revisión.
- La creación de cuentas usa una contraseña aleatoria desconocida, perfil suspendido y recuperación por correo. Si falla la configuración se elimina únicamente la cuenta recién creada o se bloquea su Auth como respaldo.
- No se migraron ni modificaron usuarios, reservas, comisiones o depósitos existentes durante esta implementación.

## Validación

`npm run test:admin`, `npm run test:finance`, `npm run build` y ESLint de los archivos modificados. Las pruebas usan PostgreSQL embebido con datos ficticios e incluyen permisos, aprobaciones, asignaciones inactivas, estados inválidos y concurrencia. Se comprobaron las cinco consultas con el esquema real en una transacción de solo lectura, sin exponer información de huéspedes. La recepción de correo y revisión visual en navegador requieren validación local.

## Liquidaciones: saldo e historial

La lista abre en **Pendientes de pago**. **Historial de pagos** muestra los hoteles con depósitos anteriores, aunque vuelvan a tener ventas pendientes. Las tarjetas superiores y los contadores muestran el resumen de todos los hoteles del filtro de búsqueda/fechas, sin variar al cambiar la pestaña de estado.

Dentro del hotel, **Ventas y saldo** muestra operaciones del período, mientras **Historial de pagos** conserva todos sus depósitos, con paginación independiente al cambiar de pestaña. La tarjeta depositada es histórica. Sin fechas, la confirmación agrupa todo el saldo conciliado pendiente; con fechas, solo las ventas del período. Puedes liquidar cada 2 o 3 días sin elegir cada reserva.

La comisión se fija al aprobar en Detalle o Revisión; si existe se conserva, y si falta se debe elegir 4% u 8%. Las nuevas aprobaciones sin configuración son rechazadas por PostgreSQL. Cada venta conserva su tasa histórica; conciliación usa el acuerdo guardado en servidor cuando la venta histórica no tiene tasa, sin aceptar porcentajes arbitrarios del navegador.

### Hotel de demostración

En Liquidaciones pulsa **Ver hotel de demostración**. WAKI Casa Miraflores DEMO tiene 8% de comisión, dos depósitos anteriores (S/276 y S/294.40) y seis ventas pendientes por S/414 netos. Puedes simular otro depósito, abrir el resumen y descargar un PDF con marca de demostración. Los cambios de la demo se conservan en sessionStorage; no se insertan hoteles públicos, reservas, cobros ni depósitos falsos en Supabase. La demo nunca envía correos. Para reiniciarla, borra `waki-finance-demo-v1` del almacenamiento de sesión del navegador.

### PDF y correo al confirmar depósito

La migración `payout_receipts` congela el detalle financiero y crea una notificación en la **misma transacción** del depósito. Luego el frontend solicita el envío a `admin-payout`. Si el envío falla, el pago permanece registrado y solo se reintenta el correo. El historial permite descargar el PDF y consultar cada reserva incluida, bruto, tasa, comisión y neto. El documento es un resumen administrativo, no un comprobante de transferencia o factura.

`admin-payout` verifica sesión/perfil global en cada solicitud. Destinatario, importes y ventas provienen del servidor. El destinatario es **contact_email del hotel** (no un correo escrito en la confirmación). Configúralo antes de liquidar. Si faltaba y corriges el contacto, el siguiente intento recupera la dirección actual. El PDF mantiene la instantánea financiera del pago.

**Configuración pendiente del proveedor de correo:** en Supabase → Edge Functions → Secrets configura una de estas alternativas. El SMTP de Hostinger y el SMTP de Supabase Auth no se comparten automáticamente con las Edge Functions.

Hostinger / SMTP existente:

- `SMTP_HOST`: servidor SMTP de tu buzón (Hostinger suele indicar smtp.hostinger.com).
- `SMTP_PORT`: 465 para TLS directo, o 587 con STARTTLS según tu proveedor.
- `SMTP_USER`: hola@wakipe.com.
- `SMTP_PASS`: contraseña del buzón; introdúcela únicamente en Secrets, nunca en el chat ni en variables VITE.
- `PAYOUT_FROM_EMAIL`: WAKI <hola@wakipe.com>.

Alternativa API: `RESEND_API_KEY` y `PAYOUT_FROM_EMAIL` con dominio verificado. Si se configuran ambas alternativas se prefiere Resend. No se han añadido credenciales ni enviado correos reales en la implementación.

Estados del correo: pendiente, enviando, enviado (aceptado por proveedor), fallido, sin configurar o incierto. El estado enviado bloquea otro envío del mismo pago. Los reintentos usan un bloqueo en base de datos; Resend además recibe una clave de idempotencia por depósito. SMTP no garantiza entrega exactamente una vez: ante un timeout o resultado incierto se bloquea el reintento automático y se pide verificar el buzón para evitar duplicados. Las credenciales faltantes producen “Configurar correo”, sin fingir que se envió.

La Edge genera el PDF en memoria; no publica comprobantes ni necesita un bucket público. El generador PDF de demo se carga bajo demanda para no aumentar la descarga inicial del panel. Validación de PDF con ejemplo renderizado y prueba de varias páginas; las pruebas SQL verifican instantáneas, saldo pendiente/pagado, cola y bloqueo de envíos duplicados. Falta verificar entrega real con un buzón controlado tras configurar el proveedor.
