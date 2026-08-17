import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/sendEmail";
import {
  cleanText,
  getAuthenticatedUser,
  getUserEmail
} from "../../profile-activation/_utils";

export const runtime = "nodejs";

type ConfirmationEmailBody = {
  appointmentId?: string;
  businessId?: string;
  serviceId?: string;
};

type Appointment = {
  id: string;
  business_id: string;
  customer_user_id: string | null;
  customer_name: string;
  service: string;
  appointment_date: string;
  appointment_time: string;
  barber_name: string | null;
  duration_minutes: number | null;
};

type Business = {
  id: string;
  name: string | null;
};

type BusinessSettings = {
  business_name: string | null;
  address: string | null;
};

type Service = {
  id: string;
  name: string;
  price: number | null;
  duration_minutes: number | null;
};

function formatAppointmentTime(value: string) {
  return value.slice(0, 5);
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function getSafeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | ConfirmationEmailBody
      | null;
    const appointmentId = cleanText(body?.appointmentId);
    const businessId = cleanText(body?.businessId);
    const serviceId = cleanText(body?.serviceId);

    if (!appointmentId || !businessId) {
      return NextResponse.json(
        { error: "Faltan datos de la cita." },
        { status: 400 }
      );
    }

    const { supabaseAdmin, user, error: authError } =
      await getAuthenticatedUser(request);

    if (authError || !user) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    const customerEmail = getUserEmail(user);

    if (!customerEmail) {
      return NextResponse.json(
        { error: "La cuenta no tiene email asociado." },
        { status: 400 }
      );
    }

    const { data: appointment, error: appointmentError } = await supabaseAdmin
      .from("appointments")
      .select(
        "id, business_id, customer_user_id, customer_name, service, appointment_date, appointment_time, barber_name, duration_minutes"
      )
      .eq("id", appointmentId)
      .eq("business_id", businessId)
      .eq("customer_user_id", user.id)
      .maybeSingle();

    if (appointmentError) {
      console.error("Error loading appointment for confirmation email:", {
        appointmentId,
        businessId,
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

    const [{ data: business }, { data: businessSettings }, serviceResult] =
      await Promise.all([
        supabaseAdmin
          .from("businesses")
          .select("id, name")
          .eq("id", safeAppointment.business_id)
          .maybeSingle(),
        supabaseAdmin
          .from("business_settings")
          .select("business_name, address")
          .eq("business_id", safeAppointment.business_id)
          .maybeSingle(),
        serviceId
          ? supabaseAdmin
              .from("services")
              .select("id, name, price, duration_minutes")
              .eq("id", serviceId)
              .eq("business_id", safeAppointment.business_id)
              .maybeSingle()
          : Promise.resolve({ data: null })
      ]);

    const safeBusiness = business as Business | null;
    const safeBusinessSettings = businessSettings as BusinessSettings | null;
    const safeService = serviceResult.data as Service | null;
    const businessName =
      cleanText(safeBusinessSettings?.business_name) ||
      cleanText(safeBusiness?.name) ||
      "BarberFlow";
    const durationMinutes =
      safeAppointment.duration_minutes ?? safeService?.duration_minutes ?? null;

    await sendEmail({
      to: customerEmail,
      subject: `Cita confirmada en ${businessName}`,
      template: "BookingConfirmed",
      idempotencyKey: `booking-confirmed/${safeAppointment.id}`,
      props: {
        customerName: safeAppointment.customer_name,
        businessName,
        service: cleanText(safeService?.name) || safeAppointment.service,
        date: safeAppointment.appointment_date,
        time: formatAppointmentTime(safeAppointment.appointment_time),
        barberName: cleanText(safeAppointment.barber_name) || undefined,
        duration: durationMinutes ? `${durationMinutes} min` : undefined,
        price:
          typeof safeService?.price === "number"
            ? `${formatPrice(safeService.price)} EUR`
            : undefined,
        address: cleanText(safeBusinessSettings?.address) || undefined
      }
    });

    console.info("Booking confirmation email sent:", {
      appointmentId: safeAppointment.id,
      businessId: safeAppointment.business_id,
      customerUserId: user.id
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error sending booking confirmation email:", {
      message: getSafeErrorMessage(error)
    });

    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
