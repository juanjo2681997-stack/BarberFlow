"use client";

import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import type { PluginListenerHandle } from "@capacitor/core";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

let token = "";
let ownerSession: Session | null = null;
let listeners: PluginListenerHandle[] = [];
let setup: Promise<void> | null = null;
let saving = Promise.resolve();
let disabled = false;

export function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function preferenceKey(userId: string) {
  return `flowbarber-push-enabled:${userId}`;
}

export async function nativeNotificationsEnabled() {
  if (!isNativeAndroid() || !Capacitor.isPluginAvailable("PushNotifications")) return false;
  const session = (await supabase.auth.getSession()).data.session;
  if (!session || localStorage.getItem(preferenceKey(session.user.id)) === "false") return false;
  const permission = await PushNotifications.checkPermissions();
  return permission.receive === "granted" &&
    localStorage.getItem("flowbarber-push-owner") === session.user.id &&
    Boolean(localStorage.getItem("flowbarber-push-token"));
}

export async function deactivateNativeNotifications() {
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) throw new Error("Inicia sesión para desactivar los avisos.");
  localStorage.setItem(preferenceKey(session.user.id), "false");
  await releaseNativeDevice();
  window.dispatchEvent(new Event("flowbarber:push-state-changed"));
}

async function saveToken() {
  if (disabled) return;
  const session = (await supabase.auth.getSession()).data.session;
  if (disabled || !session || !token || localStorage.getItem(preferenceKey(session.user.id)) === "false") return;
  let installationId = localStorage.getItem("flowbarber-installation");
  if (!installationId) {
    installationId = crypto.randomUUID();
    localStorage.setItem("flowbarber-installation", installationId);
  }
  const response = await fetch("/api/push/devices", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ token, installationId })
  });
  if (!response.ok) throw new Error("No se pudo registrar este dispositivo.");
  ownerSession = session;
  localStorage.setItem("flowbarber-push-owner", session.user.id);
  window.dispatchEvent(new Event("flowbarber:push-state-changed"));
}

function queueSave() {
  saving = saving.catch(() => undefined).then(saveToken);
  return saving;
}

export async function releaseNativeDevice() {
  if (!isNativeAndroid()) return;
  disabled = true;
  await saving.catch(() => undefined);
  const session = (await supabase.auth.getSession()).data.session ?? ownerSession;
  const deviceToken = token || localStorage.getItem("flowbarber-push-token");
  if (!deviceToken) return;
  await PushNotifications.unregister();
  await PushNotifications.removeAllDeliveredNotifications();
  if (!session) {
    token = "";
    localStorage.removeItem("flowbarber-push-token");
    localStorage.removeItem("flowbarber-push-owner");
    return;
  }
  const response = await fetch("/api/push/devices", {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ token: deviceToken })
  });
  if (!response.ok) throw new Error("No se pudo desvincular el dispositivo. Inténtalo de nuevo.");
  ownerSession = null;
  token = "";
  localStorage.removeItem("flowbarber-push-token");
  localStorage.removeItem("flowbarber-push-owner");
  window.dispatchEvent(new Event("flowbarber:push-state-changed"));
}

async function ensureListeners() {
  if (setup) return setup;
  setup = (async () => {
    listeners.push(await PushNotifications.addListener("registration", (result) => {
      if (disabled) return;
      token = result.value;
      localStorage.setItem("flowbarber-push-token", token);
      void queueSave().catch(() => {
        window.dispatchEvent(new Event("flowbarber:push-error"));
      });
    }));
    listeners.push(await PushNotifications.addListener("registrationError", () => {
      window.dispatchEvent(new Event("flowbarber:push-error"));
    }));
    listeners.push(await PushNotifications.addListener("pushNotificationReceived", () => {
      window.dispatchEvent(new Event("flowbarber:appointments-changed"));
    }));
    listeners.push(await PushNotifications.addListener("pushNotificationActionPerformed", (result) => {
      window.location.assign(result.notification.data?.view === "panel" ? "/panel" : "/?view=appointments");
    }));
  })().catch(async (error) => {
    await Promise.all(listeners.map((listener) => listener.remove()));
    listeners = [];
    setup = null;
    throw error;
  });
  return setup;
}

export async function activateNativeNotifications(requestPermission = true) {
  if (!isNativeAndroid()) return false;
  const session = (await supabase.auth.getSession()).data.session;
  if (!session) {
    if (!requestPermission) return false;
    throw new Error("Inicia sesión para activar los avisos.");
  }
  if (!requestPermission && localStorage.getItem(preferenceKey(session.user.id)) === "false") {
    await releaseNativeDevice();
    return false;
  }
  if (!Capacitor.isPluginAvailable("PushNotifications")) {
    throw new Error("Esta instalación necesita la próxima actualización Android para activar los avisos.");
  }
  await ensureListeners();
  let permission = await PushNotifications.checkPermissions();
  if ((permission.receive === "prompt" || permission.receive === "prompt-with-rationale") && requestPermission) {
    permission = await PushNotifications.requestPermissions();
  }
  if (permission.receive !== "granted") {
    if (!requestPermission) return false;
    throw new Error("Activa las notificaciones de FlowBarber en los ajustes de Android.");
  }
  if (!requestPermission && localStorage.getItem(preferenceKey(session.user.id)) === "false") return false;
  if (requestPermission) localStorage.setItem(preferenceKey(session.user.id), "true");
  disabled = false;
  await PushNotifications.createChannel({
    id: "appointments",
    name: "Citas",
    description: "Cambios, cancelaciones y recordatorios de tus citas",
    importance: 4,
    visibility: 0
  });
  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("Android no ha confirmado el registro. Revisa la conexión y Firebase."));
    }, 20000);
    const handles: PluginListenerHandle[] = [];
    const cleanup = () => {
      window.clearTimeout(timer);
      void Promise.all(handles.map((handle) => handle.remove()));
    };
    void (async () => {
      handles.push(await PushNotifications.addListener("registration", async () => {
        try {
          await queueSave();
          cleanup();
          resolve();
        } catch (error) {
          cleanup();
          reject(error);
        }
      }));
      handles.push(await PushNotifications.addListener("registrationError", () => {
        cleanup();
        reject(new Error("No se pudo registrar Android en Firebase."));
      }));
      await PushNotifications.register();
    })().catch((error) => {
      cleanup();
      reject(error);
    });
  });
  return true;
}
