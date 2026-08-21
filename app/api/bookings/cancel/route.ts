import { NextResponse } from "next/server";
import webpush from "web-push";
import { sendEmail } from "@/lib/email/sendEmail";
import {
  cleanText,
  getAuthenticatedUser
} from "../../profile-activation/_utils";

export const runtime = "nodejs";

const cancellationLimitHours = 24;
const madridTimeZone = "Europe/Madrid";
const barberCancellationAppointmentPrefix = "barber-cancellations:";
const barberCancellationCustomerPhone = "barber";

type CancelBookingBody = {
  appointmentId?: string;
};

type Appointment = {
  id: string;
  business_id: string;
  customer_user_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  service: string;
  appointment_date: string;
  appointment_time: string;
  duration_minutes: number | null;
  status: string | null;
  appointment_status: string | null;
};

type Business = {
  id: string;
  name: string | null;
};

type BusinessSettings = {
  business_name: string | null;
};

type OwnerContact = {
  email: string | null;
};

type EmployeeOwnerContact = {
  display_name: string | null;
  email: string | null;
};

type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

type SupabaseAdminClient = {
  from: (table: string) => any;
};

function formatAppointmentTime(value: string) {
  return value.slice(0, 5);
}

function getSafeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido";
}

function isCancelled(appointment: Appointment) {
  return (
    appointment.status === "cancelled" ||
    appointment.appointment_status === "cancelled"
  );
}

function getMadridDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: madridTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const getPart = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: getPart("year"),
    month: getPart("month"),
    day: getPart("day"),
    hour: getPart("hour"),
    minute: getPart("minute"),
    second: getPart("second")
  };
}

function getMadridNowTime() {
  const now = getMadridDateParts(new Date());

  return Date.UTC(
    now.year,
    now.month - 1,
    now.day,
    now.hour,
    now.minute,
    now.second
  );
}

function getAppointmentTime(appointment: Appointment) {
  const [year, month, day] = appointment.appointment_date.split("-").map(Number);
  const [hour, minute] = formatAppointmentTime(appointment.appointment_time)
    .split(":")
    .map(Number);

  return Date.UTC(year, month - 1, day, hour, minute, 0);
}

function canCustomerCancel(appointment: Appointment) {
  return (
    getAppointmentTime(appointment) - getMadridNowTime() >=
    cancellationLimitHours * 60 * 60 * 1000
  );
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function getUniqueEmails(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .map(normalizeEmail)
        .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    )
  );
}

function getBarberCancellationAppointmentId(businessId: string) {
  return `${barberCancellationAppointmentPrefix}${businessId}`;
}

async function sendBarberCancellationPush(params: {
  supabaseAdmin: SupabaseAdminClient;
  appointment: Appointment;
  businessName: string;
}) {
  const { supabaseAdmin, appointment, businessName } = params;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;

  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    console.warn("Customer cancellation push skipped: missing VAPID config.", {
      appointmentId: appointment.id,
      businessId: appointment.business_id
    });

    return false;
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const { data: subscriptions, error: subscriptionsError } = await supabaseAdmin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("business_id", appointment.business_id)
    .eq(
      "appointment_id",
      getBarberCancellationAppointmentId(appointment.business_id)
    )
    .eq("customer_phone", barberCancellationCustomerPhone);

  if (subscriptionsError) {
    console.error("Error loading barber cancellation push subscriptions:", {
      appointmentId: appointment.id,
      businessId: appointment.business_id,
      message: subscriptionsError.message
    });

    return false;
  }

  const pushSubscriptions = (subscriptions ?? []) as PushSubscriptionRow[];

  if (pushSubscriptions.length === 0) {
    console.info("Customer cancellation push skipped: no barber subscription.", {
      appointmentId: appointment.id,
      businessId: appointment.business_id
    });

    return false;
  }

  let sentCount = 0;

  for (const subscription of pushSubscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth
          }
        },
        JSON.stringify({
          title: "Reserva cancelada",
          body: "Revisa tu correo, tienes una reserva cancelada.",
          url: "/panel",
          businessName
        })
      );

      sentCount += 1;
    } catch (pushError) {
      const statusCode =
        typeof pushError === "object" &&
        pushError !== null &&
        "statusCode" in pushError
          ? Number((pushError as { statusCode?: unknown }).statusCode)
          : null;

      console.error("Error sending customer cancellation push:", {
        appointmentId: appointment.id,
        businessId: appointment.business_id,
        statusCode,
        message: getSafeErrorMessage(pushError)
      });

      if (statusCode === 404 || statusCode === 410) {
        await supabaseAdmin
          .from("push_subscriptions")
          .delete()
          .eq("business_id", appointment.business_id)
          .eq("endpoint", subscription.endpoint);
      }
    }
  }

  console.info("Customer cancellation push processed:", {
    appointmentId: appointment.id,
    businessId: appointment.business_id,
    subscriptionCount: pushSubscriptions.length,
    sentCount
  });

  return sentCount > 0;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | CancelBookingBody
      | null;
    const appointmentId = cleanText(body?.appointmentId);

    if (!appointmentId) {
      return NextResponse.json(
        { error: "Falta la cita que quieres cancelar." },
        { status: 400 }
      );
    }

    const { supabaseAdmin, user, error: authError } =
      await getAuthenticatedUser(request);

    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    const { data: appointment, error: appointmentError } = await supabaseAdmin
      .from("appointments")
      .select(
        "id, business_id, customer_user_id, customer_name, customer_phone, service, appointment_date, appointment_time, duration_minutes, status, appointment_status"
      )
      .eq("id", appointmentId)
      .eq("customer_user_id", user.id)
      .maybeSingle();

    if (appointmentError) {
      console.error("Error loading appointment for customer cancellation:", {
        appointmentId,
        userId: user.id,
        message: appointmentError.message
      });

      return NextResponse.json(
        { error: "No se pudo cargar la cita." },
        { status: 500 }
      );
    }

    if (!appointment) {
      return NextResponse.json(
        { error: "No se encontro la cita." },
        { status: 404 }
      );
    }

    const safeAppointment = appointment as Appointment;

    if (isCancelled(safeAppointment)) {
      return NextResponse.json({ ok: true, alreadyCancelled: true });
    }

    if (!canCustomerCancel(safeAppointment)) {
      return NextResponse.json(
        {
          error:
            "Solo puedes cancelar una cita si faltan al menos 24 horas para la hora reservada."
        },
        { status: 400 }
      );
    }

    const cancelledAt = new Date().toISOString();
    const cancellationReason = "Cancelada por el cliente";
    const { data: cancelledAppointment, error: cancelError } =
      await supabaseAdmin
        .from("appointments")
        .update({
          status: "cancelled",
          appointment_status: "cancelled",
          status_updated_at: cancelledAt,
          cancelled_at: cancelledAt,
          cancellation_reason: cancellationReason,
          whatsapp_cancel_notified_at: cancelledAt
        })
        .eq("id", safeAppointment.id)
        .eq("business_id", safeAppointment.business_id)
        .eq("customer_user_id", user.id)
        .or("status.is.null,status.neq.cancelled")
        .or("appointment_status.is.null,appointment_status.neq.cancelled")
        .select(
          "id, business_id, customer_name, customer_phone, service, appointment_date, appointment_time, duration_minutes"
        )
        .maybeSingle();

    if (cancelError) {
      console.error("Error cancelling appointment by customer:", {
        appointmentId: safeAppointment.id,
        businessId: safeAppointment.business_id,
        userId: user.id,
        message: cancelError.message
      });

      return NextResponse.json(
        { error: "No se pudo cancelar la cita." },
        { status: 500 }
      );
    }

    if (!cancelledAppointment) {
      return NextResponse.json({ ok: true, alreadyCancelled: true });
    }

    const [{ data: business }, { data: businessSettings }, ownersResult] =
      await Promise.all([
        supabaseAdmin
          .from("businesses")
          .select("id, name")
          .eq("id", safeAppointment.business_id)
          .maybeSingle(),
        supabaseAdmin
          .from("business_settings")
          .select("business_name")
          .eq("business_id", safeAppointment.business_id)
          .maybeSingle(),
        supabaseAdmin
          .from("business_users")
          .select("email")
          .eq("business_id", safeAppointment.business_id)
          .eq("role", "owner")
      ]);

    const { data: employeeOwners } = await supabaseAdmin
      .from("employees")
      .select("display_name, email")
      .eq("business_id", safeAppointment.business_id)
      .eq("role", "owner")
      .eq("is_active", true);

    const safeBusiness = business as Business | null;
    const safeBusinessSettings = businessSettings as BusinessSettings | null;
    const ownerContacts = (ownersResult.data ?? []) as OwnerContact[];
    const employeeOwnerContacts =
      (employeeOwners ?? []) as EmployeeOwnerContact[];
    const ownerEmails = getUniqueEmails([
      ...ownerContacts.map((owner) => owner.email),
      ...employeeOwnerContacts.map((owner) => owner.email)
    ]);
    const businessName =
      cleanText(safeBusinessSettings?.business_name) ||
      cleanText(safeBusiness?.name) ||
      "flowbarber";
    const ownerName =
      cleanText(employeeOwnerContacts[0]?.display_name) || businessName;
    const appointmentForEmail = cancelledAppointment as Appointment;
    let emailSent = false;

    if (ownerEmails.length === 0) {
      console.warn("Customer cancellation email skipped: missing owner email.", {
        appointmentId: safeAppointment.id,
        businessId: safeAppointment.business_id
      });
    } else {
      try {
        await sendEmail({
          to: ownerEmails,
          subject: `Reserva cancelada por ${appointmentForEmail.customer_name}`,
          template: "CustomerBookingCancelled",
          idempotencyKey: `customer-booking-cancelled/${safeAppointment.id}`,
          props: {
            barberName: ownerName,
            customerName: appointmentForEmail.customer_name,
            customerPhone:
              cleanText(appointmentForEmail.customer_phone) || undefined,
            businessName,
            service: appointmentForEmail.service,
            date: appointmentForEmail.appointment_date,
            time: formatAppointmentTime(appointmentForEmail.appointment_time),
            duration: appointmentForEmail.duration_minutes
              ? `${appointmentForEmail.duration_minutes} min`
              : undefined
          }
        });

        emailSent = true;

        console.info("Customer cancellation email sent:", {
          appointmentId: safeAppointment.id,
          businessId: safeAppointment.business_id,
          recipientCount: ownerEmails.length
        });
      } catch (emailError) {
        console.error("Error sending customer cancellation email:", {
          appointmentId: safeAppointment.id,
          businessId: safeAppointment.business_id,
          message: getSafeErrorMessage(emailError)
        });
      }
    }

    const pushSent = await sendBarberCancellationPush({
      supabaseAdmin,
      appointment: appointmentForEmail,
      businessName
    });

    return NextResponse.json({
      ok: true,
      emailSent,
      pushSent
    });
  } catch (error) {
    console.error("Unexpected customer cancellation error:", {
      message: getSafeErrorMessage(error)
    });

    return NextResponse.json(
      { error: "No se pudo cancelar la cita." },
      { status: 500 }
    );
  }
}
