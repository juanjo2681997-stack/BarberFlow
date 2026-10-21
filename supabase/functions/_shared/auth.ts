import { createHmac, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

function equalValues(first: string, second: string) {
  return Buffer.byteLength(first) === Buffer.byteLength(second) &&
    timingSafeEqual(Buffer.from(first), Buffer.from(second));
}

export function isDispatchAuthorized(authorization: string, secret: string | undefined, now = Date.now()) {
  if (!secret) return false;
  if (equalValues(authorization, `Bearer ${secret}`)) return true;
  const match = /^Bearer v1\.(\d{10,12})\.([0-9a-f-]{36})\.([0-9a-f]{64})$/.exec(authorization);
  if (!match) return false;
  const [, issuedAt, nonce, signature] = match;
  const age = now / 1000 - Number(issuedAt);
  if (age < -5 || age > 60) return false;
  const expected = createHmac("sha256", secret)
    .update(`native-push-dispatch:${issuedAt}:${nonce}`).digest("hex");
  return equalValues(signature, expected);
}
