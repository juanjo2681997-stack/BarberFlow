const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");
const ts = require("typescript");
const Module = require("node:module");
const path = require("node:path");

let database;
const customer = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const business = "00000000-0000-4000-8000-000000000003";

before(async () => {
  database = new PGlite();
  await database.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
    create table public.business_settings(business_id uuid, business_name text);
    create table public.business_users(
      business_id uuid, user_id uuid, email text, role text, employee_id uuid
    );
    create table public.employees(
      id uuid, business_id uuid, is_active boolean, login_enabled boolean
    );
    create table public.appointments(
      id uuid primary key default gen_random_uuid(), customer_user_id uuid, business_id uuid,
      appointment_date date, appointment_time time, service text,
      status text default 'pending', appointment_status text default 'pending',
      customer_name text, cancellation_reason text, reminder_status text default 'pending',
      reminder_sent_at timestamptz, reminder_error text
    );
    insert into auth.users(id) values ('${customer}'), ('${other}');
    insert into business_settings values ('${business}', 'Barbería de prueba');
  `);
  await database.exec(readFileSync(path.join(__dirname, "../supabase/migrations/202610190001_native_notifications.sql"), "utf8"));
});
after(async () => { if (database) await database.close(); });

async function createBooking(overrides = {}) {
  const row = { customer_user_id: customer, business_id: business,
    appointment_date: "2030-06-10", appointment_time: "12:30", service: "Corte", ...overrides };
  const keys = Object.keys(row);
  return (await database.query(
    `insert into appointments(${keys.join(",")}) values(${keys.map((_, index) => "$" + (index + 1)).join(",")}) returning *`,
    Object.values(row))).rows[0];
}
async function jobs(booking) {
  return (await database.query("select * from appointment_notification_jobs where appointment_id = $1 order by created_at, kind", [booking.id])).rows;
}

test("reserva: confirmación y un recordatorio exactamente 24 horas antes en Madrid", async () => {
  const booking = await createBooking();
  const queued = await jobs(booking);
  assert.equal(queued.length, 2);
  const reminder = queued.find(job => job.kind === "reminder");
  assert.equal(new Date(reminder.due_at).toISOString(), "2030-06-09T10:30:00.000Z");
  assert.equal(reminder.payload.businessName, "Barbería de prueba");
  assert.equal(reminder.recipient_id, customer);
});

test("modificar hora, fecha o servicio invalida avisos previos y reprograma", async () => {
  const booking = await createBooking();
  for (const [column, value] of [["appointment_time", "14:00"], ["appointment_date", "2030-06-12"], ["service", "Barba"]]) {
    await database.query(`update appointments set ${column} = $1 where id = $2`, [value, booking.id]);
    const queued = await jobs(booking);
    const pending = queued.filter(job => job.state === "pending");
    assert.deepEqual(pending.map(job => job.kind).sort(), ["modified", "reminder"]);
    assert.ok(queued.filter(job => !pending.includes(job)).every(job => job.state === "cancelled"));
  }
  const reminder = (await jobs(booking)).find(job => job.state === "pending" && job.kind === "reminder");
  assert.equal(reminder.payload.service, "Barba");
  assert.equal(reminder.payload.time, "14:00");
  assert.equal(new Date(reminder.due_at).toISOString(), "2030-06-11T12:00:00.000Z");
});

test("cancelar por cualquier vía invalida el recordatorio y no duplica cancelaciones", async () => {
  for (const column of ["status", "appointment_status"]) {
    const booking = await createBooking();
    await database.query(`update appointments set ${column} = 'cancelled' where id = $1`, [booking.id]);
    await database.query(`update appointments set ${column} = 'cancelled' where id = $1`, [booking.id]);
    const queued = await jobs(booking);
    assert.equal(queued.filter(job => job.state === "pending").length, 1);
    assert.equal(queued.find(job => job.state === "pending").kind, "cancelled");
  }
});

test("eliminar una reserva activa conserva un aviso de cancelación sin recordatorios", async () => {
  const booking = await createBooking();
  await database.query("delete from appointments where id = $1", [booking.id]);
  const queued = await jobs(booking);
  assert.equal(queued.filter(job => job.state === "pending").length, 1);
  assert.equal(queued.find(job => job.kind === "cancelled").payload.deleted, true);
});

test("realizada/no asistió anulan avisos y pendiente crea un nuevo recordatorio", async () => {
  for (const status of ["completed", "no_show"]) {
    const booking = await createBooking();
    await database.query("update appointments set appointment_status = $1 where id = $2", [status, booking.id]);
    assert.equal((await jobs(booking)).filter(job => job.state === "pending").length, 0);
    await database.query("update appointments set appointment_status = 'pending' where id = $1", [booking.id]);
    assert.equal((await jobs(booking)).filter(job => job.state === "pending").length, 2);
  }
});

test("sin cliente no hay avisos; una reserva de última hora no recibe recordatorios tardíos", async () => {
  const guest = await createBooking({ customer_user_id: null });
  assert.equal((await jobs(guest)).length, 0);
  const recent = (await database.query(`
    insert into appointments(customer_user_id, business_id, appointment_date, appointment_time, service)
    values ($1, $2, (now() at time zone 'Europe/Madrid' + interval '2 hours')::date,
      (now() at time zone 'Europe/Madrid' + interval '2 hours')::time, 'Corte') returning *`,
    [customer, business])).rows[0];
  assert.deepEqual((await jobs(recent)).map(job => job.kind), ["confirmed"]);
});

test("los cambios de datos internos no invalidan ni duplican la cola", async () => {
  const booking = await createBooking();
  await database.query("update appointments set customer_name = 'Nombre corregido', notification_revision = 999 where id = $1", [booking.id]);
  assert.equal((await jobs(booking)).length, 2);
  const updated = (await database.query("select notification_revision from appointments where id = $1", [booking.id])).rows[0];
  assert.equal(Number(updated.notification_revision), 1);
});

test("invierno y cambio de hora calculan 24 horas reales", async () => {
  for (const [date, time, expected] of [
    ["2030-01-10", "12:30", "2030-01-09T11:30:00.000Z"],
    ["2030-03-31", "12:30", "2030-03-30T10:30:00.000Z"],
    ["2030-10-27", "12:30", "2030-10-26T11:30:00.000Z"]
  ]) {
    const booking = await createBooking({ appointment_date: date, appointment_time: time });
    const reminder = (await jobs(booking)).find(job => job.kind === "reminder");
    assert.equal(new Date(reminder.due_at).toISOString(), expected);
  }
});

test("los trabajadores reclaman trabajos distintos y rechazan revisiones obsoletas", async () => {
  await database.exec("update appointment_notification_jobs set state = 'cancelled'");
  const booking = await createBooking();
  const first = (await database.query("select * from claim_appointment_notifications(5)")).rows;
  const second = (await database.query("select * from claim_appointment_notifications(5)")).rows;
  assert.equal(first.length, 1);
  assert.equal(second.length, 0);
  const claim = first[0];
  const valid = async () => (await database.query("select notification_is_current($1, $2) as valid", [claim.id, claim.lease_id])).rows[0].valid;
  assert.equal(await valid(), true);
  await database.query("update appointments set service = 'Corte y barba' where id = $1", [booking.id]);
  assert.equal(await valid(), false);
  await database.query("select finish_appointment_notification($1, $2, 'sent', null)", [claim.id, claim.lease_id]);
  assert.equal((await jobs(booking)).find(job => job.id === claim.id).state, "cancelled");
});

test("registro por dispositivo: rotación de token y cambio de cuenta no filtran avisos", async () => {
  const installation = "00000000-0000-4000-8000-000000000004";
  const oldToken = "old-device-token-for-testing-only";
  const newToken = "new-device-token-for-testing-only";
  await database.query("select register_native_push_device($1, $2, $3)", [oldToken, installation, customer]);
  await database.query("select register_native_push_device($1, $2, $3)", [newToken, installation, customer]);
  await database.query("select register_native_push_device($1, $2, $3)", [newToken, installation, other]);
  const devices = (await database.query("select * from native_push_devices")).rows;
  assert.equal(devices.length, 1);
  assert.equal(devices[0].token, newToken);
  assert.equal(devices[0].user_id, other);
});

test("reintentos mantienen los dispositivos enviados y respetan el bloqueo", async () => {
  await database.exec("update appointment_notification_jobs set state = 'cancelled'");
  const booking = await createBooking();
  const claim = (await database.query("select * from claim_appointment_notifications(5)")).rows[0];
  const device = "00000000-0000-4000-8000-000000000005";
  await database.query("select record_notification_delivery($1, $2, $3)", [claim.id, claim.lease_id, device]);
  await database.query("select record_notification_delivery($1, $2, $3)", [claim.id, claim.lease_id, device]);
  await database.query("select finish_appointment_notification($1, $2, 'pending', 'FCM_HTTP_503')", [claim.id, claim.lease_id]);
  const job = (await jobs(booking)).find(job => job.id === claim.id);
  assert.deepEqual(job.delivered_devices, [device]);
  assert.equal(job.state, "pending");
  assert.equal(job.last_error, "FCM_HTTP_503");
});

test("anon y authenticated no leen tokens ni pueden reclamar la cola", async () => {
  for (const role of ["anon", "authenticated"]) {
    await database.exec(`set role ${role}`);
    await assert.rejects(database.query("select token from native_push_devices"), /permission denied/);
    await assert.rejects(database.query("select * from claim_appointment_notifications(5)"), /permission denied/);
    await database.exec("reset role");
  }
});

test("el mensaje modificado indica fecha, hora y servicio nuevos", () => {
  const filename = path.join(__dirname, "../lib/push/message.ts");
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const loaded = new Module(filename, module);
  loaded._compile(compiled, filename);
  const message = loaded.exports.appointmentMessage("modified", {
    businessName: "FlowBarber", date: "2030-06-12", time: "14:00", service: "Barba"
  });
  for (const detail of ["modificada", "2030-06-12", "14:00", "Barba"]) assert.ok(message.body.includes(detail));
});

test("cancelación por el cliente avisa al manager y revocar acceso invalida su aviso", async () => {
  await database.exec("update appointment_notification_jobs set state = 'cancelled'");
  await database.query("insert into business_users(business_id, user_id, role) values ($1, $2, 'manager')", [business, other]);
  const booking = await createBooking();
  await database.query("update appointments set status = 'cancelled', appointment_status = 'cancelled', cancellation_reason = 'Cancelada por el cliente' where id = $1", [booking.id]);
  const staff = (await jobs(booking)).find(job => job.payload.audience === "barber");
  assert.equal(staff.recipient_id, other);
  const claims = (await database.query("select * from claim_appointment_notifications(5)")).rows;
  const claim = claims.find(job => job.id === staff.id);
  assert.ok(claim);
  const valid = async () => (await database.query("select notification_is_current($1, $2) as valid", [claim.id, claim.lease_id])).rows[0].valid;
  assert.equal(await valid(), true);
  await database.query("delete from business_users where user_id = $1", [other]);
  assert.equal(await valid(), false);
});

test("cron y webhook inmediato usan Vault y sólo despiertan al insertar avisos vencidos", async () => {
  await database.exec(`
    create schema vault; create schema net; create schema cron;
    create table vault.decrypted_secrets(name text, decrypted_secret text);
    create table public.test_http_calls(url text, headers jsonb, body jsonb);
    create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer)
      returns bigint language plpgsql as $$
      begin insert into test_http_calls values(url, headers, body); return 1; end; $$;
    create function cron.schedule(job_name text, cron_expression text, command text)
      returns bigint language sql as $$ select 1::bigint; $$;
  `);
  const script = readFileSync(path.join(__dirname, "../supabase/native_push_scheduler.sql"), "utf8")
    .replace(/^create extension[^;]+;/gm, "");
  await database.exec(script);
  await createBooking();
  assert.equal((await database.query("select * from test_http_calls")).rows.length, 0);
  await database.exec(`
    insert into vault.decrypted_secrets values
      ('native_push_dispatch_url', 'https://example.invalid/api/push/dispatch'),
      ('native_push_dispatch_secret', 'test-only-dispatch-secret');
  `);
  const booking = await createBooking();
  const calls = (await database.query("select * from test_http_calls")).rows;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://example.invalid/api/push/dispatch");
  assert.equal(calls[0].headers.Authorization, "Bearer test-only-dispatch-secret");
  await database.query("update appointments set service = 'Barba' where id = $1", [booking.id]);
  assert.equal((await database.query("select * from test_http_calls")).rows.length, 2);
  await database.exec("update appointment_notification_jobs set state = 'cancelled'");
  assert.equal((await database.query("select * from test_http_calls")).rows.length, 2);
});

function loadTypescript(filename) {
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const loaded = new Module(filename, module);
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = (name) => name.startsWith("./")
    ? loadTypescript(path.resolve(path.dirname(filename), name + ".ts"))
    : originalRequire(name);
  loaded._compile(compiled, filename);
  return loaded.exports;
}

test("FCM firma OAuth, envía los datos nuevos y descarta mensajes diferidos", async () => {
  const { generateKeyPairSync, verify } = require("node:crypto");
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const keys = ["FCM_PROJECT_ID", "FCM_CLIENT_EMAIL", "FCM_PRIVATE_KEY"];
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originalFetch = global.fetch;
  process.env.FCM_PROJECT_ID = "flowbarber-test";
  process.env.FCM_CLIENT_EMAIL = "test@flowbarber-test.iam.gserviceaccount.com";
  process.env.FCM_PRIVATE_KEY = privateKey.export({ format: "pem", type: "pkcs8" }).toString().replace(/\n/g, "\\n");
  const requests = [];
  global.fetch = async (url, init) => {
    requests.push({ url, init });
    if (url.includes("oauth2")) return Response.json({ access_token: "test-only-oauth-token", expires_in: 3600 });
    return Response.json({ name: "projects/flowbarber-test/messages/test" });
  };
  try {
    const fcm = loadTypescript(path.join(__dirname, "../lib/push/fcm.ts"));
    const params = {
      token: "test-only-device-token", appointmentId: "booking-1", jobId: "event-1",
      kind: "modified", payload: { date: "2030-06-12", time: "14:00", service: "Barba", businessName: "FlowBarber" }
    };
    await fcm.sendFcm(params);
    await fcm.sendFcm(params);
    assert.equal(requests.filter(request => request.url.includes("oauth2")).length, 1);
    const assertion = requests[0].init.body.get("assertion");
    const [header, claims, signature] = assertion.split(".");
    assert.equal(verify("RSA-SHA256", Buffer.from(header + "." + claims), publicKey, Buffer.from(signature, "base64url")), true);
    assert.equal(JSON.parse(Buffer.from(claims, "base64url")).scope, "https://www.googleapis.com/auth/firebase.messaging");
    const message = JSON.parse(requests[1].init.body).message;
    assert.equal(message.android.ttl, "0s");
    assert.equal(message.android.collapse_key, "booking-1");
    assert.equal(message.android.notification.tag, "booking-1");
    assert.equal(message.android.notification.channel_id, "appointments");
    assert.equal(message.data.view, "appointments");
    assert.ok(message.notification.body.includes("14:00"));
    global.fetch = async () => Response.json({
      error: { details: [{ errorCode: "UNREGISTERED" }] }
    }, { status: 404 });
    await assert.rejects(fcm.sendFcm(params), error => error.invalidDevice === true && error.code === "UNREGISTERED");
    global.fetch = async () => Response.json({
      error: { details: [{ errorCode: "INVALID_ARGUMENT" }] }
    }, { status: 400 });
    await assert.rejects(fcm.sendFcm(params), error => error.invalidDevice === false);
  } finally {
    global.fetch = originalFetch;
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
});
