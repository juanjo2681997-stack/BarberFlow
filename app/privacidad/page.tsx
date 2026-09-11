import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de privacidad | FlowBarber",
  description:
    "Política de privacidad de FlowBarber para usuarios, clientes y barberías."
};

const lastUpdated = "11 de septiembre de 2026";
const publicDomain = "barber.flowreservas.app";
const privacyContact = "juanjo26.8.1997@gmail.com";

const dataGroups = [
  {
    title: "Datos de cuenta e identificación",
    text:
      "Nombre, apellidos o nombre completo, email, contraseña gestionada mediante el sistema de autenticación, teléfono cuando lo facilitas y datos necesarios para activar o recuperar tu perfil."
  },
  {
    title: "Datos de barbería y equipo",
    text:
      "Nombre de la barbería, responsable, dirección, teléfono o WhatsApp de contacto, Instagram, servicios, precios, duración de servicios, horarios, empleados, roles de acceso y disponibilidad."
  },
  {
    title: "Reservas y actividad del servicio",
    text:
      "Citas, servicio elegido, fecha, hora, duración, estado de la reserva, cancelaciones, motivos de cancelación, reseñas, valoraciones, favoritos y comunicaciones asociadas a la cita."
  },
  {
    title: "Imágenes",
    text:
      "Fotografías o imágenes que subas voluntariamente, como foto de perfil de cliente o imagen pública de la barbería."
  },
  {
    title: "Datos técnicos",
    text:
      "Datos necesarios para seguridad, funcionamiento, notificaciones y diagnóstico, como sesión de autenticación, navegador o user agent, identificadores de suscripción push y registros técnicos generados por la infraestructura."
  },
  {
    title: "Pagos y suscripciones",
    text:
      "Datos necesarios para gestionar planes, periodos de prueba, estado de suscripción, identificadores de cliente o suscripción de Stripe y eventos de facturación. FlowBarber no almacena los datos completos de tarjetas."
  }
];

const purposes = [
  "Crear y gestionar cuentas de clientes, propietarios y empleados.",
  "Publicar y administrar páginas de barberías, servicios, horarios y disponibilidad.",
  "Permitir la reserva, modificación operativa, confirmación, seguimiento y cancelación de citas.",
  "Enviar emails transaccionales, como verificación de correo, recuperación de contraseña, confirmaciones, avisos de cancelación y comunicaciones relacionadas con pagos.",
  "Gestionar notificaciones push de recordatorios o avisos, solo cuando se activan.",
  "Gestionar pagos, suscripciones, pruebas, renovaciones, incidencias de cobro y acceso al panel de facturación.",
  "Mantener la seguridad, prevenir abusos, resolver errores y mejorar la estabilidad del servicio.",
  "Cumplir obligaciones legales, fiscales, contractuales o requerimientos de plataformas como Google Play o App Store."
];

const providers = [
  {
    name: "Supabase",
    text:
      "Se utiliza para autenticación, base de datos y almacenamiento de imágenes asociadas a perfiles o barberías."
  },
  {
    name: "Stripe",
    text:
      "Se utiliza para crear sesiones de pago, gestionar clientes, suscripciones, portal de facturación y eventos de cobro. Los datos completos de tarjeta se procesan por Stripe, no por FlowBarber."
  },
  {
    name: "Resend",
    text:
      "Se utiliza para el envío de emails transaccionales necesarios para el funcionamiento de la aplicación."
  },
  {
    name: "Vercel",
    text:
      "Se utiliza como infraestructura de despliegue y ejecución de la aplicación, incluyendo tareas programadas."
  }
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

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-barber-black text-barber-cream">
      <div className="mx-auto flex w-full max-w-5xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <Link
            className="inline-flex w-fit items-center rounded-full border border-barber-gold/35 px-4 py-2 text-sm font-bold text-barber-gold transition hover:border-barber-gold hover:bg-barber-gold hover:text-black"
            href="/"
          >
            Volver al inicio
          </Link>
          <p className="text-sm font-semibold text-white/55">
            Última actualización: {lastUpdated}
          </p>
        </header>

        <section className="py-10 sm:py-14">
          <p className="text-sm font-bold uppercase text-barber-gold">
            FlowBarber
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight text-white sm:text-5xl">
            Política de privacidad
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-white/70 sm:text-lg">
            Esta política explica cómo FlowBarber trata los datos personales en
            la aplicación pública disponible en {publicDomain}, incluyendo el
            uso por clientes que reservan citas y por barberías que gestionan su
            agenda, servicios, equipo y suscripciones.
          </p>
        </section>

        <div className="space-y-5 pb-14">
          <Section title="1. Responsable del tratamiento">
            <p>
              El servicio FlowBarber es accesible públicamente desde{" "}
              <strong className="text-white">{publicDomain}</strong>. La persona
              o entidad titular de FlowBarber actúa como responsable del
              tratamiento respecto a la gestión de la plataforma, cuentas,
              seguridad, comunicaciones técnicas y suscripciones.
            </p>
            <p>
              Cuando una barbería usa FlowBarber para gestionar sus clientes,
              servicios y reservas, esa barbería también puede actuar como
              responsable de los datos vinculados a su actividad profesional,
              especialmente los relativos a citas, clientes, horarios,
              empleados y comunicaciones con sus propios clientes.
            </p>
          </Section>

          <Section title="2. Datos que se recopilan">
            <div className="grid gap-3 sm:grid-cols-2">
              {dataGroups.map((group) => (
                <article
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  key={group.title}
                >
                  <h3 className="text-base font-bold text-barber-gold">
                    {group.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-white/68">
                    {group.text}
                  </p>
                </article>
              ))}
            </div>
          </Section>

          <Section title="3. Finalidad del tratamiento">
            <ul className="list-disc space-y-2 pl-5">
              {purposes.map((purpose) => (
                <li key={purpose}>{purpose}</li>
              ))}
            </ul>
          </Section>

          <Section title="4. Base jurídica">
            <p>
              Tratamos datos cuando es necesario para prestar el servicio
              solicitado, por ejemplo crear una cuenta, permitir una reserva,
              administrar una barbería o gestionar una suscripción.
            </p>
            <p>
              También podemos tratar datos sobre la base del consentimiento,
              como en el caso de notificaciones push o determinadas
              comunicaciones; por interés legítimo, para seguridad,
              prevención de abuso y mejora técnica; y para cumplir obligaciones
              legales aplicables.
            </p>
          </Section>

          <Section title="5. Proveedores y encargados">
            <p>
              FlowBarber utiliza proveedores técnicos que pueden tratar datos
              personales únicamente para prestar sus servicios a la aplicación:
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {providers.map((provider) => (
                <article
                  className="rounded-2xl border border-barber-gold/15 bg-barber-gold/[0.06] p-4"
                  key={provider.name}
                >
                  <h3 className="text-base font-bold text-white">
                    {provider.name}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-white/70">
                    {provider.text}
                  </p>
                </article>
              ))}
            </div>
          </Section>

          <Section title="6. Pagos y suscripciones">
            <p>
              Los pagos y suscripciones de barberías se gestionan mediante
              Stripe. FlowBarber puede conservar identificadores de cliente,
              suscripción, plan, estado de pago, periodo de prueba y eventos
              necesarios para activar o limitar el acceso al servicio.
            </p>
            <p>
              Los datos completos de tarjetas, autenticación bancaria u otros
              medios de pago se introducen y procesan en entornos de Stripe.
              FlowBarber no necesita almacenar el número completo de tarjeta
              para operar la suscripción.
            </p>
          </Section>

          <Section title="7. Conservación">
            <p>
              Conservamos los datos mientras la cuenta, barbería o relación de
              servicio siga activa y durante los plazos necesarios para cumplir
              obligaciones legales, resolver incidencias, prevenir fraude,
              atender reclamaciones o mantener historiales operativos de citas
              y pagos.
            </p>
            <p>
              Cuando una cuenta o barbería solicita la eliminación de sus datos,
              revisamos la petición y eliminamos o anonimizamos la información
              que ya no sea necesaria, salvo que exista una obligación legal o
              contractual que exija conservarla durante más tiempo.
            </p>
          </Section>

          <Section title="8. Derechos del usuario">
            <p>
              Puedes solicitar acceso, rectificación, supresión, oposición,
              limitación del tratamiento y portabilidad de tus datos cuando
              corresponda. También puedes retirar consentimientos, como el de
              notificaciones push, desde la configuración del navegador o
              dispositivo.
            </p>
            <p>
              Para ejercer tus derechos, utiliza {privacyContact}. Es posible
              que solicitemos información adicional para verificar tu identidad
              antes de aplicar cambios sobre datos personales.
            </p>
          </Section>

          <Section title="9. Eliminación de cuenta y datos">
            <p>
              Puedes pedir la eliminación de tu cuenta y de los datos asociados
              contactando por {privacyContact}. Si eres cliente, la petición
              afectará a tu perfil, datos de contacto, foto, favoritos, reseñas
              y reservas asociadas en la medida legalmente posible.
            </p>
            <p>
              Si eres propietario o empleado de una barbería, la eliminación
              puede requerir revisar la titularidad de la barbería, citas
              pendientes, datos de facturación, suscripciones y obligaciones
              frente a clientes antes de completar la baja.
            </p>
          </Section>

          <Section title="10. Seguridad">
            <p>
              FlowBarber usa autenticación, sesiones de usuario, permisos por
              rol y comunicaciones con proveedores especializados para proteger
              el acceso a cuentas, paneles y operaciones sensibles. Además,
              limitamos el acceso a APIs privadas mediante sesión autorizada
              cuando la operación lo requiere.
            </p>
            <p>
              Ningún sistema es infalible. Si detectas un acceso no autorizado
              o un problema de seguridad, comunícalo cuanto antes por{" "}
              {privacyContact}.
            </p>
          </Section>

          <Section title="11. Menores">
            <p>
              FlowBarber no está dirigido a menores de edad como usuarios
              titulares de cuentas de gestión. Si una persona menor solicita una
              cita, debe hacerlo con autorización de sus representantes legales
              o a través de la barbería correspondiente, según resulte aplicable.
            </p>
          </Section>

          <Section title="12. Transferencias internacionales">
            <p>
              Algunos proveedores de FlowBarber, como Supabase, Stripe, Resend
              o Vercel, pueden prestar servicios desde distintos países. Cuando
              el tratamiento implique transferencias internacionales, deberán
              aplicarse las garantías contractuales o mecanismos legales que
              correspondan según la normativa aplicable.
            </p>
          </Section>

          <Section title="13. Cambios en esta política">
            <p>
              Podemos actualizar esta política para reflejar cambios legales,
              técnicos o funcionales de FlowBarber. Cuando el cambio sea
              relevante, lo comunicaremos mediante la aplicación o los canales
              de contacto disponibles.
            </p>
          </Section>

          <Section title="14. Contacto">
            <p>
              Para consultas sobre privacidad, derechos de usuario o eliminación
              de datos, contacta con FlowBarber mediante {privacyContact}. Antes
              de publicar esta URL en tiendas de aplicaciones, se recomienda
              sustituir esta referencia por un correo profesional del dominio
              flowreservas.app.
            </p>
          </Section>
        </div>
      </div>
    </main>
  );
}
