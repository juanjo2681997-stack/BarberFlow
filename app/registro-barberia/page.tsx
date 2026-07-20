"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type RegisterBusinessForm = {
  business_name: string;
  owner_name: string;
  email: string;
  password: string;
  whatsapp_phone: string;
  address: string;
  instagram_url: string;
};

type RegisterBusinessResult = {
  business: {
    id: string;
    name: string;
    slug: string;
  };
  email: string;
  public_url: string;
  panel_url: string;
};

const initialForm: RegisterBusinessForm = {
  business_name: "",
  owner_name: "",
  email: "",
  password: "",
  whatsapp_phone: "",
  address: "",
  instagram_url: ""
};

export default function RegisterBusinessPage() {
  const [form, setForm] = useState<RegisterBusinessForm>(initialForm);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<RegisterBusinessResult | null>(null);

  const publicUrl =
    result && typeof window !== "undefined"
      ? `${window.location.origin}${result.public_url}`
      : result?.public_url ?? "";
  const panelUrl =
    result && typeof window !== "undefined"
      ? `${window.location.origin}${result.panel_url}`
      : result?.panel_url ?? "";

  function updateField(field: keyof RegisterBusinessForm, value: string) {
    setForm((currentForm) => ({
      ...currentForm,
      [field]: value
    }));
    setMessage("");
    setIsError(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      form.business_name.trim() === "" ||
      form.owner_name.trim() === "" ||
      form.email.trim() === "" ||
      form.password.trim() === "" ||
      form.whatsapp_phone.trim() === ""
    ) {
      setIsError(true);
      setMessage("Rellena nombre de barbería, responsable, email, contraseña y WhatsApp.");
      return;
    }

    if (form.password.length < 8) {
      setIsError(true);
      setMessage("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setIsSubmitting(true);
    setMessage("");
    setIsError(false);

    try {
      const response = await fetch("/api/register-business", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(form)
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "No se pudo registrar la barbería.");
      }

      setResult(data as RegisterBusinessResult);
      setForm(initialForm);
      setMessage("Barbería registrada correctamente.");
      setIsError(false);
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo registrar la barbería."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-barber-black px-5 py-6 text-barber-cream">
      <section className="mx-auto w-full max-w-2xl rounded-[2rem] border border-white/10 bg-gradient-to-b from-barber-gray to-barber-black p-6 shadow-2xl shadow-black/50">
        <Link
          className="text-xs font-semibold text-white/50 transition hover:text-barber-gold"
          href="/"
        >
          Volver al inicio
        </Link>

        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.24em] text-barber-gold">
          BARBERFLOW
        </p>
        <h1 className="mt-5 text-3xl font-bold leading-tight text-white">
          Registrar mi barbería
        </h1>
        <p className="mt-3 text-sm leading-6 text-white/65">
          Crea una cuenta demo para empezar a configurar servicios, horarios y
          reservas desde tu propio panel.
        </p>

        {message && (
          <p
            className={
              isError
                ? "mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold text-red-100"
                : "mt-5 rounded-2xl border border-barber-gold/30 bg-barber-gold/10 p-4 text-sm font-semibold text-barber-gold"
            }
          >
            {message}
          </p>
        )}

        {result ? (
          <div className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-black/20 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                URL pública
              </p>
              <p className="mt-2 break-all rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-white">
                {publicUrl}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                URL panel
              </p>
              <p className="mt-2 break-all rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-white">
                {panelUrl}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">
                Email de acceso
              </p>
              <p className="mt-2 break-all rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-white">
                {result.email}
              </p>
            </div>

            <Link
              className="block rounded-2xl bg-barber-gold px-5 py-3 text-center text-sm font-bold text-black shadow-lg shadow-barber-gold/20 transition hover:bg-[#e7b65f] active:scale-[0.98]"
              href="/panel"
            >
              Ir a mi panel
            </Link>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-white/70">
                Nombre de la barbería
              </span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                onChange={(event) =>
                  updateField("business_name", event.target.value)
                }
                placeholder="Barbería Pablo"
                type="text"
                value={form.business_name}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-white/70">
                Nombre del propietario o responsable
              </span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                onChange={(event) => updateField("owner_name", event.target.value)}
                placeholder="Nombre completo"
                type="text"
                value={form.owner_name}
              />
            </label>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-white/70">
                  Email
                </span>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                  onChange={(event) => updateField("email", event.target.value)}
                  placeholder="barberia@email.com"
                  type="email"
                  value={form.email}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-white/70">
                  Contraseña
                </span>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                  onChange={(event) => updateField("password", event.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  type="password"
                  value={form.password}
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-white/70">
                Teléfono WhatsApp
              </span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                onChange={(event) =>
                  updateField("whatsapp_phone", event.target.value)
                }
                placeholder="600000000"
                type="tel"
                value={form.whatsapp_phone}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-white/70">
                Dirección opcional
              </span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                onChange={(event) => updateField("address", event.target.value)}
                placeholder="Calle, ciudad"
                type="text"
                value={form.address}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-white/70">
                Instagram opcional
              </span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                onChange={(event) =>
                  updateField("instagram_url", event.target.value)
                }
                placeholder="https://instagram.com/tu_barberia"
                type="url"
                value={form.instagram_url}
              />
            </label>

            <button
              className="w-full rounded-2xl bg-barber-gold px-5 py-3 text-sm font-bold text-black shadow-lg shadow-barber-gold/20 transition hover:bg-[#e7b65f] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Registrando..." : "Registrar barbería"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
