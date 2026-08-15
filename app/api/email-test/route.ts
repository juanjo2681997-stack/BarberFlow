import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendResendEmail } from "@/lib/email/resend";

export const runtime = "nodejs";

function getBearerSecret(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";

  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

function getProvidedSecret(request: Request) {
  return (
    request.headers.get("x-email-test-secret")?.trim() ||
    getBearerSecret(request)
  );
}

function secretsMatch(providedSecret: string, expectedSecret: string) {
  const provided = Buffer.from(providedSecret);
  const expected = Buffer.from(expectedSecret);

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getAppUrl(request: Request) {
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");

  return (configuredUrl || new URL(request.url).origin).replace(/\/$/, "");
}

export async function POST(request: Request) {
  const expectedSecret = process.env.EMAIL_TEST_SECRET?.trim();

  if (!expectedSecret) {
    return NextResponse.json(
      { error: "EMAIL_TEST_SECRET no esta configurado." },
      { status: 503 }
    );
  }

  const providedSecret = getProvidedSecret(request);

  if (!providedSecret || !secretsMatch(providedSecret, expectedSecret)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const to = typeof body?.to === "string" ? body.to.trim().toLowerCase() : "";

  if (!to || !isValidEmail(to)) {
    return NextResponse.json(
      { error: "Indica un destinatario valido en el campo to." },
      { status: 400 }
    );
  }

  try {
    await sendResendEmail({
      to,
      subject: "BarberFlow - email de prueba",
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
          <h1 style="font-size:22px">BarberFlow</h1>
          <p>Este es un email de prueba enviado desde BarberFlow.</p>
          <p>Si has recibido este correo, Resend y BARBERFLOW_EMAIL_FROM estan funcionando correctamente.</p>
          <p>
            <a href="${getAppUrl(request)}" style="display:inline-block;background:#d8a24a;color:#111;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold">
              Abrir BarberFlow
            </a>
          </p>
        </div>
      `,
      text: `Este es un email de prueba enviado desde BarberFlow.\n\nSi has recibido este correo, Resend y BARBERFLOW_EMAIL_FROM estan funcionando correctamente.\n\n${getAppUrl(request)}`
    });

    return NextResponse.json({ ok: true, to });
  } catch (error) {
    console.error("Error sending test email:", error);

    return NextResponse.json(
      { error: "No se pudo enviar el email de prueba." },
      { status: 500 }
    );
  }
}
