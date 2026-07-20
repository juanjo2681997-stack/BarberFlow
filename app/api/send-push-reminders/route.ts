import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

export const runtime = "nodejs";

type Appointment = {
  id: string;
  business_id: string | null;
  appointment_time: string;
  customer_name: string;
  service: string;
};

type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

type BusinessSettingsRow = {
  business_name: string | null;
};

type SupabaseAdminClient = NonNullable<ReturnType<typeof getAdminClient>>;

function formatDateForSupabase(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatAppointmentTime(time: string) {
  return time.slice(0, 5);
}

function getTomorrowDate() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  return formatDateForSupabase(tomorrow);
}

function getMadridCurrentDateTime() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  const parts = formatter.formatToParts(new Date());
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return {
    today: `${value("year")}-${value("month")}-${value("day")}`,
    currentTime: `${value("hour")}:${value("minute")}`
  };
}

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

async function markReminder(
  supabase: SupabaseAdminClient,
  appointmentId: string,
  businessId: string | null,
  status: "sent" | "failed",
  errorMessage: string | null
) {
  let query = supabase
    .from("appointments")
    .update({
      reminder_status: status,
      reminder_sent_at: status === "sent" ? new Date().toISOString() : null,
      reminder_error: errorMessage
    })
    .eq("id", appointmentId);

  if (businessId) {
    query = query.eq("business_id", businessId);
  }

  await query;
}

async function cleanupExpiredBlockedTimes(supabase: SupabaseAdminClient) {
  const { today, currentTime } = getMadridCurrentDateTime();

  const { error: pastDateError, count: pastDateCount } = await supabase
    .from("blocked_times")
    .delete({ count: "exact" })
    .lt("block_date", today);

  if (pastDateError) {
    console.error("Error cleaning expired blocked times:", pastDateError);
    return {
      deleted: 0,
      today,
      currentTime,
      error: pastDateError.message
    };
  }

  const { error: todayError, count: todayCount } = await supabase
    .from("blocked_times")
    .delete({ count: "exact" })
    .eq("block_date", today)
    .not("end_time", "is", null)
    .lte("end_time", currentTime);

  if (todayError) {
    console.error("Error cleaning expired blocked times:", todayError);
    return {
      deleted: pastDateCount ?? 0,
      today,
      currentTime,
      error: todayError.message
    };
  }

  return {
    deleted: (pastDateCount ?? 0) + (todayCount ?? 0),
    today,
    currentTime,
    error: null
  };
}

async function handleSendPushReminders(request: Request) {
  const allowedSecrets = [
    process.env.PUSH_REMINDER_SECRET,
    process.env.CRON_SECRET
  ].filter(Boolean);
  const authorization = request.headers.get("authorization");
  const userAgent = request.headers.get("user-agent") || "";
  const isAuthorized = allowedSecrets.some(
    (secret) => authorization === `Bearer ${secret}`
  );
  const isVercelCron = userAgent.toLowerCase().includes("vercel-cron");
  const isVercelCronWithoutAuthorization = !authorization && isVercelCron;

  if (!isAuthorized && !isVercelCronWithoutAuthorization) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabase = getAdminClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Faltan variables de entorno de Supabase." },
      { status: 500 }
    );
  }

  const cleanupResult = await cleanupExpiredBlockedTimes(supabase);
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;

  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return NextResponse.json(
      {
        error: "Faltan variables de entorno para enviar notificaciones.",
        cleanup: cleanupResult
      },
      { status: 500 }
    );
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const tomorrow = getTomorrowDate();

  const { data: appointments, error: appointmentsError } = await supabase
    .from("appointments")
    .select("id, business_id, appointment_time, customer_name, service")
    .eq("appointment_date", tomorrow)
    .eq("reminder_status", "pending")
    .order("appointment_time", { ascending: true });

  if (appointmentsError) {
    return NextResponse.json({ error: appointmentsError.message }, { status: 500 });
  }

  const results = [];
  const businessNameCache = new Map<string, string>();

  for (const appointment of (appointments ?? []) as Appointment[]) {
    try {
      let subscriptionQuery = supabase
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("appointment_id", appointment.id)
        .order("created_at", { ascending: false })
        .limit(1);

      if (appointment.business_id) {
        subscriptionQuery = subscriptionQuery.eq(
          "business_id",
          appointment.business_id
        );
      }

      const { data: subscription, error: subscriptionError } =
        await subscriptionQuery.maybeSingle();

      if (subscriptionError) {
        throw new Error(subscriptionError.message);
      }

      if (!subscription) {
        throw new Error("No hay suscripción push para esta cita.");
      }

      let businessName = "Pablo's Barbershop";

      if (appointment.business_id) {
        const cachedBusinessName = businessNameCache.get(appointment.business_id);

        if (cachedBusinessName) {
          businessName = cachedBusinessName;
        } else {
          const { data: settings } = await supabase
            .from("business_settings")
            .select("business_name")
            .eq("business_id", appointment.business_id)
            .limit(1)
            .maybeSingle();
          const settingsRow = settings as BusinessSettingsRow | null;
          businessName = settingsRow?.business_name || businessName;
          businessNameCache.set(appointment.business_id, businessName);
        }
      }

      const pushSubscription = subscription as PushSubscriptionRow;
      const appointmentTime = formatAppointmentTime(appointment.appointment_time);
      const body = `Hola ${appointment.customer_name}, te recordamos tu cita de mañana en ${businessName} a las ${appointmentTime} para ${appointment.service}.`;

      await webpush.sendNotification(
        {
          endpoint: pushSubscription.endpoint,
          keys: {
            p256dh: pushSubscription.p256dh,
            auth: pushSubscription.auth
          }
        },
        JSON.stringify({
          title: "Recordatorio de cita",
          body,
          url: "/"
        })
      );

      await markReminder(supabase, appointment.id, appointment.business_id, "sent", null);
      results.push({ appointment_id: appointment.id, status: "sent" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo enviar.";

      await markReminder(
        supabase,
        appointment.id,
        appointment.business_id,
        "failed",
        message
      );
      results.push({ appointment_id: appointment.id, status: "failed", error: message });
    }
  }

  return NextResponse.json({ ok: true, date: tomorrow, cleanup: cleanupResult, results });
}

export async function GET(request: Request) {
  return handleSendPushReminders(request);
}

export async function POST(request: Request) {
  return handleSendPushReminders(request);
}

