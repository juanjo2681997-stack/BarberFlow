"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type ConfirmationState = "loading" | "success" | "expired" | "used" | "invalid";

function getMessage(state: ConfirmationState) {
  if (state === "success") {
    return "Solicitud confirmada correctamente.";
  }

  if (state === "expired") {
    return "Este enlace ha caducado.";
  }

  if (state === "used") {
    return "Este enlace ya ha sido utilizado.";
  }

  if (state === "invalid") {
    return "El enlace no es válido.";
  }

  return "Confirmando activación...";
}

function ActivateProfileContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [state, setState] = useState<ConfirmationState>("loading");

  useEffect(() => {
    async function confirmActivation() {
      if (!token) {
        setState("invalid");
        return;
      }

      const response = await fetch("/api/profile-activation/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ token })
      });

      const result = await response.json().catch(() => null);

      if (response.ok) {
        setState("success");
        return;
      }

      if (result?.code === "expired") {
        setState("expired");
        return;
      }

      if (result?.code === "used") {
        setState("used");
        return;
      }

      setState("invalid");
    }

    confirmActivation();
  }, [token]);

  const isSuccess = state === "success";
  const isLoading = state === "loading";

  return (
    <main className="min-h-screen bg-barber-black px-5 py-6 text-barber-cream">
      <section className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-md flex-col justify-center rounded-[2rem] border border-white/10 bg-gradient-to-b from-barber-gray to-barber-black p-6 text-center shadow-2xl shadow-black/50">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-barber-gold">
          BARBERFLOW
        </p>
        <h1 className="mt-6 text-3xl font-bold text-white">
          Activación de perfil
        </h1>
        <p
          className={
            isSuccess || isLoading
              ? "mt-5 rounded-2xl border border-barber-gold/30 bg-barber-gold/10 p-4 text-sm font-semibold leading-6 text-barber-gold"
              : "mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold leading-6 text-red-100"
          }
        >
          {getMessage(state)}
        </p>

        {!isLoading && (
          <Link
            className="mt-4 block rounded-2xl border border-white/10 px-4 py-3 text-center text-xs font-semibold text-white/70 transition hover:border-barber-gold/50 hover:text-barber-gold"
            href="/"
          >
            Volver a BarberFlow
          </Link>
        )}
      </section>
    </main>
  );
}

export default function ActivateProfilePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-barber-black px-5 py-6 text-barber-cream">
          <section className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-md flex-col justify-center rounded-[2rem] border border-white/10 bg-gradient-to-b from-barber-gray to-barber-black p-6 text-center shadow-2xl shadow-black/50">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-barber-gold">
              BARBERFLOW
            </p>
            <h1 className="mt-6 text-3xl font-bold text-white">
              Confirmando activación...
            </h1>
          </section>
        </main>
      }
    >
      <ActivateProfileContent />
    </Suspense>
  );
}
