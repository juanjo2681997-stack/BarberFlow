import { NextResponse } from "next/server";
import { getEmployeeRequestContext } from "../../employees/_utils";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

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
      is_active: service?.is_active === true
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

  const { id } = await routeContext.params;

  if (!id) {
    return NextResponse.json({ error: "Servicio no valido." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const normalized = normalizeServiceBody(body);

  if ("error" in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const { data, error } = await context.supabaseAdmin
    .from("services")
    .update(normalized.value)
    .eq("id", id)
    .eq("business_id", context.businessId)
    .select("id, name, price, duration_minutes, is_active")
    .maybeSingle();

  if (error) {
    console.error("Error updating service:", error);
    return NextResponse.json(
      { error: "No se pudo guardar el servicio." },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Servicio no encontrado." },
      { status: 404 }
    );
  }

  return NextResponse.json({ service: data });
}

export async function DELETE(_request: Request, routeContext: RouteContext) {
  const context = await getEmployeeRequestContext(_request);

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  if (!context.canManageEmployees) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { id } = await routeContext.params;

  if (!id) {
    return NextResponse.json({ error: "Servicio no valido." }, { status: 400 });
  }

  const { data, error } = await context.supabaseAdmin
    .from("services")
    .update({ is_active: false })
    .eq("id", id)
    .eq("business_id", context.businessId)
    .select("id, name, price, duration_minutes, is_active")
    .maybeSingle();

  if (error) {
    console.error("Error deactivating service:", error);
    return NextResponse.json(
      { error: "No se pudo desactivar el servicio." },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "Servicio no encontrado." },
      { status: 404 }
    );
  }

  return NextResponse.json({ service: data, deactivated: true });
}
