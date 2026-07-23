import { createHmac, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";

const stripeApiVersion = "2024-06-20";

type StripeRequestOptions = {
  method?: "GET" | "POST";
  body?: Record<string, string | number | boolean | null | undefined>;
};

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

export function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
}

export async function stripeRequest(
  path: string,
  options: StripeRequestOptions = {}
) {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("Falta STRIPE_SECRET_KEY.");
  }

  const body = new URLSearchParams();

  for (const [key, value] of Object.entries(options.body ?? {})) {
    if (value === null || value === undefined) {
      continue;
    }

    body.append(key, String(value));
  }

  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: options.method ?? "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": stripeApiVersion
    },
    body: options.method === "GET" ? undefined : body
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error?.message ?? "Error comunicando con Stripe.");
  }

  return data;
}

export async function getAuthenticatedUser(supabaseAdmin: any, token: string) {
  if (!token) {
    return null;
  }

  const {
    data: { user },
    error
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}

export async function getBusinessForUser(supabaseAdmin: any, user: any) {
  let businessUserResult = await supabaseAdmin
    .from("business_users")
    .select("business_id, email, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!businessUserResult.data && user.email) {
    businessUserResult = await supabaseAdmin
      .from("business_users")
      .select("business_id, email, role")
      .eq("email", user.email)
      .limit(1)
      .maybeSingle();
  }

  if (businessUserResult.error) {
    throw new Error("No se pudo comprobar la barbería del usuario.");
  }

  const businessUser = businessUserResult.data;

  if (!businessUser?.business_id) {
    return null;
  }

  const { data: business, error: businessError } = await supabaseAdmin
    .from("businesses")
    .select(
      "id, name, slug, plan_status, public_booking_enabled, stripe_customer_id, stripe_subscription_id, stripe_price_id, subscription_status"
    )
    .eq("id", businessUser.business_id)
    .maybeSingle();

  if (businessError) {
    throw new Error("No se pudo cargar la barbería.");
  }

  if (!business) {
    return null;
  }

  return {
    business,
    businessUser
  };
}

function parseStripeSignature(signature: string) {
  const values = new Map<string, string[]>();

  for (const item of signature.split(",")) {
    const [key, value] = item.split("=");

    if (!key || !value) {
      continue;
    }

    values.set(key, [...(values.get(key) ?? []), value]);
  }

  return {
    timestamp: values.get("t")?.[0] ?? "",
    signatures: values.get("v1") ?? []
  };
}

function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
) {
  const { timestamp, signatures } = parseStripeSignature(signatureHeader);

  if (!timestamp || signatures.length === 0) {
    throw new Error("Firma de Stripe no válida.");
  }

  const timestampNumber = Number(timestamp);
  const toleranceSeconds = 300;
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (
    !Number.isFinite(timestampNumber) ||
    Math.abs(nowSeconds - timestampNumber) > toleranceSeconds
  ) {
    throw new Error("La firma de Stripe ha caducado.");
  }

  const expectedSignature = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  const isValid = signatures.some((signature) => {
    const signatureBuffer = Buffer.from(signature, "hex");

    return (
      signatureBuffer.length === expectedBuffer.length &&
      timingSafeEqual(signatureBuffer, expectedBuffer)
    );
  });

  if (!isValid) {
    throw new Error("Firma de Stripe no válida.");
  }
}

export const stripe = {
  webhooks: {
    constructEvent(rawBody: string, signatureHeader: string, secret: string) {
      verifyStripeSignature(rawBody, signatureHeader, secret);

      return JSON.parse(rawBody);
    }
  }
};
