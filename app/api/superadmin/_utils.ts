import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

export function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
}

export async function validateSuperadmin(supabaseAdmin: any, token: string) {
  if (!token) {
    return {
      isValid: false,
      status: 401,
      error: "No autorizado."
    };
  }

  const {
    data: { user },
    error: userError
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    return {
      isValid: false,
      status: 401,
      error: "No autorizado."
    };
  }

  const checks = [
    () =>
      supabaseAdmin
        .from("admin_users")
        .select("*")
        .or(`user_id.eq.${user.id},email.eq.${user.email ?? ""}`)
        .limit(1)
        .maybeSingle(),
    () =>
      supabaseAdmin
        .from("admin_users")
        .select("*")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle(),
    () =>
      supabaseAdmin
        .from("admin_users")
        .select("*")
        .eq("email", user.email ?? "")
        .limit(1)
        .maybeSingle()
  ];

  for (const check of checks) {
    const { data, error } = await check();

    if (data) {
      return {
        isValid: true,
        status: 200,
        error: "",
        user
      };
    }

    if (!error) {
      continue;
    }

    if (
      !String(error.message ?? "")
        .toLowerCase()
        .includes("column")
    ) {
      console.error("Error checking superadmin user:", error);
      return {
        isValid: false,
        status: 500,
        error: "No se pudo comprobar el administrador."
      };
    }
  }

  return {
    isValid: false,
    status: 403,
    error: "No tienes permisos para acceder al panel de administración."
  };
}
