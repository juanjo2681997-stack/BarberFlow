import { NextResponse } from "next/server";
import {
  getBearerToken,
  getSupabaseAdmin,
  validateSuperadmin
} from "../../_utils";

export const runtime = "nodejs";

type PlanStatus = "demo" | "active" | "inactive";

function isPlanStatus(value: unknown): value is PlanStatus {
  return value === "demo" || value === "active" || value === "inactive";
}

async function deleteBusinessRows(
  supabaseAdmin: any,
  table: string,
  businessId: string
) {
  const { error } = await supabaseAdmin
    .from(table)
    .delete()
    .eq("business_id", businessId);

  if (error) {
    console.error(`Error deleting ${table} for business:`, error);
    throw new Error(`No se pudieron eliminar los datos de ${table}.`);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Faltan variables de entorno de Supabase." },
      { status: 500 }
    );
  }

  const validation = await validateSuperadmin(
    supabaseAdmin,
    getBearerToken(request)
  );

  if (!validation.isValid) {
    return NextResponse.json(
      { error: validation.error },
      { status: validation.status }
    );
  }

  const { id } = await context.params;
  const body = await request.json();

  if (!id) {
    return NextResponse.json(
      { error: "Falta la barbería." },
      { status: 400 }
    );
  }

  if (
    !isPlanStatus(body.plan_status) ||
    typeof body.public_booking_enabled !== "boolean"
  ) {
    return NextResponse.json(
      { error: "Datos de barbería no válidos." },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("businesses")
    .update({
      plan_status: body.plan_status,
      public_booking_enabled: body.public_booking_enabled
    })
    .eq("id", id)
    .select(
      "id, name, slug, plan_status, public_booking_enabled, trial_started_at, trial_ends_at, subscription_started_at, subscription_ends_at, subscription_status, plan_name, profile_image_url, created_at"
    )
    .single();

  if (error) {
    console.error("Error updating superadmin business:", error);
    return NextResponse.json(
      { error: "No se pudo actualizar la barbería." },
      { status: 500 }
    );
  }

  return NextResponse.json({ business: data });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Faltan variables de entorno de Supabase." },
      { status: 500 }
    );
  }

  const validation = await validateSuperadmin(
    supabaseAdmin,
    getBearerToken(request)
  );

  if (!validation.isValid) {
    return NextResponse.json(
      { error: validation.error },
      { status: validation.status }
    );
  }

  const { id } = await context.params;

  if (!id) {
    return NextResponse.json(
      { error: "Falta la barbería." },
      { status: 400 }
    );
  }

  const { data: business, error: businessError } = await supabaseAdmin
    .from("businesses")
    .select("id, name, slug, plan_status")
    .eq("id", id)
    .maybeSingle();

  if (businessError) {
    console.error("Error loading business before delete:", businessError);
    return NextResponse.json(
      { error: "No se pudo comprobar la barbería." },
      { status: 500 }
    );
  }

  if (!business) {
    return NextResponse.json(
      { error: "No se encontró la barbería." },
      { status: 404 }
    );
  }

  if (business.plan_status !== "inactive") {
    return NextResponse.json(
      { error: "La barbería debe estar inactiva antes de poder eliminarla." },
      { status: 400 }
    );
  }

  try {
    await deleteBusinessRows(supabaseAdmin, "push_subscriptions", id);
    await deleteBusinessRows(supabaseAdmin, "appointment_slots", id);
    await deleteBusinessRows(supabaseAdmin, "reviews", id);
    await deleteBusinessRows(supabaseAdmin, "blocked_times", id);
    await deleteBusinessRows(supabaseAdmin, "working_hours", id);
    await deleteBusinessRows(supabaseAdmin, "services", id);
    await deleteBusinessRows(supabaseAdmin, "business_settings", id);
    await deleteBusinessRows(supabaseAdmin, "appointments", id);
    await deleteBusinessRows(supabaseAdmin, "business_users", id);

    const { error: deleteBusinessError } = await supabaseAdmin
      .from("businesses")
      .delete()
      .eq("id", id)
      .eq("plan_status", "inactive");

    if (deleteBusinessError) {
      console.error("Error deleting business:", deleteBusinessError);
      return NextResponse.json(
        { error: "No se pudo eliminar la barbería." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      business
    });
  } catch (error) {
    console.error("Error deleting business data:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo eliminar la barbería."
      },
      { status: 500 }
    );
  }
}
