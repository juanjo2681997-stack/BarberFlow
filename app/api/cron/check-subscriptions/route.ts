import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

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

async function checkExpiredTrials(request: Request) {
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

  const { data, error } = await supabase
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

  if (error) {
    console.error("Error checking expired trials:", error);
    return NextResponse.json(
      { error: "No se pudieron actualizar las pruebas vencidas." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    checked_at: now,
    updated_count: data?.length ?? 0,
    businesses: data ?? []
  });
}

export async function GET(request: Request) {
  return checkExpiredTrials(request);
}

export async function POST(request: Request) {
  return checkExpiredTrials(request);
}
