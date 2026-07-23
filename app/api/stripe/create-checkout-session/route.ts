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
  const priceId = process.env.STRIPE_PRICE_ID;

  if (!supabaseAdmin || !priceId) {
    return NextResponse.json(
      { error: "Faltan variables de entorno de Stripe o Supabase." },
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

  const { business } = assignment;

  if (
    business.plan_status === "active" &&
    business.stripe_subscription_id
  ) {
    return NextResponse.json(
      { error: "Esta barbería ya tiene una suscripción activa." },
      { status: 400 }
    );
  }

  try {
    let stripeCustomerId = business.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await stripeRequest("/customers", {
        body: {
          email: user.email ?? assignment.businessUser.email ?? "",
          name: business.name ?? "",
          "metadata[business_id]": business.id
        }
      });

      stripeCustomerId = customer.id;

      const { error: updateCustomerError } = await supabaseAdmin
        .from("businesses")
        .update({
          stripe_customer_id: stripeCustomerId
        })
        .eq("id", business.id);

      if (updateCustomerError) {
        console.error("Error saving Stripe customer:", updateCustomerError);
        return NextResponse.json(
          { error: "No se pudo guardar el cliente de Stripe." },
          { status: 500 }
        );
      }
    }

    const origin = request.headers.get("origin") ?? new URL(request.url).origin;
    const checkoutSession = await stripeRequest("/checkout/sessions", {
      body: {
        mode: "subscription",
        customer: stripeCustomerId,
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": 1,
        success_url: `${origin}/panel?subscription=success`,
        cancel_url: `${origin}/panel?subscription=cancelled`,
        "metadata[business_id]": business.id,
        "subscription_data[metadata][business_id]": business.id
      }
    });

    return NextResponse.json({
      url: checkoutSession.url
    });
  } catch (error) {
    console.error("Error creating Stripe Checkout Session:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo iniciar el pago."
      },
      { status: 500 }
    );
  }
}
