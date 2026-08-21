import { EmailButton } from "../components/EmailButton";
import { EmailText } from "../components/EmailText";
import { EmailLayout } from "../layout";

export type VerifyEmailProps = {
  name?: string;
  verificationUrl: string;
};

export function VerifyEmail({ name, verificationUrl }: VerifyEmailProps) {
  return (
    <EmailLayout
      preview="Confirma tu correo en flowbarber"
      title="Confirma tu correo"
    >
      <EmailText>
        {name ? `Hola ${name}, ` : "Hola, "}
        confirma tu correo electrónico para activar tu cuenta en flowbarber.
      </EmailText>
      <EmailText>
        Pulsa el botón para verificar tu email y continuar usando la plataforma.
      </EmailText>
      <EmailButton href={verificationUrl}>Confirmar correo</EmailButton>
    </EmailLayout>
  );
}

export function verifyEmailText({ name, verificationUrl }: VerifyEmailProps) {
  return `${name ? `Hola ${name},` : "Hola,"}

Confirma tu correo electrónico para activar tu cuenta en flowbarber.

${verificationUrl}`;
}
