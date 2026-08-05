import { NextResponse } from "next/server";
import {
  attachEmployeeServices,
  cleanOptionalText,
  cleanServiceIds,
  getEmployeeRequestContext,
  isEmployeeRole,
  syncEmployeeServices,
  validateServiceIds
} from "./_utils";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const context = await getEmployeeRequestContext(request);

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  let query = context.supabaseAdmin
    .from("employees")
    .select(
      "id, business_id, user_id, display_name, email, phone, avatar_url, role, is_active, login_enabled, receives_bookings, calendar_color, created_at, updated_at"
    )
    .eq("business_id", context.businessId)
    .order("created_at", { ascending: true });

  if (!context.canManageEmployees) {
    if (context.employeeId) {
      query = query.eq("id", context.employeeId);
    } else {
      query = query.eq("user_id", context.user.id);
    }
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error loading employees:", error);
    return NextResponse.json(
      { error: "No se pudieron cargar los empleados." },
      { status: 500 }
    );
  }

  const employees = await attachEmployeeServices(
    context.supabaseAdmin,
    context.businessId,
    data ?? []
  );

  return NextResponse.json({
    employees,
    can_manage_employees: context.canManageEmployees,
    current_employee_id: context.employeeId,
    current_role: context.businessRole
  });
}

export async function POST(request: Request) {
  const context = await getEmployeeRequestContext(request);

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  if (!context.canManageEmployees) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const displayName = cleanOptionalText(body?.display_name);
  const role = body?.role;

  if (!displayName) {
    return NextResponse.json(
      { error: "El nombre del empleado es obligatorio." },
      { status: 400 }
    );
  }

  if (!isEmployeeRole(role) || role === "owner") {
    return NextResponse.json(
      { error: "No puedes crear otro owner desde este formulario." },
      { status: 400 }
    );
  }

  const requestedServiceIds = cleanServiceIds(body?.service_ids);
  const validatedServices = await validateServiceIds(
    context.supabaseAdmin,
    context.businessId,
    requestedServiceIds
  );

  if (!validatedServices.valid) {
    return NextResponse.json(
      { error: "Algún servicio no pertenece a esta barbería." },
      { status: 400 }
    );
  }

  const isActive = body?.is_active !== false;
  const { data: employee, error } = await context.supabaseAdmin
    .from("employees")
    .insert({
      business_id: context.businessId,
      user_id: null,
      display_name: displayName,
      email: cleanOptionalText(body?.email),
      phone: cleanOptionalText(body?.phone),
      avatar_url: cleanOptionalText(body?.avatar_url),
      role,
      is_active: isActive,
      login_enabled: body?.login_enabled === true,
      receives_bookings: isActive && body?.receives_bookings === true,
      calendar_color: cleanOptionalText(body?.calendar_color),
      updated_at: new Date().toISOString()
    })
    .select(
      "id, business_id, user_id, display_name, email, phone, avatar_url, role, is_active, login_enabled, receives_bookings, calendar_color, created_at, updated_at"
    )
    .single();

  if (error) {
    console.error("Error creating employee:", error);
    return NextResponse.json(
      { error: "No se pudo crear el empleado." },
      { status: 500 }
    );
  }

  const serviceError = await syncEmployeeServices(
    context.supabaseAdmin,
    context.businessId,
    employee.id,
    validatedServices.serviceIds
  );

  if (serviceError) {
    return NextResponse.json(
      { error: "Empleado creado, pero no se pudieron guardar sus servicios." },
      { status: 500 }
    );
  }

  const [employeeWithServices] = await attachEmployeeServices(
    context.supabaseAdmin,
    context.businessId,
    [employee]
  );

  return NextResponse.json({ employee: employeeWithServices });
}
