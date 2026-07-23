import { NextResponse } from "next/server";
import { getBearerToken, getSupabaseAdmin, validateSuperadmin } from "../_utils";

export const runtime = "nodejs";

type Business = {
  id: string;
  name: string | null;
  slug: string | null;
  plan_status: string | null;
  public_booking_enabled: boolean | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  subscription_started_at: string | null;
  subscription_ends_at: string | null;
  subscription_status: string | null;
  plan_name: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  profile_image_url: string | null;
  created_at: string | null;
};

type BusinessUser = {
  business_id: string;
  user_id: string | null;
  email: string | null;
  role: string | null;
};

type AuthUserSummary = {
  id: string;
  email?: string;
  user_metadata?: {
    full_name?: string;
    name?: string;
  };
};

function countByBusinessId(rows: { business_id: string | null }[] | null) {
  const counts = new Map<string, number>();

  for (const row of rows ?? []) {
    if (!row.business_id) {
      continue;
    }

    counts.set(row.business_id, (counts.get(row.business_id) ?? 0) + 1);
  }

  return counts;
}

function getTrialDaysRemaining(trialEndsAt: string | null) {
  if (!trialEndsAt) {
    return null;
  }

  return Math.max(
    0,
    Math.ceil(
      (new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    )
  );
}

async function getOwnerNames(
  supabaseAdmin: any,
  owners: BusinessUser[]
) {
  const ownerNames = new Map<string, string>();

  await Promise.all(
    owners.map(async (owner) => {
      if (!owner.user_id) {
        ownerNames.set(owner.business_id, owner.email ?? "");
        return;
      }

      const { data, error } = await supabaseAdmin.auth.admin.getUserById(
        owner.user_id
      );

      if (error || !data.user) {
        ownerNames.set(owner.business_id, owner.email ?? "");
        return;
      }

      const authUser = data.user as AuthUserSummary;
      const name =
        authUser.user_metadata?.full_name?.trim() ||
        authUser.user_metadata?.name?.trim() ||
        authUser.email ||
        owner.email ||
        "";

      ownerNames.set(owner.business_id, name);
    })
  );

  return ownerNames;
}

export async function GET(request: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return NextResponse.json(
      { error: "Faltan variables de entorno de Supabase." },
      { status: 500 }
    );
  }

  const validation = await validateSuperadmin(
    supabaseAdmin,
    getBearerToken(request)
  );

  if (!validation.isValid) {
    return NextResponse.json(
      { error: validation.error },
      { status: validation.status }
    );
  }

  const { data: businesses, error: businessesError } = await supabaseAdmin
    .from("businesses")
    .select(
      "id, name, slug, plan_status, public_booking_enabled, trial_started_at, trial_ends_at, subscription_started_at, subscription_ends_at, subscription_status, plan_name, stripe_customer_id, stripe_subscription_id, stripe_price_id, profile_image_url, created_at"
    )
    .order("created_at", { ascending: false });

  if (businessesError) {
    console.error("Error loading superadmin businesses:", businessesError);
    return NextResponse.json(
      { error: "No se pudieron cargar las barberías." },
      { status: 500 }
    );
  }

  const businessList = (businesses ?? []) as Business[];
  const businessIds = businessList.map((business) => business.id);

  if (businessIds.length === 0) {
    return NextResponse.json({
      businesses: [],
      summary: {
        total: 0,
        active: 0,
        demo: 0,
        inactive: 0
      }
    });
  }

  const [
    { data: businessUsers, error: businessUsersError },
    { data: appointments, error: appointmentsError },
    { data: reviews, error: reviewsError }
  ] = await Promise.all([
    supabaseAdmin
      .from("business_users")
      .select("business_id, user_id, email, role")
      .in("business_id", businessIds),
    supabaseAdmin
      .from("appointments")
      .select("business_id")
      .in("business_id", businessIds),
    supabaseAdmin
      .from("reviews")
      .select("business_id")
      .in("business_id", businessIds)
  ]);

  if (businessUsersError || appointmentsError || reviewsError) {
    console.error("Error loading superadmin business details:", {
      businessUsersError,
      appointmentsError,
      reviewsError
    });
    return NextResponse.json(
      { error: "No se pudieron cargar los datos de las barberías." },
      { status: 500 }
    );
  }

  const owners = new Map<string, BusinessUser>();

  for (const businessUser of (businessUsers ?? []) as BusinessUser[]) {
    if (
      !owners.has(businessUser.business_id) ||
      businessUser.role === "owner"
    ) {
      owners.set(businessUser.business_id, businessUser);
    }
  }

  const ownerList = Array.from(owners.values());
  const ownerNames = await getOwnerNames(supabaseAdmin, ownerList);
  const appointmentCounts = countByBusinessId(appointments ?? []);
  const reviewCounts = countByBusinessId(reviews ?? []);

  const enrichedBusinesses = businessList.map((business) => {
    const owner = owners.get(business.id);

    return {
      ...business,
      owner_name: ownerNames.get(business.id) ?? owner?.email ?? "",
      owner_email: owner?.email ?? "",
      total_appointments: appointmentCounts.get(business.id) ?? 0,
      total_reviews: reviewCounts.get(business.id) ?? 0,
      trial_days_remaining: getTrialDaysRemaining(business.trial_ends_at)
    };
  });

  const summary = {
    total: businessList.length,
    active: businessList.filter(
      (business) => business.plan_status === "active"
    ).length,
    demo: businessList.filter((business) => business.plan_status === "demo")
      .length,
    inactive: businessList.filter(
      (business) => business.plan_status === "inactive"
    ).length
  };

  return NextResponse.json({
    businesses: enrichedBusinesses,
    summary
  });
}
