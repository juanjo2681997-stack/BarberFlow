import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/sendEmail";
import { getEmployeeRequestContext } from "../../../employees/_utils";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type Appointment = {
  id: string;
  business_id: string;
  customer_user_id: string | null;
  customer_name: string;
  service: string;
  appointment_date: string;
  appointment_time: string;
  duration_minutes: number | null;
  status: string | null;
  appointment_status: string | null;
};

type Business = {
  name: string | null;
};

type BusinessSettings = {
  business_name: string | null;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatAppointmentTime(value: string) {
  return value.slice(0, 5);
}

function getSafeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido";
}

function isValidEmail(value: unknown) {
  return (
    typeof value === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  );
}

function isCancelled(appointment: Appointment) {
  return (
    appointment.status === "cancelled" ||
    appointment.appointment_status === "cancelled"
  );
}

async function getCustomerEmail(supabaseAdmin: any, customerUserId: string | null) {
  if (!customerUserId) {
    return "";
  }

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(
    customerUserId
  );

  if (error) {
    console.error("Error loading customer email for barber cancellation:", {
      customerUserId,
      message: error.message
    });
    return "";
  }

  const email = data.user?.email?.trim().toLowerCase() ?? "";

  return isValidEmail(email) ? email : "";
}

async function sendCustomerCancellationEmail(params: {
  supabaseAdmin: any;
  appointment: Appointment;
}) {
  const { supabaseAdmin, appointment } = params;
  const customerEmail = await getCustomerEmail(
    supabaseAdmin,
    appointment.customer_user_id
  );

  if (!customerEmail) {
    return "skipped";
  }

  const [{ data: business }, { data: businessSettings }] = await Promise.all([
    supabaseAdmin
      .from("businesses")
      .select("name")
      .eq("id", appointment.business_id)
      .maybeSingle(),
    supabaseAdmin
      .from("business_settings")
      .select("business_name")
      .eq("business_id", appointment.business_id)
      .maybeSingle()
  ]);
  const safeBusiness = business as Business | null;
  const safeBusinessSettings = businessSettings as BusinessSettings | null;
  const businessName =
    cleanText(safeBusinessSettings?.business_name) ||
    cleanText(safeBusiness?.name) ||
    "FlowBarber";

  try {
    await sendEmail({
      to: customerEmail,
      subject: `Cita cancelada en ${businessName}`,
      template: "BookingCancelled",
      idempotencyKey: `barber-booking-cancelled/${appointment.id}`,
      props: {
        customerName: appointment.customer_name,
        businessName,
        service: appointment.service,
        date: appointment.appointment_date,
        time: formatAppointmentTime(appointment.appointment_time),
        reason: "Cancelada por la barberia"
      }
    });

    return "sent";
  } catch (error) {
    console.error("Error sending barber cancellation email to customer:", {
      appointmentId: appointment.id,
      businessId: appointment.business_id,
      message: getSafeErrorMessage(error)
    });

    return "failed";
  }
}

export async function POST(request: Request, routeContext: RouteContext) {
  const context = await getEmployeeRequestContext(request);

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { id } = await routeContext.params;

  if (!id) {
    return NextResponse.json({ error: "Cita no valida." }, { status: 400 });
  }

  const { data: appointment, error: appointmentError } =
    await context.supabaseAdmin
      .from("appointments")
      .select(
        "id, business_id, customer_user_id, customer_name, service, appointment_date, appointment_time, duration_minutes, status, appointment_status"
      )
      .eq("id", id)
      .eq("business_id", context.businessId)
      .maybeSingle();

  if (appointmentError) {
    console.error("Error loading appointment for barber cancellation:", appointmentError);
    return NextResponse.json(
      { error: "No se pudo cargar la cita." },
      { status: 500 }
    );
  }

  if (!appointment) {
    return NextResponse.json({ error: "Cita no encontrada." }, { status: 404 });
  }

  const safeAppointment = appointment as Appointment;

  if (isCancelled(safeAppointment)) {
    return NextResponse.json({
      ok: true,
      alreadyCancelled: true,
      emailStatus: "skipped"
    });
  }

  const cancelledAt = new Date().toISOString();
  const cancellationReason = "Cancelada por la barberia";
  const { data: cancelledAppointment, error: cancelError } =
    await context.supabaseAdmin
      .from("appointments")
      .update({
        status: "cancelled",
        appointment_status: "cancelled",
        status_updated_at: cancelledAt,
        cancelled_at: cancelledAt,
        cancellation_reason: cancellationReason,
        whatsapp_cancel_notified_at: null
      })
      .eq("id", safeAppointment.id)
      .eq("business_id", context.businessId)
      .or("status.is.null,status.neq.cancelled")
      .or("appointment_status.is.null,appointment_status.neq.cancelled")
      .select(
        "id, business_id, customer_user_id, customer_name, service, appointment_date, appointment_time, duration_minutes, status, appointment_status"
      )
      .maybeSingle();

  if (cancelError) {
    console.error("Error cancelling appointment by barber:", cancelError);
    return NextResponse.json(
      { error: "No se pudo cancelar la cita." },
      { status: 500 }
    );
  }

  if (!cancelledAppointment) {
    return NextResponse.json({
      ok: true,
      alreadyCancelled: true,
      emailStatus: "skipped"
    });
  }

  const emailStatus = await sendCustomerCancellationEmail({
    supabaseAdmin: context.supabaseAdmin,
    appointment: cancelledAppointment as Appointment
  });

  return NextResponse.json({
    ok: true,
    emailStatus
  });
}
