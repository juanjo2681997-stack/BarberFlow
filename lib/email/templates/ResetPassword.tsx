import { EmailButton } from "../components/EmailButton";
import { EmailText } from "../components/EmailText";
import { EmailLayout } from "../layout";

export type ResetPasswordProps = {
  name?: string;
  resetUrl: string;
};

export function ResetPassword({ name, resetUrl }: ResetPasswordProps) {
  return (
    <EmailLayout
      preview="Restablece tu contraseña de BarberFlow"
      title="Restablece tu contraseña"
    >
      <EmailText>
        {name ? `Hola ${name}, ` : "Hola, "}
        hemos recibido una solicitud para cambiar tu contraseña.
      </EmailText>
      <EmailText>
        Si has sido tú, pulsa el botón para crear una contraseña nueva.
      </EmailText>
      <EmailButton href={resetUrl}>Cambiar contraseña</EmailButton>
    </EmailLayout>
  );
}

export function resetPasswordText({ name, resetUrl }: ResetPasswordProps) {
  return `${name ? `Hola ${name},` : "Hola,"}

Hemos recibido una solicitud para cambiar tu contraseña.

${resetUrl}`;
}
