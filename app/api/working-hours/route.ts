import { NextResponse } from "next/server";
import { getEmployeeRequestContext } from "../employees/_utils";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const context = await getEmployeeRequestContext(request);

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { data, error } = await context.supabaseAdmin
    .from("working_hours")
    .select(
      "id, day_of_week, day_name, is_working, morning_start, morning_end, afternoon_start, afternoon_end, slot_minutes"
    )
    .eq("business_id", context.businessId)
    .order("day_of_week", { ascending: true });

  if (error) {
    console.error("Error loading working hours:", error);
    return NextResponse.json(
      { error: "No se pudieron cargar los horarios de trabajo." },
      { status: 500 }
    );
  }

  return NextResponse.json({ working_hours: data ?? [] });
}
