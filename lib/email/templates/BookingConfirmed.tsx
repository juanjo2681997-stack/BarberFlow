import { EmailText } from "../components/EmailText";
import { EmailLayout } from "../layout";

export type BookingConfirmedProps = {
  customerName: string;
  businessName: string;
  service: string;
  date: string;
  time: string;
};

export function BookingConfirmed({
  customerName,
  businessName,
  service,
  date,
  time
}: BookingConfirmedProps) {
  return (
    <EmailLayout
      preview={`Cita confirmada en ${businessName}`}
      title="Cita confirmada"
    >
      <EmailText>Hola {customerName}, tu cita está confirmada.</EmailText>
      <EmailText>
        <strong>Barbería:</strong> {businessName}
        <br />
        <strong>Servicio:</strong> {service}
        <br />
        <strong>Fecha:</strong> {date}
        <br />
        <strong>Hora:</strong> {time}
      </EmailText>
      <EmailText muted>
        Te recomendamos llegar unos minutos antes de la hora reservada.
      </EmailText>
    </EmailLayout>
  );
}

export function bookingConfirmedText({
  customerName,
  businessName,
  service,
  date,
  time
}: BookingConfirmedProps) {
  return `Hola ${customerName}, tu cita está confirmada.

Barbería: ${businessName}
Servicio: ${service}
Fecha: ${date}
Hora: ${time}`;
}
