import { createSign } from "node:crypto";
import { appointmentMessage, type AppointmentPayload, type NotificationKind } from "./message";

let cachedToken: { value: string; expires: number } | null = null;

async function accessToken() {
  if (cachedToken && cachedToken.expires > Date.now() + 60000) return cachedToken.value;
  const email = process.env.FCM_CLIENT_EMAIL;
  const privateKey = process.env.FCM_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !privateKey) throw new Error("FCM_CONFIGURATION");
  const issuedAt = Math.floor(Date.now() / 1000);
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: issuedAt, exp: issuedAt + 3600
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey, "base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error("FCM_AUTHENTICATION");
  const data = await response.json() as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

export class FcmError extends Error {
  constructor(public code: string, public invalidDevice: boolean) { super(code); }
}

export async function sendFcm(params: {
  token: string; appointmentId: string; jobId: string;
  kind: NotificationKind; payload: AppointmentPayload;
}) {
  const project = process.env.FCM_PROJECT_ID;
  if (!project || !/^[a-z0-9-]+$/.test(project)) throw new Error("FCM_CONFIGURATION");
  const bearer = await accessToken();
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token: params.token,
        notification: appointmentMessage(params.kind, params.payload),
        data: {
          appointmentId: params.appointmentId, eventId: params.jobId,
          view: params.payload.audience === "barber" ? "panel" : "appointments"
        },
        android: {
          priority: "HIGH", ttl: "0s", collapse_key: params.appointmentId,
          notification: { channel_id: "appointments", tag: params.appointmentId, icon: "ic_stat_notification" }
        }
      }
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    const code = result?.error?.details?.find((detail: { errorCode?: string }) => detail.errorCode)?.errorCode;
    if (response.status === 401) cachedToken = null;
    throw new FcmError(code || `FCM_HTTP_${response.status}`, code === "UNREGISTERED");
  }
}
