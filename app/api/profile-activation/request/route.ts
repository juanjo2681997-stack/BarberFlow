import { NextResponse } from "next/server";
import {
  cleanPayload,
  generateActivationToken,
  getAuthenticatedUser,
  getExpiresAt,
  getUserEmail,
  hashActivationToken,
  isProfileType,
  sendProfileActivationEmail
} from "../_utils";

export const runtime = "nodejs";

async function hasCustomerProfile(supabaseAdmin: any, userId: string) {
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

async function hasOwnerProfile(
  supabaseAdmin: any,
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

export async function POST(request: Request) {
  try {
    const { supabaseAdmin, user, error } = await getAuthenticatedUser(request);

    if (error || !user) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    const email = getUserEmail(user);

    if (!email) {
      return NextResponse.json(
        { error: "Tu cuenta no tiene email asociado." },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => null);
    const profileType = body?.profile_type;

    if (!isProfileType(profileType)) {
      return NextResponse.json(
        { error: "Tipo de perfil no válido." },
        { status: 400 }
      );
    }

    const payload = cleanPayload(profileType, body?.payload);
    const payloadError =
      profileType === "customer"
        ? !payload.full_name || !payload.phone
          ? "Faltan los datos del perfil de cliente."
          : null
        : !payload.business_name || !payload.owner_name
          ? "Faltan los datos del perfil de propietario."
          : null;

    if (payloadError) {
      return NextResponse.json({ error: payloadError }, { status: 400 });
    }

    const serializedPayload = JSON.stringify(payload);

    if (serializedPayload.length > 8000) {
      return NextResponse.json(
        { error: "La solicitud es demasiado grande." },
        { status: 400 }
      );
    }

    const profileAlreadyExists =
      profileType === "customer"
        ? await hasCustomerProfile(supabaseAdmin, user.id)
        : await hasOwnerProfile(supabaseAdmin, user.id, email);

    if (profileAlreadyExists) {
      return NextResponse.json(
        { error: "Este perfil ya está activo." },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();

    const { error: invalidateError } = await supabaseAdmin
      .from("profile_activation_requests")
      .update({ used_at: now })
      .eq("user_id", user.id)
      .eq("profile_type", profileType)
      .is("used_at", null);

    if (invalidateError) {
      console.error("Error invalidating profile activation requests:", invalidateError);
      return NextResponse.json(
        { error: "No se pudo preparar la solicitud." },
        { status: 500 }
      );
    }

    const token = generateActivationToken();
    const tokenHash = hashActivationToken(token);
    const expiresAt = getExpiresAt();

    const { data: activationRequest, error: insertError } = await supabaseAdmin
      .from("profile_activation_requests")
      .insert({
        email,
        user_id: user.id,
        profile_type: profileType,
        token_hash: tokenHash,
        payload,
        expires_at: expiresAt
      })
      .select("id")
      .single();

    if (insertError || !activationRequest) {
      console.error("Error creating profile activation request:", insertError);
      return NextResponse.json(
        { error: "No se pudo crear la solicitud de activación." },
        { status: 500 }
      );
    }

    try {
      await sendProfileActivationEmail({
        request,
        email,
        profileType,
        token,
        name:
          profileType === "customer" ? payload.full_name : payload.owner_name
      });
    } catch (emailError) {
      await supabaseAdmin
        .from("profile_activation_requests")
        .update({ used_at: new Date().toISOString() })
        .eq("id", activationRequest.id);

      console.error("Error sending profile activation email:", emailError);

      return NextResponse.json(
        { error: "No se pudo enviar el correo de activación." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Te hemos enviado un correo para confirmar la activación.",
      expires_at: expiresAt
    });
  } catch (error) {
    console.error("Error requesting profile activation:", error);

    return NextResponse.json(
      { error: "No se pudo crear la solicitud de activación." },
      { status: 500 }
    );
  }
}
