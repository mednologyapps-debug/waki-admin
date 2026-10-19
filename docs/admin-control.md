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
