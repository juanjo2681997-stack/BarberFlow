import { NextResponse } from "next/server";
import { getEmployeeRequestContext } from "../../employees/_utils";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type WorkingHourInput = {
  is_working: boolean;
  morning_start: string | null;
  morning_end: string | null;
  afternoon_start: string | null;
  afternoon_end: string | null;
  slot_minutes: number;
};

function normalizeOptionalTime(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed === "" ? null : trimmed;
}

function normalizeWorkingHourBody(body: unknown) {
  const workingHour = body as Partial<WorkingHourInput> | null;
  const slotMinutes = Number(workingHour?.slot_minutes);

  if (
    !Number.isInteger(slotMinutes) ||
    slotMinutes < 5 ||
    slotMinutes > 240 ||
    slotMinutes % 5 !== 0
  ) {
    return { error: "El intervalo entre huecos no es valido." };
  }

  return {
    value: {
      is_working: workingHour?.is_working === true,
      morning_start: normalizeOptionalTime(workingHour?.morning_start),
      morning_end: normalizeOptionalTime(workingHour?.morning_end),
      afternoon_start: normalizeOptionalTime(workingHour?.afternoon_start),
      afternoon_end: normalizeOptionalTime(workingHour?.afternoon_end),
      slot_minutes: slotMinutes
    }
  };
}

export async function GET(request: Request, routeContext: RouteContext) {
  const context = await getEmployeeRequestContext(request);

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { id } = await routeContext.params;

  if (!id) {
    return NextResponse.json({ error: "Horario no valido." }, { status: 400 });
  }

  const { data, error } = await context.supabaseAdmin
    .from("working_hours")
    .select(
      "id, day_of_week, day_name, is_working, morning_start, morning_end, afternoon_start, afternoon_end, slot_minutes"
    )
    .eq("id", id)
    .eq("business_id", context.businessId)
    .maybeSingle();

  if (error) {
    console.error("Error loading working hour:", error);
    return NextResponse.json(
      { error: "No se pudo cargar el horario actual." },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Horario no encontrado." },
      { status: 404 }
    );
  }

  return NextResponse.json({ working_hour: data });
}

export async function PATCH(request: Request, routeContext: RouteContext) {
  const context = await getEmployeeRequestContext(request);

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  if (!context.canManageEmployees) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { id } = await routeContext.params;

  if (!id) {
    return NextResponse.json({ error: "Horario no valido." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const normalized = normalizeWorkingHourBody(body);

  if ("error" in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const { data, error } = await context.supabaseAdmin
    .from("working_hours")
    .update(normalized.value)
    .eq("id", id)
    .eq("business_id", context.businessId)
    .select(
      "id, day_of_week, day_name, is_working, morning_start, morning_end, afternoon_start, afternoon_end, slot_minutes"
    )
    .maybeSingle();

  if (error) {
    console.error("Error updating working hour:", error);
    return NextResponse.json(
      { error: "No se pudo actualizar el horario." },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Horario no encontrado." },
      { status: 404 }
    );
  }

  return NextResponse.json({ working_hour: data });
}
