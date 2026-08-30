import { NextResponse } from "next/server";
import { getEmployeeRequestContext } from "../employees/_utils";

export const runtime = "nodejs";

type ServiceInput = {
  name: string;
  price: number;
  duration_minutes: number;
  is_active: boolean;
};

function normalizeServiceBody(body: unknown) {
  const service = body as Partial<ServiceInput> | null;
  const name = typeof service?.name === "string" ? service.name.trim() : "";
  const price = Number(service?.price);
  const durationMinutes = Number(service?.duration_minutes);

  if (!name) {
    return { error: "El nombre del servicio es obligatorio." };
  }

  if (!Number.isFinite(price) || price < 0) {
    return { error: "El precio del servicio no es valido." };
  }

  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 5 ||
    durationMinutes > 480
  ) {
    return { error: "La duracion del servicio no es valida." };
  }

  return {
    value: {
      name,
      price,
      duration_minutes: durationMinutes,
      is_active: service?.is_active !== false
    }
  };
}

export async function GET(request: Request) {
  const context = await getEmployeeRequestContext(request);

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { data, error } = await context.supabaseAdmin
    .from("services")
    .select("id, name, price, duration_minutes, is_active")
    .eq("business_id", context.businessId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error loading services:", error);
    return NextResponse.json(
      { error: "No se pudieron cargar los servicios." },
      { status: 500 }
    );
  }

  return NextResponse.json({ services: data ?? [] });
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
  const normalized = normalizeServiceBody(body);

  if ("error" in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const { data, error } = await context.supabaseAdmin
    .from("services")
    .insert({
      business_id: context.businessId,
      ...normalized.value
    })
    .select("id, name, price, duration_minutes, is_active")
    .single();

  if (error) {
    console.error("Error creating service:", error);
    return NextResponse.json(
      { error: "No se pudo anadir el servicio." },
      { status: 500 }
    );
  }

  return NextResponse.json({ service: data });
}
