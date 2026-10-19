import { supabase } from "./supabase";
export const emailStates = {
  pending: "Correo pendiente",
  sending: "Enviando correo",
  sent: "Correo enviado",
  failed: "Envío fallido",
  unconfigured: "Configurar correo",
  unknown: "Verificar envío",
  unavailable: "Sin envío registrado",
  demo: "Simulación · sin envío",
};
export async function payoutRequest(action, payout_id) {
  const { data, error } = await supabase.functions.invoke("admin-payout", {
    body: { action, payout_id },
  });
  if (error || !data?.ok) throw new Error("NOTIFICATION_FAILED");
  return data;
}
export async function downloadReceipt(receiptOrId) {
  let bytes, name;
  if (typeof receiptOrId === "object") {
    const { payoutPdf } = await import("./payoutDocument");
    bytes = await payoutPdf(receiptOrId);
    name = "WAKI-liquidacion-demo.pdf";
  } else {
    const result = await payoutRequest("pdf", receiptOrId);
    bytes = Uint8Array.from(atob(result.pdf), (c) => c.charCodeAt(0));
    name = result.filename;
  }
  const url = URL.createObjectURL(
      new Blob([bytes], { type: "application/pdf" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
