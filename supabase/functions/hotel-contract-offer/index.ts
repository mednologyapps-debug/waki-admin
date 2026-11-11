import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.114.0";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const headers = {
  "Access-Control-Allow-Origin": "https://hotel.wakipe.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};
const fail = (status: number, code: string) =>
  new Response(JSON.stringify({ error: code }), { status, headers });

function wrap(text: string, font: any, size: number, width: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of String(text || "").split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

async function makePdf(data: any) {
  const { hotel, brand, plan } = data;
  const socio = plan.code === "socio";
  const planTitle = socio ? "Socio WAKI" : "Flexible";
  const fee = socio ? "S/ 99 + IGV por mes" : "Sin cuota mensual";
  const commission = socio ? "8 % + IGV aplicable a la comisión" : "12 % + IGV aplicable a la comisión";
  const clauses = [
    ["01 · PARTES Y OFERTA", "Contrato de afiliación hotelera", `Acuerdo entre Mednology Apps (RUC 20608764161), marca WAKI, y ${brand.legal_name} (RUC ${brand.ruc}), para la sede ${hotel.name}. Correo verificado del representante: ${hotel.contact_email || "el registrado en WAKI Hotel"}. Plan elegido: ${planTitle}. Comisión: ${commission}. Cuota: ${fee}.`,
      "1. Objeto. WAKI facilita la búsqueda, reserva y pago de estadías por horas y brinda al Hotel un portal para administrar habitaciones, tarifas, disponibilidad y reservas. El Hotel presta el alojamiento y la atención presencial. Cada parte responde por sus obligaciones legales y opera como parte independiente.",
      `2. Comisión e impuestos. ${socio ? "WAKI cobra el 8 %" : "WAKI cobra el 12 %"} sobre el importe total de la reserva efectivamente cobrada por WAKI, más el IGV aplicable al servicio de intermediación. ${socio ? "Además, cobra S/ 99 más IGV por cada ciclo mensual de servicio." : "El plan Flexible no tiene cuota mensual."} Las reservas originadas fuera de WAKI no generan comisión. WAKI emitirá el comprobante por sus servicios; el Hotel emitirá los comprobantes que correspondan por el servicio de hospedaje conforme a su régimen tributario.",
      "3. Renovación y cancelación. El Plan Socio se renueva por periodos mensuales mientras permanezca activo. El Hotel puede cancelarlo en cualquier momento, sin penalidad ni cargo adicional por cancelar; la solicitud detiene renovaciones futuras. Los importes ya devengados y operaciones pendientes de conciliación continúan sujetos a pago. La autorización para cargos recurrentes, cuando esté habilitada, se solicita por separado y muestra monto y periodicidad."],
    ["02 · OPERACIÓN Y ABONOS", "Reservas y liquidaciones", "4. Obligaciones del Hotel. El Hotel mantiene las licencias, condiciones de seguridad y datos de afiliación actualizados, incluidos dirección, cuenta de abono, servicios, fotos, tarifas, habitaciones y unidades físicas. Registrará bloqueos y cambios para evitar sobreventas.",
      "5. Estancias. El Hotel respeta el precio, los servicios y la duración confirmados. El huésped puede ingresar en cualquier momento dentro de la franja contratada y la estadía termina en la hora de fin confirmada. La llegada tardía no extiende la reserva. El personal autorizado verifica reserva e identidad según las condiciones comunicadas al huésped.",
      "6. Obligaciones de WAKI. WAKI muestra las condiciones, tramita el pago por medio del proveedor habilitado, confirma la reserva al validar pago y disponibilidad, y atiende incidencias de plataforma y cobro bajo su control.",
      "7. Liquidación. WAKI recauda los pagos del canal WAKI y transfiere al Hotel el saldo de las operaciones elegibles, descontando la comisión y reflejando reservas, tasas y ajustes. La cuota mensual del Plan Socio se cobra por separado. Las liquidaciones ordinarias se programan los miércoles y domingos, sujetas a conciliación de fondos, validaciones del proveedor de pago y datos bancarios correctos.",
      "8. Diferencias. WAKI puede diferir temporalmente operaciones con fraude, contracargos, devoluciones, reversas o errores de abono. Comunicará el motivo y registrará la regularización. Las partes cooperan para resolver discrepancias y conservan el sustento."],
    ["03 · HUÉSPEDES Y DATOS", "Privacidad y atención", "9. Cancelación de reservas. Las condiciones de cancelación de cada reserva son las comunicadas al huésped antes del pago y las exigidas por ley. Una reserva no utilizada no se registra como estadía completada. Si el Hotel no puede prestar el servicio, ocurre un cobro incorrecto o existe una operación no reconocida, WAKI revisa y coordina la solución y el reembolso cuando corresponda, preservando los derechos irrenunciables del huésped.",
      "10. Protección de datos. Cada parte cumple la Ley N.° 29733, su reglamento y las obligaciones aplicables a los tratamientos bajo su control. WAKI comparte solo la información necesaria para la reserva, el ingreso, incidencias y obligaciones legales. El Hotel limita accesos, protege credenciales y no reutiliza datos para publicidad sin base legal. Ante incidentes informa a WAKI y coopera con la respuesta.",
      "11. Confidencialidad y pagos. Los datos de huéspedes y los documentos de afiliación son confidenciales. WAKI y el Hotel no solicitan el número completo de tarjeta ni el CVV por canales propios. El proveedor de pagos procesa los datos de tarjeta.",
      "12. Soporte. Para incidencias de plataforma, cobros o privacidad: soporte@wakipe.com. Los reclamos sobre la prestación presencial corresponden al Hotel, que colaborará con WAKI cuando el caso involucre a ambas partes."],
    ["04 · ACEPTACIÓN", "Constancia electrónica", "13. Vigencia y terminación. El acuerdo se perfecciona cuando el representante acepta este documento en WAKI Hotel. Cualquiera de las partes puede solicitar el cierre por escrito. La terminación no extingue importes devengados, reservas confirmadas, devoluciones, liquidaciones pendientes, privacidad o atención de reclamos. Los cambios de plan o condiciones económicas requieren comunicación previa y aceptación del Hotel para aplicarse al futuro. Rige la legislación peruana.",
      "14. Declaración del representante. Al seleccionar «Acepto el contrato», declara tener facultades para representar al Hotel, haber revisado el PDF y aceptar sus condiciones y el plan individual aquí indicado. La autorización para cobros recurrentes, si corresponde, se obtiene en un acto separado.",
      "15. Evidencia. WAKI conserva el identificador y versión del documento, establecimiento, plan, cuenta autenticada y fecha y hora de aceptación, vinculados al PDF exacto aceptado. El Hotel puede consultar la constancia en su portal. Si WAKI reemplaza una oferta antes de su aceptación, el representante revisa la nueva versión.",
      `Oferta individual: ${hotel.name} · ${brand.legal_name} · RUC ${brand.ruc} · Plan ${planTitle} · Comisión ${commission} · Cuota ${fee}.`,
      "La comisión y cuota mensual son importes antes del IGV aplicable a los servicios de WAKI. Cada parte cumple sus obligaciones tributarias y emite los comprobantes que le correspondan conforme al régimen aplicable.",
      "Mednology Apps · WAKI · soporte@wakipe.com"],
  ];
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Contrato de afiliación hotelera WAKI · ${brand.legal_name}`);
  pdf.setSubject(`Plan ${planTitle}; oferta individual de ${hotel.name}`);
  pdf.setCreator("WAKI · Mednology Apps");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const purple = rgb(0.39, 0.19, 0.82);
  const ink = rgb(0.16, 0.13, 0.22);
  const muted = rgb(0.43, 0.40, 0.48);
  const width = 595.28, height = 841.89, left = 54, right = width - 54;
  clauses.forEach((items, index) => {
    const page = pdf.addPage([width, height]);
    let y = height - 58;
    page.drawText("WAKI  /  AFILIACIÓN HOTELERA", { x: left, y, size: 9, font: bold, color: purple });
    page.drawText(`OFERTA ${planTitle.toUpperCase()}`, { x: left, y: y - 18, size: 8, font: regular, color: muted });
    page.drawLine({ start: { x: left, y: y - 28 }, end: { x: right, y: y - 28 }, thickness: 1, color: rgb(.88,.85,.92) });
    y -= 58;
    for (let item = 0; item < items.length; item++) {
      const text = items[item];
      const heading = item === 0;
      if (heading) {
        page.drawText(text, { x: left, y, size: text.startsWith("0") ? 8 : 19, font: text.startsWith("0") ? bold : bold, color: text.startsWith("0") ? purple : ink });
        y -= text.startsWith("0") ? 20 : 31;
        continue;
      }
      for (const line of wrap(text, regular, 9.5, right - left)) {
        if (y < 66) throw new Error("CONTRACT_LAYOUT_OVERFLOW");
        page.drawText(line, { x: left, y, size: 9.5, font: regular, color: muted });
        y -= 13.5;
      }
      y -= 11;
    }
    page.drawLine({ start: { x: left, y: 38 }, end: { x: right, y: 38 }, thickness: .7, color: rgb(.88,.85,.92) });
    page.drawText("Mednology Apps · WAKI · Contrato de afiliación hotelera", { x: left, y: 22, size: 8, font: regular, color: muted });
    page.drawText(`${index + 1} / ${clauses.length}`, { x: right - 28, y: 22, size: 8, font: regular, color: muted });
  });
  return await pdf.save();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED");
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return fail(401, "AUTH_REQUIRED");
  let hotelId = "";
  try {
    const body = await req.json();
    hotelId = String(body?.hotel_id || "");
  } catch { return fail(400, "INVALID_REQUEST"); }
  if (!/^[0-9a-f-]{36}$/i.test(hotelId)) return fail(400, "INVALID_HOTEL_ID");

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: userData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !userData.user) return fail(401, "AUTH_REQUIRED");

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: membership, error: membershipError } = await admin.from("hotel_staff")
    .select("hotel_id,user_id,is_active").eq("hotel_id", hotelId).eq("user_id", userData.user.id).eq("is_active", true).maybeSingle();
  if (membershipError || !membership) return fail(403, "NOT_AUTHORIZED");

  const { data: existing, error: existingError } = await userClient.rpc("hotel_contract_offer", { p_hotel: hotelId });
  if (existingError) return fail(400, "CONTRACT_LOOKUP_FAILED");
  if (existing?.document_path) return new Response(JSON.stringify({ document_path: existing.document_path, already_published: true }), { headers });

  const { data: context, error: contextError } = await admin.rpc("hotel_contract_generation_context", { p_hotel: hotelId });
  if (contextError || !context?.plan?.code || !context?.brand?.ruc || !context?.brand?.legal_name) return fail(409, "CONTRACT_DATA_INCOMPLETE");
  const { data: hotelRow, error: hotelError } = await admin.from("hotels").select("approval_status,is_active").eq("id", hotelId).single();
  if (hotelError || !["draft", "rejected", "pending_review"].includes(hotelRow.approval_status)) return fail(409, "INVALID_CONTRACT_STATUS");

  try {
    const bytes = await makePdf(context);
    const path = `${hotelId}/contracts/${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await admin.storage.from("hotel-affiliations").upload(path, bytes, { contentType: "application/pdf", upsert: false, cacheControl: "0" });
    if (uploadError) return fail(500, "CONTRACT_STORAGE_FAILED");
    const { data: saved, error: saveError } = await admin.rpc("hotel_contract_offer_generated", {
      p_hotel: hotelId, p_path: path, p_offered_by: userData.user.id,
    });
    if (saveError) return fail(500, "CONTRACT_PUBLISH_FAILED");
    return new Response(JSON.stringify(saved), { headers });
  } catch {
    return fail(500, "CONTRACT_GENERATION_FAILED");
  }
});
