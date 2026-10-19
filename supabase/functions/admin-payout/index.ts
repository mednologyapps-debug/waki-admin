import { Buffer } from "node:buffer";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.114.0";
import nodemailer from "npm:nodemailer@7.0.11";
import { payoutPdf, payoutHtml } from "./payoutDocument.js";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
function base64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const token = req.headers.get("Authorization") || "";
    if (!/^Bearer /i.test(token)) return reply({ error: "AUTH_REQUIRED" }, 401);
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: auth, error: authError } = await service.auth.getUser(
      token.replace(/^Bearer /i, ""),
    );
    if (authError || !auth.user) return reply({ error: "AUTH_REQUIRED" }, 401);
    const user = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: token } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { payout_id, action } = await req.json();
    if (
      !/^[0-9a-f-]{36}$/i.test(payout_id) ||
      !["pdf", "send"].includes(action)
    )
      return reply({ error: "INVALID_REQUEST" }, 400);
    const { data: receipt, error: receiptError } = await user.rpc(
      "admin_payout_receipt",
      { p_id: payout_id },
    );
    if (receiptError) return reply({ error: "NOT_AUTHORIZED" }, 403);
    if (action === "pdf")
      return reply({
        ok: true,
        pdf: base64(await payoutPdf(receipt)),
        filename: "WAKI-liquidacion-" + payout_id.slice(0, 8) + ".pdf",
      });
    const { data: claim, error: claimError } = await service.rpc(
      "admin_payout_delivery",
      { p_id: payout_id, p_action: "claim", p_data: {} },
    );
    if (claimError) throw claimError;
    if (!claim?.ok)
      return reply({ ok: true, email_status: claim?.state || "failed" });
    let state = "failed",
      errorCode = "",
      messageId = "";
    let transport;
    try {
      const r = claim.payload,
        email = String(claim.recipient || "").trim();
      const resend = Deno.env.get("RESEND_API_KEY"),
        smtpHost = Deno.env.get("SMTP_HOST"),
        smtpUser = Deno.env.get("SMTP_USER"),
        smtpPass = Deno.env.get("SMTP_PASS"),
        from = Deno.env.get("PAYOUT_FROM_EMAIL") || "WAKI <hola@wakipe.com>";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        state = "failed";
        errorCode = "HOTEL_EMAIL_MISSING";
      } else if (!resend && !(smtpHost && smtpUser && smtpPass)) {
        state = "unconfigured";
        errorCode = "MAIL_NOT_CONFIGURED";
      } else {
        const bytes = await payoutPdf(r),
          filename = "WAKI-liquidacion-" + payout_id.slice(0, 8) + ".pdf",
          subject =
            "WAKI · Liquidación " +
            r.paid_on +
            " · S/ " +
            Number(r.amount).toFixed(2);
        if (resend) {
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: "Bearer " + resend,
              "Content-Type": "application/json",
              "Idempotency-Key": "waki-payout-" + payout_id,
            },
            body: JSON.stringify({
              from,
              to: [email],
              subject,
              html: payoutHtml(r),
              attachments: [{ filename, content: base64(bytes) }],
            }),
            signal: AbortSignal.timeout(20000),
          });
          const result = await response.json();
          if (!response.ok) {
            state = response.status >= 500 ? "unknown" : "failed";
            errorCode = "PROVIDER_" + response.status;
          } else {
            state = "sent";
            messageId = result.id;
          }
        } else {
          const port = Number(Deno.env.get("SMTP_PORT") || 465);
          transport = nodemailer.createTransport({
            host: smtpHost,
            port,
            secure: port === 465,
            requireTLS: port !== 465,
            auth: { user: smtpUser, pass: smtpPass },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 20000,
          });
          const sent = await transport.sendMail({
            from,
            to: email,
            subject,
            html: payoutHtml(r),
            text:
              "Tu liquidación WAKI: S/ " +
              Number(r.amount).toFixed(2) +
              ". Operación: " +
              r.reference +
              ". Se adjunta el resumen PDF.",
            messageId: "<waki-payout-" + payout_id + "@wakipe.com>",
            attachments: [
              {
                filename,
                content: Buffer.from(bytes),
                contentType: "application/pdf",
              },
            ],
          });
          if (sent.accepted?.length) {
            state = "sent";
            messageId = sent.messageId;
          } else {
            state = "failed";
            errorCode = "RECIPIENT_REJECTED";
          }
        }
      }
    } catch (err) {
      const code = String((err as { code?: string })?.code || "");
      state = ["EAUTH", "EENVELOPE", "ECONNECTION"].includes(code)
        ? "failed"
        : "unknown";
      errorCode = state === "unknown" ? "DELIVERY_UNKNOWN" : "SMTP_FAILED";
    } finally {
      transport?.close();
    }
    const { error: finishError } = await service.rpc("admin_payout_delivery", {
      p_id: payout_id,
      p_action: "finish",
      p_data: {
        lease: claim.lease,
        state,
        error_code: errorCode,
        message_id: messageId,
      },
    });
    if (finishError) return reply({ ok: true, email_status: "unknown" });
    return reply({ ok: true, email_status: state, error_code: errorCode });
  } catch {
    console.error("admin-payout request failed");
    return reply({ error: "REQUEST_FAILED" }, 500);
  }
});
