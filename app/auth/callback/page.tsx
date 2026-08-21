"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

function AuthCallbackContent() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/panel";
  const mode = searchParams.get("mode") || "invite";
  const isEmailVerification = mode === "verify";
  const [isLoading, setIsLoading] = useState(true);
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success"
  );
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    async function prepareSession() {
      const code = searchParams.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          setMessageType("error");
          setMessage("No se pudo validar la invitación.");
          setIsLoading(false);
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      setHasSession(Boolean(data.session));
      setIsLoading(false);
    }

    prepareSession();
  }, [searchParams]);

  async function savePassword() {
    setMessage("");

    if (password.length < 8) {
      setMessageType("error");
      setMessage("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (password !== repeatPassword) {
      setMessageType("error");
      setMessage("Las contraseñas no coinciden.");
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password
    });

    if (error) {
      setMessageType("error");
      setMessage("No se pudo guardar la contraseña.");
      return;
    }

    setPassword("");
    setRepeatPassword("");
    setMessageType("success");
    setMessage("Contraseña guardada correctamente. Ya puedes entrar al panel.");
  }

  return (
    <main className="min-h-screen bg-barber-black px-5 py-6 text-barber-cream">
      <section className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-md flex-col justify-center rounded-[2rem] border border-white/10 bg-gradient-to-b from-barber-gray to-barber-black p-6 shadow-2xl shadow-black/50">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-barber-gold">
          FLOWBARBER
        </p>
        <h1 className="mt-6 text-3xl font-bold text-white">
          {isEmailVerification ? "Correo verificado" : "Acceso de empleado"}
        </h1>

        {isLoading ? (
          <p className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-semibold text-white/70">
            Validando invitación...
          </p>
        ) : !hasSession ? (
          <p className="mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold leading-6 text-red-100">
            No se pudo iniciar sesión con esta invitación. Pide una nueva
            invitación a la barbería.
          </p>
        ) : isEmailVerification ? (
          <div className="mt-6 space-y-4">
            <p className="rounded-2xl border border-barber-gold/30 bg-barber-gold/10 p-4 text-sm font-semibold leading-6 text-barber-gold">
              Tu correo electrónico se ha verificado correctamente. Ya puedes
              acceder a flowbarber con tu email y contraseña.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <p className="text-sm leading-6 text-white/65">
              Crea tu contraseña para acceder al panel de flowbarber.
            </p>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-white/70">
                Contraseña
              </span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-white/70">
                Repetir contraseña
              </span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                onChange={(event) => setRepeatPassword(event.target.value)}
                type="password"
                value={repeatPassword}
              />
            </label>

            <button
              className="w-full rounded-2xl bg-barber-gold px-6 py-4 text-base font-bold text-black shadow-lg shadow-barber-gold/20 transition hover:bg-[#e7b65f] active:scale-[0.98]"
              onClick={savePassword}
              type="button"
            >
              Guardar contraseña
            </button>
          </div>
        )}

        {message && (
          <p
            className={
              messageType === "success"
                ? "mt-5 rounded-2xl border border-barber-gold/30 bg-barber-gold/10 p-4 text-sm font-semibold text-barber-gold"
                : "mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold text-red-100"
            }
          >
            {message}
          </p>
        )}

        <Link
          className="mt-4 block rounded-2xl border border-white/10 px-4 py-3 text-center text-xs font-semibold text-white/70 transition hover:border-barber-gold/50 hover:text-barber-gold"
          href={nextPath}
        >
          {isEmailVerification ? "Continuar" : "Ir al panel"}
        </Link>
      </section>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-barber-black px-5 py-6 text-barber-cream">
          <section className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-md flex-col justify-center rounded-[2rem] border border-white/10 bg-gradient-to-b from-barber-gray to-barber-black p-6 text-center shadow-2xl shadow-black/50">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-barber-gold">
              FLOWBARBER
            </p>
            <h1 className="mt-6 text-3xl font-bold text-white">
              Validando invitación...
            </h1>
          </section>
        </main>
      }
    >
      <AuthCallbackContent />
    </Suspense>
  );
}
