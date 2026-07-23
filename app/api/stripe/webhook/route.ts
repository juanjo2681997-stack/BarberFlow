import { NextResponse } from "next/server";
import { getSupabaseAdmin, stripe, stripeRequest } from "../_utils";

export const runtime = "nodejs";

type StripeSubscription = {
  id: string;
  customer: string;
  status: string;
  metadata?: {
    business_id?: string;
  };
  current_period_start?: number;
  current_period_end?: number;
  items?: {
    data?: Array<{
      price?: {
        id?: string;
      };
    }>;
  };
};

function toIsoFromSeconds(value: unknown) {
  return typeof value === "number" ? new Date(value * 1000).toISOString() : null;
}

function getSubscriptionPriceId(subscription: StripeSubscription) {
  return subscription.items?.data?.[0]?.price?.id ?? null;
}

async function findBusinessForSubscription(
  supabaseAdmin: any,
  subscription: StripeSubscription
) {
  const metadataBusinessId = subscription.metadata?.business_id;

  if (metadataBusinessId) {
    const { data } = await supabaseAdmin
      .from("businesses")
      .select("id")
      .eq("id", metadataBusinessId)
      .maybeSingle();

    if (data) {
      return data.id;
    }
  }

  const { data: bySubscription } = await supabaseAdmin
    .from("businesses")
    .select("id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  if (bySubscription) {
    return bySubscription.id;
  }

  const { data: byCustomer } = await supabaseAdmin
    .from("businesses")
    .select("id")
    .eq("stripe_customer_id", subscription.customer)
    .maybeSingle();

  return byCustomer?.id ?? null;
}

async function applySubscriptionStatus(
  supabaseAdmin: any,
  subscription: StripeSubscription
) {
  const businessId = await findBusinessForSubscription(
    supabaseAdmin,
    subscription
  );

  if (!businessId) {
    console.error("Stripe subscription without matching business:", subscription.id);
    return;
  }

  const baseUpdate = {
    stripe_customer_id: subscription.customer,
    stripe_subscription_id: subscription.id,
    stripe_price_id: getSubscriptionPriceId(subscription),
    subscription_status:
      subscription.status === "canceled" ? "cancelled" : subscription.status,
    subscription_started_at: toIsoFromSeconds(
      subscription.current_period_start
    ),
    subscription_ends_at: toIsoFromSeconds(subscription.current_period_end)
  };

  if (subscription.status === "active" || subscription.status === "trialing") {
    await supabaseAdmin
      .from("businesses")
      .update({
        ...baseUpdate,
        plan_status: "active",
        plan_name: "basic",
        public_booking_enabled: true
      })
      .eq("id", businessId);
    return;
  }

  if (
    subscription.status === "unpaid" ||
    subscription.status === "incomplete_expired" ||
    subscription.status === "paused" ||
    subscription.status === "canceled"
  ) {
    await supabaseAdmin
      .from("businesses")
      .update({
        ...baseUpdate,
        plan_status: "inactive",
        public_booking_enabled: false
      })
      .eq("id", businessId);
    return;
  }

  await supabaseAdmin
    .from("businesses")
    .update(baseUpdate)
    .eq("id", businessId);
}

async function handleCheckoutCompleted(supabaseAdmin: any, session: any) {
  const businessId = session.metadata?.business_id;

  if (!businessId) {
    return;
  }

  await supabaseAdmin
    .from("businesses")
    .update({
      stripe_customer_id: session.customer ?? null,
      stripe_subscription_id: session.subscription ?? null
    })
    .eq("id", businessId);
}

async function handleInvoicePaid(supabaseAdmin: any, invoice: any) {
  const subscriptionId = invoice.subscription;

  if (!subscriptionId) {
    return;
  }

  const subscription = (await stripeRequest(`/subscriptions/${subscriptionId}`, {
    method: "GET"
  })) as StripeSubscription;

  if (subscription.status === "active" || subscription.status === "trialing") {
    await applySubscriptionStatus(supabaseAdmin, subscription);
  }
}

async function handleInvoicePaymentFailed(supabaseAdmin: any, invoice: any) {
  const subscriptionId = invoice.subscription;
  const customerId = invoice.customer;

  let query = supabaseAdmin
    .from("businesses")
    .update({
      subscription_status: "past_due"
    });

  if (subscriptionId) {
    query = query.eq("stripe_subscription_id", subscriptionId);
  } else if (customerId) {
    query = query.eq("stripe_customer_id", customerId);
  } else {
    return;
  }

  await query;
}

export async function POST(request: Request) {
  const supabaseAdmin = getSupabaseAdmin();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!supabaseAdmin || !webhookSecret) {
    return NextResponse.json(
      { error: "Faltan variables de entorno de Stripe o Supabase." },
      { status: 500 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  if (!signature) {
    return NextResponse.json({ error: "Falta firma de Stripe." }, { status: 400 });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("Invalid Stripe webhook signature:", error);
    return NextResponse.json({ error: "Firma no válida." }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(supabaseAdmin, event.data.object);
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated"
    ) {
      await applySubscriptionStatus(supabaseAdmin, event.data.object);
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as StripeSubscription;
      await applySubscriptionStatus(supabaseAdmin, {
        ...subscription,
        status: "canceled"
      });
    }

    if (event.type === "invoice.paid") {
      await handleInvoicePaid(supabaseAdmin, event.data.object);
    }

    if (event.type === "invoice.payment_failed") {
      await handleInvoicePaymentFailed(supabaseAdmin, event.data.object);
    }
  } catch (error) {
    console.error("Error handling Stripe webhook:", error);
    return NextResponse.json(
      { error: "No se pudo procesar el webhook." },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
