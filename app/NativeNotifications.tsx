"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { activateNativeNotifications, isNativeAndroid, releaseNativeDevice } from "@/lib/push/native";

export default function NativeNotifications() {
  useEffect(() => {
    if (!isNativeAndroid()) return;
    const refresh = () => {
      if (document.visibilityState === "visible") {
        void supabase.auth.getSession().then(({ data }) => {
          if (data.session) return activateNativeNotifications(false);
        }).catch(() => undefined);
        window.dispatchEvent(new Event("flowbarber:appointments-changed"));
      }
    };
    const { data } = supabase.auth.onAuthStateChange((event) => {
      window.setTimeout(() => {
        if (event === "SIGNED_OUT") void releaseNativeDevice().catch(() => undefined);
        else refresh();
      }, 0);
    });
    document.addEventListener("visibilitychange", refresh);
    refresh();
    return () => {
      data.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return null;
}
