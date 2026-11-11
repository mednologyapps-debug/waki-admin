import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const PURPLE = rgb(0.39, 0.19, 0.82)
const INK = rgb(0.16, 0.13, 0.22)
const MUTED = rgb(0.43, 0.40, 0.48)

export function contractPlanTerms(code) {
  if (code === 'socio') {
    return {
      title: 'Socio WAKI',
      commission: '8 % + IGV aplicable a la comisión',
      monthly: 'S/ 99 + IGV por mes',
      clause: 'WAKI cobra una comisión del 8 % sobre cada reserva pagada y completada en WAKI. Al importe de la comisión se añade el IGV que corresponda. Además, se cobra una cuota mensual de S/ 99 más el IGV aplicable, por cada ciclo mensual de servicio.'
    }
  }
  if (code === 'flexible') {
    return {
      title: 'Flexible',
      commission: '12 % + IGV aplicable a la comisión',
      monthly: 'Sin cuota mensual',
      clause: 'WAKI cobra una comisión del 12 % sobre cada reserva pagada y completada en WAKI. Al importe de la comisión se añade el IGV que corresponda. Este plan no tiene cuota mensual.'
    }
  }
  return null
}

function wrap(text, font, size, width) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

export async function buildHotelAffiliationContract({ hotel, planCode, representativeEmail }) {
  const terms = contractPlanTerms(planCode)
  if (!terms) throw new Error('HOTEL_PLAN_REQUIRED')
  const brand = hotel?.hotel_brands || {}
  if (!hotel?.name || !brand.legal_name || !/^\d{11}$/.test(brand.ruc || '')) {
    throw new Error('HOTEL_LEGAL_DETAILS_REQUIRED')
  }

  const pdf = await PDFDocument.create()
  pdf.setTitle(`Contrato de afiliación hotelera WAKI · ${brand.legal_name}`)
  pdf.setSubject(`Plan ${terms.title}; oferta individual vinculada al hotel ${hotel.name}`)
  pdf.setCreator('WAKI · Mednology Apps')
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const pages = [
    [
      ['01 · PARTES Y PLAN', 'Contrato de afiliación hotelera', 'Este acuerdo regula la publicación y gestión de reservas de estadías por horas mediante WAKI en el Perú.'],
      ['Operador', 'Mednology Apps · RUC 20608764161 · Marca WAKI'],
      ['Hotel', `${brand.legal_name} · RUC ${brand.ruc} · Sede ${hotel.name}`],
      ['Representante', `${hotel.contact_email || representativeEmail || 'Correo del administrador verificado'}`],
      ['Oferta comercial', `Plan ${terms.title} · Comisión ${terms.commission} · Cuota ${terms.monthly}`],
      ['1. Objeto y relación entre las partes', 'WAKI facilita la búsqueda, reserva y pago de estadías por horas y brinda al Hotel un portal para administrar habitaciones, tarifas, disponibilidad y reservas. El Hotel presta el alojamiento y la atención presencial. Cada parte responde por sus obligaciones y por las responsabilidades que le atribuya la ley. El Hotel es un proveedor independiente y no representa a WAKI.'],
      ['2. Comisión, impuestos y cuota', `${terms.clause} La base de cálculo es el importe total de la reserva efectivamente cobrada por WAKI, antes de descontar la comisión. Las reservas presenciales u originadas por otros canales no generan comisión. WAKI emitirá el comprobante que corresponda por sus servicios y cargos. El Hotel es responsable de emitir los comprobantes correspondientes al servicio de hospedaje y de cumplir sus propias obligaciones tributarias.`],
      ['3. Renovación y cancelación del plan', 'El Plan Socio se renueva por periodos mensuales mientras continúe activo. El Hotel puede solicitar su cancelación en cualquier momento, sin penalidad ni cargo adicional por cancelación. La cancelación detiene renovaciones futuras; los importes devengados hasta la fecha efectiva y las operaciones pendientes de conciliación siguen siendo pagaderos. El Plan Flexible no tiene mensualidad. La autorización para cobros recurrentes, cuando se habilite, será solicitada en un paso separado y mostrará importe y periodicidad.']
    ],
    [
      ['02 · OPERACIÓN', 'Reservas, disponibilidad y atención', 'Reglas para que lo ofrecido al huésped coincida con la disponibilidad real del establecimiento.'],
      ['4. Obligaciones del Hotel', 'El Hotel declara contar con autorización para operar y mantener las licencias y condiciones de seguridad, higiene y atención que sean aplicables. Mantendrá actualizados la razón social, el RUC, la dirección, los datos de abono, los servicios, las fotos, las tarifas, los tipos de habitación, las unidades físicas y la disponibilidad. Registrará los bloqueos y cambios con anticipación razonable para evitar sobreventas.'],
      ['5. Condiciones de la estadía', 'El Hotel respetará el precio, la duración y los servicios confirmados. El huésped puede ingresar en cualquier momento dentro de la franja contratada, sujeto a la verificación aplicable. La estadía terminará a la hora de fin confirmada; una llegada tardía no la extiende. El personal autorizado verificará la reserva y, cuando corresponda, la identidad y mayoría de edad conforme a las condiciones informadas antes del pago.'],
      ['6. Obligaciones de WAKI', 'WAKI mostrará las condiciones de reserva, procesará el pago por medio del proveedor habilitado, comunicará la confirmación una vez validados pago y disponibilidad, y atenderá las incidencias de plataforma y cobro bajo su control. WAKI conservará trazabilidad de las operaciones, ajustes y comunicaciones relevantes.'],
      ['7. Liquidaciones', 'WAKI recauda los pagos realizados por el canal WAKI y liquida al Hotel el saldo de las operaciones elegibles, deduciendo la comisión acordada e identificando reservas, importes, tasa aplicada y ajustes. La cuota del Plan Socio se cobra por separado y no se descuenta de las transferencias al Hotel. Las liquidaciones ordinarias se programan los miércoles y domingos, sujetas a conciliación de fondos, validaciones del proveedor de pago y datos bancarios correctos.'],
      ['8. Diferencias y ajustes', 'WAKI podrá diferir temporalmente operaciones afectadas por fraude, contracargos, devoluciones, reversas o errores de abono. Comunicará el motivo disponible y registrará la regularización en la liquidación correspondiente. Las partes colaborarán para resolver las discrepancias y conservarán el sustento de cada ajuste.']
    ],
    [
      ['03 · HUÉSPEDES Y DATOS', 'Incidencias y privacidad', 'Las partes limitan el uso de la información del huésped a las finalidades autorizadas.'],
      ['9. Cancelaciones y no presentación de reservas', 'Las condiciones de cancelación de cada reserva serán las que se informen al huésped antes de pagar y las que exija la ley. Una reserva no utilizada no se registrará como estadía completada. Si el Hotel no puede brindar lo ofrecido, hay incumplimiento, cobro incorrecto, operación no reconocida o una orden de reversión, WAKI revisará el caso y coordinará la solución y el reembolso cuando corresponda. Se preservan los derechos irrenunciables del huésped.'],
      ['10. Protección de datos', 'Cada parte cumple la Ley N.° 29733, su reglamento y las obligaciones aplicables al tratamiento bajo su control. WAKI compartirá con el Hotel solo la información necesaria para gestionar la reserva, verificar el ingreso, resolver incidencias y cumplir obligaciones legales. El Hotel limitará el acceso a personal autorizado, protegerá sus credenciales y no reutilizará los datos para publicidad sin la base legal correspondiente. Ante un incidente que afecte datos o reservas, informará oportunamente a WAKI y cooperará con la respuesta.'],
      ['11. Confidencialidad y pagos', 'Los datos de huéspedes, tarifas privadas, credenciales y documentos de afiliación son confidenciales. Las credenciales completas de tarjeta y el CVV no serán solicitados por canales propios de WAKI o del Hotel. El proveedor de pago procesa los datos de tarjeta; WAKI podrá conservar identificadores y referencias necesarios para confirmar y conciliar operaciones.'],
      ['12. Soporte y reclamos', 'Para incidencias de plataforma, cobros o privacidad: soporte@wakipe.com. El Libro de Reclamaciones Virtual y reclamos@wakipe.com son canales para los huéspedes. WAKI atiende los asuntos de plataforma bajo su control; el Hotel atiende los asuntos relacionados con la prestación presencial y colabora cuando el caso involucre a ambas partes.']
    ],
    [
      ['04 · VIGENCIA Y ACEPTACIÓN', 'Constancia de aceptación electrónica', 'La aceptación se registra en el Portal Hotel desde la cuenta verificada del representante.'],
      ['13. Vigencia, cambios y terminación', 'El acuerdo individual se perfecciona cuando el representante acepta este documento en el Portal Hotel. El Hotel puede solicitar la terminación cuando quiera, sin penalidad ni cargo adicional por cancelación. La terminación no extingue obligaciones sobre reservas confirmadas, importes devengados, devoluciones, liquidaciones pendientes, protección de datos ni atención de reclamos. Los cambios de plan o de condiciones económicas requieren comunicación previa y aceptación del Hotel para su aplicación futura. Rige la legislación peruana.'],
      ['14. Declaración del representante', 'Al seleccionar «Acepto el contrato», el representante declara contar con facultades para representar al Hotel, haber podido abrir y revisar el PDF completo, y aceptar las condiciones y el plan individual aquí indicado. La autorización de cobros recurrentes, si aplica, es independiente y se registra por separado.'],
      ['15. Evidencia electrónica', 'WAKI conservará el identificador y versión de este documento, el establecimiento asociado, el plan, la cuenta autenticada del representante y la fecha y hora de aceptación. El registro se vincula a la versión exacta del PDF y podrá ser consultado por el Hotel. Si WAKI reemplaza una oferta antes de su aceptación, el representante deberá abrir y aceptar la nueva versión.'],
      ['Documento vinculado a esta oferta', `Hotel: ${hotel.name} · Razón social: ${brand.legal_name} · RUC: ${brand.ruc} · Plan: ${terms.title}`],
      ['Información de contacto', 'WAKI · Mednology Apps · soporte@wakipe.com'],
      ['Nota tributaria', 'La comisión y la cuota mensual indicadas son importes antes del IGV aplicable a los servicios de WAKI. Cada parte emitirá los comprobantes que le correspondan conforme al régimen tributario aplicable.']
    ]
  ]

  const { width, height } = { width: 595.28, height: 841.89 }
  pages.forEach((sections, pageIndex) => {
    const page = pdf.addPage([width, height])
    const left = 54
    const right = width - 54
    const usable = right - left
    let y = height - 58
    page.drawText('WAKI  /  AFILIACIÓN HOTELERA', { x: left, y, size: 9, font: bold, color: PURPLE })
    page.drawText(`OFERTA ${terms.title.toUpperCase()}`, { x: left, y: y - 18, size: 8, font: regular, color: MUTED })
    page.drawLine({ start: { x: left, y: y - 28 }, end: { x: right, y: y - 28 }, thickness: 1, color: rgb(.88,.85,.92) })
    y -= 58
    for (const [heading, body, intro] of sections) {
      page.drawText(heading, { x: left, y, size: heading.startsWith('0') ? 8 : 11, font: bold, color: PURPLE })
      y -= heading.startsWith('0') ? 20 : 18
      if (body) {
        const size = heading.startsWith('0') && heading.includes('·') ? 20 : 10
        const font = size >= 18 ? bold : regular
        const lines = wrap(body, font, size, usable)
        for (const line of lines) {
          page.drawText(line, { x: left, y, size, font, color: size >= 18 ? INK : MUTED })
          y -= size >= 18 ? 27 : 14
        }
      }
      if (intro) {
        y -= 3
        for (const line of wrap(intro, regular, 10, usable)) {
          page.drawText(line, { x: left, y, size: 10, font: regular, color: MUTED })
          y -= 14
        }
      }
      y -= 13
    }
    page.drawLine({ start: { x: left, y: 38 }, end: { x: right, y: 38 }, thickness: .7, color: rgb(.88,.85,.92) })
    page.drawText('Mednology Apps · WAKI · Contrato de afiliación hotelera', { x: left, y: 22, size: 8, font: regular, color: MUTED })
    page.drawText(`${pageIndex + 1} / ${pages.length}`, { x: right - 28, y: 22, size: 8, font: regular, color: MUTED })
  })
  return pdf.save()
}
