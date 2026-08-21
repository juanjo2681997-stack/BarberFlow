import { EmailButton } from "../components/EmailButton";
import { EmailText } from "../components/EmailText";
import { EmailLayout } from "../layout";

export type ActivateCustomerProps = {
  name?: string;
  activationUrl: string;
};

export function ActivateCustomer({ name, activationUrl }: ActivateCustomerProps) {
  return (
    <EmailLayout
      preview="Confirma tu perfil de cliente en flowbarber"
      title="Activa tu perfil de cliente"
    >
      <EmailText>
        {name ? `Hola ${name}, ` : "Hola, "}
        has solicitado activar tu perfil de cliente dentro de flowbarber.
      </EmailText>
      <EmailText>
        Pulsa el botón para confirmar que quieres usar esta cuenta como cliente.
      </EmailText>
      <EmailButton href={activationUrl}>Activar perfil de cliente</EmailButton>
    </EmailLayout>
  );
}

export function activateCustomerText({
  name,
  activationUrl
}: ActivateCustomerProps) {
  return `${name ? `Hola ${name},` : "Hola,"}

Has solicitado activar tu perfil de cliente dentro de flowbarber.

${activationUrl}`;
}
