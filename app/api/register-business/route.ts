import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/sendEmail";
import {
  createBusinessForOwner,
  type RegisterBusinessPayload
} from "./_shared";
import {
  createProfileActivationRequest,
  findAuthUserByEmail,
  hasOwnerProfile
} from "../profile-activation/_utils";

export const runtime = "nodejs";

type RegisterBusinessBody = {
  business_name?: string;
  owner_name?: string;
  email?: string;
  password?: string;
  whatsapp_phone?: string;
  address?: string;
  instagram_url?: string;
};

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function getAppOrigin(request: Request) {
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const requestOrigin = request.headers.get("origin") ?? "";

  return (configuredUrl || requestOrigin).replace(/\/$/, "");
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Error inesperado.";
}

function getSignupErrorMessage(message: string) {
  return message.toLowerCase().includes("already")
    ? "Ya existe una cuenta con ese email."
    : message;
}

export async function POST(request: Request) {
  const supabase = getAdminClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Faltan variables de entorno de Supabase." },
      { status: 500 }
    );
  }

  try {
    const body = (await request.json()) as RegisterBusinessBody;
    const businessName = cleanText(body.business_name);
    const ownerName = cleanText(body.owner_name);
    const email = cleanText(body.email).toLowerCase();
    const password = cleanText(body.password);
    const whatsappPhone = cleanText(body.whatsapp_phone);
    const address = cleanText(body.address);
    const instagramUrl = cleanText(body.instagram_url);

    if (!businessName || !ownerName || !email || !password) {
      return NextResponse.json(
        { error: "Rellena nombre de barbería, responsable, email y contraseña." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 8 caracteres." },
        { status: 400 }
      );
    }

    const businessPayload: RegisterBusinessPayload = {
      business_name: businessName,
      owner_name: ownerName,
      email,
      whatsapp_phone: whatsappPhone,
      address,
      instagram_url: instagramUrl
    };
    const existingUser = await findAuthUserByEmail(supabase, email);

    if (existingUser) {
      const alreadyOwner = await hasOwnerProfile(supabase, existingUser.id, email);

      if (alreadyOwner) {
        return NextResponse.json(
          { error: "Este email ya tiene un perfil de propietario activo." },
          { status: 409 }
        );
      }

      await createProfileActivationRequest({
        request,
        supabaseAdmin: supabase,
        userId: existingUser.id,
        email,
        profileType: "owner",
        payload: businessPayload,
        name: ownerName
      });

      return NextResponse.json({
        ok: true,
        activation_required: true,
        email,
        message: "Te hemos enviado un correo para activar tu perfil de flowbarber."
      });
    }

    const redirectTo = `${getAppOrigin(
      request
    )}/auth/callback?mode=verify&next=/panel`;
    const { data: userData, error: userError } =
      await supabase.auth.admin.generateLink({
        type: "signup",
        email,
        password,
        options: {
          data: {
            full_name: ownerName,
            business_name: businessName
          },
          redirectTo
        }
      });

    const verificationUrl = userData.properties?.action_link;

    if (userError || !userData.user || !verificationUrl) {
      return NextResponse.json(
        {
          error: getSignupErrorMessage(
            userError?.message ?? "No se pudo crear el usuario."
          )
        },
        { status: 400 }
      );
    }

    const business = await createBusinessForOwner({
      supabase,
      userId: userData.user.id,
      payload: businessPayload
    });

    await sendEmail({
      to: email,
      subject: "Confirma tu correo en flowbarber",
      template: "VerifyEmail",
      props: {
        name: ownerName,
        verificationUrl
      }
    });

    return NextResponse.json({
      ok: true,
      business: {
        id: business.id,
        name: businessName,
        slug: business.slug
      },
      email,
      public_url: `/barberia/${business.slug}`,
      panel_url: "/panel"
    });
  } catch (error) {
    console.error("Error registering business:", error);

    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
