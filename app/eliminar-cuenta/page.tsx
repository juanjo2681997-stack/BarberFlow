import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Eliminar cuenta | FlowBarber",
  description:
    "Información pública para solicitar la eliminación de una cuenta de FlowBarber."
};

const publicDomain = "barber.flowreservas.app";
const deletionUrl = `https://${publicDomain}/eliminar-cuenta`;
const contactEmail = "juanjo26.8.1997@gmail.com";

const deletedDataGroups = [
  "Datos de cuenta e identificación, como email, nombre, teléfono y perfiles asociados.",
  "Perfil de cliente, foto de perfil, barberías favoritas, reseñas y datos vinculados a reservas cuando pueda eliminarse o anonimizarse.",
  "Accesos de barbero, empleado o propietario asociados a la cuenta.",
  "Imágenes subidas por el usuario o asociadas a su perfil cuando no deban conservarse por otra obligación.",
  "Suscripciones push y otros datos técnicos asociados directamente a la cuenta."
];

const retainedDataGroups = [
  "Reservas, historial operativo o comunicaciones que una barbería necesite conservar para gestionar incidencias, reclamaciones o seguridad.",
  "Datos de facturación, suscripción o pagos gestionados con Stripe cuando deban conservarse por obligaciones legales, fiscales, contractuales o prevención de fraude.",
  "Registros técnicos mínimos necesarios para proteger FlowBarber, investigar abuso o cumplir obligaciones de seguridad.",
  "Datos de una barbería activa si la cuenta solicitante es propietaria y la eliminación requiere revisar titularidad, citas pendientes, equipo o suscripción."
];

function Section({
  children,
  title
}: Readonly<{
  children: React.ReactNode;
  title: string;
}>) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-5 shadow-lg shadow-black/10 sm:p-6">
      <h2 className="text-xl font-bold text-white sm:text-2xl">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-7 text-white/72 sm:text-base">
        {children}
      </div>
    </section>
  );
}

export default function DeleteAccountPage() {
  return (
    <main className="min-h-screen bg-barber-black text-barber-cream">
      <div className="mx-auto flex w-full max-w-5xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <Link
            className="inline-flex w-fit items-center rounded-full border border-barber-gold/35 px-4 py-2 text-sm font-bold text-barber-gold transition hover:border-barber-gold hover:bg-barber-gold hover:text-black"
            href="/"
          >
            Volver a FlowBarber
          </Link>
          <p className="break-all text-sm font-semibold text-white/55">
            {deletionUrl}
          </p>
        </header>

        <section className="py-10 sm:py-14">
          <p className="text-sm font-bold uppercase text-barber-gold">
            FlowBarber
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight text-white sm:text-5xl">
            Eliminación de cuenta
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-white/70 sm:text-lg">
            Esta página pública explica cómo solicitar la eliminación de una
            cuenta de FlowBarber en {publicDomain}. Sirve tanto para usuarios de
            la app como para quienes necesiten hacer la solicitud sin tener la
            app instalada.
          </p>
        </section>

        <div className="space-y-5 pb-14">
          <Section title="Cómo solicitarlo desde la app">
            <p>
              Inicia sesión en FlowBarber con tu email y contraseña. Si usas la
              zona de cliente, entra en <strong className="text-white">Mi perfil</strong>{" "}
              y abre la sección <strong className="text-white">Eliminar cuenta</strong>.
              Si accedes como barbero, propietario o empleado, entra en el panel
              y usa la sección <strong className="text-white">Cuenta FlowBarber</strong>.
            </p>
            <p>
              Antes de registrar la solicitud se pedirá una confirmación
              explícita. La solicitud afecta a la cuenta completa de FlowBarber:
              si el mismo email tiene perfil de cliente y acceso a una barbería,
              se revisarán ambos perfiles de forma conjunta.
            </p>
          </Section>

          <Section title="Solicitud sin la app instalada">
            <p>
              También puedes solicitarlo por email escribiendo a{" "}
              <a
                className="font-bold text-barber-gold underline-offset-4 hover:underline"
                href={`mailto:${contactEmail}?subject=Solicitud%20de%20eliminaci%C3%B3n%20de%20cuenta%20FlowBarber`}
              >
                {contactEmail}
              </a>
              . Indica que quieres eliminar tu cuenta de FlowBarber y escribe el
              email con el que la registraste. Es posible que pidamos información
              adicional para verificar que la cuenta te pertenece antes de
              eliminar o anonimizar datos.
            </p>
          </Section>

          <Section title="Datos que se eliminan o anonimizan">
            <ul className="list-disc space-y-2 pl-5">
              {deletedDataGroups.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Section>

          <Section title="Datos que pueden conservarse temporalmente">
            <p>
              FlowBarber puede conservar parte de la información solo cuando sea
              necesario por obligaciones legales, prevención de fraude,
              facturación, seguridad, reclamaciones o continuidad operativa de
              una barbería. No se publican plazos concretos en esta página
              porque dependen de la obligación aplicable y del tipo de dato.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              {retainedDataGroups.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Section>

          <Section title="Qué ocurre después">
            <p>
              La solicitud queda registrada para revisión. Mientras no se
              complete la eliminación, la cuenta puede seguir funcionando salvo
              que sea necesario limitar el acceso por seguridad, abuso, pagos,
              titularidad de una barbería o una obligación legal.
            </p>
            <p>
              Cuando se complete el proceso, FlowBarber eliminará o anonimizará
              los datos personales que ya no sean necesarios y cerrará el acceso
              asociado a la cuenta.
            </p>
          </Section>

          <Section title="Contacto">
            <p>
              Para dudas sobre privacidad o estado de una solicitud de
              eliminación, contacta con FlowBarber en{" "}
              <a
                className="font-bold text-barber-gold underline-offset-4 hover:underline"
                href={`mailto:${contactEmail}`}
              >
                {contactEmail}
              </a>
              .
            </p>
          </Section>
        </div>
      </div>
    </main>
  );
}
