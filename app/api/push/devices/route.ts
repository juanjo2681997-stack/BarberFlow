import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "../../profile-activation/_utils";

export const runtime = "nodejs";

async function handle(request: Request, remove: boolean) {
  try {
    if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }
    const { supabaseAdmin, user, error } = await getAuthenticatedUser(request);
    if (error || !user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    const body = await request.json().catch(() => null);
    if (typeof body?.token !== "string" || body.token.length < 20 || body.token.length > 4096) {
      return NextResponse.json({ error: "Token no válido." }, { status: 400 });
    }
    if (remove) {
      const result = await supabaseAdmin.from("native_push_devices").delete()
        .eq("user_id", user.id).eq("token", body.token);
      if (result.error) throw result.error;
    } else {
      if (typeof body.installationId !== "string" ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.installationId)) {
        return NextResponse.json({ error: "Dispositivo no válido." }, { status: 400 });
      }
      const result = await supabaseAdmin.rpc("register_native_push_device", {
        device_token: body.token, installation: body.installationId, owner_id: user.id
      });
      if (result.error) throw result.error;
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "No se pudo actualizar el dispositivo." }, { status: 500 });
  }
}

export async function POST(request: Request) { return handle(request, false); }
export async function DELETE(request: Request) { return handle(request, true); }
