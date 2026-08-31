import { NextResponse } from "next/server";
import {
  cleanOptionalText,
  getEmployeeRequestContext
} from "../employees/_utils";

export const runtime = "nodejs";

function isDateValue(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeTime(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function normalizeBlockedTimeBody(body: unknown) {
  const row = body as {
    block_date?: unknown;
    is_full_day?: unknown;
    start_time?: unknown;
    end_time?: unknown;
    reason?: unknown;
  } | null;
  const blockDate = cleanOptionalText(row?.block_date);
  const isFullDay = row?.is_full_day === true;
  const startTime = normalizeTime(row?.start_time);
  const endTime = normalizeTime(row?.end_time);

  if (!isDateValue(blockDate)) {
    return { error: "La fecha del bloqueo no es valida." };
  }

  if (!isFullDay && (!startTime || !endTime || startTime >= endTime)) {
    return { error: "La franja horaria del bloqueo no es valida." };
  }

  return {
    value: {
      block_date: blockDate,
      is_full_day: isFullDay,
      start_time: isFullDay ? null : startTime,
      end_time: isFullDay ? null : endTime,
      reason: cleanOptionalText(row?.reason)
    }
  };
}

export async function GET(request: Request) {
  const context = await getEmployeeRequestContext(request);

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { data, error } = await context.supabaseAdmin
    .from("blocked_times")
    .select("id, block_date, is_full_day, start_time, end_time, reason")
    .eq("business_id", context.businessId)
    .order("block_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    console.error("Error loading blocked times:", error);
    return NextResponse.json(
      { error: "No se pudieron cargar los bloqueos." },
      { status: 500 }
    );
  }

  return NextResponse.json({ blocked_times: data ?? [] });
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
  const normalized = normalizeBlockedTimeBody(body);

  if ("error" in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const { data, error } = await context.supabaseAdmin
    .from("blocked_times")
    .insert({
      business_id: context.businessId,
      ...normalized.value
    })
    .select("id, block_date, is_full_day, start_time, end_time, reason")
    .single();

  if (error) {
    console.error("Error creating blocked time:", error);
    return NextResponse.json(
      { error: "No se pudo anadir el bloqueo." },
      { status: 500 }
    );
  }

  return NextResponse.json({ blocked_time: data });
}
