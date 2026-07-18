// =====================================================================
// admin-crear-usuario
// Body: { nombre: string, email: string, role: 'admin'|'supervisor'|'driver', redirectTo?: string }
// Invita al correo (la persona define su propia contraseña) y crea su
// fila en profiles. Solo puede llamarla un admin.
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

const VALID_ROLES = ["admin", "supervisor", "driver"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return jsonResponse({ error: "No autenticado" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // Client "como el llamante": valida su JWT y respeta RLS.
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
    const nombre = (body.nombre ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();
    const role = body.role;
    const redirectTo = body.redirectTo || undefined;

    if (!nombre) return jsonResponse({ error: "Falta el nombre" }, 400);
    if (!email) return jsonResponse({ error: "Falta el correo" }, 400);
    if (!VALID_ROLES.includes(role)) return jsonResponse({ error: "Rol inválido" }, 400);

    // Client con privilegios totales (service_role) — ignora RLS. Nunca sale de aquí.
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    });
    if (inviteErr) return jsonResponse({ error: inviteErr.message }, 400);

    const userId = invited.user.id;
    const { data: profile, error: insertErr } = await admin
      .from("profiles")
      .insert({ user_id: userId, nombre, email, role })
      .select()
      .single();

    if (insertErr) {
      // No dejar una cuenta huérfana sin perfil: revertir la invitación.
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      return jsonResponse({ error: insertErr.message }, 400);
    }

    return jsonResponse({ profile });
  } catch (e) {
    return jsonResponse({ error: e?.message ?? "Error interno" }, 500);
  }
});
