export type NotificationKind = "confirmed" | "modified" | "cancelled" | "reminder";

export type AppointmentPayload = {
  audience?: "barber";
  businessName: string;
  date: string;
  time: string;
  service: string;
};

export function appointmentMessage(kind: NotificationKind, payload: AppointmentPayload) {
  const details = `${payload.date} a las ${payload.time}, servicio: ${payload.service}.`;
  if (payload.audience === "barber" && kind === "cancelled") {
    return { title: "Reserva cancelada", body: `Un cliente ha cancelado su cita en ${payload.businessName}: ${details}` };
  }
  const messages = {
    confirmed: { title: "Cita confirmada", body: `Tu cita en ${payload.businessName} está confirmada: ${details}` },
    modified: { title: "Cita modificada", body: `Tu cita en ${payload.businessName} ha sido modificada. Nuevos datos: ${details}` },
    cancelled: { title: "Cita cancelada", body: `Tu cita en ${payload.businessName} del ${payload.date} a las ${payload.time} ha sido cancelada. Servicio: ${payload.service}.` },
    reminder: { title: "Recordatorio de cita", body: `Te recordamos tu cita en ${payload.businessName}: ${details}` }
  };
  return messages[kind];
}
