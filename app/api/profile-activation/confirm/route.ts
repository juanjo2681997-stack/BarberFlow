import { NextResponse } from "next/server";
import { getSupabaseAdmin, hashActivationToken } from "../_utils";

export const runtime = "nodejs";

function activationResponse(
  error: string,
  code: "invalid" | "used" | "expired",
  status: number
) {
  return NextResponse.json({ error, code }, { status });
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

    if (!activationRequest) {
      return activationResponse("El enlace no es válido.", "invalid", 404);
    }

    if (activationRequest.used_at) {
      return activationResponse("Este enlace ya ha sido utilizado.", "used", 409);
    }

    if (new Date(activationRequest.expires_at).getTime() <= Date.now()) {
      return activationResponse("Este enlace ha caducado.", "expired", 410);
    }

    const confirmedAt = new Date().toISOString();
    const { data: confirmedRequest, error: updateError } = await supabaseAdmin
      .from("profile_activation_requests")
      .update({
        used_at: confirmedAt,
        confirmed_at: confirmedAt
      })
      .eq("id", activationRequest.id)
      .is("used_at", null)
      .gt("expires_at", confirmedAt)
      .select("id, email, user_id, profile_type, payload, confirmed_at")
      .maybeSingle();

    if (updateError) {
      console.error("Error confirming profile activation request:", updateError);
      return NextResponse.json(
        { error: "No se pudo confirmar la solicitud." },
        { status: 500 }
      );
    }

    if (!confirmedRequest) {
      return activationResponse("Este enlace ya ha sido utilizado.", "used", 409);
    }

    return NextResponse.json({
      ok: true,
      message: "Solicitud confirmada correctamente.",
      activation: {
        id: confirmedRequest.id,
        email: confirmedRequest.email,
        user_id: confirmedRequest.user_id,
        profile_type: confirmedRequest.profile_type,
        payload: confirmedRequest.payload,
        confirmed_at: confirmedRequest.confirmed_at
      }
    });
  } catch (error) {
    console.error("Error confirming profile activation:", error);

    return NextResponse.json(
      { error: "No se pudo confirmar la solicitud." },
      { status: 500 }
    );
  }
}
