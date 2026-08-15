import { EmailText } from "../components/EmailText";
import { EmailLayout } from "../layout";

export type BookingCancelledProps = {
  customerName: string;
  businessName: string;
  service: string;
  date: string;
  time: string;
  reason?: string;
};

export function BookingCancelled({
  customerName,
  businessName,
  service,
  date,
  time,
  reason
}: BookingCancelledProps) {
  return (
    <EmailLayout
      preview={`Cita cancelada en ${businessName}`}
      title="Cita cancelada"
    >
      <EmailText>Hola {customerName}, tu cita ha sido cancelada.</EmailText>
      <EmailText>
        <strong>Barbería:</strong> {businessName}
        <br />
        <strong>Servicio:</strong> {service}
        <br />
        <strong>Fecha:</strong> {date}
        <br />
        <strong>Hora:</strong> {time}
      </EmailText>
      {reason && <EmailText>Motivo: {reason}</EmailText>}
      <EmailText muted>
        Contacta con la barbería para encontrar una nueva hora disponible.
      </EmailText>
    </EmailLayout>
  );
}

export function bookingCancelledText({
  customerName,
  businessName,
  service,
  date,
  time,
  reason
}: BookingCancelledProps) {
  return `Hola ${customerName}, tu cita ha sido cancelada.

Barbería: ${businessName}
Servicio: ${service}
Fecha: ${date}
Hora: ${time}${reason ? `\nMotivo: ${reason}` : ""}`;
}
