import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/sendEmail";
import {
  cleanText,
  getAuthenticatedUser
} from "../../profile-activation/_utils";

export const runtime = "nodejs";

const cancellationLimitHours = 24;
const madridTimeZone = "Europe/Madrid";

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
      "BarberFlow";
    const ownerName =
      cleanText(employeeOwnerContacts[0]?.display_name) || businessName;
    const appointmentForEmail = cancelledAppointment as Appointment;

    if (ownerEmails.length === 0) {
      console.warn("Customer cancellation email skipped: missing owner email.", {
        appointmentId: safeAppointment.id,
        businessId: safeAppointment.business_id
      });

      return NextResponse.json({ ok: true, emailSent: false });
    }

    try {
      await sendEmail({
        to: ownerEmails,
        subject: `Reserva cancelada por ${appointmentForEmail.customer_name}`,
        template: "CustomerBookingCancelled",
        idempotencyKey: `customer-booking-cancelled/${safeAppointment.id}`,
        props: {
          barberName: ownerName,
          customerName: appointmentForEmail.customer_name,
          customerPhone: cleanText(appointmentForEmail.customer_phone) || undefined,
          businessName,
          service: appointmentForEmail.service,
          date: appointmentForEmail.appointment_date,
          time: formatAppointmentTime(appointmentForEmail.appointment_time),
          duration: appointmentForEmail.duration_minutes
            ? `${appointmentForEmail.duration_minutes} min`
            : undefined
        }
      });

      console.info("Customer cancellation email sent:", {
        appointmentId: safeAppointment.id,
        businessId: safeAppointment.business_id,
        recipientCount: ownerEmails.length
      });

      return NextResponse.json({ ok: true, emailSent: true });
    } catch (emailError) {
      console.error("Error sending customer cancellation email:", {
        appointmentId: safeAppointment.id,
        businessId: safeAppointment.business_id,
        message: getSafeErrorMessage(emailError)
      });

      return NextResponse.json({ ok: true, emailSent: false });
    }
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
