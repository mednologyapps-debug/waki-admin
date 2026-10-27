import {csvField} from './csv';
import { supabase } from "./supabase";
export const roles = {
  user: "Usuario",
  hotel: "Personal de hotel",
  admin: "Administrador global",
  super_admin: "Superadministrador",
};
export const accounts = {
  active: "Activo",
  suspended: "Suspendido",
  blocked: "Bloqueado",
  pending: "Por aprobar",
};
export const reservations = {
  pending_payment: "Pendiente de pago",
  confirmed: "Confirmada",
  payment_failed: "Pago fallido",
  cancelled: "Cancelada",
  checked_in: "En estadía",
  completed: "Finalizada",
  no_show: "No se presentó",
  refunded: "Reembolsada",
};
export const payments = {
  pending: "Pendiente",
  paid: "Pagado",
  failed: "Fallido",
  refunded: "Reembolsado",
};
export const staffRoles = {
  admin: "Administrador de hotel",
  reception: "Recepción",
  scanner: "Scanner",
};
export function controlError(error) {
  const text = error?.message || String(error || "");
  return (
    Object.entries(messages).find(([key]) => text.includes(key))?.[1] ||
    "No pudimos completar la operación. Actualiza e inténtalo nuevamente."
  );
}
const messages = {
  EMAIL_NOT_AVAILABLE:
    "El usuario no tiene un correo disponible para enviar el enlace.",
  NOT_AUTHORIZED:
    "Solo los administradores globales activos pueden realizar esta acción.",
  SUPER_ADMIN_REQUIRED:
    "Se requiere un superadministrador para modificar cuentas administrativas.",
  SELF_CHANGE_FORBIDDEN:
    "No puedes modificar tu propia cuenta desde este panel.",
  LAST_SUPER_ADMIN: "Debe quedar al menos un superadministrador activo.",
  RECORD_CHANGED:
    "El registro cambió. Cierra este formulario y actualiza antes de confirmar.",
  REASON_REQUIRED: "Escribe un motivo de al menos 5 caracteres.",
  INVALID_SELECTION: "Selecciona una de las opciones permitidas.",
  HOTEL_REQUIRED: "Selecciona el hotel y el permiso del colaborador.",
  HOTEL_ASSIGNMENT_CONFLICT:
    "Este usuario ya está asignado a otro hotel. Revisa su asignación antes de cambiarla.",
  CHECKIN_NOT_READY:
    "Antes del ingreso se requiere pago, QR y documentos verificados, y una reserva vigente.",
  INVALID_TRANSITION: "El estado actual no permite este cambio.",
  APPROVAL_REQUIRED: "Esta cuenta debe aprobarse con el botón Aprobar.",
  EMAIL_EXISTS: "Ese correo ya tiene una cuenta. Búscalo en Usuarios.",
  CREATE_FAILED:
    "No se pudo crear la cuenta. Verifica que el correo no esté registrado.",
  NOT_PENDING: "Esta cuenta ya no está pendiente de aprobación.",
  INVALID_DATES: "Revisa el intervalo de fechas.",
};
export async function adminAction(action, data) {
  const { data: result, error } = await supabase.functions.invoke(
    "admin-control",
    { body: { action, data } },
  );
  if (error) {
    let detail;
    try {
      detail = await error.context?.json();
    } catch {
      /* no JSON response */
    }
    throw new Error(detail?.error || error.message);
  }
  if (!result?.ok) throw new Error(result?.error || "REQUEST_FAILED");
  return result;
}
export function downloadCsv(filename, rows) {
  const csv = rows.map((r) => r.map(csvField).join(";")).join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
