import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/sendEmail";
import {
  cleanText,
  findAuthUserByEmail,
  getAppOrigin,
  getSupabaseAdmin
} from "../../profile-activation/_utils";

export const runtime = "nodejs";

type PasswordResetBody = {
  email?: string;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getUserDisplayName(user: { user_metadata?: Record<string, unknown> }) {
  const metadata = user.user_metadata ?? {};
  const fullName = cleanText(metadata.full_name);
  const name = cleanText(metadata.name);

  return fullName || name || undefined;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | PasswordResetBody
      | null;
    const email = cleanText(body?.email).toLowerCase();

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Introduce el email utilizado para crear la cuenta." },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const user = await findAuthUserByEmail(supabaseAdmin, email);

    if (!user) {
      return NextResponse.json(
        { error: "No existe ninguna cuenta creada con ese email." },
        { status: 404 }
      );
    }

    const redirectTo = `${getAppOrigin(request)}/actualizar-contrasena`;
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo
      }
    });
    const resetUrl = data.properties?.action_link;

    if (error || !resetUrl) {
      return NextResponse.json(
        { error: "No se pudo generar el enlace de recuperación." },
        { status: 400 }
      );
    }

    await sendEmail({
      to: email,
      subject: "Recuperar contraseña",
      template: "ResetPassword",
      props: {
        name: getUserDisplayName(user),
        resetUrl
      }
    });

    return NextResponse.json({
      ok: true,
      message: "Te hemos enviado un email para recuperar tu contraseña."
    });
  } catch (error) {
    console.error("Error sending password reset email:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo enviar el email de recuperación."
      },
      { status: 500 }
    );
  }
}
