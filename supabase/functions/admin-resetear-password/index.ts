// =====================================================================
// admin-resetear-password
// Body: { email: string, redirectTo?: string }
// Envía el correo de "restablecer contraseña" a otro usuario. Solo
// puede llamarla un admin.
//
// Autocontenida a propósito (sin imports relativos a otra función) para
// poder pegarla tal cual en Supabase Dashboard → Edge Functions → Create
// function. Las env vars SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY las inyecta Supabase automáticamente.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return jsonResponse({ error: "No autenticado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await caller.auth.getUser();
    if (userErr || !user) return jsonResponse({ error: "Sesión inválida" }, 401);

    const { data: callerProfile, error: profErr } = await caller
      .from("profiles").select("role").eq("user_id", user.id).single();
    if (profErr || callerProfile?.role !== "admin") {
      return jsonResponse({ error: "Solo un admin puede realizar esta acción" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const email = (body.email ?? "").trim().toLowerCase();
    const redirectTo = body.redirectTo || undefined;
    if (!email) return jsonResponse({ error: "Falta el correo" }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return jsonResponse({ error: error.message }, 400);

    return jsonResponse({ ok: true });
  } catch (e) {
    return jsonResponse({ error: e?.message ?? "Error interno" }, 500);
  }
});
