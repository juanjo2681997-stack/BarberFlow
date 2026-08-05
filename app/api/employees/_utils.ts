import { createClient } from "@supabase/supabase-js";

export type EmployeeRole = "owner" | "manager" | "barber" | "receptionist";

export type EmployeeRow = {
  id: string;
  business_id: string;
  user_id: string | null;
  display_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: EmployeeRole;
  is_active: boolean;
  login_enabled: boolean;
  receives_bookings: boolean;
  calendar_color: string | null;
  created_at: string;
  updated_at: string;
};

type BusinessUserRow = {
  business_id: string;
  role: EmployeeRole | string | null;
  employee_id: string | null;
};

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Faltan variables de entorno de Supabase.");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

export function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
}

export function isEmployeeRole(value: unknown): value is EmployeeRole {
  return (
    value === "owner" ||
    value === "manager" ||
    value === "barber" ||
    value === "receptionist"
  );
}

export function isEmployeeManagerRole(value: unknown) {
  return value === "owner" || value === "manager";
}

export function cleanOptionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function cleanServiceIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((serviceId): serviceId is string => typeof serviceId === "string")
        .map((serviceId) => serviceId.trim())
        .filter(Boolean)
    )
  );
}

export async function getEmployeeRequestContext(request: Request) {
  const supabaseAdmin = getSupabaseAdmin();
  const token = getBearerToken(request);

  if (!token) {
    return { error: "No autorizado.", status: 401 as const };
  }

  const {
    data: { user },
    error: userError
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    return { error: "No autorizado.", status: 401 as const };
  }

  let businessUserResult = await supabaseAdmin
    .from("business_users")
    .select("business_id, role, employee_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!businessUserResult.data && user.email) {
    businessUserResult = await supabaseAdmin
      .from("business_users")
      .select("business_id, role, employee_id")
      .eq("email", user.email)
      .limit(1)
      .maybeSingle();
  }

  if (businessUserResult.error) {
    console.error("Error checking employee permissions:", businessUserResult.error);
    return {
      error: "No se pudieron comprobar los permisos.",
      status: 500 as const
    };
  }

  const businessUser = businessUserResult.data as BusinessUserRow | null;

  if (!businessUser?.business_id) {
    return { error: "No tienes ninguna barbería asignada.", status: 403 as const };
  }

  return {
    supabaseAdmin,
    user,
    businessId: businessUser.business_id,
    businessRole: businessUser.role,
    employeeId: businessUser.employee_id,
    canManageEmployees: isEmployeeManagerRole(businessUser.role)
  };
}

export async function validateServiceIds(
  supabaseAdmin: any,
  businessId: string,
  serviceIds: string[]
) {
  if (serviceIds.length === 0) {
    return { valid: true, serviceIds: [] as string[] };
  }

  const { data, error } = await supabaseAdmin
    .from("services")
    .select("id")
    .eq("business_id", businessId)
    .in("id", serviceIds);

  if (error) {
    console.error("Error validating employee services:", error);
    return { valid: false, serviceIds: [] as string[] };
  }

  const validServiceIds = ((data ?? []) as Array<{ id: string }>).map((service) =>
    String(service.id)
  );

  return {
    valid: validServiceIds.length === serviceIds.length,
    serviceIds: validServiceIds
  };
}

export async function attachEmployeeServices(
  supabaseAdmin: any,
  businessId: string,
  employees: EmployeeRow[]
) {
  if (employees.length === 0) {
    return [];
  }

  const employeeIds = employees.map((employee) => employee.id);
  const { data, error } = await supabaseAdmin
    .from("employee_services")
    .select("employee_id, service_id")
    .eq("business_id", businessId)
    .in("employee_id", employeeIds);

  if (error) {
    console.error("Error loading employee services:", error);
    return employees.map((employee) => ({
      ...employee,
      service_ids: [] as string[],
      service_count: 0
    }));
  }

  return employees.map((employee) => {
    const serviceIds = ((data ?? []) as Array<{
      employee_id: string;
      service_id: string;
    }>)
      .filter((row) => row.employee_id === employee.id)
      .map((row) => String(row.service_id));

    return {
      ...employee,
      service_ids: serviceIds,
      service_count: serviceIds.length
    };
  });
}

export async function syncEmployeeServices(
  supabaseAdmin: any,
  businessId: string,
  employeeId: string,
  serviceIds: string[]
) {
  const { error: deleteError } = await supabaseAdmin
    .from("employee_services")
    .delete()
    .eq("business_id", businessId)
    .eq("employee_id", employeeId);

  if (deleteError) {
    console.error("Error clearing employee services:", deleteError);
    return deleteError;
  }

  if (serviceIds.length === 0) {
    return null;
  }

  const { error: insertError } = await supabaseAdmin
    .from("employee_services")
    .insert(
      serviceIds.map((serviceId) => ({
        business_id: businessId,
        employee_id: employeeId,
        service_id: serviceId,
        is_enabled: true
      }))
    );

  if (insertError) {
    console.error("Error saving employee services:", insertError);
  }

  return insertError;
}
