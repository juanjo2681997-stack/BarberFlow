import { NextResponse } from "next/server";
import {
  cleanOptionalText,
  getEmployeeRequestContext,
  loadEmployeeForBusiness
} from "../../../_utils";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
    blockId: string;
  }>;
};

function isDateValue(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeTime(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function normalizeBlockedTimeBody(body: any) {
  const blockDate = cleanOptionalText(body?.block_date);
  const isFullDay = body?.is_full_day === true;
  const startTime = normalizeTime(body?.start_time);
  const endTime = normalizeTime(body?.end_time);

  if (!isDateValue(blockDate)) {
    return { error: "La fecha del bloqueo no es válida." };
  }

  if (!isFullDay && (!startTime || !endTime || startTime >= endTime)) {
    return { error: "La franja horaria del bloqueo no es válida." };
  }

  return {
    value: {
      block_date: blockDate,
      is_full_day: isFullDay,
      start_time: isFullDay ? null : startTime,
      end_time: isFullDay ? null : endTime,
      reason: cleanOptionalText(body?.reason)
    }
  };
}

export async function PATCH(request: Request, routeContext: RouteContext) {
  const context = await getEmployeeRequestContext(request);

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  if (!context.canManageEmployees) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { id, blockId } = await routeContext.params;
  const { employee, error: employeeError } = await loadEmployeeForBusiness(
    context.supabaseAdmin,
    context.businessId,
    id
  );

  if (employeeError) {
    return NextResponse.json(
      { error: "No se pudo cargar el empleado." },
      { status: 500 }
    );
  }

  if (!employee) {
    return NextResponse.json(
      { error: "Empleado no encontrado." },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => null);
  const normalized = normalizeBlockedTimeBody(body);

  if ("error" in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const { data, error } = await context.supabaseAdmin
    .from("employee_blocked_times")
    .update(normalized.value)
    .eq("id", blockId)
    .eq("business_id", context.businessId)
    .eq("employee_id", id)
    .select("id, block_date, is_full_day, start_time, end_time, reason")
    .single();

  if (error) {
    console.error("Error updating employee blocked time:", error);
    return NextResponse.json(
      { error: "No se pudo guardar el bloqueo del empleado." },
      { status: 500 }
    );
  }

  return NextResponse.json({ blocked_time: data });
}

export async function DELETE(_request: Request, routeContext: RouteContext) {
  const context = await getEmployeeRequestContext(_request);

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  if (!context.canManageEmployees) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { id, blockId } = await routeContext.params;
  const { employee, error: employeeError } = await loadEmployeeForBusiness(
    context.supabaseAdmin,
    context.businessId,
    id
  );

  if (employeeError) {
    return NextResponse.json(
      { error: "No se pudo cargar el empleado." },
      { status: 500 }
    );
  }

  if (!employee) {
    return NextResponse.json(
      { error: "Empleado no encontrado." },
      { status: 404 }
    );
  }

  const { error } = await context.supabaseAdmin
    .from("employee_blocked_times")
    .delete()
    .eq("id", blockId)
    .eq("business_id", context.businessId)
    .eq("employee_id", id);

  if (error) {
    console.error("Error deleting employee blocked time:", error);
    return NextResponse.json(
      { error: "No se pudo eliminar el bloqueo del empleado." },
      { status: 500 }
    );
  }

  return NextResponse.json({ deleted: true });
}
