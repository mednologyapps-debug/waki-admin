# WAKI · Propuesta de liquidaciones a hoteles
**Estado:** Propuesta operativa pendiente de aprobación. No cambia automáticamente la base de datos, importes ni transferencias.
**Zona horaria:** America/Lima (Perú).

## 1. Calendario previamente acordado
- **Miércoles y domingos** son los dos días ordinarios de corte y preparación de liquidaciones.
- Corte miércoles: operaciones desde el domingo 00:00 hasta el martes 23:59, o la ventana no liquidada que corresponda.
- Corte domingo: operaciones desde el miércoles 00:00 hasta el sábado 23:59, o la ventana no liquidada que corresponda.
- Solo operaciones **pagadas, completadas, recibidas y conciliadas** por WAKI entran al lote. No se incluyen TEST, pagos sin confirmar, contracargos, reembolsos o importes observados.
- Si Izipay o el banco aún no acredita fondos, la operación pasa al siguiente corte; nunca se pierde ni se paga anticipadamente.
- El domingo puede prepararse el lote; el abono efectivo se realiza cuando el banco lo permita, normalmente el siguiente día hábil si la transferencia no está disponible. Los feriados se tratan igual.
- Comunicación al hotel: calendario programado, no garantía absoluta de disponibilidad de fondos a hora fija.

## 2. Cálculo y asientos
Por cada operación, guardar: ID reserva, ID transacción Izipay, bruto realmente cobrado (PEN), fecha de pago, fecha de servicio completado, estado del proveedor, fecha/importe del abono del proveedor, comisión WAKI histórica (4% u 8% según acuerdo), neto hotel, costo real Izipay, IGV/comprobantes que correspondan, devoluciones, contracargos, liquidación y referencia bancaria.

**Neto para el hotel = cobro bruto elegible – comisión WAKI contractual – ajustes autorizados y documentados.**
**Comisión WAKI = bruto elegible × tasa histórica de la reserva.**
**Costo Izipay = importe reportado por el procesador**, no una tarifa inventada ni una deducción adicional automática al hotel.

Por defecto, proponemos que WAKI asuma el costo del procesador dentro de su margen, salvo que un acuerdo comercial específico firmado diga otra cosa. El extracto de Izipay puede depositar un neto distinto del bruto; reconciliar ambos a través de una cuenta puente y registrar la comisión del procesador separadamente.

Ejemplo ilustrativo sobre una operación completada de S/100.00: tasa WAKI 8%, hotel S/92.00 y WAKI S/8.00 antes de costos del procesador y obligaciones tributarias. Con tasa 4%, hotel S/96.00 y WAKI S/4.00.

## 3. Quién realiza y autoriza
1. **Operaciones / conciliación:** descarga y cruza pagos de Izipay, lista de reservas completadas y saldo de WAKI. Abre incidencias y excluye filas dudosas.
2. **Finanzas:** revisa por hotel el lote, contrato, comisión histórica, saldo, cuenta bancaria *verificada*, ajustes, comisiones de pasarela y reservas ya pagadas. Prepara PDF y propuesta de transferencia.
3. **Superadministrador o responsable financiero designado:** autoriza el monto y la cuenta bancaria. Idealmente no debe ser la misma persona que preparó el lote.
4. **Ejecutor bancario autorizado:** efectúa la transferencia fuera de WAKI. La plataforma NO mueve dinero.
5. **Operaciones / Finanzas:** registra referencia bancaria, fecha, importe, evidencia y estado de conciliación; solo entonces marca "Depositado" y notifica por correo.

El admin debe advertir "No confirmes depósito antes de efectuarlo" y evitar duplicados mediante una transacción idempotente. El PDF de liquidación es un resumen, NO una constancia bancaria ni una factura.

## 4. Conciliación por tres fuentes
Cruzar **WAKI (reserva y QR) ↔ Izipay/Niubiz (transacción, devoluciones, tasas y liquidación de fondos) ↔ banco de Mednology (abono) ↔ banco del hotel (transferencia)**.
El proveedor inicial es Izipay; los contratos y la contabilidad deben referirse genéricamente a la "pasarela/proveedor de pagos autorizado por WAKI" por la migración prevista a Niubiz.

Claves para evitar duplicados: transaction_id único, booking_id único por operación, settlement_item único y referencia bancaria con comprobante. Ninguna reserva puede abonarse dos veces; los pagos en revisión quedan fuera hasta resolverse.

## 5. Reembolsos, contracargos y diferencias
- Antes del depósito: devolución o reversa verificada en proveedor → excluir o ajustar solo esa operación del lote.
- Después del depósito: crear ajuste negativo trazable en la siguiente liquidación del mismo hotel (si el contrato lo permite); en ausencia de saldo futuro, gestión manual acordada.
- Contracargos: apartar importe controvertido, registrar evidencia y fechas; no retener ventas ajenas al incidente sin justificación contractual.
- Fallas y cobros duplicados: dejar "en revisión", conciliar IPN y proveedor antes de emitir otro cobro o devolver.
- Cambios de CCI o cuenta: solicitar verificación nueva por Admin; no transferir a cuentas no aprobadas.
- No tratar "cancelado en la app" como "reembolsado"; el reembolso se confirma con la pasarela.

## 6. Evolución mínima del Admin (pendiente de decisión)
Añadir vistas: **Por conciliar**, **Elegibles próxima liquidación**, **Por autorizar**, **Transferidos**, **Observados/ajustes**. Requiere separar: preparado → revisado → autorizado → transferencia real → conciliado. Exigir motivo y evidencia para ajustes/reembolsos, auditar actor/hora y cerrar períodos sin recalcular comisiones históricas. La funcionalidad actual registra depósitos y PDFs pero NO realiza transferencias ni reembolsos automáticos.

## 7. Indicadores de control
Saldo total conciliado pendiente; pagos recibidos vs netos reportados por la pasarela; comisiones WAKI históricas; costos del procesador; devoluciones/contracargos; transferencia por hotel; depósitos vencidos; fondos no conciliados. Alerta de depósito duplicado o cuenta bancaria sin verificación.
