import { createHash, randomBytes } from "node:crypto";
import { createClient, type User } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/sendEmail";

export type ProfileType = "customer" | "owner";

export type ActivationPayload = Record<string, string>;

type SupabaseAdminClient = {
  auth: {
    getUser: (token: string) => Promise<{
      data: { user: User | null };
      error: { message: string } | null;
    }>;
    admin: {
      listUsers: (params: {
        page: number;
        perPage: number;
      }) => Promise<{
        data: { users: User[] };
        error: { message: string } | null;
      }>;
    };
  };
  from: (table: string) => any;
};

export const activationTokenMinutes = 30;

export function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Faltan variables de entorno de Supabase.");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

export function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
}

export async function getAuthenticatedUser(request: Request) {
  const supabaseAdmin = getSupabaseAdmin();
  const token = getBearerToken(request);

  if (!token) {
    return { supabaseAdmin, user: null, error: "No autorizado." };
  }

  const {
    data: { user },
    error
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return { supabaseAdmin, user: null, error: "No autorizado." };
  }

  return { supabaseAdmin, user, error: null };
}

export function isProfileType(value: unknown): value is ProfileType {
  return value === "customer" || value === "owner";
}

export function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function cleanPayload(
  profileType: ProfileType,
  payload: unknown
): ActivationPayload {
  const source =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};

  if (profileType === "customer") {
    return {
      full_name: cleanText(source.full_name),
      phone: cleanText(source.phone)
    };
  }

  return {
    business_name: cleanText(source.business_name),
    owner_name: cleanText(source.owner_name),
    whatsapp_phone: cleanText(source.whatsapp_phone),
    address: cleanText(source.address),
    instagram_url: cleanText(source.instagram_url)
  };
}

export function validatePayload(profileType: ProfileType, payload: ActivationPayload) {
  const serializedPayload = JSON.stringify(payload);

  if (serializedPayload.length > 8000) {
    return "La solicitud es demasiado grande.";
  }

  if (profileType === "customer") {
    if (!payload.full_name || !payload.phone) {
      return "Faltan los datos del perfil de cliente.";
    }

    return null;
  }

  if (!payload.business_name || !payload.owner_name) {
    return "Faltan los datos del perfil de propietario.";
  }

  return null;
}

export function generateActivationToken() {
  return randomBytes(32).toString("base64url");
}

export function hashActivationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getExpiresAt() {
  return new Date(Date.now() + activationTokenMinutes * 60 * 1000).toISOString();
}

export function getAppOrigin(request: Request) {
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const requestOrigin = request.headers.get("origin") ?? "";

  return (configuredUrl || requestOrigin).replace(/\/$/, "");
}

export function getActivationUrl(request: Request, token: string) {
  return `${getAppOrigin(request)}/activar-perfil?token=${encodeURIComponent(
    token
  )}`;
}

export async function sendProfileActivationEmail(params: {
  request: Request;
  email: string;
  profileType: ProfileType;
  token: string;
  name?: string;
}) {
  const activationUrl = getActivationUrl(params.request, params.token);

  await sendEmail({
    to: params.email,
    subject:
      params.profileType === "owner"
        ? "Confirma tu perfil de barbería en flowbarber"
        : "Confirma tu perfil de cliente en flowbarber",
    template: params.profileType === "owner" ? "ActivateOwner" : "ActivateCustomer",
    props: {
      name: params.name,
      activationUrl
    }
  });
}

export function getUserEmail(user: User) {
  return typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
}

export async function findAuthUserByEmail(
  supabaseAdmin: SupabaseAdminClient,
  email: string
) {
  const cleanEmail = email.trim().toLowerCase();
  const perPage = 1000;

  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage
    });

    if (error) {
      throw new Error(error.message);
    }

    const users = data.users ?? [];
    const foundUser = users.find(
      (user) => getUserEmail(user) === cleanEmail
    );

    if (foundUser || users.length < perPage) {
      return foundUser ?? null;
    }
  }

  return null;
}

export async function hasCustomerProfile(
  supabaseAdmin: SupabaseAdminClient,
  userId: string
) {
  const { data, error } = await supabaseAdmin
    .from("customer_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

export async function hasOwnerProfile(
  supabaseAdmin: SupabaseAdminClient,
  userId: string,
  email: string
) {
  let result = await supabaseAdmin
    .from("business_users")
    .select("business_id")
    .eq("user_id", userId)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  if (!result.data && email) {
    result = await supabaseAdmin
      .from("business_users")
      .select("business_id")
      .eq("email", email)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();
  }

  if (result.error) {
    throw result.error;
  }

  return Boolean(result.data);
}

export async function createProfileActivationRequest(params: {
  request: Request;
  supabaseAdmin: SupabaseAdminClient;
  userId: string;
  email: string;
  profileType: ProfileType;
  payload: ActivationPayload;
  name?: string;
}) {
  const payloadError = validatePayload(params.profileType, params.payload);

  if (payloadError) {
    throw new Error(payloadError);
  }

  const now = new Date().toISOString();

  const { error: invalidateError } = await params.supabaseAdmin
    .from("profile_activation_requests")
    .update({ used_at: now })
    .eq("user_id", params.userId)
    .eq("profile_type", params.profileType)
    .is("used_at", null);

  if (invalidateError) {
    throw new Error(invalidateError.message);
  }

  const token = generateActivationToken();
  const tokenHash = hashActivationToken(token);
  const expiresAt = getExpiresAt();

  const { data: activationRequest, error: insertError } = await params.supabaseAdmin
    .from("profile_activation_requests")
    .insert({
      email: params.email,
      user_id: params.userId,
      profile_type: params.profileType,
      token_hash: tokenHash,
      payload: params.payload,
      expires_at: expiresAt
    })
    .select("id")
    .single();

  if (insertError || !activationRequest) {
    throw new Error(insertError?.message ?? "No se pudo crear la solicitud.");
  }

  try {
    await sendProfileActivationEmail({
      request: params.request,
      email: params.email,
      profileType: params.profileType,
      token,
      name: params.name
    });
  } catch (error) {
    await params.supabaseAdmin
      .from("profile_activation_requests")
      .update({ used_at: new Date().toISOString() })
      .eq("id", activationRequest.id);

    throw error;
  }

  return {
    id: activationRequest.id as string,
    expires_at: expiresAt
  };
}
