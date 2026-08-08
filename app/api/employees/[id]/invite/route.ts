import { NextResponse } from "next/server";
import {
  cleanOptionalText,
  getEmployeeRequestContext,
  loadEmployeeForBusiness
} from "../../_utils";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type AuthUser = {
  id: string;
  email?: string;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getAppOrigin(request: Request) {
  const configuredUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  const requestOrigin = request.headers.get("origin") ?? "";

  return (configuredUrl || requestOrigin).replace(/\/$/, "");
}

async function findAuthUserByEmail(supabaseAdmin: any, email: string) {
  const normalizedEmail = email.toLowerCase();
  const perPage = 1000;
  let page = 1;

  while (page <= 10) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage
    });

    if (error) {
      console.error("Error listing auth users:", error);
      return { user: null, error };
    }

    const users = (data?.users ?? []) as AuthUser[];
    const foundUser = users.find(
      (user) => user.email?.toLowerCase() === normalizedEmail
    );

    if (foundUser) {
      return { user: foundUser, error: null };
    }

    if (users.length < perPage) {
      break;
    }

    page += 1;
  }

  return { user: null, error: null };
}

async function upsertBusinessUserForEmployee(
  supabaseAdmin: any,
  businessId: string,
  employeeId: string,
  userId: string,
  email: string,
  role: string
) {
  let existingResult = await supabaseAdmin
    .from("business_users")
    .select("id")
    .eq("business_id", businessId)
    .eq("employee_id", employeeId)
    .limit(1)
    .maybeSingle();

  if (!existingResult.data) {
    existingResult = await supabaseAdmin
      .from("business_users")
      .select("id")
      .eq("business_id", businessId)
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
  }

  if (!existingResult.data) {
    existingResult = await supabaseAdmin
      .from("business_users")
      .select("id")
      .eq("business_id", businessId)
      .eq("email", email)
      .limit(1)
      .maybeSingle();
  }

  if (existingResult.error) {
    return existingResult.error;
  }

  if (existingResult.data?.id) {
    const { error } = await supabaseAdmin
      .from("business_users")
      .update({
        user_id: userId,
        email,
        employee_id: employeeId,
        role
      })
      .eq("id", existingResult.data.id)
      .eq("business_id", businessId);

    return error;
  }

  const { error } = await supabaseAdmin.from("business_users").insert({
    business_id: businessId,
    user_id: userId,
    email,
    employee_id: employeeId,
    role
  });

  return error;
}

export async function POST(request: Request, routeContext: RouteContext) {
  const context = await getEmployeeRequestContext(request);

  if ("error" in context) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  if (!context.canManageEmployees) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  const { id } = await routeContext.params;
  const { employee, error: employeeError } = await loadEmployeeForBusiness(
    context.supabaseAdmin,
    context.businessId,
    id
  );

  if (employeeError) {
    return NextResponse.json(
      { error: "No se pudo cargar el empleado." },
      { status: 500 }
    );
  }

  if (!employee) {
    return NextResponse.json(
      { error: "Empleado no encontrado." },
      { status: 404 }
    );
  }

  if (context.businessRole === "manager" && employee.role === "owner") {
    return NextResponse.json(
      { error: "Un manager no puede invitar a un owner." },
      { status: 403 }
    );
  }

  if (!employee.is_active) {
    return NextResponse.json(
      { error: "No puedes invitar a un empleado inactivo." },
      { status: 400 }
    );
  }

  const email = cleanOptionalText(employee.email).toLowerCase();

  if (!email || !isValidEmail(email)) {
    return NextResponse.json(
      { error: "El empleado necesita un email válido para recibir invitación." },
      { status: 400 }
    );
  }

  const existingUserResult = await findAuthUserByEmail(
    context.supabaseAdmin,
    email
  );

  if (existingUserResult.error) {
    return NextResponse.json(
      { error: "No se pudo comprobar si el usuario ya existe." },
      { status: 500 }
    );
  }

  let authUser = existingUserResult.user;
  let inviteSent = false;

  if (!authUser) {
    const redirectTo = `${getAppOrigin(request)}/auth/callback?next=/panel`;
    const { data, error } =
      await context.supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: {
          employee_id: employee.id,
          business_id: context.businessId,
          role: employee.role
        }
      });

    if (error) {
      console.error("Error inviting employee:", error);
      return NextResponse.json(
        { error: "No se pudo enviar la invitación." },
        { status: 500 }
      );
    }

    authUser = data?.user as AuthUser | null;
    inviteSent = true;
  }

  if (!authUser?.id) {
    return NextResponse.json(
      { error: "No se pudo obtener el usuario Auth del empleado." },
      { status: 500 }
    );
  }

  const { data: updatedEmployee, error: updateEmployeeError } =
    await context.supabaseAdmin
      .from("employees")
      .update({
        user_id: authUser.id,
        login_enabled: true,
        email
      })
      .eq("id", employee.id)
      .eq("business_id", context.businessId)
      .select(
        "id, business_id, user_id, display_name, email, phone, avatar_url, role, is_active, login_enabled, receives_bookings, calendar_color, created_at, updated_at"
      )
      .single();

  if (updateEmployeeError) {
    console.error("Error linking employee auth user:", updateEmployeeError);
    return NextResponse.json(
      { error: "No se pudo vincular el usuario al empleado." },
      { status: 500 }
    );
  }

  const businessUserError = await upsertBusinessUserForEmployee(
    context.supabaseAdmin,
    context.businessId,
    employee.id,
    authUser.id,
    email,
    employee.role
  );

  if (businessUserError) {
    console.error("Error linking employee business user:", businessUserError);
    return NextResponse.json(
      { error: "No se pudo vincular el empleado a la barbería." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    employee: updatedEmployee,
    invite_sent: inviteSent,
    reused_existing_user: !inviteSent
  });
}
