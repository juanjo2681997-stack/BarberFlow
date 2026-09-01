import { EmailButton } from "../components/EmailButton";
import { EmailDetails } from "../components/EmailDetails";
import { EmailText } from "../components/EmailText";
import { EmailLayout } from "../layout";

export type SubscriptionPaymentFailedProps = {
  businessName: string;
  paymentFailedAt: string;
  graceEndsAt: string;
  manageSubscriptionUrl: string;
};

export function SubscriptionPaymentFailed({
  businessName,
  paymentFailedAt,
  graceEndsAt,
  manageSubscriptionUrl
}: SubscriptionPaymentFailedProps) {
  return (
    <EmailLayout
      preview="No hemos podido procesar tu pago de FlowBarber"
      title="Pago de suscripcion pendiente"
    >
      <EmailText>
        Hola, no hemos podido procesar el cobro de la suscripcion de{" "}
        {businessName} en FlowBarber.
      </EmailText>
      <EmailText>
        Dispones de 48 horas para actualizar el metodo de pago antes de que se
        suspendan temporalmente las reservas publicas.
      </EmailText>
      <EmailDetails
        rows={[
          { label: "Barberia", value: businessName },
          { label: "Pago fallido", value: paymentFailedAt },
          { label: "Fin de la gracia", value: graceEndsAt }
        ]}
      />
      <EmailText>
        Durante este periodo de gracia podras seguir accediendo al panel de
        FlowBarber y gestionando tu cuenta segun la configuracion actual.
      </EmailText>
      <EmailButton href={manageSubscriptionUrl}>
        Gestionar suscripcion
      </EmailButton>
      <EmailText muted>
        Si ya has actualizado el metodo de pago, no necesitas hacer nada mas.
      </EmailText>
    </EmailLayout>
  );
}

export function subscriptionPaymentFailedText({
  businessName,
  paymentFailedAt,
  graceEndsAt,
  manageSubscriptionUrl
}: SubscriptionPaymentFailedProps) {
  return `Hola,

No hemos podido procesar el cobro de la suscripcion de ${businessName} en FlowBarber.

Dispones de 48 horas para actualizar el metodo de pago antes de que se suspendan temporalmente las reservas publicas.

Barberia: ${businessName}
Pago fallido: ${paymentFailedAt}
Fin de la gracia: ${graceEndsAt}

Durante este periodo de gracia podras seguir accediendo al panel de FlowBarber y gestionando tu cuenta segun la configuracion actual.

Gestionar suscripcion:
${manageSubscriptionUrl}

Si ya has actualizado el metodo de pago, no necesitas hacer nada mas.`;
}
