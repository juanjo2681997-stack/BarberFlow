import { NextResponse } from "next/server";
import {
  getEmployeeRequestContext,
  loadEmployeeForBusiness
} from "../../_utils";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type EmployeeWorkingHourInput = {
  id?: string;
  day_of_week: number;
  day_name: string;
  is_working: boolean;
  morning_start: string | null;
  morning_end: string | null;
  afternoon_start: string | null;
  afternoon_end: string | null;
  slot_minutes: number;
};

type NormalizedEmployeeWorkingHour = {
  id: string | null;
  day_of_week: number;
  day_name: string;
  is_working: boolean;
  morning_start: string | null;
  morning_end: string | null;
  afternoon_start: string | null;
  afternoon_end: string | null;
  slot_minutes: number;
};

const dayNames = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado"
];

function getDefaultEmployeeWorkingHours() {
  return dayNames.map((dayName, dayOfWeek) => ({
    id: "",
    day_of_week: dayOfWeek,
    day_name: dayName,
    is_working: false,
    morning_start: "",
    morning_end: "",
    afternoon_start: "",
    afternoon_end: "",
    slot_minutes: 15
  }));
}

function normalizeTime(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function normalizeWorkingHour(value: unknown): NormalizedEmployeeWorkingHour | null {
  const row = value as Partial<EmployeeWorkingHourInput>;
  const dayOfWeek = Number(row.day_of_week);
  const slotMinutes = Number(row.slot_minutes);

  if (
    !Number.isInteger(dayOfWeek) ||
    dayOfWeek < 0 ||
    dayOfWeek > 6 ||
    !Number.isFinite(slotMinutes) ||
    slotMinutes < 5
  ) {
    return null;
  }

  return {
    id: typeof row.id === "string" && row.id.trim() !== "" ? row.id : null,
    day_of_week: dayOfWeek,
    day_name:
      typeof row.day_name === "string" && row.day_name.trim() !== ""
        ? row.day_name.trim()
        : dayNames[dayOfWeek],
    is_working: row.is_working === true,
    morning_start: normalizeTime(row.morning_start),
    morning_end: normalizeTime(row.morning_end),
    afternoon_start: normalizeTime(row.afternoon_start),
    afternoon_end: normalizeTime(row.afternoon_end),
    slot_minutes: slotMinutes
  };
}

export async function GET(request: Request, routeContext: RouteContext) {
  const context = await getEmployeeRequestContext(request);

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { id } = await routeContext.params;

  if (!context.canManageEmployees && context.employeeId !== id) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }
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

  const { data, error } = await context.supabaseAdmin
    .from("employee_working_hours")
    .select(
      "id, day_of_week, day_name, is_working, morning_start, morning_end, afternoon_start, afternoon_end, slot_minutes"
    )
    .eq("business_id", context.businessId)
    .eq("employee_id", id)
    .order("day_of_week", { ascending: true });

  if (error) {
    console.error("Error loading employee working hours:", error);
    return NextResponse.json(
      { error: "No se pudieron cargar los horarios del empleado." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    working_hours:
      data && data.length > 0 ? data : getDefaultEmployeeWorkingHours()
  });
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
  const rows: Array<NormalizedEmployeeWorkingHour | null> = Array.isArray(
    body?.working_hours
  )
    ? body.working_hours.map(normalizeWorkingHour)
    : [];

  if (rows.length !== 7 || rows.some((row) => row === null)) {
    return NextResponse.json(
      { error: "Los horarios del empleado no son válidos." },
      { status: 400 }
    );
  }

  for (const row of rows) {
    if (!row) {
      continue;
    }

    if (row.id) {
      const { error } = await context.supabaseAdmin
        .from("employee_working_hours")
        .update({
          day_of_week: row.day_of_week,
          day_name: row.day_name,
          is_working: row.is_working,
          morning_start: row.morning_start,
          morning_end: row.morning_end,
          afternoon_start: row.afternoon_start,
          afternoon_end: row.afternoon_end,
          slot_minutes: row.slot_minutes
        })
        .eq("id", row.id)
        .eq("business_id", context.businessId)
        .eq("employee_id", id);

      if (error) {
        console.error("Error updating employee working hour:", error);
        return NextResponse.json(
          { error: "No se pudieron guardar los horarios del empleado." },
          { status: 500 }
        );
      }
    } else {
      const { error } = await context.supabaseAdmin
        .from("employee_working_hours")
        .insert({
          business_id: context.businessId,
          employee_id: id,
          day_of_week: row.day_of_week,
          day_name: row.day_name,
          is_working: row.is_working,
          morning_start: row.morning_start,
          morning_end: row.morning_end,
          afternoon_start: row.afternoon_start,
          afternoon_end: row.afternoon_end,
          slot_minutes: row.slot_minutes
        });

      if (error) {
        console.error("Error inserting employee working hour:", error);
        return NextResponse.json(
          { error: "No se pudieron guardar los horarios del empleado." },
          { status: 500 }
        );
      }
    }
  }

  const { data, error } = await context.supabaseAdmin
    .from("employee_working_hours")
    .select(
      "id, day_of_week, day_name, is_working, morning_start, morning_end, afternoon_start, afternoon_end, slot_minutes"
    )
    .eq("business_id", context.businessId)
    .eq("employee_id", id)
    .order("day_of_week", { ascending: true });

  if (error) {
    console.error("Error reloading employee working hours:", error);
    return NextResponse.json(
      { error: "Horarios guardados, pero no se pudieron recargar." },
      { status: 500 }
    );
  }

  return NextResponse.json({ working_hours: data ?? [] });
}
