import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
const maxImageSize = 3 * 1024 * 1024;
const bucketName = "customer-avatars";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function getToken(request: Request) {
  const authorization = request.headers.get("authorization");

  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
}

function getImageExtension(type: string) {
  if (type === "image/png") {
    return "png";
  }

  if (type === "image/webp") {
    return "webp";
  }

  return "jpg";
}

async function getAuthenticatedUser(supabaseAdmin: any, request: Request) {
  const token = getToken(request);

  if (!token) {
    return { user: null, error: "No autorizado.", status: 401 };
  }

  const {
    data: { user },
    error
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return { user: null, error: "No autorizado.", status: 401 };
  }

  return { user, error: "", status: 200 };
}

async function saveAvatarUrl(supabaseAdmin: any, userId: string, avatarUrl: string) {
  const { data: existingProfile, error: profileError } = await supabaseAdmin
    .from("customer_profiles")
    .select("user_id, full_name, phone")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  const { data: profile, error: updateError } = await supabaseAdmin
    .from("customer_profiles")
    .upsert(
      {
        user_id: userId,
        full_name: existingProfile?.full_name ?? "",
        phone: existingProfile?.phone ?? "",
        avatar_url: avatarUrl
      },
      { onConflict: "user_id" }
    )
    .select("user_id, full_name, phone, avatar_url")
    .single();

  if (updateError) {
    throw updateError;
  }

  const { error: reviewsError } = await supabaseAdmin
    .from("reviews")
    .update({
      customer_avatar_url: avatarUrl
    })
    .eq("customer_user_id", userId);

  if (reviewsError) {
    throw reviewsError;
  }

  return profile;
}

export async function POST(request: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Faltan variables de entorno de Supabase." },
      { status: 500 }
    );
  }

  const authResult = await getAuthenticatedUser(supabaseAdmin, request);

  if (!authResult.user) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  const formData = await request.formData();
  const avatar = formData.get("avatar");

  if (!(avatar instanceof File)) {
    return NextResponse.json(
      { error: "Falta la imagen de perfil." },
      { status: 400 }
    );
  }

  if (!allowedImageTypes.includes(avatar.type)) {
    return NextResponse.json(
      { error: "Solo se permiten imágenes JPG, PNG o WebP." },
      { status: 400 }
    );
  }

  if (avatar.size > maxImageSize) {
    return NextResponse.json(
      { error: "La imagen no puede superar 3 MB." },
      { status: 400 }
    );
  }

  const extension = getImageExtension(avatar.type);
  const avatarPath = `${authResult.user.id}/avatar-${Date.now()}.${extension}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(bucketName)
    .upload(avatarPath, avatar, {
      contentType: avatar.type,
      upsert: false
    });

  if (uploadError) {
    console.error("Error uploading customer avatar:", uploadError);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from(bucketName)
    .getPublicUrl(avatarPath);

  const avatarUrl = publicUrlData.publicUrl;

  try {
    const profile = await saveAvatarUrl(
      supabaseAdmin,
      authResult.user.id,
      avatarUrl
    );

    return NextResponse.json({
      profile,
      avatar_url: avatarUrl
    });
  } catch (error) {
    console.error("Error saving customer avatar:", error);
    return NextResponse.json(
      { error: "No se pudo guardar el avatar." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Faltan variables de entorno de Supabase." },
      { status: 500 }
    );
  }

  const authResult = await getAuthenticatedUser(supabaseAdmin, request);

  if (!authResult.user) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    );
  }

  try {
    const profile = await saveAvatarUrl(supabaseAdmin, authResult.user.id, "");

    return NextResponse.json({
      profile,
      avatar_url: ""
    });
  } catch (error) {
    console.error("Error removing customer avatar:", error);
    return NextResponse.json(
      { error: "No se pudo quitar el avatar." },
      { status: 500 }
    );
  }
}
