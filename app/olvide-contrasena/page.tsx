"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type Message = {
  text: string;
  type: "success" | "error";
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [isSending, setIsSending] = useState(false);

  async function requestPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanEmail = email.trim().toLowerCase();
    setMessage(null);

    if (!isValidEmail(cleanEmail)) {
      setMessage({
        text: "Introduce el email utilizado para crear la cuenta.",
        type: "error"
      });
      return;
    }

    setIsSending(true);

    const response = await fetch("/api/auth/password-reset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: cleanEmail
      })
    });
    const result = await response.json().catch(() => null);

    setIsSending(false);

    if (!response.ok) {
      setMessage({
        text:
          result?.error ??
          "No se pudo enviar el enlace. Revisa el email e inténtalo de nuevo.",
        type: "error"
      });
      return;
    }

    setMessage({
      text:
        result?.message ??
        "Te hemos enviado un email para recuperar tu contraseña.",
      type: "success"
    });
  }

  return (
    <main className="min-h-screen bg-barber-black px-5 py-6 text-barber-cream">
      <section className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-md flex-col justify-center rounded-[2rem] border border-white/10 bg-gradient-to-b from-barber-gray to-barber-black p-6 shadow-2xl shadow-black/50">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-barber-gold">
          BARBERFLOW
        </p>
        <h1 className="mt-6 text-3xl font-bold text-white">
          Recuperar contraseña
        </h1>
        <p className="mt-3 text-sm leading-6 text-white/65">
          Escribe el mismo email que utilizaste para crear tu cuenta y te
          enviaremos un enlace seguro para crear una contraseña nueva.
        </p>

        <form className="mt-6 space-y-4" noValidate onSubmit={requestPasswordReset}>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-white/70">
              Email
            </span>
            <input
              autoComplete="email"
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
              disabled={isSending}
              onChange={(event) => {
                setEmail(event.target.value);
                setMessage(null);
              }}
              placeholder="tu@email.com"
              type="email"
              value={email}
            />
          </label>

          <button
            className="w-full rounded-2xl bg-barber-gold px-6 py-4 text-base font-bold text-black shadow-lg shadow-barber-gold/20 transition hover:bg-[#e7b65f] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSending}
            type="submit"
          >
            {isSending ? "Enviando..." : "Enviar enlace"}
          </button>
        </form>

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
            Volver a reservas
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
