import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import { isDispatchAuthorized } from "./auth.ts";
import { FcmError, sendFcm } from "./fcm.ts";
import type { AppointmentPayload, NotificationKind } from "./message.ts";

type Job = {
  id: string; appointment_id: string; recipient_id: string; lease_id: string;
  kind: NotificationKind; payload: AppointmentPayload; delivered_devices: string[];
};

export async function dispatchNotifications(request: Request) {
  if (request.method !== "POST") {
    return Response.json({ error: "Método no permitido." }, { status: 405, headers: { Allow: "POST" } });
  }
  const secret = process.env.NATIVE_PUSH_DISPATCH_SECRET;
  const supplied = request.headers.get("authorization") || "";
  if (!isDispatchAuthorized(supplied, secret)) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!process.env.FCM_PROJECT_ID || !process.env.FCM_CLIENT_EMAIL || !process.env.FCM_PRIVATE_KEY) {
    return Response.json({ error: "Falta configurar FCM." }, { status: 503 });
  }
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ error: "Falta configurar Supabase." }, { status: 503 });
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc("claim_appointment_notifications", { batch_size: 5 });
  if (error) return Response.json({ error: "No se pudo leer la cola." }, { status: 500 });
  const started = Date.now();
  let processed = 0;
  for (const job of (data ?? []) as Job[]) {
    let resultState = "sent";
    let errorCode: string | null = null;
    try {
      const { data: devices, error: deviceError } = await admin.from("native_push_devices")
        .select("id, token").eq("user_id", job.recipient_id);
      if (deviceError) throw new Error("DEVICE_QUERY");
      if (!devices?.length) throw new Error("NO_DEVICES");
      for (const device of devices) {
        if (job.delivered_devices.includes(device.id)) continue;
        if (Date.now() - started > 40000) throw new Error("TIME_BUDGET");
        const { data: current, error: currentError } = await admin.rpc("notification_is_current", {
          job_id: job.id, claim_id: job.lease_id
        });
        if (currentError) throw new Error("VALIDATION_QUERY");
        if (!current) { resultState = "cancelled"; break; }
        const { data: stillOwned, error: ownershipError } = await admin.from("native_push_devices")
          .select("id").eq("id", device.id).eq("user_id", job.recipient_id).eq("token", device.token).maybeSingle();
        if (ownershipError) throw new Error("DEVICE_QUERY");
        if (!stillOwned) continue;
        try {
          await sendFcm({
            token: device.token, appointmentId: job.appointment_id, jobId: job.id,
            kind: job.kind, payload: job.payload
          });
          const { error: recordError } = await admin.rpc("record_notification_delivery", {
            job_id: job.id, claim_id: job.lease_id, device_id: device.id
          });
          if (recordError) throw new Error("DELIVERY_RECORD");
        } catch (sendError) {
          if (sendError instanceof FcmError && sendError.invalidDevice) {
            const { error: deleteError } = await admin.from("native_push_devices")
              .delete().eq("id", device.id).eq("token", device.token).eq("user_id", job.recipient_id);
            if (deleteError) throw new Error("DEVICE_CLEANUP");
          } else {
            resultState = "pending";
            errorCode = sendError instanceof FcmError ? sendError.code : "SEND_FAILED";
          }
        }
      }
    } catch (dispatchError) {
      resultState = "pending";
      const safeCodes = new Set(["DEVICE_QUERY", "NO_DEVICES", "TIME_BUDGET", "VALIDATION_QUERY", "DEVICE_CLEANUP", "DELIVERY_RECORD"]);
      errorCode = dispatchError instanceof Error && safeCodes.has(dispatchError.message)
        ? dispatchError.message : "DISPATCH_FAILED";
    }
    const { error: finishError } = await admin.rpc("finish_appointment_notification", {
      job_id: job.id, claim_id: job.lease_id, result_state: resultState, error_code: errorCode
    });
    if (finishError) return Response.json({ error: "No se pudo confirmar el envío." }, { status: 500 });
    processed += 1;
  }
  return Response.json({ ok: true, processed });
}
