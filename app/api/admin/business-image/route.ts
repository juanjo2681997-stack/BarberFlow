import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];
const maxImageSize = 3 * 1024 * 1024;
const bucketName = "business-images";

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

async function validateBusinessUser(
  supabaseAdmin: any,
  token: string,
  businessId: string
) {
  const {
    data: { user },
    error: userError
  } = await supabaseAdmin.auth.getUser(token);

  if (userError || !user) {
    return { isValid: false, status: 401, error: "No autorizado." };
  }

  let businessUserResult = await supabaseAdmin
    .from("business_users")
    .select("business_id")
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!businessUserResult.data && user.email) {
    businessUserResult = await supabaseAdmin
      .from("business_users")
      .select("business_id")
      .eq("business_id", businessId)
      .eq("email", user.email)
      .limit(1)
      .maybeSingle();
  }

  if (businessUserResult.error) {
    console.error("Error checking business user:", businessUserResult.error);
    return {
      isValid: false,
      status: 500,
      error: "No se pudo comprobar la barbería."
    };
  }

  if (!businessUserResult.data) {
    return { isValid: false, status: 403, error: "No autorizado." };
  }

  return { isValid: true, status: 200, error: "" };
}

export async function POST(request: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Faltan variables de entorno de Supabase." },
      { status: 500 }
    );
  }

  const token = getToken(request);

  if (!token) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const formData = await request.formData();
  const businessId = String(formData.get("business_id") ?? "");
  const image = formData.get("image");

  if (!businessId || !(image instanceof File)) {
    return NextResponse.json(
      { error: "Falta la barbería o la imagen." },
      { status: 400 }
    );
  }

  if (!allowedImageTypes.includes(image.type)) {
    return NextResponse.json(
      { error: "Solo se permiten imágenes JPG, PNG o WebP." },
      { status: 400 }
    );
  }

  if (image.size > maxImageSize) {
    return NextResponse.json(
      { error: "La imagen no puede superar 3 MB." },
      { status: 400 }
    );
  }

  const validation = await validateBusinessUser(supabaseAdmin, token, businessId);

  if (!validation.isValid) {
    return NextResponse.json(
      { error: validation.error },
      { status: validation.status }
    );
  }

  const extension = getImageExtension(image.type);
  const imagePath = `${businessId}/profile-${Date.now()}.${extension}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(bucketName)
    .upload(imagePath, image, {
      contentType: image.type,
      upsert: false
    });

  if (uploadError) {
    console.error("Error uploading business image:", uploadError);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: publicUrlData } = supabaseAdmin.storage
    .from(bucketName)
    .getPublicUrl(imagePath);

  const profileImageUrl = publicUrlData.publicUrl;
  const { data: business, error: updateError } = await supabaseAdmin
    .from("businesses")
    .update({
      profile_image_url: profileImageUrl
    })
    .eq("id", businessId)
    .select("id, name, slug, profile_image_url, cover_image_url")
    .single();

  if (updateError) {
    console.error("Error saving business image:", updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    business,
    profile_image_url: profileImageUrl
  });
}

export async function DELETE(request: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Faltan variables de entorno de Supabase." },
      { status: 500 }
    );
  }

  const token = getToken(request);

  if (!token) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const body = await request.json();
  const businessId = typeof body.business_id === "string" ? body.business_id : "";

  if (!businessId) {
    return NextResponse.json(
      { error: "Falta la barbería." },
      { status: 400 }
    );
  }

  const validation = await validateBusinessUser(supabaseAdmin, token, businessId);

  if (!validation.isValid) {
    return NextResponse.json(
      { error: validation.error },
      { status: validation.status }
    );
  }

  const { data: business, error: updateError } = await supabaseAdmin
    .from("businesses")
    .update({
      profile_image_url: ""
    })
    .eq("id", businessId)
    .select("id, name, slug, profile_image_url, cover_image_url")
    .single();

  if (updateError) {
    console.error("Error removing business image:", updateError);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    business,
    profile_image_url: ""
  });
}
