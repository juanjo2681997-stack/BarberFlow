import { EmailDetails } from "../components/EmailDetails";
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
      <EmailDetails
        rows={[
          { label: "Barbería", value: businessName },
          { label: "Servicio", value: service },
          { label: "Fecha", value: date },
          { label: "Hora", value: time },
          ...(reason ? [{ label: "Motivo", value: reason }] : [])
        ]}
      />
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
