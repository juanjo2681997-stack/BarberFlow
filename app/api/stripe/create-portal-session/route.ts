import { NextResponse } from "next/server";
import {
  getAuthenticatedUser,
  getBearerToken,
  getBusinessForUser,
  getSupabaseAdmin,
  stripeRequest
} from "../_utils";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Faltan variables de entorno de Supabase." },
      { status: 500 }
    );
  }

  const user = await getAuthenticatedUser(
    supabaseAdmin,
    getBearerToken(request)
  );

  if (!user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const assignment = await getBusinessForUser(supabaseAdmin, user);

  if (!assignment) {
    return NextResponse.json(
      { error: "No tienes una barbería asignada." },
      { status: 403 }
    );
  }

  const stripeCustomerId = assignment.business.stripe_customer_id;

  if (!stripeCustomerId) {
    return NextResponse.json(
      { error: "Esta barbería todavía no tiene cliente de Stripe." },
      { status: 400 }
    );
  }

  try {
    const origin = request.headers.get("origin") ?? new URL(request.url).origin;
    const portalSession = await stripeRequest("/billing_portal/sessions", {
      body: {
        customer: stripeCustomerId,
        return_url: `${origin}/panel`
      }
    });

    return NextResponse.json({
      url: portalSession.url
    });
  } catch (error) {
    console.error("Error creating Stripe Portal Session:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo abrir la gestión de la suscripción."
      },
      { status: 500 }
    );
  }
}
