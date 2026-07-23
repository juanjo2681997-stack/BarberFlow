"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

type PlanStatus = "demo" | "active" | "inactive";

type SuperadminBusiness = {
  id: string;
  name: string | null;
  slug: string | null;
  plan_status: PlanStatus | string | null;
  public_booking_enabled: boolean | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  subscription_started_at: string | null;
  subscription_ends_at: string | null;
  subscription_status: string | null;
  plan_name: string | null;
  trial_days_remaining: number | null;
  profile_image_url: string | null;
  created_at: string | null;
  owner_name: string;
  owner_email: string;
  total_appointments: number;
  total_reviews: number;
};

type Summary = {
  total: number;
  active: number;
  demo: number;
  inactive: number;
};

type FormMessage = {
  text: string;
  type: "success" | "error";
};

const emptySummary: Summary = {
  total: 0,
  active: 0,
  demo: 0,
  inactive: 0
};

const planStatuses: PlanStatus[] = ["demo", "active", "inactive"];

function getInitial(name: string | null) {
  return (name?.trim().charAt(0) || "B").toUpperCase();
}

function formatDate(value: string | null) {
  if (!value) {
    return "Sin fecha";
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function getPlanNameLabel(planName: string | null) {
  if (planName === "free_trial") {
    return "free_trial";
  }

  if (planName === "basic") {
    return "basic";
  }

  return planName || "Sin plan";
}

function getPlanBadgeClasses(planStatus: string | null) {
  if (planStatus === "active") {
    return "border-emerald-400/30 bg-emerald-400/10 text-emerald-100";
  }

  if (planStatus === "inactive") {
    return "border-red-400/30 bg-red-400/10 text-red-100";
  }

  return "border-barber-gold/30 bg-barber-gold/10 text-barber-gold";
}

function getSummaryFromBusinesses(businesses: SuperadminBusiness[]): Summary {
  return {
    total: businesses.length,
    active: businesses.filter((business) => business.plan_status === "active")
      .length,
    demo: businesses.filter((business) => business.plan_status === "demo")
      .length,
    inactive: businesses.filter(
      (business) => business.plan_status === "inactive"
    ).length
  };
}

export default function SuperadminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businesses, setBusinesses] = useState<SuperadminBusiness[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [message, setMessage] = useState<FormMessage | null>(null);
  const [hasSuperadminAccess, setHasSuperadminAccess] = useState<
    boolean | null
  >(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoadingBusinesses, setIsLoadingBusinesses] = useState(false);
  const [updatingBusinessId, setUpdatingBusinessId] = useState<string | null>(
    null
  );
  const [deletingBusinessId, setDeletingBusinessId] = useState<string | null>(
    null
  );
  const [businessToDelete, setBusinessToDelete] =
    useState<SuperadminBusiness | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");

  useEffect(() => {
    initializeSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);

      if (nextSession) {
        loadBusinesses(nextSession.access_token);
      } else {
        setBusinesses([]);
        setSummary(emptySummary);
        setHasSuperadminAccess(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function initializeSession() {
    const {
      data: { session: currentSession }
    } = await supabase.auth.getSession();

    setSession(currentSession);

    if (currentSession) {
      await loadBusinesses(currentSession.access_token);
    }

    setIsCheckingSession(false);
  }

  async function login() {
    if (!email.trim() || !password.trim()) {
      setMessage({
        text: "Rellena email y contraseña.",
        type: "error"
      });
      return;
    }

    setIsLoggingIn(true);
    setMessage(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    setIsLoggingIn(false);

    if (error || !data.session) {
      setMessage({
        text: "No se pudo iniciar sesión.",
        type: "error"
      });
      return;
    }

    setPassword("");
    setSession(data.session);
    await loadBusinesses(data.session.access_token);
  }

  async function logout() {
    await supabase.auth.signOut();
    setSession(null);
    setBusinesses([]);
    setSummary(emptySummary);
    setHasSuperadminAccess(null);
    setMessage(null);
  }

  async function loadBusinesses(accessToken = session?.access_token ?? "") {
    if (!accessToken) {
      setMessage({
        text: "Inicia sesión para acceder al panel de administración.",
        type: "error"
      });
      setHasSuperadminAccess(false);
      return;
    }

    setIsLoadingBusinesses(true);
    setMessage(null);

    const response = await fetch("/api/superadmin/businesses", {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    setIsLoadingBusinesses(false);

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      setBusinesses([]);
      setSummary(emptySummary);
      setHasSuperadminAccess(false);
      setMessage({
        text:
          data?.error ??
          "No tienes permisos para acceder al panel de administración.",
        type: "error"
      });
      return;
    }

    setHasSuperadminAccess(true);
    setBusinesses((data.businesses ?? []) as SuperadminBusiness[]);
    setSummary((data.summary ?? emptySummary) as Summary);
  }

  async function updateBusiness(
    business: SuperadminBusiness,
    updates: {
      plan_status?: PlanStatus;
      public_booking_enabled?: boolean;
    }
  ) {
    if (!session) {
      setMessage({
        text: "Inicia sesión para actualizar barberías.",
        type: "error"
      });
      return;
    }

    const nextPlanStatus =
      updates.plan_status ?? (business.plan_status as PlanStatus) ?? "demo";
    const nextPublicBookingEnabled =
      updates.public_booking_enabled ?? business.public_booking_enabled === true;

    setUpdatingBusinessId(business.id);
    setMessage(null);

    const response = await fetch(`/api/superadmin/businesses/${business.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        plan_status: nextPlanStatus,
        public_booking_enabled: nextPublicBookingEnabled
      })
    });

    setUpdatingBusinessId(null);

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      setMessage({
        text: data?.error ?? "No se pudo actualizar la barbería.",
        type: "error"
      });
      return;
    }

    setBusinesses((currentBusinesses) =>
      currentBusinesses.map((currentBusiness) =>
        currentBusiness.id === business.id
          ? {
              ...currentBusiness,
              plan_status: data.business.plan_status,
              public_booking_enabled: data.business.public_booking_enabled
            }
          : currentBusiness
      )
    );

    setSummary((currentSummary) => {
      const nextBusinesses = businesses.map((currentBusiness) =>
        currentBusiness.id === business.id
          ? {
              ...currentBusiness,
              plan_status: data.business.plan_status
            }
          : currentBusiness
      );

      return {
        ...currentSummary,
        active: nextBusinesses.filter(
          (currentBusiness) => currentBusiness.plan_status === "active"
        ).length,
        demo: nextBusinesses.filter(
          (currentBusiness) => currentBusiness.plan_status === "demo"
        ).length,
        inactive: nextBusinesses.filter(
          (currentBusiness) => currentBusiness.plan_status === "inactive"
        ).length
      };
    });

    setMessage({
      text: "Barbería actualizada correctamente.",
      type: "success"
    });
  }

  function openDeleteModal(business: SuperadminBusiness) {
    setBusinessToDelete(business);
    setDeleteConfirmationText("");
    setMessage(null);
  }

  function closeDeleteModal() {
    if (deletingBusinessId) {
      return;
    }

    setBusinessToDelete(null);
    setDeleteConfirmationText("");
  }

  async function deleteBusiness() {
    if (!session || !businessToDelete) {
      setMessage({
        text: "Inicia sesiÃ³n para eliminar barberÃ­as.",
        type: "error"
      });
      return;
    }

    if (deleteConfirmationText !== "ELIMINAR") {
      setMessage({
        text: "Escribe ELIMINAR para confirmar.",
        type: "error"
      });
      return;
    }

    setDeletingBusinessId(businessToDelete.id);
    setMessage(null);

    const response = await fetch(
      `/api/superadmin/businesses/${businessToDelete.id}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      }
    );

    setDeletingBusinessId(null);

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      setMessage({
        text: data?.error ?? "No se pudo eliminar la barberÃ­a.",
        type: "error"
      });
      return;
    }

    setBusinesses((currentBusinesses) => {
      const nextBusinesses = currentBusinesses.filter(
        (business) => business.id !== businessToDelete.id
      );

      setSummary(getSummaryFromBusinesses(nextBusinesses));

      return nextBusinesses;
    });
    setBusinessToDelete(null);
    setDeleteConfirmationText("");
    setMessage({
      text: "BarberÃ­a eliminada correctamente.",
      type: "success"
    });
  }

  if (isCheckingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-barber-black px-5 py-6 text-barber-cream">
        <p className="rounded-2xl border border-white/10 bg-barber-gray p-5 text-sm font-semibold text-white/70">
          Comprobando sesión...
        </p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-barber-black px-5 py-6 text-barber-cream">
        <section className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-md flex-col justify-center rounded-[2rem] border border-white/10 bg-gradient-to-b from-barber-gray to-barber-black p-6 shadow-2xl shadow-black/50">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-barber-gold">
            BARBERFLOW
          </p>
          <h1 className="mt-6 text-3xl font-bold text-white">
            Panel de administración
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/65">
            Acceso privado para administradores de la plataforma.
          </p>

          {message && (
            <p
              className={
                message.type === "success"
                  ? "mt-5 rounded-2xl border border-barber-gold/30 bg-barber-gold/10 p-4 text-sm font-semibold text-barber-gold"
                  : "mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold text-red-100"
              }
            >
              {message.text}
            </p>
          )}

          <div className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-black/20 p-4">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-white/70">
                Email
              </span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@barberflow.com"
                type="email"
                value={email}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-white/70">
                Contraseña
              </span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Contraseña"
                type="password"
                value={password}
              />
            </label>

            <button
              className="w-full rounded-2xl bg-barber-gold px-5 py-3 text-sm font-bold text-black shadow-lg shadow-barber-gold/20 transition hover:bg-[#e7b65f] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoggingIn}
              onClick={login}
              type="button"
            >
              {isLoggingIn ? "Entrando..." : "Iniciar sesión"}
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (hasSuperadminAccess === false) {
    return (
      <main className="min-h-screen bg-barber-black px-5 py-6 text-barber-cream">
        <section className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-md flex-col justify-center rounded-[2rem] border border-white/10 bg-gradient-to-b from-barber-gray to-barber-black p-6 shadow-2xl shadow-black/50">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-barber-gold">
            BARBERFLOW
          </p>
          <h1 className="mt-6 text-3xl font-bold text-white">
            Panel de administración
          </h1>
          <p className="mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold leading-6 text-red-100">
            {message?.text ??
              "No tienes permisos para acceder al panel de administración."}
          </p>
          <button
            className="mt-5 rounded-2xl border border-red-400/40 px-5 py-3 text-sm font-bold text-red-100 transition hover:bg-red-400/10 active:scale-[0.98]"
            onClick={logout}
            type="button"
          >
            Cerrar sesión
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-barber-black px-5 py-6 text-barber-cream">
      <section className="mx-auto w-full max-w-6xl">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-gradient-to-b from-barber-gray to-barber-black p-6 shadow-2xl shadow-black/50 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-barber-gold">
              BARBERFLOW
            </p>
            <h1 className="mt-3 text-3xl font-bold text-white">
              Panel de administración
            </h1>
          </div>
          <button
            className="rounded-2xl border border-red-400/40 px-5 py-3 text-sm font-bold text-red-100 transition hover:bg-red-400/10 active:scale-[0.98]"
            onClick={logout}
            type="button"
          >
            Cerrar sesión
          </button>
        </header>

        {message && (
          <p
            className={
              message.type === "success"
                ? "mt-6 rounded-2xl border border-barber-gold/30 bg-barber-gold/10 p-4 text-sm font-semibold text-barber-gold"
                : "mt-6 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold text-red-100"
            }
          >
            {message.text}
          </p>
        )}

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-barber-gray p-6 shadow-2xl shadow-black/40">
          <h2 className="text-2xl font-bold text-white">Resumen</h2>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
              <p className="text-sm font-semibold text-white/55">Total</p>
              <p className="mt-2 text-3xl font-bold text-white">
                {summary.total}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-5">
              <p className="text-sm font-semibold text-emerald-100/70">
                Activas
              </p>
              <p className="mt-2 text-3xl font-bold text-emerald-100">
                {summary.active}
              </p>
            </div>
            <div className="rounded-2xl border border-barber-gold/20 bg-barber-gold/10 p-5">
              <p className="text-sm font-semibold text-barber-gold/80">Demo</p>
              <p className="mt-2 text-3xl font-bold text-barber-gold">
                {summary.demo}
              </p>
            </div>
            <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-5">
              <p className="text-sm font-semibold text-red-100/70">
                Inactivas
              </p>
              <p className="mt-2 text-3xl font-bold text-red-100">
                {summary.inactive}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[2rem] border border-white/10 bg-barber-gray p-6 shadow-2xl shadow-black/40">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white">Barberías</h2>
              <p className="mt-2 text-sm leading-6 text-white/60">
                Gestiona el estado del plan y la visibilidad pública de cada
                barbería.
              </p>
            </div>
            <button
              className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-bold text-white transition hover:border-barber-gold/50 hover:text-barber-gold active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoadingBusinesses}
              onClick={() => loadBusinesses()}
              type="button"
            >
              {isLoadingBusinesses ? "Cargando..." : "Actualizar"}
            </button>
          </div>

          {isLoadingBusinesses ? (
            <p className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
              Cargando barberías...
            </p>
          ) : businesses.length === 0 ? (
            <p className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
              No hay barberías registradas.
            </p>
          ) : (
            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {businesses.map((business) => (
                <article
                  className="rounded-2xl border border-white/10 bg-black/20 p-5"
                  key={business.id}
                >
                  <div className="flex items-start gap-4">
                    {business.profile_image_url ? (
                      <img
                        alt={business.name ?? "Barbería"}
                        className="h-16 w-16 shrink-0 rounded-full border border-barber-gold/30 object-cover"
                        src={business.profile_image_url}
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-barber-gold/30 bg-barber-gold/10 text-2xl font-bold text-barber-gold">
                        {getInitial(business.name)}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="text-xl font-bold text-white">
                            {business.name || "Sin nombre"}
                          </h3>
                          <p className="mt-1 text-sm font-semibold text-white/45">
                            /barberia/{business.slug || "sin-slug"}
                          </p>
                        </div>
                        <span
                          className={`w-fit rounded-full border px-3 py-1 text-xs font-bold ${getPlanBadgeClasses(
                            business.plan_status
                          )}`}
                        >
                          {business.plan_status ?? "demo"}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-white/65 sm:grid-cols-2">
                        <p>
                          <span className="font-semibold text-white/85">
                            Propietario:
                          </span>{" "}
                          {business.owner_name || "Sin propietario"}
                        </p>
                        <p>
                          <span className="font-semibold text-white/85">
                            Email:
                          </span>{" "}
                          {business.owner_email || "Sin email"}
                        </p>
                        <p>
                          <span className="font-semibold text-white/85">
                            Registro:
                          </span>{" "}
                          {formatDate(business.created_at)}
                        </p>
                        <p>
                          <span className="font-semibold text-white/85">
                            Reservas públicas:
                          </span>{" "}
                          {business.public_booking_enabled
                            ? "Activadas"
                            : "Desactivadas"}
                        </p>
                        <p>
                          <span className="font-semibold text-white/85">
                            Plan interno:
                          </span>{" "}
                          {getPlanNameLabel(business.plan_name)}
                        </p>
                        <p>
                          <span className="font-semibold text-white/85">
                            SuscripciÃ³n:
                          </span>{" "}
                          {business.subscription_status || "Sin estado"}
                        </p>
                        <p>
                          <span className="font-semibold text-white/85">
                            Fin de prueba:
                          </span>{" "}
                          {formatDate(business.trial_ends_at)}
                        </p>
                        <p>
                          <span className="font-semibold text-white/85">
                            DÃ­as restantes:
                          </span>{" "}
                          {business.trial_days_remaining ?? "Sin prueba"}
                        </p>
                        <p>
                          <span className="font-semibold text-white/85">
                            Citas:
                          </span>{" "}
                          {business.total_appointments}
                        </p>
                        <p>
                          <span className="font-semibold text-white/85">
                            Reseñas:
                          </span>{" "}
                          {business.total_reviews}
                        </p>
                      </div>

                      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                            Plan
                          </span>
                          <select
                            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-barber-gold disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={updatingBusinessId === business.id}
                            onChange={(event) =>
                              updateBusiness(business, {
                                plan_status: event.target.value as PlanStatus
                              })
                            }
                            value={business.plan_status ?? "demo"}
                          >
                            {planStatuses.map((planStatus) => (
                              <option
                                className="bg-barber-gray"
                                key={planStatus}
                                value={planStatus}
                              >
                                {planStatus}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="rounded-2xl border border-white/10 bg-black/20 p-4">
                          <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                            Reservas públicas
                          </span>
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-white">
                              {business.public_booking_enabled
                                ? "Activadas"
                                : "Desactivadas"}
                            </span>
                            <input
                              checked={business.public_booking_enabled === true}
                              className="h-5 w-5 accent-[#d8a24a]"
                              disabled={updatingBusinessId === business.id}
                              onChange={(event) =>
                                updateBusiness(business, {
                                  public_booking_enabled: event.target.checked
                                })
                              }
                              type="checkbox"
                            />
                          </div>
                        </label>
                      </div>

                      <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/10 p-4">
                        {business.plan_status !== "inactive" && (
                          <p className="mb-3 text-xs font-semibold leading-5 text-red-100">
                            Debes poner la barbería como inactiva antes de
                            eliminarla.
                          </p>
                        )}
                        <button
                          className="w-full rounded-2xl border border-red-400/45 px-4 py-3 text-sm font-bold text-red-100 transition hover:bg-red-400/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={
                            business.plan_status !== "inactive" ||
                            deletingBusinessId === business.id
                          }
                          onClick={() => openDeleteModal(business)}
                          type="button"
                        >
                          Eliminar barbería
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>

      {businessToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-5 py-6">
          <section className="w-full max-w-lg rounded-[2rem] border border-red-400/35 bg-barber-gray p-6 shadow-2xl shadow-black/60">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-100">
              Confirmar eliminación
            </p>
            <h2 className="mt-4 text-2xl font-bold text-white">
              Vas a eliminar definitivamente esta barbería y sus datos asociados.
            </h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-red-100">
              Esta acción no se puede deshacer.
            </p>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4 text-sm leading-6 text-white/70">
              <p>
                <span className="font-semibold text-white">Nombre:</span>{" "}
                {businessToDelete.name || "Sin nombre"}
              </p>
              <p>
                <span className="font-semibold text-white">Slug:</span>{" "}
                {businessToDelete.slug || "sin-slug"}
              </p>
            </div>

            <label className="mt-5 block">
              <span className="mb-2 block text-sm font-semibold text-white/70">
                Escribe ELIMINAR para confirmar
              </span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-red-300"
                onChange={(event) =>
                  setDeleteConfirmationText(event.target.value)
                }
                placeholder="ELIMINAR"
                value={deleteConfirmationText}
              />
            </label>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-bold text-white transition hover:border-white/25 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!!deletingBusinessId}
                onClick={closeDeleteModal}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="rounded-2xl border border-red-400/55 bg-red-400/10 px-5 py-3 text-sm font-bold text-red-100 transition hover:bg-red-400/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                disabled={
                  deleteConfirmationText !== "ELIMINAR" ||
                  deletingBusinessId === businessToDelete.id
                }
                onClick={deleteBusiness}
                type="button"
              >
                {deletingBusinessId === businessToDelete.id
                  ? "Eliminando..."
                  : "Eliminar definitivamente"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
