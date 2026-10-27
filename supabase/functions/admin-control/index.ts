import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.114.0";
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
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!,
      key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = (req.headers.get("Authorization") || "").replace(
      /^Bearer\s+/i,
      "",
    );
    if (!token) return reply({ error: "AUTH_REQUIRED" }, 401);
    const service = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: auth, error: authError } = await service.auth.getUser(token);
    if (authError || !auth.user) return reply({ error: "AUTH_REQUIRED" }, 401);
    const { data: actor, error: profileError } = await service
      .from("profiles")
      .select("role,account_status")
      .eq("id", auth.user.id)
      .single();
    if (
      profileError ||
      actor?.account_status !== "active" ||
      !["admin", "super_admin"].includes(actor.role)
    )
      return reply({ error: "NOT_AUTHORIZED" }, 403);
    if (Number(req.headers.get("content-length") || 0) > 10000)
      return reply({ error: "INVALID_REQUEST" }, 413);
    const body = await req.json();
    const action = body.action;
    const data = body.data || {};
    if (
      typeof data.reason !== "string" ||
      data.reason.trim().length < 5 ||
      data.reason.length > 500
    )
      return reply({ error: "REASON_REQUIRED" }, 400);
    const origin = req.headers.get("origin") || "";
    const app = Deno.env.get("ADMIN_APP_URL") || "https://admin.wakipe.com";
    const redirectBase =
      origin === app || /^http:\/\/localhost:(5173|5174)$/.test(origin)
        ? origin
        : app;
    if (action === "create_user") {
      const email = String(data.email || "")
          .trim()
          .toLowerCase(),
        name = String(data.full_name || "").trim(),
        role = String(data.role || "");
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        email.length > 254 ||
        name.length < 2 ||
        name.length > 160 ||
        !["user", "hotel", "admin", "super_admin"].includes(role)
      )
        return reply({ error: "INVALID_SELECTION" }, 400);
      if (
        ["admin", "super_admin"].includes(role) &&
        actor.role !== "super_admin"
      )
        return reply({ error: "SUPER_ADMIN_REQUIRED" }, 403);
      if (role === "hotel") {
        if (!["admin", "reception", "scanner"].includes(data.staff_role))
          return reply({ error: "INVALID_SELECTION" }, 400);
        const { data: hotel } = await service
          .from("hotels")
          .select("id")
          .eq("id", data.hotel_id || "")
          .maybeSingle();
        if (!hotel) return reply({ error: "HOTEL_REQUIRED" }, 400);
      }
      const { data: created, error: createError } =
        await service.auth.admin.createUser({
          email,
          password: crypto.randomUUID() + crypto.randomUUID(),
          email_confirm: false,
          user_metadata: { full_name: name },
        });
      if (createError || !created.user)
        return reply(
          {
            error:
              createError?.code === "email_exists"
                ? "EMAIL_EXISTS"
                : "CREATE_FAILED",
          },
          400,
        );
      const { error: setupError } = await service.rpc("admin_control_action", {
        p_actor: auth.user.id,
        p_action: "create_user",
        p_data: { ...data, id: created.user.id },
      });
      if (setupError) {
        // Newly created, inaccessible account only. Never delete a pre-existing account.
        const { error: cleanupError } = await service.auth.admin.deleteUser(
          created.user.id,
        );
        if (cleanupError)
          await service.auth.admin.updateUserById(created.user.id, {
            ban_duration: "876000h",
          });
        console.error("admin account setup failed", setupError.code);
        return reply({ error: "CREATE_FAILED" }, 400);
      }
      const { error: mailError } = await service.auth.resetPasswordForEmail(
        email,
        { redirectTo: redirectBase + "/activar-cuenta" },
      );
      return reply({ ok: true, email_sent: !mailError, id: created.user.id });
    }
    if (
      ![
        "update_user",
        "approve_user",
        "reject_user",
        "send_activation",
        "reservation",
      ].includes(action)
    )
      return reply({ error: "INVALID_ACTION" }, 400);
    const { data: result, error } = await service.rpc("admin_control_action", {
      p_actor: auth.user.id,
      p_action: action,
      p_data: data,
    });
    if (error) return reply({ error: error.message }, 400);
    if (action === "send_activation") {
      const { data: target, error: lookupError } =
        await service.auth.admin.getUserById(data.id);
      if (lookupError || !target.user?.email)
        return reply({ error: "EMAIL_NOT_AVAILABLE" }, 400);
      const { error: mailError } = await service.auth.resetPasswordForEmail(
        target.user.email,
        { redirectTo: redirectBase + "/activar-cuenta" },
      );
      return reply({ ...result, email_sent: !mailError });
    }
    return reply(result);
  } catch (error) {
    console.error(
      "admin-control failed",
      error instanceof Error ? error.name : "ERROR",
    );
    return reply({ error: "REQUEST_FAILED" }, 500);
  }
});
