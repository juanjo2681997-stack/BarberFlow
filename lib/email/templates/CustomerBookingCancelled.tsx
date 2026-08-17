import { EmailDetails } from "../components/EmailDetails";
import { EmailText } from "../components/EmailText";
import { EmailLayout } from "../layout";

export type CustomerBookingCancelledProps = {
  barberName?: string;
  customerName: string;
  customerPhone?: string;
  businessName: string;
  service: string;
  date: string;
  time: string;
  duration?: string;
  price?: string;
};

export function CustomerBookingCancelled({
  barberName,
  customerName,
  customerPhone,
  businessName,
  service,
  date,
  time,
  duration,
  price
}: CustomerBookingCancelledProps) {
  return (
    <EmailLayout
      preview={`Reserva cancelada por ${customerName}`}
      title="Reserva cancelada"
    >
      <EmailText>
        Hola {barberName || businessName}, {customerName} ha cancelado su cita.
      </EmailText>
      <EmailDetails
        rows={[
          { label: "Barberia", value: businessName },
          { label: "Cliente", value: customerName },
          ...(customerPhone ? [{ label: "Telefono", value: customerPhone }] : []),
          { label: "Servicio", value: service },
          { label: "Fecha", value: date },
          { label: "Hora", value: time },
          ...(duration ? [{ label: "Duracion", value: duration }] : []),
          ...(price ? [{ label: "Precio", value: price }] : [])
        ]}
      />
      <EmailText muted>
        El hueco queda libre para nuevas reservas.
      </EmailText>
    </EmailLayout>
  );
}

export function customerBookingCancelledText({
  barberName,
  customerName,
  customerPhone,
  businessName,
  service,
  date,
  time,
  duration,
  price
}: CustomerBookingCancelledProps) {
  const optionalRows = [
    customerPhone ? `Telefono: ${customerPhone}` : "",
    duration ? `Duracion: ${duration}` : "",
    price ? `Precio: ${price}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  return `Hola ${barberName || businessName}, ${customerName} ha cancelado su cita.

Barberia: ${businessName}
Cliente: ${customerName}
${optionalRows ? `${optionalRows}\n` : ""}Servicio: ${service}
Fecha: ${date}
Hora: ${time}

El hueco queda libre para nuevas reservas.`;
}
