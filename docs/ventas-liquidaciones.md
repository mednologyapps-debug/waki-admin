# Ventas y liquidaciones

Ruta `/finanzas`, enlazada desde Dashboard, Hoteles y el menú compartido. Acceso exclusivo para perfiles globales `admin` / `super_admin` activos, comprobado en servidor con el perfil actual. No usa claves privadas en el navegador.

## Uso

1. Abrir **Ventas y liquidaciones** y configurar la comisión de cada hotel. No se presupone 4% u 8%; debe coincidir con su acuerdo. La nueva tasa se guarda para futuros cobros, sin modificar el historial.
2. En **Ver detalle**, conciliar los ingresos contra los movimientos reales de la cuenta WAKI. Escribir referencia del cobro. Si la venta es histórica y no tenía una comisión guardada, introducir el porcentaje acordado en esa fecha.
3. El neto conciliado se agrega al pendiente del hotel. El resumen excluye pruebas, pagos fallidos, otras monedas e incidencias. Las ampliaciones son operaciones separadas y se descuentan del total de la reserva base al importar el historial.
4. Transferir el importe al hotel por el medio habitual y luego usar **Registrar depósito**. Solicita referencia, fecha y confirmación explícita. Registra todas las ventas pendientes del hotel dentro del periodo mostrado; no ejecuta una transferencia bancaria.
5. Revisar **Últimos depósitos del hotel** (20 más recientes). La auditoría privada guarda administrador, fecha, cambios de comisión, conciliaciones e importe de cada depósito. La exportación CSV incluye solo los 25 hoteles de la página actual, como indica el botón.

El periodo filtra por fecha del cobro en `America/Lima`, con el último día incluido. “Ya depositado” corresponde a las ventas de ese periodo, aunque la transferencia se haya registrado en otra fecha. Sin filtro se obtiene el saldo histórico completo. El número de ventas cuenta operaciones conciliadas, incluidas ampliaciones.

## Conciliación y pasarela

Actualmente los registros existentes identifican pasarelas de pruebas o no identifican la pasarela. **Marcar una reserva como `paid` no prueba por sí solo que el dinero ingresó a WAKI**. Por eso los cobros nuevos y los históricos requieren conciliación explícita; el porcentaje se captura automáticamente para nuevos cobros cuando está configurado. Los proveedores cuyo nombre incluye `test`, `mock`, `qa` o `sandbox` no pueden conciliarse ni liquidarse.

Antes de automatizar la conciliación, conectar exclusivamente el webhook de producción de la pasarela con validación criptográfica, moneda, importe y referencia única. El flujo Izipay encontrado en este proyecto compartido solo admite modo TEST; no se lo modificó ni se lo convirtió en producción.

Si una reserva se cancela, rechaza o deja de estar pagada, sus operaciones quedan en revisión. No se revierten depósitos ya realizados. Los reembolsos parciales, contracargos, compensaciones posteriores al depósito y liberación de incidencias requieren un flujo contable adicional; no se descuentan importes supuestos. No se incluyen IGV adicional, costos de pasarela, retenciones ni cargos bancarios: el cálculo solicitado es bruto menos comisión.

## Integridad y rendimiento

- Cálculos monetarios con `numeric` PostgreSQL, redondeando comisión a 2 decimales por operación; la UI solo formatea.
- Libro privado con RLS y sin permisos directos del cliente. Los wrappers públicos son `SECURITY INVOKER`; la implementación privilegiada está en `waki_private`, con `search_path` vacío y comprobación del administrador en cada llamada.
- Snapshot de tasa por venta. Auditoría de las modificaciones.
- Unicidad `(source_kind, source_id)` impide duplicar cobros ante reintentos.
- Depósito atómico: bloqueo por hotel y de las filas incluidas; el servidor recalcula saldo y token de las ventas, rechaza cotizaciones antiguas/importes alterados y referencias repetidas. Una venta conserva un único `payout_id`.
- Una RPC de resumen devuelve totales y 25 hoteles. Otra devuelve 50 operaciones solo cuando se abre el detalle. Filtros explícitos con botón Aplicar: sin consultas por tecla, polling ni realtime.
- Índices por hotel/fecha, pendientes, reserva, depósito e historial.

## Instalación y validación

La migración `hotel_settlements` ya se aplicó al proyecto WAKI conectado durante la implementación. El archivo SQL versionado conserva la definición para otros entornos; no volver a ejecutar manualmente sobre el mismo proyecto. No se configuraron porcentajes reales ni se registraron depósitos en producción.

Publicar la rama `codex/hotel-sales-settlements` después de revisar el PR. Para validarla localmente:

```powershell
git fetch origin
git switch --track origin/codex/hotel-sales-settlements
npm install
npm run dev
```

Configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` del proyecto y abrir `/finanzas` con un administrador global. No guardar credenciales en GitHub.

```sh
npm run test:finance
npm run build
```

Las pruebas utilizan PostgreSQL WASM (PGlite) en memoria con esquema base mínimo: ejemplos 300/8%=276 y 1000/4%=960, tasas históricas, redondeo, duplicados, cotización desactualizada, extensiones, cancelaciones, permisos y pruebas excluidas. No envían dinero ni insertan datos en WAKI. Se verificaron también las RPC sobre datos reales y el rechazo sin usuario en Supabase.

El lint de los archivos modificados pasa. `npm run lint` completo encuentra errores previos en HotelDetailPage, HotelRoomsPage y NewHotelPage, ajenos a esta funcionalidad. Advisors de Supabase: las nuevas tablas privadas sin políticas son deliberadamente inaccesibles al cliente; no se agregan políticas que expongan saldos.
