import { dispatchNotifications } from "@/supabase/functions/_shared/dispatch";

export const runtime = "nodejs";
export const maxDuration = 60;

export const POST = dispatchNotifications;
