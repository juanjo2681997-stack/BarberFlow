import { EmailButton } from "../components/EmailButton";
import { EmailText } from "../components/EmailText";
import { EmailLayout } from "../layout";

export type ActivateOwnerProps = {
  name?: string;
  activationUrl: string;
};

export function ActivateOwner({ name, activationUrl }: ActivateOwnerProps) {
  return (
    <EmailLayout
      preview="Confirma tu perfil de barbería en flowbarber"
      title="Activa tu perfil de barbería"
    >
      <EmailText>
        {name ? `Hola ${name}, ` : "Hola, "}
        has solicitado activar tu perfil de propietario de barbería dentro de
        flowbarber.
      </EmailText>
      <EmailText>
        Pulsa el botón para confirmar esta activación y continuar con tu
        barbería.
      </EmailText>
      <EmailButton href={activationUrl}>Activar perfil de barbería</EmailButton>
    </EmailLayout>
  );
}

export function activateOwnerText({ name, activationUrl }: ActivateOwnerProps) {
  return `${name ? `Hola ${name},` : "Hola,"}

Has solicitado activar tu perfil de propietario de barbería dentro de flowbarber.

${activationUrl}`;
}
