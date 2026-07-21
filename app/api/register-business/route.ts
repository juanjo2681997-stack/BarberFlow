import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type RegisterBusinessBody = {
  business_name?: string;
  owner_name?: string;
  email?: string;
  password?: string;
  whatsapp_phone?: string;
  address?: string;
  instagram_url?: string;
};

const defaultBlockCancellationMessage =
  "Hola {nombre}, sentimos avisarte de que tu cita del día {fecha} a las {hora}, ha sido cancelada porque la barbería no estará disponible en ese horario. Disculpa las molestias.";

const initialServices = [
  { name: "Corte clásico", price: 12, duration_minutes: 30 },
  { name: "Degradado", price: 15, duration_minutes: 45 },
  { name: "Corte + barba", price: 20, duration_minutes: 60 },
  { name: "Barba", price: 8, duration_minutes: 20 }
];

const initialWorkingHours = [
  {
    day_of_week: 0,
    day_name: "Domingo",
    is_working: false,
    morning_start: null,
    morning_end: null,
    afternoon_start: null,
    afternoon_end: null,
    slot_minutes: 15
  },
  {
    day_of_week: 1,
    day_name: "Lunes",
    is_working: true,
    morning_start: "10:00",
    morning_end: "14:00",
    afternoon_start: "16:00",
    afternoon_end: "20:00",
    slot_minutes: 15
  },
  {
    day_of_week: 2,
    day_name: "Martes",
    is_working: true,
    morning_start: "10:00",
    morning_end: "14:00",
    afternoon_start: "16:00",
    afternoon_end: "20:00",
    slot_minutes: 15
  },
  {
    day_of_week: 3,
    day_name: "Miércoles",
    is_working: true,
    morning_start: "10:00",
    morning_end: "14:00",
    afternoon_start: "16:00",
    afternoon_end: "20:00",
    slot_minutes: 15
  },
  {
    day_of_week: 4,
    day_name: "Jueves",
    is_working: true,
    morning_start: "10:00",
    morning_end: "14:00",
    afternoon_start: "16:00",
    afternoon_end: "20:00",
    slot_minutes: 15
  },
  {
    day_of_week: 5,
    day_name: "Viernes",
    is_working: true,
    morning_start: "10:00",
    morning_end: "14:00",
    afternoon_start: "16:00",
    afternoon_end: "20:00",
    slot_minutes: 15
  },
  {
    day_of_week: 6,
    day_name: "Sábado",
    is_working: true,
    morning_start: "10:00",
    morning_end: "14:00",
    afternoon_start: null,
    afternoon_end: null,
    slot_minutes: 15
  }
];

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function slugify(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  return slug || "barberia";
}

async function getUniqueSlug(
  supabase: NonNullable<ReturnType<typeof getAdminClient>>,
  businessName: string
) {
  const baseSlug = slugify(businessName);

  for (let index = 1; index <= 100; index += 1) {
    const nextSlug = index === 1 ? baseSlug : `${baseSlug}-${index}`;
    const { data, error } = await supabase
      .from("businesses")
      .select("id")
      .eq("slug", nextSlug)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return nextSlug;
    }
  }

  return `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado.";
}

export async function POST(request: Request) {
  const supabase = getAdminClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Faltan variables de entorno de Supabase." },
      { status: 500 }
    );
  }

  try {
    const body = (await request.json()) as RegisterBusinessBody;
    const businessName = cleanText(body.business_name);
    const ownerName = cleanText(body.owner_name);
    const email = cleanText(body.email).toLowerCase();
    const password = cleanText(body.password);
    const whatsappPhone = cleanText(body.whatsapp_phone);
    const address = cleanText(body.address);
    const instagramUrl = cleanText(body.instagram_url);

    if (!businessName || !ownerName || !email || !password) {
      return NextResponse.json(
        { error: "Rellena nombre de barbería, responsable, email y contraseña." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 8 caracteres." },
        { status: 400 }
      );
    }

    const { data: userData, error: userError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: ownerName,
          business_name: businessName
        }
      });

    if (userError || !userData.user) {
      const message = userError?.message ?? "No se pudo crear el usuario.";

      return NextResponse.json(
        {
          error: message.toLowerCase().includes("already")
            ? "Ya existe una cuenta con ese email."
            : message
        },
        { status: 400 }
      );
    }

    const userId = userData.user.id;
    const slug = await getUniqueSlug(supabase, businessName);

    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .insert({
        name: businessName,
        slug,
        plan_status: "demo",
        public_booking_enabled: true
      })
      .select("id, name, slug")
      .single();

    if (businessError || !business) {
      throw new Error(businessError?.message ?? "No se pudo crear la barbería.");
    }

    const businessId = business.id;

    const { error: businessUserError } = await supabase
      .from("business_users")
      .insert({
        business_id: businessId,
        user_id: userId,
        email,
        role: "owner"
      });

    if (businessUserError) {
      throw new Error(businessUserError.message);
    }

    const { error: settingsError } = await supabase
      .from("business_settings")
      .insert({
        business_id: businessId,
        business_name: businessName,
        slogan: "Reserva tu corte en menos de 30 segundos",
        whatsapp_phone: whatsappPhone,
        whatsapp_message: "Hola, quiero reservar una cita en {business_name}.",
        instagram_url: instagramUrl,
        address,
        main_button_text: "Reservar cita",
        booking_limit_mode: "days",
        booking_limit_value: 31,
        booking_limit_enabled: true,
        weekly_release_enabled: false,
        weekly_release_day: 1,
        weekly_release_window_days: 7,
        block_cancellation_message: defaultBlockCancellationMessage
      });

    if (settingsError) {
      throw new Error(settingsError.message);
    }

    const { error: servicesError } = await supabase.from("services").insert(
      initialServices.map((service) => ({
        ...service,
        is_active: true,
        business_id: businessId
      }))
    );

    if (servicesError) {
      throw new Error(servicesError.message);
    }

    const { error: workingHoursError } = await supabase
      .from("working_hours")
      .insert(
        initialWorkingHours.map((workingHour) => ({
          ...workingHour,
          business_id: businessId
        }))
      );

    if (workingHoursError) {
      throw new Error(workingHoursError.message);
    }

    return NextResponse.json({
      ok: true,
      business: {
        id: businessId,
        name: businessName,
        slug
      },
      email,
      public_url: `/barberia/${slug}`,
      panel_url: "/panel"
    });
  } catch (error) {
    console.error("Error registering business:", error);

    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
