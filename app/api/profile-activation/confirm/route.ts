import { NextResponse } from "next/server";
import { createBusinessForOwner } from "../../register-business/_shared";
import {
  cleanPayload,
  getSupabaseAdmin,
  hasCustomerProfile,
  hasOwnerProfile,
  hashActivationToken,
  isProfileType,
  validatePayload,
  type ActivationPayload,
  type ProfileType
} from "../_utils";

export const runtime = "nodejs";

function activationResponse(
  error: string,
  code: "invalid" | "used" | "expired",
  status: number
) {
  return NextResponse.json({ error, code }, { status });
}

async function createCustomerProfile(params: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  userId: string;
  payload: ActivationPayload;
}) {
  const { error } = await params.supabaseAdmin.from("customer_profiles").upsert(
    {
      user_id: params.userId,
      full_name: params.payload.full_name,
      phone: params.payload.phone
    },
    { onConflict: "user_id" }
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function createConfirmedProfile(params: {
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>;
  userId: string;
  email: string;
  profileType: ProfileType;
  payload: ActivationPayload;
}) {
  if (params.profileType === "customer") {
    const alreadyCustomer = await hasCustomerProfile(
      params.supabaseAdmin,
      params.userId
    );

    if (!alreadyCustomer) {
      await createCustomerProfile({
        supabaseAdmin: params.supabaseAdmin,
        userId: params.userId,
        payload: params.payload
      });
    }

    return null;
  }

  const alreadyOwner = await hasOwnerProfile(
    params.supabaseAdmin,
    params.userId,
    params.email
  );

  if (alreadyOwner) {
    return null;
  }

  return createBusinessForOwner({
    supabase: params.supabaseAdmin,
    userId: params.userId,
    payload: {
      business_name: params.payload.business_name,
      owner_name: params.payload.owner_name,
      email: params.email,
      whatsapp_phone: params.payload.whatsapp_phone ?? "",
      address: params.payload.address ?? "",
      instagram_url: params.payload.instagram_url ?? ""
    }
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const token = typeof body?.token === "string" ? body.token.trim() : "";

    if (!token) {
      return activationResponse("El enlace no es válido.", "invalid", 400);
    }

    const supabaseAdmin = getSupabaseAdmin();
    const tokenHash = hashActivationToken(token);

    const { data: activationRequest, error: loadError } = await supabaseAdmin
      .from("profile_activation_requests")
      .select(
        "id, email, user_id, profile_type, payload, expires_at, used_at, confirmed_at, created_at"
      )
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (loadError) {
      console.error("Error loading profile activation request:", loadError);
      return NextResponse.json(
        { error: "No se pudo comprobar el enlace." },
        { status: 500 }
      );
    }

    if (!activationRequest || !isProfileType(activationRequest.profile_type)) {
      return activationResponse("El enlace no es válido.", "invalid", 404);
    }

    if (activationRequest.used_at) {
      return activationResponse("Este enlace ya ha sido utilizado.", "used", 409);
    }

    if (new Date(activationRequest.expires_at).getTime() <= Date.now()) {
      return activationResponse("Este enlace ha caducado.", "expired", 410);
    }

    const payload = cleanPayload(
      activationRequest.profile_type,
      activationRequest.payload
    );
    const payloadError = validatePayload(
      activationRequest.profile_type,
      payload
    );

    if (payloadError) {
      return activationResponse("El enlace no es válido.", "invalid", 400);
    }

    const confirmedAt = new Date().toISOString();
    const { data: claimedRequest, error: claimError } = await supabaseAdmin
      .from("profile_activation_requests")
      .update({
        used_at: confirmedAt,
        confirmed_at: confirmedAt
      })
      .eq("id", activationRequest.id)
      .is("used_at", null)
      .gt("expires_at", confirmedAt)
      .select("id")
      .maybeSingle();

    if (claimError) {
      console.error("Error claiming profile activation request:", claimError);
      return NextResponse.json(
        { error: "No se pudo confirmar la solicitud." },
        { status: 500 }
      );
    }

    if (!claimedRequest) {
      return activationResponse("Este enlace ya ha sido utilizado.", "used", 409);
    }

    const createdBusiness = await createConfirmedProfile({
      supabaseAdmin,
      userId: activationRequest.user_id,
      email: activationRequest.email,
      profileType: activationRequest.profile_type,
      payload
    });

    return NextResponse.json({
      ok: true,
      message: "Perfil activado correctamente.",
      activation: {
        id: activationRequest.id,
        email: activationRequest.email,
        user_id: activationRequest.user_id,
        profile_type: activationRequest.profile_type,
        confirmed_at: confirmedAt
      },
      business: createdBusiness
    });
  } catch (error) {
    console.error("Error confirming profile activation:", error);

    return NextResponse.json(
      { error: "No se pudo confirmar la solicitud." },
      { status: 500 }
    );
  }
}
