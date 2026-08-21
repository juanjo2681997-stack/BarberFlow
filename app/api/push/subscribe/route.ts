import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type PushSubscriptionBody = {
  appointment_id?: string;
  business_id?: string;
  customer_phone?: string;
  subscription_type?: string;
  user_agent?: string;
  subscription?: {
    endpoint?: string;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
  };
};

const barberCancellationSubscriptionType = "barber_cancellations";
const barberCancellationCustomerPhone = "barber";
const barberCancellationAppointmentPrefix = "barber-cancellations:";

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

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");

  return authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
}

function getBarberCancellationAppointmentId(businessId: string) {
  return `${barberCancellationAppointmentPrefix}${businessId}`;
}

async function userCanManageBusiness(params: {
  supabase: ReturnType<typeof getAdminClient>;
  businessId: string;
  userId: string;
  userEmail: string;
}) {
  const { supabase, businessId, userId, userEmail } = params;

  if (!supabase) {
    return false;
  }

  let businessUserResult = await supabase
    .from("business_users")
    .select("business_id, role, employee_id")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!businessUserResult.data && userEmail) {
    businessUserResult = await supabase
      .from("business_users")
      .select("business_id, role, employee_id")
      .eq("business_id", businessId)
      .eq("email", userEmail)
      .limit(1)
      .maybeSingle();
  }

  if (businessUserResult.error || !businessUserResult.data) {
    if (businessUserResult.error) {
      console.error("Error checking push subscription business user:", {
        businessId,
        userId,
        message: businessUserResult.error.message
      });
    }

    return false;
  }

  const businessUser = businessUserResult.data as {
    role: string | null;
    employee_id: string | null;
  };

  if (businessUser.role !== "owner" && businessUser.role !== "manager") {
    return false;
  }

  if (!businessUser.employee_id) {
    return true;
  }

  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("is_active, login_enabled")
    .eq("id", businessUser.employee_id)
    .eq("business_id", businessId)
    .maybeSingle();

  if (employeeError) {
    console.error("Error checking push subscription employee:", {
      businessId,
      userId,
      message: employeeError.message
    });

    return false;
  }

  return Boolean(employee?.is_active && employee?.login_enabled);
}

export async function POST(request: Request) {
  try {
    const supabase = getAdminClient();

    if (!supabase) {
      return NextResponse.json(
        { error: "Faltan variables de entorno de Supabase." },
        { status: 500 }
      );
    }

    const body = (await request.json()) as PushSubscriptionBody;
    const endpoint = body.subscription?.endpoint;
    const p256dh = body.subscription?.keys?.p256dh;
    const auth = body.subscription?.keys?.auth;
    const businessId = cleanText(body.business_id);

    if (
      body.subscription_type === barberCancellationSubscriptionType &&
      businessId &&
      endpoint &&
      p256dh &&
      auth
    ) {
      const token = getBearerToken(request);

      if (!token) {
        return NextResponse.json({ error: "No autorizado." }, { status: 401 });
      }

      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser(token);

      if (userError || !user) {
        return NextResponse.json({ error: "No autorizado." }, { status: 401 });
      }

      const canManageBusiness = await userCanManageBusiness({
        supabase,
        businessId,
        userId: user.id,
        userEmail: user.email ?? ""
      });

      if (!canManageBusiness) {
        return NextResponse.json({ error: "No autorizado." }, { status: 403 });
      }

      const appointmentId = getBarberCancellationAppointmentId(businessId);
      const { error: deleteError } = await supabase
        .from("push_subscriptions")
        .delete()
        .eq("business_id", businessId)
        .eq("appointment_id", appointmentId)
        .eq("endpoint", endpoint);

      if (deleteError) {
        console.error("Error replacing barber cancellation push subscription:", {
          businessId,
          userId: user.id,
          message: deleteError.message
        });

        return NextResponse.json({ error: deleteError.message }, { status: 500 });
      }

      const { error } = await supabase.from("push_subscriptions").insert({
        appointment_id: appointmentId,
        business_id: businessId,
        customer_phone: barberCancellationCustomerPhone,
        endpoint,
        p256dh,
        auth,
        user_agent: body.user_agent || request.headers.get("user-agent")
      });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      console.info("Barber cancellation push subscription saved:", {
        businessId,
        userId: user.id
      });

      return NextResponse.json({ ok: true });
    }

    if (
      !body.appointment_id ||
      !businessId ||
      !body.customer_phone ||
      !endpoint ||
      !p256dh ||
      !auth
    ) {
      return NextResponse.json(
        { error: "Faltan datos para guardar la suscripción." },
        { status: 400 }
      );
    }

    const { error: deleteError } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("appointment_id", body.appointment_id)
      .eq("business_id", businessId)
      .eq("endpoint", endpoint);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    const { error } = await supabase.from("push_subscriptions").insert({
      appointment_id: body.appointment_id,
      business_id: businessId,
      customer_phone: body.customer_phone,
      endpoint,
      p256dh,
      auth,
      user_agent: body.user_agent || request.headers.get("user-agent")
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error inesperado.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
