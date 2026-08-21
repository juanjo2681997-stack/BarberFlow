export const TRIAL_DAYS = 14;

export type RegisterBusinessPayload = {
  business_name: string;
  owner_name: string;
  email: string;
  whatsapp_phone: string;
  address: string;
  instagram_url: string;
};

type CreatedEmployee = {
  id: string;
};

type CreatedService = {
  id: string;
};

type SupabaseAdminClient = {
  from: (table: string) => any;
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
  supabase: SupabaseAdminClient,
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

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);

  return nextDate;
}

export async function createBusinessForOwner(params: {
  supabase: SupabaseAdminClient;
  userId: string;
  payload: RegisterBusinessPayload;
}) {
  const { supabase, userId, payload } = params;
  const slug = await getUniqueSlug(supabase, payload.business_name);
  const trialStartedAt = new Date();
  const trialEndsAt = addDays(trialStartedAt, TRIAL_DAYS);

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .insert({
      name: payload.business_name,
      slug,
      plan_status: "demo",
      plan_name: "free_trial",
      subscription_status: "trialing",
      trial_started_at: trialStartedAt.toISOString(),
      trial_ends_at: trialEndsAt.toISOString(),
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
      email: payload.email,
      role: "owner"
    });

  if (businessUserError) {
    throw new Error(businessUserError.message);
  }

  const { data: ownerEmployee, error: employeeError } = await supabase
    .from("employees")
    .insert({
      business_id: businessId,
      user_id: userId,
      display_name: payload.owner_name,
      email: payload.email,
      role: "owner",
      is_active: true,
      login_enabled: true,
      receives_bookings: true
    })
    .select("id")
    .single();

  if (employeeError || !ownerEmployee) {
    throw new Error(
      employeeError?.message ?? "No se pudo crear el empleado propietario."
    );
  }

  const employeeId = (ownerEmployee as CreatedEmployee).id;

  const { error: linkEmployeeError } = await supabase
    .from("business_users")
    .update({
      employee_id: employeeId
    })
    .eq("business_id", businessId)
    .eq("user_id", userId);

  if (linkEmployeeError) {
    throw new Error(linkEmployeeError.message);
  }

  const { error: settingsError } = await supabase
    .from("business_settings")
    .insert({
      business_id: businessId,
      business_name: payload.business_name,
      barber_name: payload.owner_name,
      slogan: "Reserva tu corte en menos de 30 segundos",
      whatsapp_phone: payload.whatsapp_phone,
      whatsapp_message: "Hola, quiero reservar una cita en {business_name}.",
      instagram_url: payload.instagram_url,
      address: payload.address,
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

  const { data: createdServices, error: servicesError } = await supabase
    .from("services")
    .insert(
      initialServices.map((service) => ({
        ...service,
        is_active: true,
        business_id: businessId
      }))
    )
    .select("id");

  if (servicesError) {
    throw new Error(servicesError.message);
  }

  const services = (createdServices ?? []) as CreatedService[];

  if (services.length > 0) {
    const { error: employeeServicesError } = await supabase
      .from("employee_services")
      .insert(
        services.map((service) => ({
          business_id: businessId,
          employee_id: employeeId,
          service_id: service.id,
          is_enabled: true
        }))
      );

    if (employeeServicesError) {
      throw new Error(employeeServicesError.message);
    }
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

  const { error: employeeWorkingHoursError } = await supabase
    .from("employee_working_hours")
    .insert(
      initialWorkingHours.map((workingHour) => ({
        ...workingHour,
        business_id: businessId,
        employee_id: employeeId
      }))
    );

  if (employeeWorkingHoursError) {
    throw new Error(employeeWorkingHoursError.message);
  }

  return {
    id: businessId,
    name: payload.business_name,
    slug
  };
}
