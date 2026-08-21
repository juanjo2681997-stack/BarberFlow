"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Message = {
  text: string;
  type: "success" | "error";
};

function getFriendlyRecoveryError(errorMessage?: string) {
  const message = errorMessage?.toLowerCase() ?? "";

  if (message.includes("expired") || message.includes("invalid")) {
    return "El enlace no es válido o ha caducado. Solicita un nuevo enlace para cambiar tu contraseña.";
  }

  return "No se pudo validar el enlace. Solicita uno nuevo e inténtalo otra vez.";
}

function hasRecoveryTokenInUrl() {
  if (typeof window === "undefined") {
    return false;
  }

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const queryParams = new URLSearchParams(window.location.search);

  return (
    hashParams.get("type") === "recovery" ||
    queryParams.get("type") === "recovery" ||
    queryParams.has("code")
  );
}

function UpdatePasswordContent() {
  const searchParams = useSearchParams();
  const [isPreparingSession, setIsPreparingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function prepareRecoverySession() {
      const code = searchParams.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          if (isMounted) {
            setMessage({
              text: getFriendlyRecoveryError(error.message),
              type: "error"
            });
            setHasSession(false);
            setIsPreparingSession(false);
          }
          return;
        }
      }

      const { data } = await supabase.auth.getSession();

      if (isMounted) {
        setHasSession(Boolean(data.session));
        setIsPreparingSession(false);
      }
    }

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasSession(Boolean(session));
        setIsPreparingSession(false);
      }
    });

    prepareRecoverySession();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [searchParams]);

  async function savePassword() {
    setMessage(null);

    if (!hasSession) {
      setMessage({
        text: "Abre esta página desde el enlace de recuperación que te hemos enviado por email.",
        type: "error"
      });
      return;
    }

    if (password.length < 8) {
      setMessage({
        text: "La contraseña debe tener al menos 8 caracteres.",
        type: "error"
      });
      return;
    }

    if (password !== repeatPassword) {
      setMessage({
        text: "Las contraseñas no coinciden.",
        type: "error"
      });
      return;
    }

    setIsSaving(true);

    const { error } = await supabase.auth.updateUser({
      password
    });

    setIsSaving(false);

    if (error) {
      setMessage({
        text: "No se pudo guardar la contraseña. Solicita un nuevo enlace e inténtalo de nuevo.",
        type: "error"
      });
      return;
    }

    setPassword("");
    setRepeatPassword("");
    setMessage({
      text: "Contraseña actualizada correctamente. Ya puedes iniciar sesión.",
      type: "success"
    });
  }

  const showRecoveryWarning =
    !isPreparingSession && !hasSession && !hasRecoveryTokenInUrl();

  return (
    <main className="min-h-screen bg-barber-black px-5 py-6 text-barber-cream">
      <section className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-md flex-col justify-center rounded-[2rem] border border-white/10 bg-gradient-to-b from-barber-gray to-barber-black p-6 shadow-2xl shadow-black/50">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-barber-gold">
          FLOWBARBER
        </p>
        <h1 className="mt-6 text-3xl font-bold text-white">
          Nueva contraseña
        </h1>
        <p className="mt-3 text-sm leading-6 text-white/65">
          Crea una contraseña nueva para volver a entrar en flowbarber.
        </p>

        {isPreparingSession ? (
          <p className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm font-semibold text-white/70">
            Validando enlace...
          </p>
        ) : (
          <div className="mt-6 space-y-4">
            {showRecoveryWarning && (
              <p className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold leading-6 text-red-100">
                Este enlace no contiene una sesión de recuperación válida.
                Solicita un nuevo enlace para cambiar tu contraseña.
              </p>
            )}

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-white/70">
                Contraseña nueva
              </span>
              <input
                autoComplete="new-password"
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-barber-gold disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!hasSession || isSaving}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setMessage(null);
                }}
                placeholder="Mínimo 8 caracteres"
                type="password"
                value={password}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-white/70">
                Repetir contraseña
              </span>
              <input
                autoComplete="new-password"
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-barber-gold disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!hasSession || isSaving}
                onChange={(event) => {
                  setRepeatPassword(event.target.value);
                  setMessage(null);
                }}
                placeholder="Repite la contraseña"
                type="password"
                value={repeatPassword}
              />
            </label>

            <button
              className="w-full rounded-2xl bg-barber-gold px-6 py-4 text-base font-bold text-black shadow-lg shadow-barber-gold/20 transition hover:bg-[#e7b65f] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!hasSession || isSaving}
              onClick={savePassword}
              type="button"
            >
              {isSaving ? "Guardando..." : "Guardar contraseña"}
            </button>
          </div>
        )}

        {message && (
          <p
            className={
              message.type === "success"
                ? "mt-5 rounded-2xl border border-barber-gold/30 bg-barber-gold/10 p-4 text-sm font-semibold leading-6 text-barber-gold"
                : "mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold leading-6 text-red-100"
            }
          >
            {message.text}
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link
            className="rounded-2xl border border-white/10 px-4 py-3 text-center text-xs font-semibold text-white/70 transition hover:border-barber-gold/50 hover:text-barber-gold"
            href="/"
          >
            Ir a reservas
          </Link>
          <Link
            className="rounded-2xl border border-white/10 px-4 py-3 text-center text-xs font-semibold text-white/70 transition hover:border-barber-gold/50 hover:text-barber-gold"
            href="/panel"
          >
            Área barbero
          </Link>
        </div>
      </section>
    </main>
  );
}

export default function UpdatePasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-barber-black px-5 py-6 text-barber-cream">
          <section className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-md flex-col justify-center rounded-[2rem] border border-white/10 bg-gradient-to-b from-barber-gray to-barber-black p-6 text-center shadow-2xl shadow-black/50">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-barber-gold">
              FLOWBARBER
            </p>
            <h1 className="mt-6 text-3xl font-bold text-white">
              Validando enlace...
            </h1>
          </section>
        </main>
      }
    >
      <UpdatePasswordContent />
    </Suspense>
  );
}
