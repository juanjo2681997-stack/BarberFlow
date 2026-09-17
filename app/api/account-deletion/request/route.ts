import { NextResponse } from "next/server";
import {
  cleanText,
  getAuthenticatedUser,
  getUserEmail
} from "../../profile-activation/_utils";

export const runtime = "nodejs";

const confirmationText = "ELIMINAR CUENTA";
const activeDeletionStatuses = ["pending", "processing"];
const validRequestSources = ["customer_app", "barber_panel"] as const;

type RequestSource = (typeof validRequestSources)[number];

type AccountDeletionBody = {
  confirmation?: string;
  source?: string;
};

function isRequestSource(value: string): value is RequestSource {
  return validRequestSources.includes(value as RequestSource);
}

function getRequestSource(value: unknown): RequestSource {
  const source = cleanText(value);

  return isRequestSource(source) ? source : "customer_app";
}

function isValidDeletionConfirmation(value: unknown) {
  return cleanText(value).toUpperCase() === confirmationText;
}

async function countRows(
  supabaseAdmin: any,
  table: string,
  column: string,
  value: string
) {
  const { count, error } = await supabaseAdmin
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, value);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function loadAccountSummary(supabaseAdmin: any, userId: string, email: string) {
  const [
    customerProfileResult,
    businessUsersByUserResult,
    businessUsersByEmailResult,
    customerAppointmentsCount,
    reviewsCount,
    favoriteBusinessesCount
  ] = await Promise.all([
    supabaseAdmin
      .from("customer_profiles")
      .select("user_id, full_name, phone, avatar_url")
      .eq("user_id", userId)
      .maybeSingle(),
    supabaseAdmin
      .from("business_users")
      .select("business_id, role, employee_id, email")
      .eq("user_id", userId),
    email
      ? supabaseAdmin
          .from("business_users")
          .select("business_id, role, employee_id, email")
          .eq("email", email)
      : Promise.resolve({ data: [], error: null }),
    countRows(supabaseAdmin, "appointments", "customer_user_id", userId),
    countRows(supabaseAdmin, "reviews", "customer_user_id", userId),
    countRows(
      supabaseAdmin,
      "customer_favorite_businesses",
      "customer_user_id",
      userId
    )
  ]);

  if (customerProfileResult.error) {
    throw customerProfileResult.error;
  }

  if (businessUsersByUserResult.error) {
    throw businessUsersByUserResult.error;
  }

  if (businessUsersByEmailResult.error) {
    throw businessUsersByEmailResult.error;
  }

  const businessUsers = [
    ...((businessUsersByUserResult.data ?? []) as Array<{
      business_id: string | null;
      role: string | null;
      employee_id: string | null;
      email: string | null;
    }>),
    ...((businessUsersByEmailResult.data ?? []) as Array<{
      business_id: string | null;
      role: string | null;
      employee_id: string | null;
      email: string | null;
    }>)
  ].filter(
    (businessUser, index, rows) =>
      businessUser.business_id &&
      rows.findIndex(
        (row) =>
          row.business_id === businessUser.business_id &&
          row.employee_id === businessUser.employee_id &&
          row.role === businessUser.role
      ) === index
  );

  const businessIds = Array.from(
    new Set(
      businessUsers
        .map((businessUser) => businessUser.business_id)
        .filter((businessId): businessId is string => Boolean(businessId))
    )
  );

  const employeeIds = Array.from(
    new Set(
      businessUsers
        .map((businessUser) => businessUser.employee_id)
        .filter((employeeId): employeeId is string => Boolean(employeeId))
    )
  );

  let businesses: Array<{
    id: string;
    name: string | null;
    slug: string | null;
    plan_status: string | null;
    subscription_status: string | null;
  }> = [];

  if (businessIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("businesses")
      .select("id, name, slug, plan_status, subscription_status")
      .in("id", businessIds);

    if (error) {
      throw error;
    }

    businesses = data ?? [];
  }

  return {
    has_customer_profile: Boolean(customerProfileResult.data),
    business_users: businessUsers,
    businesses,
    employee_ids: employeeIds,
    counts: {
      customer_appointments: customerAppointmentsCount,
      reviews: reviewsCount,
      favorite_businesses: favoriteBusinessesCount
    }
  };
}

async function loadActiveRequest(supabaseAdmin: any, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("account_deletion_requests")
    .select("id, status, requested_at, updated_at")
    .eq("user_id", userId)
    .in("status", activeDeletionStatuses)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function GET(request: Request) {
  try {
    const { supabaseAdmin, user, error } = await getAuthenticatedUser(request);

    if (error || !user) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    const activeRequest = await loadActiveRequest(supabaseAdmin, user.id);

    return NextResponse.json({
      request: activeRequest ?? null
    });
  } catch (error) {
    console.error("Error loading account deletion request:", error);

    return NextResponse.json(
      { error: "No se pudo comprobar la solicitud de eliminación." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { supabaseAdmin, user, error } = await getAuthenticatedUser(request);

    if (error || !user) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | AccountDeletionBody
      | null;
    if (!isValidDeletionConfirmation(body?.confirmation)) {
      return NextResponse.json(
        { error: "Confirmación no válida." },
        { status: 400 }
      );
    }

    const email = getUserEmail(user);

    if (!email) {
      return NextResponse.json(
        { error: "Tu cuenta no tiene email asociado." },
        { status: 400 }
      );
    }

    const existingRequest = await loadActiveRequest(supabaseAdmin, user.id);

    if (existingRequest) {
      return NextResponse.json({
        ok: true,
        already_exists: true,
        request: existingRequest
      });
    }

    const accountSummary = await loadAccountSummary(supabaseAdmin, user.id, email);
    const requestSource = getRequestSource(body?.source);

    const { data, error: insertError } = await supabaseAdmin
      .from("account_deletion_requests")
      .insert({
        user_id: user.id,
        email,
        status: "pending",
        request_source: requestSource,
        confirmation_text: confirmationText,
        metadata: {
          account_summary: accountSummary,
          user_agent: request.headers.get("user-agent") ?? "",
          requested_from: requestSource
        }
      })
      .select("id, status, requested_at, updated_at")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        const activeRequest = await loadActiveRequest(supabaseAdmin, user.id);

        return NextResponse.json({
          ok: true,
          already_exists: true,
          request: activeRequest
        });
      }

      console.error("Error creating account deletion request:", insertError);
      return NextResponse.json(
        { error: "No se pudo registrar la solicitud de eliminación." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      already_exists: false,
      request: data
    });
  } catch (error) {
    console.error("Error requesting account deletion:", error);

    return NextResponse.json(
      { error: "No se pudo registrar la solicitud de eliminación." },
      { status: 500 }
    );
  }
}
