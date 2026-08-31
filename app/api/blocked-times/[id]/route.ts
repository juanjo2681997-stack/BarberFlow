import { NextResponse } from "next/server";
import { getEmployeeRequestContext } from "../../employees/_utils";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(request: Request, routeContext: RouteContext) {
  const context = await getEmployeeRequestContext(request);

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  if (!context.canManageEmployees) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { id } = await routeContext.params;

  if (!id) {
    return NextResponse.json({ error: "Bloqueo no valido." }, { status: 400 });
  }

  const { error } = await context.supabaseAdmin
    .from("blocked_times")
    .delete()
    .eq("id", id)
    .eq("business_id", context.businessId);

  if (error) {
    console.error("Error deleting blocked time:", error);
    return NextResponse.json(
      { error: "No se pudo eliminar el bloqueo." },
      { status: 500 }
    );
  }

  return NextResponse.json({ deleted: true });
}
