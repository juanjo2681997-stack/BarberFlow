import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type PushSubscriptionBody = {
  appointment_id?: string;
  customer_phone?: string;
  user_agent?: string;
  subscription?: {
    endpoint?: string;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
  };
};

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();

    if (!supabase) {
      return NextResponse.json(
        { error: "Faltan variables de entorno de Supabase." },
        { status: 500 }
      );
    }

    const body = (await request.json()) as PushSubscriptionBody;
    const endpoint = body.subscription?.endpoint;
    const p256dh = body.subscription?.keys?.p256dh;
    const auth = body.subscription?.keys?.auth;

    if (!body.appointment_id || !body.customer_phone || !endpoint || !p256dh || !auth) {
      return NextResponse.json(
        { error: "Faltan datos para guardar la suscripción." },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("push_subscriptions").insert({
      appointment_id: body.appointment_id,
      customer_phone: body.customer_phone,
      endpoint,
      p256dh,
      auth,
      user_agent: body.user_agent || request.headers.get("user-agent")
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
