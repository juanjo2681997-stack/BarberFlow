type ResendEmailPayload = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  idempotencyKey?: string;
};

export async function sendResendEmail({
  to,
  subject,
  html,
  text,
  idempotencyKey
}: ResendEmailPayload) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.BARBERFLOW_EMAIL_FROM;

  if (!resendApiKey) {
    throw new Error("Falta RESEND_API_KEY.");
  }

  if (!from) {
    throw new Error("Falta BARBERFLOW_EMAIL_FROM.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      text
    })
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(result?.message ?? "No se pudo enviar el email.");
  }

  return result;
}
