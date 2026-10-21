import { dispatchNotifications } from "../_shared/dispatch.ts";

Deno.test("Edge: rechaza GET y POST sin secreto", async () => {
  const original = Deno.env.get("NATIVE_PUSH_DISPATCH_SECRET");
  Deno.env.delete("NATIVE_PUSH_DISPATCH_SECRET");
  try {
    const get = await dispatchNotifications(new Request("https://example.invalid/"));
    if (get.status !== 405) throw new Error("GET debe responder 405");
    const post = await dispatchNotifications(new Request("https://example.invalid/", {
      method: "POST", headers: { authorization: "Bearer undefined" }
    }));
    if (post.status !== 401) throw new Error("POST sin secreto debe responder 401");
    await get.body?.cancel();
    await post.body?.cancel();
  } finally {
    if (original !== undefined) Deno.env.set("NATIVE_PUSH_DISPATCH_SECRET", original);
  }
});

Deno.test("Edge: exige FCM antes de reclamar trabajos", async () => {
  const keys = ["NATIVE_PUSH_DISPATCH_SECRET", "FCM_PROJECT_ID", "FCM_CLIENT_EMAIL", "FCM_PRIVATE_KEY"];
  const original = keys.map(key => [key, Deno.env.get(key)] as const);
  for (const key of keys) Deno.env.delete(key);
  Deno.env.set("NATIVE_PUSH_DISPATCH_SECRET", "test-only-edge-secret");
  try {
    const response = await dispatchNotifications(new Request("https://example.invalid/", {
      method: "POST", headers: { authorization: "Bearer test-only-edge-secret" }
    }));
    if (response.status !== 503) throw new Error("Sin FCM debe responder 503");
    await response.body?.cancel();
  } finally {
    for (const [key, value] of original) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});
