import { dispatchNotifications } from "../_shared/dispatch.ts";

Deno.serve(async (request: Request) => {
  try {
    return await dispatchNotifications(request);
  } catch {
    return Response.json({ error: "No se pudo procesar la cola." }, { status: 500 });
  }
});
