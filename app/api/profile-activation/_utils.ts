import { createHash, randomBytes } from "node:crypto";
import { createClient, type User } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/sendEmail";

export type ProfileType = "customer" | "owner";

export type ActivationPayload = Record<string, string>;

export const activationTokenMinutes = 30;

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Faltan variables de entorno de Supabase.");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

export function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
}

export async function getAuthenticatedUser(request: Request) {
  const supabaseAdmin = getSupabaseAdmin();
  const token = getBearerToken(request);

  if (!token) {
    return { supabaseAdmin, user: null, error: "No autorizado." };
  }

  const {
    data: { user },
    error
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return { supabaseAdmin, user: null, error: "No autorizado." };
  }

  return { supabaseAdmin, user, error: null };
}

export function isProfileType(value: unknown): value is ProfileType {
  return value === "customer" || value === "owner";
}

export function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function cleanPayload(profileType: ProfileType, payload: unknown) {
  const source =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};

  if (profileType === "customer") {
    return {
      full_name: cleanText(source.full_name),
      phone: cleanText(source.phone)
    };
  }

  return {
    business_name: cleanText(source.business_name),
    owner_name: cleanText(source.owner_name),
    whatsapp_phone: cleanText(source.whatsapp_phone),
    address: cleanText(source.address),
    instagram_url: cleanText(source.instagram_url)
  };
}

export function validatePayload(profileType: ProfileType, payload: ActivationPayload) {
  const serializedPayload = JSON.stringify(payload);

  if (serializedPayload.length > 8000) {
    return "La solicitud es demasiado grande.";
  }

  if (profileType === "customer") {
    if (!payload.full_name || !payload.phone) {
      return "Faltan los datos del perfil de cliente.";
    }

    return null;
  }

  if (!payload.business_name || !payload.owner_name) {
    return "Faltan los datos del perfil de propietario.";
  }

  return null;
}

export function generateActivationToken() {
  return randomBytes(32).toString("base64url");
}

export function hashActivationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getExpiresAt() {
  return new Date(Date.now() + activationTokenMinutes * 60 * 1000).toISOString();
}

export function getAppOrigin(request: Request) {
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const requestOrigin = request.headers.get("origin") ?? "";

  return (configuredUrl || requestOrigin).replace(/\/$/, "");
}

export function getActivationUrl(request: Request, token: string) {
  return `${getAppOrigin(request)}/activar-perfil?token=${encodeURIComponent(
    token
  )}`;
}

function getEmailSubject(profileType: ProfileType) {
  return profileType === "owner"
    ? "Confirma tu perfil de barbería en BarberFlow"
    : "Confirma tu perfil de cliente en BarberFlow";
}

function getEmailCopy(profileType: ProfileType) {
  return profileType === "owner"
    ? "Has solicitado activar tu perfil de propietario de barbería dentro de BarberFlow."
    : "Has solicitado activar tu perfil de cliente dentro de BarberFlow.";
}

export async function sendProfileActivationEmail(params: {
  request: Request;
  email: string;
  profileType: ProfileType;
  token: string;
  name?: string;
}) {
  {
    const activationUrl = getActivationUrl(params.request, params.token);

    await sendEmail({
      to: params.email,
      subject:
        params.profileType === "owner"
          ? "Confirma tu perfil de barberia en BarberFlow"
          : "Confirma tu perfil de cliente en BarberFlow",
      template:
        params.profileType === "owner" ? "ActivateOwner" : "ActivateCustomer",
      props: {
        name: params.name,
        activationUrl
      }
    });

    return;
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.BARBERFLOW_EMAIL_FROM;

  if (!resendApiKey) {
    throw new Error("Falta RESEND_API_KEY.");
  }

  if (!emailFrom) {
    throw new Error("Falta BARBERFLOW_EMAIL_FROM.");
  }

  const activationUrl = getActivationUrl(params.request, params.token);
  const subject = getEmailSubject(params.profileType);
  const copy = getEmailCopy(params.profileType);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: emailFrom,
      to: params.email,
      subject,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
          <h1 style="font-size:22px">BarberFlow</h1>
          <p>${copy}</p>
          <p>Pulsa el siguiente botón para confirmar esta activación.</p>
          <p>
            <a href="${activationUrl}" style="display:inline-block;background:#d8a24a;color:#111;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:bold">
              Confirmar perfil
            </a>
          </p>
          <p>Este enlace caduca en ${activationTokenMinutes} minutos.</p>
          <p>Si no has solicitado esta activación, puedes ignorar este correo.</p>
        </div>
      `,
      text: `${copy}\n\nConfirma esta activación aquí:\n${activationUrl}\n\nEste enlace caduca en ${activationTokenMinutes} minutos.\n\nSi no has solicitado esta activación, puedes ignorar este correo.`
    })
  });

  if (!response.ok) {
    throw new Error("No se pudo enviar el correo de activación.");
  }
}

export function getUserEmail(user: User) {
  return typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
}
