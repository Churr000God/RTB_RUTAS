// =====================================================================
// admin-toggle-usuario
// Body: { userId: string, disabled: boolean }
// Deshabilita (ban) o rehabilita una cuenta y refleja el estado en
// profiles.disabled. Reversible — no hay borrado duro. Rechaza tocar
// al superadmin o a la propia cuenta del que llama. Solo un admin
// puede invocarla.
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

const SUPERADMIN_ID = "5ecb861d-7d41-4d01-a916-72eb1c2b1817";
// ~100 años: Supabase no acepta "forever", así que se usa una duración muy larga.
const BAN_DURATION_DISABLE = "876000h";
const BAN_DURATION_ENABLE = "none";

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
    const userId = body.userId;
    const disabled = !!body.disabled;
    if (!userId) return jsonResponse({ error: "Falta userId" }, 400);
    if (userId === SUPERADMIN_ID) return jsonResponse({ error: "No se puede deshabilitar al superadmin" }, 403);
    if (userId === user.id) return jsonResponse({ error: "No puedes deshabilitar tu propia cuenta" }, 403);

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: disabled ? BAN_DURATION_DISABLE : BAN_DURATION_ENABLE,
    });
    if (banErr) return jsonResponse({ error: banErr.message }, 400);

    const { data: profile, error: updateErr } = await admin
      .from("profiles")
      .update({ disabled })
      .eq("user_id", userId)
      .select()
      .single();
    if (updateErr) return jsonResponse({ error: updateErr.message }, 400);

    return jsonResponse({ profile });
  } catch (e) {
    return jsonResponse({ error: e?.message ?? "Error interno" }, 500);
  }
});
