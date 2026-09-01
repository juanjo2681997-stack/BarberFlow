import { NextResponse } from "next/server";
import { getSupabaseAdmin, stripe, stripeRequest } from "../_utils";
import { sendEmail } from "@/lib/email/sendEmail";

export const runtime = "nodejs";

const PAYMENT_GRACE_HOURS = 48;
const SUBSCRIPTION_PAYMENT_FAILED_SUBJECT =
  "No hemos podido procesar tu pago · FlowBarber";

type StripeSubscription = {
  id: string;
  customer: string;
  status: string;
  cancel_at?: number | null;
  cancel_at_period_end?: boolean;
  metadata?: {
    business_id?: string;
  };
  current_period_start?: number;
  current_period_end?: number;
  items?: {
    data?: Array<{
      current_period_end?: number;
      price?: {
        id?: string;
      };
    }>;
  };
};

type StripeInvoice = {
  customer?: string | null;
  subscription?: string | null;
  parent?: {
    subscription_details?: {
      subscription?: string | null;
    };
  };
  lines?: {
    data?: Array<{
      parent?: {
        subscription_item_details?: {
          subscription?: string | null;
        };
      };
    }>;
  };
};

type BusinessPaymentState = {
  id: string;
  name: string | null;
  payment_failed_at: string | null;
};

type OwnerBusinessUser = {
  email: string | null;
  user_id: string | null;
};

type OwnerEmployee = {
  display_name: string | null;
  email: string | null;
};

function toIsoFromSeconds(value: unknown) {
  return typeof value === "number" ? new Date(value * 1000).toISOString() : null;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return cleanText(value).toLowerCase();
}

function getUniqueEmails(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .map(normalizeEmail)
        .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    )
  );
}

function getSafeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error desconocido.";
}

function getAppOrigin(request: Request) {
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const requestOrigin = request.headers.get("origin") ?? "";
  const fallbackOrigin = new URL(request.url).origin;

  return (configuredUrl || requestOrigin || fallbackOrigin).replace(/\/$/, "");
}

function formatEmailDateTime(value: string) {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Madrid"
  }).format(date);
}

function getStripeId(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string"
  ) {
    return value.id;
  }

  return null;
}

function getSubscriptionPriceId(subscription: StripeSubscription) {
  return subscription.items?.data?.[0]?.price?.id ?? null;
}

function getSubscriptionCurrentPeriodEnd(subscription: StripeSubscription) {
  return (
    subscription.current_period_end ??
    subscription.items?.data?.[0]?.current_period_end ??
    null
  );
}

function getScheduledCancellationEndDate(subscription: StripeSubscription) {
  if (!subscription.cancel_at_period_end) {
    return null;
  }

  return toIsoFromSeconds(
    subscription.cancel_at ?? getSubscriptionCurrentPeriodEnd(subscription)
  );
}

function getDeletedSubscriptionEndDate(subscription: StripeSubscription) {
  return toIsoFromSeconds(
    subscription.cancel_at ?? getSubscriptionCurrentPeriodEnd(subscription)
  );
}

function isPaymentGraceExpired(paymentFailedAt: string | null) {
  if (!paymentFailedAt) {
    return false;
  }

  const paymentFailedTime = new Date(paymentFailedAt).getTime();

  return (
    Number.isFinite(paymentFailedTime) &&
    Date.now() - paymentFailedTime >= PAYMENT_GRACE_HOURS * 60 * 60 * 1000
  );
}

function getInvoiceSubscriptionId(invoice: StripeInvoice) {
  return (
    getStripeId(invoice.subscription) ??
    getStripeId(invoice.parent?.subscription_details?.subscription) ??
    getStripeId(
      invoice.lines?.data?.[0]?.parent?.subscription_item_details?.subscription
    )
  );
}

async function getBusinessPaymentState(supabaseAdmin: any, businessId: string) {
  const { data, error } = await supabaseAdmin
    .from("businesses")
    .select("id, name, payment_failed_at")
    .eq("id", businessId)
    .maybeSingle();

  if (error) {
    console.error("Error loading business payment state:", error);
    return null;
  }

  return (data ?? null) as BusinessPaymentState | null;
}

async function getOwnerNotificationRecipients(
  supabaseAdmin: any,
  businessId: string
) {
  const [ownersResult, employeeOwnersResult] = await Promise.all([
    supabaseAdmin
      .from("business_users")
      .select("email, user_id")
      .eq("business_id", businessId)
      .eq("role", "owner"),
    supabaseAdmin
      .from("employees")
      .select("display_name, email")
      .eq("business_id", businessId)
      .eq("role", "owner")
      .eq("is_active", true)
  ]);

  if (ownersResult.error) {
    console.error("Error loading owner business users for payment email:", {
      businessId,
      message: ownersResult.error.message
    });
  }

  if (employeeOwnersResult.error) {
    console.error("Error loading owner employees for payment email:", {
      businessId,
      message: employeeOwnersResult.error.message
    });
  }

  const ownerContacts = (ownersResult.data ?? []) as OwnerBusinessUser[];
  const employeeOwnerContacts =
    (employeeOwnersResult.data ?? []) as OwnerEmployee[];
  const authOwnerEmails = await Promise.all(
    ownerContacts
      .map((owner) => cleanText(owner.user_id))
      .filter(Boolean)
      .map(async (userId) => {
        const { data, error } = await supabaseAdmin.auth.admin.getUserById(
          userId
        );

        if (error) {
          console.error("Error loading owner auth user for payment email:", {
            businessId,
            userId,
            message: error.message
          });
          return "";
        }

        return data.user?.email ?? "";
      })
  );

  return getUniqueEmails([
    ...ownerContacts.map((owner) => owner.email),
    ...authOwnerEmails,
    ...employeeOwnerContacts.map((owner) => owner.email)
  ]);
}

async function sendSubscriptionPaymentFailedEmail(params: {
  supabaseAdmin: any;
  business: BusinessPaymentState;
  paymentFailedAt: string;
  manageSubscriptionUrl: string;
}) {
  const { supabaseAdmin, business, paymentFailedAt, manageSubscriptionUrl } =
    params;
  const ownerEmails = await getOwnerNotificationRecipients(
    supabaseAdmin,
    business.id
  );

  if (ownerEmails.length === 0) {
    console.warn("Subscription payment failed email skipped: missing owner email.", {
      businessId: business.id
    });
    return;
  }

  const graceEndsAt = new Date(
    new Date(paymentFailedAt).getTime() + PAYMENT_GRACE_HOURS * 60 * 60 * 1000
  ).toISOString();

  try {
    await sendEmail({
      to: ownerEmails,
      subject: SUBSCRIPTION_PAYMENT_FAILED_SUBJECT,
      template: "SubscriptionPaymentFailed",
      idempotencyKey: `subscription-payment-failed/${business.id}/${paymentFailedAt}`,
      props: {
        businessName: cleanText(business.name) || "FlowBarber",
        paymentFailedAt: formatEmailDateTime(paymentFailedAt),
        graceEndsAt: formatEmailDateTime(graceEndsAt),
        manageSubscriptionUrl
      }
    });

    console.info("Subscription payment failed email sent:", {
      businessId: business.id,
      recipientCount: ownerEmails.length
    });
  } catch (emailError) {
    console.error("Error sending subscription payment failed email:", {
      businessId: business.id,
      message: getSafeErrorMessage(emailError)
    });
  }
}

async function updateBusinessForPaymentGrace(params: {
  supabaseAdmin: any;
  business: BusinessPaymentState;
  update: Record<string, unknown>;
  paymentFailedAt: string;
}) {
  const { supabaseAdmin, business, update, paymentFailedAt } = params;

  if (business.payment_failed_at) {
    const { error } = await supabaseAdmin
      .from("businesses")
      .update({
        ...update,
        public_booking_enabled: !isPaymentGraceExpired(
          business.payment_failed_at
        ),
        payment_failed_at: business.payment_failed_at
      })
      .eq("id", business.id);

    if (error) {
      throw new Error(error.message);
    }

    return {
      enteredGrace: false,
      business,
      paymentFailedAt: business.payment_failed_at
    };
  }

  const { data, error } = await supabaseAdmin
    .from("businesses")
    .update({
      ...update,
      public_booking_enabled: !isPaymentGraceExpired(paymentFailedAt),
      payment_failed_at: paymentFailedAt
    })
    .eq("id", business.id)
    .is("payment_failed_at", null)
    .select("id, name, payment_failed_at")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return {
      enteredGrace: false,
      business,
      paymentFailedAt: null
    };
  }

  return {
    enteredGrace: true,
    business: data as BusinessPaymentState,
    paymentFailedAt: (data as BusinessPaymentState).payment_failed_at
  };
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
  subscription: StripeSubscription,
  manageSubscriptionUrl?: string
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
    subscription_ends_at: getScheduledCancellationEndDate(subscription)
  };

  if (subscription.status === "active" || subscription.status === "trialing") {
    await supabaseAdmin
      .from("businesses")
      .update({
        ...baseUpdate,
        plan_status: "active",
        plan_name: "basic",
        public_booking_enabled: true,
        payment_failed_at: null
      })
      .eq("id", businessId);
    return;
  }

  if (subscription.status === "past_due") {
    const business = await getBusinessPaymentState(supabaseAdmin, businessId);

    if (!business) {
      console.error("Past due subscription without matching business:", {
        businessId,
        subscriptionId: subscription.id
      });
      return;
    }

    const graceResult = await updateBusinessForPaymentGrace({
      supabaseAdmin,
      business,
      paymentFailedAt: business.payment_failed_at ?? new Date().toISOString(),
      update: {
        ...baseUpdate,
        plan_status: "active",
        plan_name: "basic"
      }
    });

    if (
      graceResult.enteredGrace &&
      graceResult.paymentFailedAt &&
      manageSubscriptionUrl
    ) {
      await sendSubscriptionPaymentFailedEmail({
        supabaseAdmin,
        business: graceResult.business,
        paymentFailedAt: graceResult.paymentFailedAt,
        manageSubscriptionUrl
      });
    }
    return;
  }

  if (
    subscription.status === "unpaid" ||
    subscription.status === "incomplete" ||
    subscription.status === "incomplete_expired" ||
    subscription.status === "paused" ||
    subscription.status === "canceled"
  ) {
    await supabaseAdmin
      .from("businesses")
      .update({
        ...baseUpdate,
        subscription_ends_at:
          subscription.status === "canceled"
            ? getDeletedSubscriptionEndDate(subscription)
            : baseUpdate.subscription_ends_at,
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
  const subscriptionId = getInvoiceSubscriptionId(invoice as StripeInvoice);

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

async function handleInvoicePaymentFailed(
  supabaseAdmin: any,
  invoice: any,
  manageSubscriptionUrl: string
) {
  const subscriptionId = getInvoiceSubscriptionId(invoice as StripeInvoice);
  const customerId = getStripeId((invoice as StripeInvoice).customer);
  let businessQuery = supabaseAdmin
    .from("businesses")
    .select("id, name, payment_failed_at");

  if (subscriptionId) {
    businessQuery = businessQuery.eq("stripe_subscription_id", subscriptionId);
  } else if (customerId) {
    businessQuery = businessQuery.eq("stripe_customer_id", customerId);
  } else {
    return;
  }

  const { data: business, error: businessError } = await businessQuery.maybeSingle();

  if (businessError || !business) {
    console.error("Error finding business for failed invoice:", businessError);
    return;
  }

  const paymentFailedAt = business.payment_failed_at ?? new Date().toISOString();
  const graceResult = await updateBusinessForPaymentGrace({
    supabaseAdmin,
    business,
    paymentFailedAt,
    update: {
      plan_status: "active",
      subscription_status: "past_due"
    }
  });

  if (graceResult.enteredGrace && graceResult.paymentFailedAt) {
    await sendSubscriptionPaymentFailedEmail({
      supabaseAdmin,
      business: graceResult.business,
      paymentFailedAt: graceResult.paymentFailedAt,
      manageSubscriptionUrl
    });
  }
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
    const manageSubscriptionUrl = `${getAppOrigin(request)}/panel`;

    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(supabaseAdmin, event.data.object);
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated"
    ) {
      await applySubscriptionStatus(
        supabaseAdmin,
        event.data.object,
        manageSubscriptionUrl
      );
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
      await handleInvoicePaymentFailed(
        supabaseAdmin,
        event.data.object,
        manageSubscriptionUrl
      );
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
