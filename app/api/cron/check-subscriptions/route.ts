import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const PAYMENT_GRACE_HOURS = 48;

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function isCronAuthorized(request: Request) {
  const allowedSecrets = [
    process.env.CRON_SECRET,
    process.env.PUSH_REMINDER_SECRET
  ].filter(Boolean);
  const authorization = request.headers.get("authorization");
  const userAgent = request.headers.get("user-agent") || "";
  const hasSecret = allowedSecrets.some(
    (secret) => authorization === `Bearer ${secret}`
  );
  const isVercelCron =
    !authorization && userAgent.toLowerCase().includes("vercel-cron");

  return hasSecret || isVercelCron;
}

async function checkSubscriptions(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabase = getAdminClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Faltan variables de entorno de Supabase." },
      { status: 500 }
    );
  }

  const now = new Date().toISOString();
  const paymentGraceLimit = new Date(
    Date.now() - PAYMENT_GRACE_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { data: expiredTrials, error: expiredTrialsError } = await supabase
    .from("businesses")
    .update({
      plan_status: "inactive",
      subscription_status: "inactive",
      public_booking_enabled: false
    })
    .eq("plan_status", "demo")
    .eq("subscription_status", "trialing")
    .not("trial_ends_at", "is", null)
    .lt("trial_ends_at", now)
    .select("id, name, slug");

  if (expiredTrialsError) {
    console.error("Error checking expired trials:", expiredTrialsError);
    return NextResponse.json(
      { error: "No se pudieron actualizar las pruebas vencidas." },
      { status: 500 }
    );
  }

  const { data: suspendedPastDueBusinesses, error: pastDueError } = await supabase
    .from("businesses")
    .update({
      public_booking_enabled: false
    })
    .eq("subscription_status", "past_due")
    .not("payment_failed_at", "is", null)
    .lte("payment_failed_at", paymentGraceLimit)
    .select("id, name, slug");

  if (pastDueError) {
    console.error("Error checking past due grace period:", pastDueError);
    return NextResponse.json(
      { error: "No se pudieron actualizar los impagos vencidos." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    checked_at: now,
    expired_trials_count: expiredTrials?.length ?? 0,
    suspended_past_due_count: suspendedPastDueBusinesses?.length ?? 0,
    expired_trials: expiredTrials ?? [],
    suspended_past_due_businesses: suspendedPastDueBusinesses ?? []
  });
}

export async function GET(request: Request) {
  return checkSubscriptions(request);
}

export async function POST(request: Request) {
  return checkSubscriptions(request);
}
