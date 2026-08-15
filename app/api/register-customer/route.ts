import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/sendEmail";

export const runtime = "nodejs";

type RegisterCustomerBody = {
  email?: string;
  password?: string;
  full_name?: string;
  phone?: string;
};

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getAppOrigin(request: Request) {
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const requestOrigin = request.headers.get("origin") ?? "";

  return (configuredUrl || requestOrigin).replace(/\/$/, "");
}

function getSignupErrorMessage(message: string) {
  const normalizedMessage = message.toLowerCase();

  return normalizedMessage.includes("already") ||
    normalizedMessage.includes("registered") ||
    normalizedMessage.includes("exists")
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
    const body = (await request.json().catch(() => null)) as
      | RegisterCustomerBody
      | null;
    const email = cleanText(body?.email).toLowerCase();
    const password = cleanText(body?.password);
    const fullName = cleanText(body?.full_name);
    const phone = cleanText(body?.phone);

    if (!email || !password || !fullName || !phone) {
      return NextResponse.json(
        { error: "Rellena nombre, telefono, email y contrasena." },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "La contrasena debe tener al menos 8 caracteres." },
        { status: 400 }
      );
    }

    const redirectTo = `${getAppOrigin(
      request
    )}/auth/callback?mode=verify&next=/`;
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone
        },
        redirectTo
      }
    });

    const verificationUrl = data.properties?.action_link;

    if (error || !data.user || !verificationUrl) {
      return NextResponse.json(
        {
          error: getSignupErrorMessage(
            error?.message ?? "No se pudo crear el usuario."
          )
        },
        { status: 400 }
      );
    }

    await sendEmail({
      to: email,
      subject: "Confirma tu correo en BarberFlow",
      template: "VerifyEmail",
      props: {
        name: fullName,
        verificationUrl
      }
    });

    return NextResponse.json({
      ok: true,
      email
    });
  } catch (error) {
    console.error("Error registering customer:", error);

    return NextResponse.json(
      { error: "No se pudo crear la cuenta de cliente." },
      { status: 500 }
    );
  }
}
