import { NextResponse } from "next/server";
import {
  attachEmployeeServices,
  cleanOptionalText,
  cleanServiceIds,
  getEmployeeRequestContext,
  isEmployeeRole,
  syncEmployeeServices,
  validateServiceIds,
  type EmployeeRow
} from "../_utils";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, contextParams: RouteContext) {
  const context = await getEmployeeRequestContext(request);

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  if (!context.canManageEmployees) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { id } = await contextParams.params;
  const body = await request.json().catch(() => null);

  if (!id) {
    return NextResponse.json({ error: "Empleado no válido." }, { status: 400 });
  }

  const { data: currentEmployee, error: currentError } =
    await context.supabaseAdmin
      .from("employees")
      .select(
        "id, business_id, user_id, display_name, email, phone, avatar_url, role, is_active, login_enabled, receives_bookings, calendar_color, created_at, updated_at"
      )
      .eq("id", id)
      .eq("business_id", context.businessId)
      .maybeSingle();

  if (currentError) {
    console.error("Error loading employee:", currentError);
    return NextResponse.json(
      { error: "No se pudo cargar el empleado." },
      { status: 500 }
    );
  }

  if (!currentEmployee) {
    return NextResponse.json(
      { error: "Empleado no encontrado." },
      { status: 404 }
    );
  }

  const employee = currentEmployee as EmployeeRow;
  const displayName = cleanOptionalText(body?.display_name);
  const requestedRole = body?.role;

  if (!displayName) {
    return NextResponse.json(
      { error: "El nombre del empleado es obligatorio." },
      { status: 400 }
    );
  }

  if (!isEmployeeRole(requestedRole)) {
    return NextResponse.json({ error: "Rol no válido." }, { status: 400 });
  }

  if (employee.role === "owner" && requestedRole !== "owner") {
    return NextResponse.json(
      { error: "No puedes cambiar el rol del owner principal." },
      { status: 400 }
    );
  }

  if (employee.role !== "owner" && requestedRole === "owner") {
    return NextResponse.json(
      { error: "No puedes convertir empleados a owner desde este formulario." },
      { status: 400 }
    );
  }

  const nextIsActive = body?.is_active === true;
  const isCurrentUserEmployee =
    context.employeeId === employee.id || employee.user_id === context.user.id;

  if (isCurrentUserEmployee && !nextIsActive) {
    return NextResponse.json(
      { error: "No puedes desactivarte a ti mismo." },
      { status: 400 }
    );
  }

  if (employee.role === "owner" && !nextIsActive) {
    const { count, error: ownerCountError } = await context.supabaseAdmin
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("business_id", context.businessId)
      .eq("role", "owner")
      .eq("is_active", true)
      .neq("id", employee.id);

    if (ownerCountError) {
      console.error("Error counting active owners:", ownerCountError);
      return NextResponse.json(
        { error: "No se pudo comprobar el owner activo." },
        { status: 500 }
      );
    }

    if ((count ?? 0) === 0) {
      return NextResponse.json(
        { error: "No puedes desactivar el único owner activo." },
        { status: 400 }
      );
    }
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

  const { data: updatedEmployee, error } = await context.supabaseAdmin
    .from("employees")
    .update({
      display_name: displayName,
      email: cleanOptionalText(body?.email),
      phone: cleanOptionalText(body?.phone),
      avatar_url: cleanOptionalText(body?.avatar_url),
      role: requestedRole,
      is_active: nextIsActive,
      login_enabled: body?.login_enabled === true,
      receives_bookings: nextIsActive && body?.receives_bookings === true,
      calendar_color: cleanOptionalText(body?.calendar_color),
      updated_at: new Date().toISOString()
    })
    .eq("id", employee.id)
    .eq("business_id", context.businessId)
    .select(
      "id, business_id, user_id, display_name, email, phone, avatar_url, role, is_active, login_enabled, receives_bookings, calendar_color, created_at, updated_at"
    )
    .single();

  if (error) {
    console.error("Error updating employee:", error);
    return NextResponse.json(
      { error: "No se pudo guardar el empleado." },
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
      { error: "Empleado guardado, pero no se pudieron sincronizar sus servicios." },
      { status: 500 }
    );
  }

  const [employeeWithServices] = await attachEmployeeServices(
    context.supabaseAdmin,
    context.businessId,
    [updatedEmployee as EmployeeRow]
  );

  return NextResponse.json({ employee: employeeWithServices });
}

export async function DELETE(request: Request, contextParams: RouteContext) {
  const context = await getEmployeeRequestContext(request);

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  if (!context.canManageEmployees) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { id } = await contextParams.params;

  if (!id) {
    return NextResponse.json({ error: "Empleado no válido." }, { status: 400 });
  }

  const { data: currentEmployee, error: currentError } =
    await context.supabaseAdmin
      .from("employees")
      .select(
        "id, business_id, user_id, display_name, email, phone, avatar_url, role, is_active, login_enabled, receives_bookings, calendar_color, created_at, updated_at"
      )
      .eq("id", id)
      .eq("business_id", context.businessId)
      .maybeSingle();

  if (currentError) {
    console.error("Error loading employee for logical delete:", currentError);
    return NextResponse.json(
      { error: "No se pudo cargar el empleado." },
      { status: 500 }
    );
  }

  if (!currentEmployee) {
    return NextResponse.json(
      { error: "Empleado no encontrado." },
      { status: 404 }
    );
  }

  const employee = currentEmployee as EmployeeRow;
  const isCurrentUserEmployee =
    context.employeeId === employee.id || employee.user_id === context.user.id;

  if (employee.role === "owner") {
    return NextResponse.json(
      { error: "No puedes eliminar al owner principal." },
      { status: 400 }
    );
  }

  if (isCurrentUserEmployee) {
    return NextResponse.json(
      { error: "No puedes eliminarte a ti mismo." },
      { status: 400 }
    );
  }

  const { data: updatedEmployee, error } = await context.supabaseAdmin
    .from("employees")
    .update({
      is_active: false,
      receives_bookings: false,
      login_enabled: false,
      updated_at: new Date().toISOString()
    })
    .eq("id", employee.id)
    .eq("business_id", context.businessId)
    .select(
      "id, business_id, user_id, display_name, email, phone, avatar_url, role, is_active, login_enabled, receives_bookings, calendar_color, created_at, updated_at"
    )
    .single();

  if (error) {
    console.error("Error logically deleting employee:", error);
    return NextResponse.json(
      { error: "No se pudo eliminar el empleado." },
      { status: 500 }
    );
  }

  const [employeeWithServices] = await attachEmployeeServices(
    context.supabaseAdmin,
    context.businessId,
    [updatedEmployee as EmployeeRow]
  );

  return NextResponse.json({
    employee: employeeWithServices,
    logical_deleted: true
  });
}
