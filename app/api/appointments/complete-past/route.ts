import { NextResponse } from "next/server";
import { getEmployeeRequestContext } from "../../employees/_utils";

export const runtime = "nodejs";

type PendingAppointment = {
  id: string;
  appointment_date: string;
  appointment_time: string;
  duration_minutes: number | null;
};

const madridTimeZone = "Europe/Madrid";

function formatAppointmentTime(time: string) {
  return time.slice(0, 5);
}

function timeToMinutes(time: string) {
  const [hours, minutes] = formatAppointmentTime(time).split(":").map(Number);

  return hours * 60 + minutes;
}

function getMadridCurrentDateTime() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: madridTimeZone,
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
    currentMinutes: Number(value("hour")) * 60 + Number(value("minute"))
  };
}

function isPastAppointment(
  appointment: PendingAppointment,
  today: string,
  currentMinutes: number
) {
  if (appointment.appointment_date < today) {
    return true;
  }

  if (appointment.appointment_date > today) {
    return false;
  }

  const durationMinutes = Number(appointment.duration_minutes) || 0;

  return timeToMinutes(appointment.appointment_time) + durationMinutes <= currentMinutes;
}

export async function POST(request: Request) {
  const context = await getEmployeeRequestContext(request);

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const { today, currentMinutes } = getMadridCurrentDateTime();
  const { data: pendingAppointments, error: loadError } =
    await context.supabaseAdmin
      .from("appointments")
      .select("id, appointment_date, appointment_time, duration_minutes")
      .eq("business_id", context.businessId)
      .eq("appointment_status", "pending")
      .or("status.is.null,status.neq.cancelled")
      .lte("appointment_date", today);

  if (loadError) {
    console.error("Error loading past appointments:", loadError);
    return NextResponse.json(
      { error: "No se pudieron revisar las citas pasadas." },
      { status: 500 }
    );
  }

  const appointmentIds = ((pendingAppointments ?? []) as PendingAppointment[])
    .filter((appointment) =>
      isPastAppointment(appointment, today, currentMinutes)
    )
    .map((appointment) => appointment.id);

  if (appointmentIds.length === 0) {
    return NextResponse.json({ completed: 0 });
  }

  const { error: updateError } = await context.supabaseAdmin
    .from("appointments")
    .update({
      appointment_status: "completed",
      status_updated_at: new Date().toISOString()
    })
    .eq("business_id", context.businessId)
    .in("id", appointmentIds);

  if (updateError) {
    console.error("Error completing past appointments:", updateError);
    return NextResponse.json(
      { error: "No se pudieron finalizar las citas pasadas." },
      { status: 500 }
    );
  }

  return NextResponse.json({ completed: appointmentIds.length });
}
