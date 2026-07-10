import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type BookingLimitMode = "days" | "weeks" | "months";

function isBookingLimitMode(value: unknown): value is BookingLimitMode {
  return value === "days" || value === "weeks" || value === "months";
}

function isBoolean(value: unknown) {
  return typeof value === "boolean";
}

function toPositiveNumber(value: unknown) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) && numberValue >= 1 ? numberValue : null;
}

function toWeekDay(value: unknown) {
  const numberValue = Number(value);

  return Number.isInteger(numberValue) && numberValue >= 0 && numberValue <= 6
    ? numberValue
    : null;
}

export async function PATCH(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Faltan variables de entorno de Supabase." },
      { status: 500 }
    );
  }

  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  if (!token) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
  const {
    data: { user },
    error: userError
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { data: adminUser, error: adminError } = await supabaseAdmin
    .from("admin_users")
    .select("*")
    .or(`user_id.eq.${user.id},email.eq.${user.email ?? ""}`)
    .limit(1)
    .maybeSingle();

  if (adminError) {
    console.error("Error checking admin user:", adminError);
    return NextResponse.json(
      { error: "No se pudo comprobar el administrador." },
      { status: 500 }
    );
  }

  if (!adminUser) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const body = await request.json();
  let businessId = typeof body.business_id === "string" ? body.business_id : "";

  if (!businessId && body.id) {
    const { data: settingsBusiness, error: settingsBusinessError } =
      await supabaseAdmin
        .from("business_settings")
        .select("business_id")
        .eq("id", body.id)
        .maybeSingle();

    if (settingsBusinessError) {
      console.error("Error loading business settings business:", settingsBusinessError);
      return NextResponse.json(
        { error: "No se pudo comprobar la barbería." },
        { status: 500 }
      );
    }

    businessId = settingsBusiness?.business_id ?? "";
  }

  const bookingLimitValue = toPositiveNumber(body.booking_limit_value);
  const weeklyReleaseDay = toWeekDay(body.weekly_release_day);
  const weeklyReleaseWindowDays = toPositiveNumber(
    body.weekly_release_window_days
  );

  if (
    !body.id ||
    !businessId ||
    !isBoolean(body.booking_limit_enabled) ||
    bookingLimitValue === null ||
    !isBookingLimitMode(body.booking_limit_mode) ||
    !isBoolean(body.weekly_release_enabled) ||
    weeklyReleaseDay === null ||
    weeklyReleaseWindowDays === null
  ) {
    return NextResponse.json(
      { error: "Datos de configuración de reservas no válidos." },
      { status: 400 }
    );
  }

  let businessUserResult = await supabaseAdmin
    .from("business_users")
    .select("business_id")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!businessUserResult.data && user.email) {
    businessUserResult = await supabaseAdmin
      .from("business_users")
      .select("business_id")
      .eq("business_id", businessId)
      .eq("email", user.email)
      .limit(1)
      .maybeSingle();
  }

  if (businessUserResult.error) {
    console.error("Error checking business user:", businessUserResult.error);
    return NextResponse.json(
      { error: "No se pudo comprobar la barbería del administrador." },
      { status: 500 }
    );
  }

  if (!businessUserResult.data) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("business_settings")
    .update({
      business_name: String(body.business_name ?? "").trim(),
      slogan: String(body.slogan ?? "").trim(),
      whatsapp_phone: String(body.whatsapp_phone ?? "").trim(),
      whatsapp_message: String(body.whatsapp_message ?? "").trim(),
      instagram_url: String(body.instagram_url ?? "").trim(),
      address: String(body.address ?? "").trim(),
      main_button_text: String(body.main_button_text ?? "").trim(),
      booking_limit_enabled: body.booking_limit_enabled,
      booking_limit_value: bookingLimitValue,
      booking_limit_mode: body.booking_limit_mode,
      weekly_release_enabled: body.weekly_release_enabled,
      weekly_release_day: weeklyReleaseDay,
      weekly_release_window_days: weeklyReleaseWindowDays,
      updated_at: new Date().toISOString()
    })
    .eq("id", body.id)
    .eq("business_id", businessId)
    .select()
    .single();

  if (error) {
    console.error("Error updating business settings:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ business_settings: data });
}
