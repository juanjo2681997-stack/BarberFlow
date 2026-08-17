import { NextResponse } from "next/server";
import {
  getAuthenticatedUser,
  isProfileType,
  type ProfileType
} from "../_utils";

export const runtime = "nodejs";

function getProfileType(request: Request): ProfileType | null {
  const { searchParams } = new URL(request.url);
  const profileType = searchParams.get("profile_type");

  return isProfileType(profileType) ? profileType : null;
}

export async function GET(request: Request) {
  try {
    const profileType = getProfileType(request);

    if (!profileType) {
      return NextResponse.json(
        { error: "Tipo de perfil no válido." },
        { status: 400 }
      );
    }

    const { supabaseAdmin, user, error } = await getAuthenticatedUser(request);

    if (error || !user) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    const { data, error: requestError } = await supabaseAdmin
      .from("profile_activation_requests")
      .select("id, expires_at, created_at")
      .eq("user_id", user.id)
      .eq("profile_type", profileType)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (requestError) {
      console.error("Error loading profile activation status:", requestError);
      return NextResponse.json(
        { error: "No se pudo comprobar la activación." },
        { status: 500 }
      );
    }

    const expiresAt = data?.expires_at ?? null;
    const isPending = expiresAt
      ? new Date(expiresAt).getTime() > Date.now()
      : false;

    return NextResponse.json({
      status: data ? (isPending ? "pending" : "expired") : "none",
      pending: isPending,
      expires_at: expiresAt
    });
  } catch (error) {
    console.error("Error checking profile activation status:", error);

    return NextResponse.json(
      { error: "No se pudo comprobar la activación." },
      { status: 500 }
    );
  }
}
