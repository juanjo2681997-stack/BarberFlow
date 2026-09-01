import { NextResponse } from "next/server";
import {
  cleanText,
  getAuthenticatedUser
} from "../profile-activation/_utils";

export const runtime = "nodejs";

type FavoriteBody = {
  businessId?: string;
};

type FavoriteRow = {
  business_id: string;
};

type Business = {
  id: string;
  plan_status: string | null;
  public_booking_enabled: boolean | null;
};

function isBusinessAvailableForBooking(business: Business) {
  return (
    business.public_booking_enabled === true &&
    (business.plan_status === "demo" || business.plan_status === "active")
  );
}

async function requireCustomerContext(request: Request) {
  const { supabaseAdmin, user, error: authError } =
    await getAuthenticatedUser(request);

  if (authError || !user) {
    return {
      supabaseAdmin,
      user: null,
      error: "No autorizado.",
      status: 401 as const
    };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("customer_profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    console.error("Error checking customer profile for favorites:", profileError);
    return {
      supabaseAdmin,
      user: null,
      error: "No se pudo comprobar tu perfil de cliente.",
      status: 500 as const
    };
  }

  if (!profile) {
    return {
      supabaseAdmin,
      user: null,
      error: "Completa tu perfil de cliente para guardar favoritas.",
      status: 403 as const
    };
  }

  return {
    supabaseAdmin,
    user,
    error: "",
    status: 200 as const
  };
}

async function loadAvailableBusiness(supabaseAdmin: any, businessId: string) {
  const { data, error } = await supabaseAdmin
    .from("businesses")
    .select("id, plan_status, public_booking_enabled")
    .eq("id", businessId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as Business | null;
}

export async function GET(request: Request) {
  const context = await requireCustomerContext(request);

  if (!context.user) {
    return NextResponse.json(
      { error: context.error },
      { status: context.status }
    );
  }

  const { data, error } = await context.supabaseAdmin
    .from("customer_favorite_businesses")
    .select("business_id")
    .eq("customer_user_id", context.user.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error loading customer favorite businesses:", error);
    return NextResponse.json(
      { error: "No se pudieron cargar tus barberías favoritas." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    favorites: ((data ?? []) as FavoriteRow[]).map(
      (favorite) => favorite.business_id
    )
  });
}

export async function POST(request: Request) {
  const context = await requireCustomerContext(request);

  if (!context.user) {
    return NextResponse.json(
      { error: context.error },
      { status: context.status }
    );
  }

  const body = (await request.json().catch(() => null)) as FavoriteBody | null;
  const businessId = cleanText(body?.businessId);

  if (!businessId) {
    return NextResponse.json(
      { error: "Falta la barbería que quieres guardar." },
      { status: 400 }
    );
  }

  try {
    const business = await loadAvailableBusiness(context.supabaseAdmin, businessId);

    if (!business || !isBusinessAvailableForBooking(business)) {
      return NextResponse.json(
        { error: "Esta barbería no está disponible para reservas." },
        { status: 404 }
      );
    }

    const { error } = await context.supabaseAdmin
      .from("customer_favorite_businesses")
      .upsert(
        {
          customer_user_id: context.user.id,
          business_id: business.id
        },
        { onConflict: "customer_user_id,business_id" }
      );

    if (error) {
      throw error;
    }

    return NextResponse.json({ favorite: business.id });
  } catch (error) {
    console.error("Error saving customer favorite business:", error);
    return NextResponse.json(
      { error: "No se pudo guardar la barbería favorita." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const context = await requireCustomerContext(request);

  if (!context.user) {
    return NextResponse.json(
      { error: context.error },
      { status: context.status }
    );
  }

  const body = (await request.json().catch(() => null)) as FavoriteBody | null;
  const businessId = cleanText(body?.businessId);

  if (!businessId) {
    return NextResponse.json(
      { error: "Falta la barbería que quieres quitar." },
      { status: 400 }
    );
  }

  const { error } = await context.supabaseAdmin
    .from("customer_favorite_businesses")
    .delete()
    .eq("customer_user_id", context.user.id)
    .eq("business_id", businessId);

  if (error) {
    console.error("Error deleting customer favorite business:", error);
    return NextResponse.json(
      { error: "No se pudo quitar la barbería favorita." },
      { status: 500 }
    );
  }

  return NextResponse.json({ removed: businessId });
}
