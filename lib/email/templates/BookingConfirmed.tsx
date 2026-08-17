import { EmailDetails } from "../components/EmailDetails";
import { EmailText } from "../components/EmailText";
import { EmailLayout } from "../layout";

export type BookingConfirmedProps = {
  customerName: string;
  businessName: string;
  service: string;
  date: string;
  time: string;
  barberName?: string;
  duration?: string;
  price?: string;
  address?: string;
};

export function BookingConfirmed({
  customerName,
  businessName,
  service,
  date,
  time,
  barberName,
  duration,
  price,
  address
}: BookingConfirmedProps) {
  return (
    <EmailLayout
      preview={`Cita confirmada en ${businessName}`}
      title="Cita confirmada"
    >
      <EmailText>Hola {customerName}, tu cita está confirmada.</EmailText>
      <EmailDetails
        rows={[
          { label: "Barbería", value: businessName },
          { label: "Servicio", value: service },
          { label: "Fecha", value: date },
          { label: "Hora", value: time },
          ...(barberName ? [{ label: "Barbero", value: barberName }] : []),
          ...(duration ? [{ label: "Duracion", value: duration }] : []),
          ...(price ? [{ label: "Precio", value: price }] : []),
          ...(address ? [{ label: "Direccion", value: address }] : [])
        ]}
      />
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
  time,
  barberName,
  duration,
  price,
  address
}: BookingConfirmedProps) {
  const optionalRows = [
    barberName ? `Barbero: ${barberName}` : "",
    duration ? `Duracion: ${duration}` : "",
    price ? `Precio: ${price}` : "",
    address ? `Direccion: ${address}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  return `Hola ${customerName}, tu cita está confirmada.

Barbería: ${businessName}
Servicio: ${service}
Fecha: ${date}
Hora: ${time}${optionalRows ? `\n${optionalRows}` : ""}`;
}
