"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Appointment = {
  id: string;
  service: string;
  appointment_date: string;
  appointment_time: string;
  customer_name: string;
  customer_phone: string;
  barber_name: string;
  duration_minutes: number;
  reminder_sent_at: string | null;
  reminder_status: string | null;
  reminder_error: string | null;
};

type WorkingHour = {
  id: string;
  day_of_week: number;
  day_name: string;
  is_working: boolean;
  morning_start: string | null;
  morning_end: string | null;
  afternoon_start: string | null;
  afternoon_end: string | null;
  slot_minutes: number;
};

type Service = {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
  is_active: boolean;
};

type NewServiceForm = {
  name: string;
  price: string;
  duration_minutes: string;
};

type BlockedTime = {
  id: string;
  block_date: string;
  is_full_day: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
};

type NewBlockedTimeForm = {
  block_date: string;
  is_full_day: boolean;
  start_time: string;
  end_time: string;
  reason: string;
};

type BusinessSettings = {
  id: string;
  business_name: string;
  slogan: string;
  whatsapp_phone: string;
  whatsapp_message: string;
  instagram_url: string;
  address: string;
  main_button_text: string;
  booking_limit_enabled: boolean;
  booking_limit_value: number;
  booking_limit_mode: "days" | "weeks" | "months";
  weekly_release_enabled: boolean;
  weekly_release_day: number;
  weekly_release_window_days: number;
};

type PanelSectionKey =
  | "today"
  | "future"
  | "reminders"
  | "settings"
  | "services"
  | "blocks"
  | "schedule";

const defaultBusinessSettings: BusinessSettings = {
  id: "",
  business_name: "Pablo's Barbershop",
  slogan: "Reserva tu corte en menos de 30 segundos",
  whatsapp_phone: "34675070848",
  whatsapp_message: "Hola, quiero reservar una cita en Pablo's Barbershop.",
  instagram_url: "https://www.instagram.com/peluqueria_pablos?igsh=MWdrbXhoY3Rvbmp2Mw==",
  address: "Calle San Francisco,13, 21800, Moguer (Huelva)",
  main_button_text: "Reservar cita",
  booking_limit_enabled: true,
  booking_limit_value: 31,
  booking_limit_mode: "days",
  weekly_release_enabled: false,
  weekly_release_day: 1,
  weekly_release_window_days: 7
};

const whatsAppMessage =
  "Hola, te escribimos desde Pablo's Barbershop para confirmar tu cita.";

const reminderStatusLabels: Record<string, string> = {
  pending: "Pendiente",
  sent: "Enviado",
  failed: "Fallido"
};

function createWhatsAppLink(phone: string) {
  const cleanPhone = phone.replace(/\D/g, "");
  const phoneWithCountryCode = cleanPhone.startsWith("34")
    ? cleanPhone
    : `34${cleanPhone}`;

  return `https://wa.me/${phoneWithCountryCode}?text=${encodeURIComponent(
    whatsAppMessage
  )}`;
}

function formatAppointmentTime(time: string) {
  return time.slice(0, 5);
}

function formatDateForSupabase(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function emptyToNull(value: string | null) {
  return value && value.trim() !== "" ? value : null;
}

function normalizeBookingLimitMode(
  mode: string | null | undefined
): "days" | "weeks" | "months" {
  if (mode === "weeks" || mode === "months") {
    return mode;
  }

  return "days";
}

function timeToMinutes(time: string) {
  const [hours, minutes] = formatAppointmentTime(time).split(":").map(Number);
  return hours * 60 + minutes;
}

export default function BarberPanel() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [workingHours, setWorkingHours] = useState<WorkingHour[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([]);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>(
    defaultBusinessSettings
  );
  const [businessForm, setBusinessForm] = useState<BusinessSettings>(
    defaultBusinessSettings
  );
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [isLoadingBlockedTimes, setIsLoadingBlockedTimes] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [scheduleMessage, setScheduleMessage] = useState("");
  const [serviceMessage, setServiceMessage] = useState("");
  const [blockMessage, setBlockMessage] = useState("");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsMessageType, setSettingsMessageType] = useState<
    "success" | "error"
  >("success");
  const [newService, setNewService] = useState<NewServiceForm>({
    name: "",
    price: "",
    duration_minutes: "30"
  });
  const [newBlockedTime, setNewBlockedTime] = useState<NewBlockedTimeForm>({
    block_date: "",
    is_full_day: true,
    start_time: "",
    end_time: "",
    reason: ""
  });
  const [openSections, setOpenSections] = useState<Record<PanelSectionKey, boolean>>({
    today: true,
    future: true,
    reminders: false,
    settings: false,
    services: false,
    blocks: false,
    schedule: false
  });

  const todayDate = new Date();
  const tomorrowDate = new Date(todayDate);
  tomorrowDate.setDate(todayDate.getDate() + 1);

  const today = formatDateForSupabase(todayDate);
  const tomorrow = formatDateForSupabase(tomorrowDate);
  const tomorrowAppointments = appointments.filter(
    (appointment) => appointment.appointment_date === tomorrow
  );
  const todayAppointments = appointments.filter(
    (appointment) => appointment.appointment_date === today
  );
  const futureAppointments = appointments.filter(
    (appointment) => appointment.appointment_date > today
  );

  useEffect(() => {
    checkSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setIsAuthenticated(true);
        loadPanelData();
      } else {
        clearPanelData();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function checkSession() {
    const { data } = await supabase.auth.getSession();

    if (data.session) {
      setIsAuthenticated(true);
      loadPanelData();
      return;
    }

    clearPanelData();
  }

  function loadPanelData() {
    loadAppointments();
    loadBusinessSettings();
    loadWorkingHours();
    loadServices();
    loadBlockedTimes();
  }

  function clearPanelData() {
    setIsAuthenticated(false);
    setAppointments([]);
    setWorkingHours([]);
    setServices([]);
    setBlockedTimes([]);
    setBusinessSettings(defaultBusinessSettings);
    setBusinessForm(defaultBusinessSettings);
    setIsLoading(false);
    setIsLoadingSchedule(false);
    setIsLoadingServices(false);
    setIsLoadingBlockedTimes(false);
    setServiceMessage("");
    setBlockMessage("");
    setSettingsMessage("");
    setSettingsMessageType("success");
  }

  async function handleLogin() {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error) {
      setLoginError("Email o contraseña incorrectos.");
      return;
    }

    setLoginError("");
    setPassword("");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setEmail("");
    setPassword("");
    clearPanelData();
  }
  async function loadBusinessSettings(clearMessage = true) {
    if (clearMessage) {
      setSettingsMessage("");
    }

    const { data, error } = await supabase
      .from("business_settings")
      .select(
        "id, business_name, slogan, whatsapp_phone, whatsapp_message, instagram_url, address, main_button_text, booking_limit_enabled, booking_limit_value, booking_limit_mode, weekly_release_enabled, weekly_release_day, weekly_release_window_days"
      )
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      console.error("Error loading business settings:", error);
      setBusinessSettings(defaultBusinessSettings);
      setBusinessForm(defaultBusinessSettings);
      return;
    }

    const nextBusinessSettings = {
      id: data.id,
      business_name: data.business_name || defaultBusinessSettings.business_name,
      slogan: data.slogan || defaultBusinessSettings.slogan,
      whatsapp_phone: data.whatsapp_phone || defaultBusinessSettings.whatsapp_phone,
      whatsapp_message:
        data.whatsapp_message || defaultBusinessSettings.whatsapp_message,
      instagram_url: data.instagram_url || defaultBusinessSettings.instagram_url,
      address: data.address || defaultBusinessSettings.address,
      main_button_text:
        data.main_button_text || defaultBusinessSettings.main_button_text,
      booking_limit_enabled:
        data.booking_limit_enabled ?? defaultBusinessSettings.booking_limit_enabled,
      booking_limit_value: Number(
        data.booking_limit_value ?? defaultBusinessSettings.booking_limit_value
      ),
      booking_limit_mode: normalizeBookingLimitMode(data.booking_limit_mode),
      weekly_release_enabled:
        data.weekly_release_enabled ??
        defaultBusinessSettings.weekly_release_enabled,
      weekly_release_day: Number(
        data.weekly_release_day ?? defaultBusinessSettings.weekly_release_day
      ),
      weekly_release_window_days: Number(
        data.weekly_release_window_days ??
          defaultBusinessSettings.weekly_release_window_days
      )
    };

    setBusinessSettings(nextBusinessSettings);
    setBusinessForm(nextBusinessSettings);
  }

  function updateBusinessSetting(
    field: keyof BusinessSettings,
    value: string | number | boolean
  ) {
    setBusinessForm((currentForm) => ({
      ...currentForm,
      [field]: value
    }));
    setSettingsMessage("");
    setSettingsMessageType("success");
  }

  async function saveBusinessSettings() {
    setSettingsMessage("");

    if (!businessSettings.id) {
      console.error("Error saving business settings:", "Missing business settings id");
      setSettingsMessageType("error");
      setSettingsMessage("No se pudo guardar la configuración.");
      return;
    }

    const settingsToSave = {
      business_name: businessForm.business_name.trim(),
      slogan: businessForm.slogan.trim(),
      whatsapp_phone: businessForm.whatsapp_phone.trim(),
      whatsapp_message: businessForm.whatsapp_message.trim(),
      instagram_url: businessForm.instagram_url.trim(),
      address: businessForm.address.trim(),
      main_button_text: businessForm.main_button_text.trim(),
      booking_limit_enabled: businessForm.booking_limit_enabled,
      booking_limit_value: Number(businessForm.booking_limit_value),
      booking_limit_mode: businessForm.booking_limit_mode,
      weekly_release_enabled: businessForm.weekly_release_enabled,
      weekly_release_day: Number(businessForm.weekly_release_day),
      weekly_release_window_days:
        Number(businessForm.weekly_release_window_days),
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from("business_settings")
      .update(settingsToSave)
      .eq("id", businessSettings.id);

    if (error) {
      console.error("Error saving business settings:", error);
      setSettingsMessageType("error");
      setSettingsMessage("No se pudo guardar la configuración.");
      return;
    }

    setSettingsMessageType("success");
    setSettingsMessage("Configuración guardada correctamente.");
    setBusinessSettings((currentSettings) => ({
      ...currentSettings,
      ...settingsToSave
    }));
    setBusinessForm((currentForm) => ({
      ...currentForm,
      ...settingsToSave
    }));
    await loadBusinessSettings(false);
  }
  async function loadAppointments() {
    setIsLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("appointments")
      .select(
        "id, service, appointment_date, appointment_time, customer_name, customer_phone, barber_name, duration_minutes, reminder_sent_at, reminder_status, reminder_error"
      )
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true });

    setIsLoading(false);

    if (error) {
      setErrorMessage("No se pudieron cargar las citas.");
      return;
    }

    setAppointments((data ?? []) as Appointment[]);
  }

  async function loadBlockedTimes() {
    setIsLoadingBlockedTimes(true);

    const { data, error } = await supabase
      .from("blocked_times")
      .select("id, block_date, is_full_day, start_time, end_time, reason")
      .order("block_date", { ascending: true })
      .order("start_time", { ascending: true });

    setIsLoadingBlockedTimes(false);

    if (error) {
      setBlockMessage("No se pudieron cargar los bloqueos.");
      return;
    }

    setBlockedTimes((data ?? []) as BlockedTime[]);
  }

  async function loadWorkingHours() {
    setIsLoadingSchedule(true);
    setScheduleMessage("");

    const { data, error } = await supabase
      .from("working_hours")
      .select(
        "id, day_of_week, day_name, is_working, morning_start, morning_end, afternoon_start, afternoon_end, slot_minutes"
      )
      .order("day_of_week", { ascending: true });

    setIsLoadingSchedule(false);

    if (error) {
      setScheduleMessage("No se pudo cargar el horario de trabajo.");
      return;
    }

    setWorkingHours((data ?? []) as WorkingHour[]);
  }

  async function loadServices() {
    setIsLoadingServices(true);

    const { data, error } = await supabase
      .from("services")
      .select("id, name, price, duration_minutes, is_active")
      .order("created_at", { ascending: true });

    setIsLoadingServices(false);

    if (error) {
      setServiceMessage("No se pudieron cargar los servicios.");
      return;
    }

    setServices((data ?? []) as Service[]);
  }

  function updateService(
    id: string,
    field: keyof Service,
    value: string | number | boolean
  ) {
    setServices((currentServices) =>
      currentServices.map((service) =>
        service.id === id ? { ...service, [field]: value } : service
      )
    );
    setServiceMessage("");
  }

  async function saveService(service: Service) {
    const { error } = await supabase
      .from("services")
      .update({
        name: service.name.trim(),
        price: Number(service.price),
        duration_minutes: Number(service.duration_minutes),
        is_active: service.is_active
      })
      .eq("id", service.id);

    if (error) {
      setServiceMessage("No se pudo guardar el servicio.");
      return;
    }

    setServiceMessage("Servicio actualizado correctamente.");
    await loadServices();
  }

  async function addService() {
    if (
      newService.name.trim() === "" ||
      newService.price.trim() === "" ||
      newService.duration_minutes.trim() === ""
    ) {
      setServiceMessage("Rellena nombre, precio y duración para añadir un servicio.");
      return;
    }

    const { error } = await supabase.from("services").insert({
      name: newService.name.trim(),
      price: Number(newService.price),
      duration_minutes: Number(newService.duration_minutes),
      is_active: true
    });

    if (error) {
      setServiceMessage("No se pudo añadir el servicio.");
      return;
    }

    setNewService({ name: "", price: "", duration_minutes: "30" });
    setServiceMessage("Servicio añadido correctamente.");
    await loadServices();
  }

  async function deleteService(id: string) {
    const { error } = await supabase.from("services").delete().eq("id", id);

    if (error) {
      setServiceMessage("No se pudo eliminar el servicio.");
      return;
    }

    setServiceMessage("Servicio eliminado correctamente.");
    await loadServices();
  }
  async function addBlockedTime() {
    if (newBlockedTime.block_date.trim() === "") {
      setBlockMessage("Elige una fecha para bloquear.");
      return;
    }

    if (!newBlockedTime.is_full_day) {
      if (
        newBlockedTime.start_time.trim() === "" ||
        newBlockedTime.end_time.trim() === ""
      ) {
        setBlockMessage("Elige hora de inicio y hora de fin.");
        return;
      }

      if (timeToMinutes(newBlockedTime.end_time) <= timeToMinutes(newBlockedTime.start_time)) {
        setBlockMessage("La hora fin debe ser posterior a la hora inicio.");
        return;
      }
    }

    const { error } = await supabase.from("blocked_times").insert({
      block_date: newBlockedTime.block_date,
      is_full_day: newBlockedTime.is_full_day,
      start_time: newBlockedTime.is_full_day ? null : newBlockedTime.start_time,
      end_time: newBlockedTime.is_full_day ? null : newBlockedTime.end_time,
      reason: emptyToNull(newBlockedTime.reason)
    });

    if (error) {
      setBlockMessage("No se pudo añadir el bloqueo.");
      return;
    }

    setNewBlockedTime({
      block_date: "",
      is_full_day: true,
      start_time: "",
      end_time: "",
      reason: ""
    });
    setBlockMessage("Bloqueo añadido correctamente.");
    await loadBlockedTimes();
  }

  async function deleteBlockedTime(id: string) {
    const { error } = await supabase.from("blocked_times").delete().eq("id", id);

    if (error) {
      setBlockMessage("No se pudo eliminar el bloqueo.");
      return;
    }

    setBlockMessage("Bloqueo eliminado correctamente.");
    await loadBlockedTimes();
  }

  function createReminderWhatsAppLink(appointment: Appointment) {
    const cleanPhone = appointment.customer_phone.replace(/\D/g, "");
    const phoneWithCountryCode = cleanPhone.startsWith("34")
      ? cleanPhone
      : `34${cleanPhone}`;
    const businessName =
      businessSettings.business_name || defaultBusinessSettings.business_name;
    const message = `Hola ${appointment.customer_name}, te recordamos tu cita de mañana en ${businessName} a las ${formatAppointmentTime(
      appointment.appointment_time
    )} para ${appointment.service}. Si no puedes asistir, avísanos por favor. Gracias.`;

    return `https://wa.me/${phoneWithCountryCode}?text=${encodeURIComponent(
      message
    )}`;
  }

  async function markReminderAsSent(id: string) {
    const { error } = await supabase
      .from("appointments")
      .update({
        reminder_status: "sent",
        reminder_sent_at: new Date().toISOString(),
        reminder_error: null
      })
      .eq("id", id);

    if (error) {
      setErrorMessage("No se pudo marcar el recordatorio como enviado.");
      return;
    }

    await loadAppointments();
  }
  async function deleteAppointment(id: string) {
    const { error } = await supabase.from("appointments").delete().eq("id", id);

    if (error) {
      setErrorMessage("No se pudo eliminar la cita.");
      return;
    }

    await loadAppointments();
  }

  function updateWorkingHour(
    id: string,
    field: keyof WorkingHour,
    value: string | boolean | number
  ) {
    setWorkingHours((currentWorkingHours) =>
      currentWorkingHours.map((workingHour) =>
        workingHour.id === id ? { ...workingHour, [field]: value } : workingHour
      )
    );
    setScheduleMessage("");
  }

  async function saveWorkingHour(workingHour: WorkingHour) {
    const { error } = await supabase
      .from("working_hours")
      .update({
        is_working: workingHour.is_working,
        morning_start: emptyToNull(workingHour.morning_start),
        morning_end: emptyToNull(workingHour.morning_end),
        afternoon_start: emptyToNull(workingHour.afternoon_start),
        afternoon_end: emptyToNull(workingHour.afternoon_end),
        slot_minutes: workingHour.slot_minutes
      })
      .eq("id", workingHour.id);

    if (error) {
      setScheduleMessage("No se pudo actualizar el horario.");
      return;
    }

    setScheduleMessage("Horario actualizado correctamente.");
    await loadWorkingHours();
  }

  function toggleSection(section: PanelSectionKey) {
    setOpenSections((currentSections) => ({
      ...currentSections,
      [section]: !currentSections[section]
    }));
  }

  function renderAccordionHeader(section: PanelSectionKey, title: string) {
    const isOpen = openSections[section];

    return (
      <button
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-4 text-left transition hover:border-barber-gold/50 hover:bg-white/[0.07] active:scale-[0.99]"
        onClick={() => toggleSection(section)}
        type="button"
      >
        <span className="text-lg font-bold text-white">{title}</span>
        <span className="text-sm font-bold text-barber-gold">
          {isOpen ? "▲" : "▼"}
        </span>
      </button>
    );
  }
  function renderAppointment(appointment: Appointment) {
    return (
      <article
        className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
        key={appointment.id}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-2xl font-bold text-barber-gold">
              {formatAppointmentTime(appointment.appointment_time)}
            </p>
            <p className="mt-1 text-sm text-white/55">
              {appointment.appointment_date}
            </p>
            <p className="mt-3 text-base font-semibold text-white">
              {appointment.customer_name}
            </p>
          </div>

          <div className="flex gap-2 sm:flex-col">
            <a
              className="rounded-full border border-green-400/40 px-3 py-2 text-center text-xs font-semibold text-green-200 transition hover:bg-green-400/10 active:scale-[0.98]"
              href={createWhatsAppLink(appointment.customer_phone)}
              rel="noreferrer"
              target="_blank"
            >
              WhatsApp
            </a>
            <button
              className="rounded-full border border-red-400/40 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-400/10 active:scale-[0.98]"
              onClick={() => deleteAppointment(appointment.id)}
              type="button"
            >
              Eliminar
            </button>
          </div>
        </div>

        <div className="mt-4 space-y-2 text-sm leading-6 text-white/70">
          <p>
            <span className="font-semibold text-white">Servicio:</span>{" "}
            {appointment.service}
          </p>
          <p>
            <span className="font-semibold text-white">Duración:</span>{" "}
            {appointment.duration_minutes} min
          </p>
          <p>
            <span className="font-semibold text-white">Teléfono:</span>{" "}
            {appointment.customer_phone}
          </p>
        </div>
      </article>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-barber-black px-5 py-6 text-barber-cream">
        <section className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-md flex-col justify-center rounded-[2rem] border border-white/10 bg-gradient-to-b from-barber-gray to-barber-black p-6 shadow-2xl shadow-black/50">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-barber-gold">
            BARBERFLOW
          </p>
          <h1 className="mt-6 text-3xl font-bold text-white">
            Acceso del barbero
          </h1>
          <p className="mt-3 text-sm leading-6 text-white/65">
            Inicia sesión para ver el panel.
          </p>

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-white/70">
                Email
              </span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                onChange={(event) => {
                  setEmail(event.target.value);
                  setLoginError("");
                }}
                placeholder="pablo@barberflow.com"
                type="email"
                value={email}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-white/70">
                Contraseña
              </span>
              <div className="flex rounded-2xl border border-white/10 bg-black/30 focus-within:border-barber-gold">
                <input
                  className="min-w-0 flex-1 rounded-l-2xl bg-transparent px-4 py-3 text-white outline-none placeholder:text-white/35"
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setLoginError("");
                  }}
                  placeholder="Contraseña"
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  className="px-4 text-sm font-semibold text-white/60 transition hover:text-barber-gold"
                  onClick={() => setShowPassword(!showPassword)}
                  type="button"
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </label>

            <button
              className="w-full rounded-2xl bg-barber-gold px-6 py-4 text-base font-bold text-black shadow-lg shadow-barber-gold/20 transition hover:bg-[#e7b65f] active:scale-[0.98]"
              onClick={handleLogin}
              type="button"
            >
              Entrar
            </button>
          </div>
          {loginError && (
            <p className="mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold text-red-100">
              {loginError}
            </p>
          )}

          <Link
            className="mt-4 block rounded-2xl border border-white/10 px-4 py-3 text-center text-xs font-semibold text-white/70 transition hover:border-barber-gold/50 hover:text-barber-gold"
            href="/"
          >
            Volver a la app
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-barber-black px-5 py-6 text-barber-cream">
      <section className="mx-auto w-full max-w-md rounded-[2rem] border border-white/10 bg-gradient-to-b from-barber-gray to-barber-black p-6 shadow-2xl shadow-black/50">
        <header className="mb-8 space-y-5">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-barber-gold">
            BARBERFLOW
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <h1 className="text-3xl font-bold text-white">Panel del barbero</h1>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="rounded-2xl border border-red-400/30 px-4 py-3 text-xs font-semibold text-red-100 transition hover:bg-red-400/10"
                onClick={handleLogout}
                type="button"
              >
                Cerrar sesión
              </button>
              <Link
                className="rounded-2xl border border-white/10 px-4 py-3 text-center text-xs font-semibold text-white/70 transition hover:border-barber-gold/50 hover:text-barber-gold"
                href="/"
              >
                Volver a la app
              </Link>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-sm font-semibold text-white/60">Citas de hoy</p>
            <p className="mt-3 text-3xl font-bold text-barber-gold">
              {todayAppointments.length}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="text-sm font-semibold text-white/60">Próximas citas</p>
            <p className="mt-3 text-3xl font-bold text-barber-gold">
              {futureAppointments.length}
            </p>
          </div>
        </section>

        <section className="mt-8">
          {renderAccordionHeader("today", "Citas de hoy")}
          {openSections.today && (
            <div className="mt-4 space-y-4">

          {isLoading ? (
            <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
              Cargando citas...
            </p>
          ) : todayAppointments.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
              No tienes citas para hoy.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {todayAppointments.map((appointment) => renderAppointment(appointment))}
            </div>
          )}
            </div>
          )}
        </section>

        <section className="mt-8 border-t border-white/10 pt-6">
          {renderAccordionHeader("future", "Próximas citas")}
          {openSections.future && (
            <div className="mt-4 space-y-4">

          {isLoading ? (
            <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
              Cargando citas...
            </p>
          ) : futureAppointments.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
              No hay próximas citas reservadas.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {futureAppointments.map((appointment) =>
                renderAppointment(appointment)
              )}
            </div>
          )}
            </div>
          )}
        </section>

        <section className="mt-8 border-t border-white/10 pt-6">
          {renderAccordionHeader("reminders", "Recordatorios de mañana")}
          {openSections.reminders && (
            <div className="mt-4 space-y-4">
              {isLoading ? (
                <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
                  Cargando recordatorios...
                </p>
              ) : tomorrowAppointments.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
                  No hay recordatorios pendientes para mañana.
                </p>
              ) : (
                <div className="space-y-3">
                  {tomorrowAppointments.map((appointment) => (
                    <article
                      className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                      key={appointment.id}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-2xl font-bold text-barber-gold">
                            {formatAppointmentTime(appointment.appointment_time)}
                          </p>
                          <p className="mt-3 text-base font-semibold text-white">
                            {appointment.customer_name}
                          </p>
                          <div className="mt-3 space-y-2 text-sm leading-6 text-white/70">
                            <p>
                              <span className="font-semibold text-white">Servicio:</span>{" "}
                              {appointment.service}
                            </p>
                            <p>
                              <span className="font-semibold text-white">Teléfono:</span>{" "}
                              {appointment.customer_phone}
                            </p>
                            <p>
                              <span className="font-semibold text-white">Recordatorio:</span>{" "}
                              {reminderStatusLabels[
                                appointment.reminder_status || "pending"
                              ] || "Pendiente"}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:min-w-32">
                          <a
                            className="rounded-full border border-green-400/40 px-3 py-2 text-center text-xs font-semibold text-green-200 transition hover:bg-green-400/10 active:scale-[0.98]"
                            href={createReminderWhatsAppLink(appointment)}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Enviar WhatsApp
                          </a>
                          <button
                            className="rounded-full border border-barber-gold/50 px-3 py-2 text-xs font-semibold text-barber-gold transition hover:bg-barber-gold/10 active:scale-[0.98]"
                            onClick={() => markReminderAsSent(appointment.id)}
                            type="button"
                          >
                            Marcar como enviado
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
        <section className="mt-8 border-t border-white/10 pt-6">
          {renderAccordionHeader("settings", "Configuración del negocio")}
          {openSections.settings && (
            <div className="mt-4 space-y-4">
              {settingsMessage && (
                <p
                  className={
                    settingsMessageType === "success"
                      ? "rounded-2xl border border-barber-gold/30 bg-barber-gold/10 p-4 text-sm font-semibold text-barber-gold"
                      : "rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold text-red-100"
                  }
                >
                  {settingsMessage}
                </p>
              )}

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="grid grid-cols-1 gap-4">
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-white/60">
                      Nombre de la barbería
                    </span>
                    <input
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                      onChange={(event) =>
                        updateBusinessSetting("business_name", event.target.value)
                      }
                      type="text"
                      value={businessForm.business_name}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-white/60">
                      Frase principal
                    </span>
                    <input
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                      onChange={(event) =>
                        updateBusinessSetting("slogan", event.target.value)
                      }
                      type="text"
                      value={businessForm.slogan}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-white/60">
                      Teléfono de WhatsApp
                    </span>
                    <input
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                      onChange={(event) =>
                        updateBusinessSetting("whatsapp_phone", event.target.value)
                      }
                      type="tel"
                      value={businessForm.whatsapp_phone}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-white/60">
                      Mensaje de WhatsApp
                    </span>
                    <textarea
                      className="min-h-24 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                      onChange={(event) =>
                        updateBusinessSetting("whatsapp_message", event.target.value)
                      }
                      value={businessForm.whatsapp_message}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-white/60">
                      URL de Instagram
                    </span>
                    <input
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                      onChange={(event) =>
                        updateBusinessSetting("instagram_url", event.target.value)
                      }
                      type="url"
                      value={businessForm.instagram_url}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-white/60">
                      Dirección
                    </span>
                    <input
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                      onChange={(event) =>
                        updateBusinessSetting("address", event.target.value)
                      }
                      type="text"
                      value={businessForm.address}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-white/60">
                      Texto del botón principal
                    </span>
                    <input
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                      onChange={(event) =>
                        updateBusinessSetting("main_button_text", event.target.value)
                      }
                      type="text"
                      value={businessForm.main_button_text}
                    />
                  </label>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <h3 className="text-lg font-bold text-white">
                      Configuración de reservas
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-white/60">
                      Define con cuánta antelación pueden reservar tus clientes.
                    </p>

                    <div className="mt-4 space-y-4">
                      <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                        <input
                          checked={businessForm.booking_limit_enabled}
                          className="mt-1 h-4 w-4 accent-barber-gold"
                          onChange={(event) =>
                            updateBusinessSetting(
                              "booking_limit_enabled",
                              event.target.checked
                            )
                          }
                          type="checkbox"
                        />
                        <span>
                          <span className="block text-sm font-bold text-white">
                            Activar límite de antelación
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-white/55">
                            Limita hasta qué fecha se puede reservar.
                          </span>
                        </span>
                      </label>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-2 block text-xs font-semibold text-white/60">
                            Número de antelación
                          </span>
                          <input
                            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                            min="1"
                            onChange={(event) =>
                              updateBusinessSetting(
                                "booking_limit_value",
                                Number(event.target.value)
                              )
                            }
                            type="number"
                            value={businessForm.booking_limit_value}
                          />
                        </label>

                        <label className="block">
                          <span className="mb-2 block text-xs font-semibold text-white/60">
                            Unidad
                          </span>
                          <select
                            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-barber-gold"
                            onChange={(event) =>
                              updateBusinessSetting(
                                "booking_limit_mode",
                                normalizeBookingLimitMode(event.target.value)
                              )
                            }
                            value={businessForm.booking_limit_mode}
                          >
                            <option className="bg-barber-gray" value="days">
                              días
                            </option>
                            <option className="bg-barber-gray" value="weeks">
                              semanas
                            </option>
                            <option className="bg-barber-gray" value="months">
                              meses
                            </option>
                          </select>
                        </label>
                      </div>

                      <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                        <input
                          checked={businessForm.weekly_release_enabled}
                          className="mt-1 h-4 w-4 accent-barber-gold"
                          onChange={(event) =>
                            updateBusinessSetting(
                              "weekly_release_enabled",
                              event.target.checked
                            )
                          }
                          type="checkbox"
                        />
                        <span>
                          <span className="block text-sm font-bold text-white">
                            Activar apertura semanal de agenda
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-white/55">
                            La agenda se abre por bloques semanales.
                          </span>
                        </span>
                      </label>

                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-2 block text-xs font-semibold text-white/60">
                            Día de apertura semanal
                          </span>
                          <select
                            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-barber-gold"
                            onChange={(event) =>
                              updateBusinessSetting(
                                "weekly_release_day",
                                Number(event.target.value)
                              )
                            }
                            value={businessForm.weekly_release_day}
                          >
                            <option className="bg-barber-gray" value={0}>
                              Domingo
                            </option>
                            <option className="bg-barber-gray" value={1}>
                              Lunes
                            </option>
                            <option className="bg-barber-gray" value={2}>
                              Martes
                            </option>
                            <option className="bg-barber-gray" value={3}>
                              Miércoles
                            </option>
                            <option className="bg-barber-gray" value={4}>
                              Jueves
                            </option>
                            <option className="bg-barber-gray" value={5}>
                              Viernes
                            </option>
                            <option className="bg-barber-gray" value={6}>
                              Sábado
                            </option>
                          </select>
                        </label>

                        <label className="block">
                          <span className="mb-2 block text-xs font-semibold text-white/60">
                            Días que se abren
                          </span>
                          <input
                            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                            min="1"
                            onChange={(event) =>
                              updateBusinessSetting(
                                "weekly_release_window_days",
                                Number(event.target.value)
                              )
                            }
                            type="number"
                            value={businessForm.weekly_release_window_days}
                          />
                        </label>
                      </div>

                      <p className="rounded-2xl border border-barber-gold/30 bg-barber-gold/10 p-3 text-xs font-semibold leading-5 text-barber-gold">
                        Ejemplo: si activas apertura semanal, eliges lunes y 7
                        días, la agenda se abre cada lunes para esa semana.
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  className="mt-4 w-full rounded-2xl bg-barber-gold px-5 py-3 text-sm font-bold text-black shadow-lg shadow-barber-gold/20 transition hover:bg-[#e7b65f] active:scale-[0.98]"
                  onClick={() => saveBusinessSettings()}
                  type="button"
                >
                  Guardar configuración
                </button>
              </div>
            </div>
          )}
        </section>
        <section className="mt-8 border-t border-white/10 pt-6">
          {renderAccordionHeader("services", "Servicios y precios")}
          {openSections.services && (
            <div className="mt-4 space-y-4">

          <p className="mt-2 text-sm leading-6 text-white/65">
            Gestiona los servicios que verán los clientes al reservar.
          </p>

          {serviceMessage && (
            <p className="mt-4 rounded-2xl border border-barber-gold/30 bg-barber-gold/10 p-4 text-sm font-semibold text-barber-gold">
              {serviceMessage}
            </p>
          )}

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <h3 className="text-lg font-bold text-white">Añadir servicio</h3>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-white/60">
                  Nombre
                </span>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                  onChange={(event) =>
                    setNewService({ ...newService, name: event.target.value })
                  }
                  placeholder="Corte degradado"
                  type="text"
                  value={newService.name}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-white/60">
                  Precio
                </span>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                  min="0"
                  onChange={(event) =>
                    setNewService({ ...newService, price: event.target.value })
                  }
                  placeholder="12"
                  step="0.01"
                  type="number"
                  value={newService.price}
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-2 block text-xs font-semibold text-white/60">
                  Duración en minutos
                </span>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                  min="5"
                  onChange={(event) =>
                    setNewService({
                      ...newService,
                      duration_minutes: event.target.value
                    })
                  }
                  type="number"
                  value={newService.duration_minutes}
                />
              </label>
            </div>

            <button
              className="mt-4 w-full rounded-2xl bg-barber-gold px-5 py-3 text-sm font-bold text-black shadow-lg shadow-barber-gold/20 transition hover:bg-[#e7b65f] active:scale-[0.98]"
              onClick={addService}
              type="button"
            >
              Añadir servicio
            </button>
          </div>

          {isLoadingServices ? (
            <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
              Cargando servicios...
            </p>
          ) : services.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
              Todavía no hay servicios creados.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {services.map((service) => (
                <article
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                  key={service.id}
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold text-white/60">
                        Nombre
                      </span>
                      <input
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-barber-gold"
                        onChange={(event) =>
                          updateService(service.id, "name", event.target.value)
                        }
                        type="text"
                        value={service.name}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold text-white/60">
                        Precio
                      </span>
                      <input
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-barber-gold"
                        min="0"
                        onChange={(event) =>
                          updateService(service.id, "price", Number(event.target.value))
                        }
                        step="0.01"
                        type="number"
                        value={service.price}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold text-white/60">
                        Duración en minutos
                      </span>
                      <input
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-barber-gold"
                        min="5"
                        onChange={(event) =>
                          updateService(
                            service.id,
                            "duration_minutes",
                            Number(event.target.value)
                          )
                        }
                        type="number"
                        value={service.duration_minutes}
                      />
                    </label>

                    <label className="flex items-center gap-2 text-sm font-semibold text-white/75 sm:pt-8">
                      <input
                        checked={service.is_active}
                        className="h-4 w-4 accent-[#d8a24a]"
                        onChange={(event) =>
                          updateService(service.id, "is_active", event.target.checked)
                        }
                        type="checkbox"
                      />
                      {service.is_active ? "Activo" : "Inactivo"}
                    </label>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      className="rounded-2xl bg-barber-gold px-4 py-3 text-xs font-bold text-black shadow-lg shadow-barber-gold/20 transition hover:bg-[#e7b65f] active:scale-[0.98]"
                      onClick={() => saveService(service)}
                      type="button"
                    >
                      Guardar
                    </button>
                    <button
                      className="rounded-2xl border border-red-400/40 px-4 py-3 text-xs font-semibold text-red-200 transition hover:bg-red-400/10 active:scale-[0.98]"
                      onClick={() => deleteService(service.id)}
                      type="button"
                    >
                      Eliminar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
            </div>
          )}
        </section>


        {errorMessage && (
          <p className="mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold text-red-100">
            {errorMessage}
          </p>
        )}

        <section className="mt-8 border-t border-white/10 pt-6">
          {renderAccordionHeader("blocks", "Bloquear horario")}
          {openSections.blocks && (
            <div className="mt-4 space-y-4">

          <p className="mt-2 text-sm leading-6 text-white/65">
            Bloquea días completos o tramos concretos para que no aparezcan al reservar.
          </p>

          {blockMessage && (
            <p className="mt-4 rounded-2xl border border-barber-gold/30 bg-barber-gold/10 p-4 text-sm font-semibold text-barber-gold">
              {blockMessage}
            </p>
          )}

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="mx-auto w-[240px] max-w-full justify-self-center sm:w-full">
                <label className="mb-2 block text-xs font-semibold text-white/60" htmlFor="block-date">
                  Fecha
                </label>
                <input
                  className="box-border w-full min-w-0 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-barber-gold"
                  onChange={(event) =>
                    setNewBlockedTime({
                      ...newBlockedTime,
                      block_date: event.target.value
                    })
                  }
                  id="block-date"
                  type="date"
                  value={newBlockedTime.block_date}
                />
              </div>

              <label className="flex items-center gap-2 text-sm font-semibold text-white/75 sm:pt-8">
                <input
                  checked={newBlockedTime.is_full_day}
                  className="h-4 w-4 accent-[#d8a24a]"
                  onChange={(event) =>
                    setNewBlockedTime({
                      ...newBlockedTime,
                      is_full_day: event.target.checked
                    })
                  }
                  type="checkbox"
                />
                Bloquear día completo
              </label>

              {!newBlockedTime.is_full_day && (
                <>
                  <div className="mx-auto w-[240px] max-w-full justify-self-center sm:w-full">
                    <label className="mb-2 block text-xs font-semibold text-white/60" htmlFor="block-start-time">
                      Hora inicio
                    </label>
                    <input
                      className="box-border w-full min-w-0 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-barber-gold"
                      onChange={(event) =>
                        setNewBlockedTime({
                          ...newBlockedTime,
                          start_time: event.target.value
                        })
                      }
                      id="block-start-time"
                      type="time"
                      value={newBlockedTime.start_time}
                    />
                  </div>

                  <div className="mx-auto w-[240px] max-w-full justify-self-center sm:w-full">
                    <label className="mb-2 block text-xs font-semibold text-white/60" htmlFor="block-end-time">
                      Hora fin
                    </label>
                    <input
                      className="box-border w-full min-w-0 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-barber-gold"
                      onChange={(event) =>
                        setNewBlockedTime({
                          ...newBlockedTime,
                          end_time: event.target.value
                        })
                      }
                      id="block-end-time"
                      type="time"
                      value={newBlockedTime.end_time}
                    />
                  </div>
                </>
              )}

              <div className="mx-auto w-[240px] max-w-full justify-self-center sm:col-span-2 sm:w-full">
                <label className="mb-2 block text-xs font-semibold text-white/60" htmlFor="block-reason">
                  Motivo opcional
                </label>
                <input
                  className="box-border w-full min-w-0 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                  onChange={(event) =>
                    setNewBlockedTime({
                      ...newBlockedTime,
                      reason: event.target.value
                    })
                  }
                  placeholder="Médico, vacaciones, asunto personal..."
                  id="block-reason"
                  type="text"
                  value={newBlockedTime.reason}
                />
              </div>
            </div>

            <button
              className="mx-auto mt-4 block w-[240px] max-w-full rounded-2xl bg-barber-gold px-5 py-3 text-sm font-bold text-black shadow-lg shadow-barber-gold/20 transition hover:bg-[#e7b65f] active:scale-[0.98] sm:w-full"
              onClick={addBlockedTime}
              type="button"
            >
              Añadir bloqueo
            </button>
          </div>

          {isLoadingBlockedTimes ? (
            <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
              Cargando bloqueos...
            </p>
          ) : blockedTimes.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
              Todavía no hay bloqueos creados.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {blockedTimes.map((blockedTime) => (
                <article
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                  key={blockedTime.id}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="text-sm leading-6 text-white/70">
                      <p className="text-base font-bold text-white">
                        {blockedTime.block_date}
                      </p>
                      <p>
                        {blockedTime.is_full_day
                          ? "Día completo"
                          : `${formatAppointmentTime(blockedTime.start_time ?? "")} - ${formatAppointmentTime(blockedTime.end_time ?? "")}`}
                      </p>
                      {blockedTime.reason && <p>Motivo: {blockedTime.reason}</p>}
                    </div>

                    <button
                      className="rounded-full border border-red-400/40 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-400/10 active:scale-[0.98]"
                      onClick={() => deleteBlockedTime(blockedTime.id)}
                      type="button"
                    >
                      Eliminar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
            </div>
          )}
        </section>
        <section className="mt-8 border-t border-white/10 pt-6">
          {renderAccordionHeader("schedule", "Horario de trabajo")}
          {openSections.schedule && (
            <div className="mt-4 space-y-4">


          {scheduleMessage && (
            <p className="mt-4 rounded-2xl border border-barber-gold/30 bg-barber-gold/10 p-4 text-sm font-semibold text-barber-gold">
              {scheduleMessage}
            </p>
          )}

          {isLoadingSchedule ? (
            <p className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
              Cargando horario...
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {workingHours.map((workingHour) => (
                <article
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                  key={workingHour.id}
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-lg font-bold text-white">
                      {workingHour.day_name}
                    </h3>
                    <label className="flex items-center gap-2 text-sm font-semibold text-white/75">
                      <input
                        checked={workingHour.is_working}
                        className="h-4 w-4 accent-[#d8a24a]"
                        onChange={(event) =>
                          updateWorkingHour(
                            workingHour.id,
                            "is_working",
                            event.target.checked
                          )
                        }
                        type="checkbox"
                      />
                      Trabaja
                    </label>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="mx-auto w-full max-w-[240px] sm:max-w-[280px] md:max-w-none">
                      <span className="mb-2 block text-xs font-semibold text-white/60">
                        Inicio mañana
                      </span>
                      <input
                        className="box-border min-h-12 w-full min-w-0 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-barber-gold"
                        onChange={(event) =>
                          updateWorkingHour(
                            workingHour.id,
                            "morning_start",
                            event.target.value
                          )
                        }
                        type="time"
                        value={formatAppointmentTime(workingHour.morning_start ?? "")}
                      />
                    </div>

                    <div className="mx-auto w-full max-w-[240px] sm:max-w-[280px] md:max-w-none">
                      <span className="mb-2 block text-xs font-semibold text-white/60">
                        Fin mañana
                      </span>
                      <input
                        className="box-border min-h-12 w-full min-w-0 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-barber-gold"
                        onChange={(event) =>
                          updateWorkingHour(
                            workingHour.id,
                            "morning_end",
                            event.target.value
                          )
                        }
                        type="time"
                        value={formatAppointmentTime(workingHour.morning_end ?? "")}
                      />
                    </div>

                    <div className="mx-auto w-full max-w-[240px] sm:max-w-[280px] md:max-w-none">
                      <span className="mb-2 block text-xs font-semibold text-white/60">
                        Inicio tarde
                      </span>
                      <input
                        className="box-border min-h-12 w-full min-w-0 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-barber-gold"
                        onChange={(event) =>
                          updateWorkingHour(
                            workingHour.id,
                            "afternoon_start",
                            event.target.value
                          )
                        }
                        type="time"
                        value={formatAppointmentTime(workingHour.afternoon_start ?? "")}
                      />
                    </div>

                    <div className="mx-auto w-full max-w-[240px] sm:max-w-[280px] md:max-w-none">
                      <span className="mb-2 block text-xs font-semibold text-white/60">
                        Fin tarde
                      </span>
                      <input
                        className="box-border min-h-12 w-full min-w-0 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-barber-gold"
                        onChange={(event) =>
                          updateWorkingHour(
                            workingHour.id,
                            "afternoon_end",
                            event.target.value
                          )
                        }
                        type="time"
                        value={formatAppointmentTime(workingHour.afternoon_end ?? "")}
                      />
                    </div>
                  </div>

                  <div className="mx-auto mt-4 w-full max-w-[240px] sm:max-w-[280px] md:max-w-none">
                    <span className="mb-2 block text-xs font-semibold text-white/60">
                      Intervalo entre huecos
                    </span>
                    <input
                      className="box-border min-h-12 w-full min-w-0 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-barber-gold"
                      min="5"
                      onChange={(event) =>
                        updateWorkingHour(
                          workingHour.id,
                          "slot_minutes",
                          Number(event.target.value)
                        )
                      }
                      type="number"
                      value={workingHour.slot_minutes}
                    />
                    <p className="mt-2 text-xs leading-5 text-white/45">
                      Ejemplo: 15 significa que los clientes podrán reservar a las 10:00, 10:15, 10:30...
                    </p>
                  </div>

                  <button
                    className="mx-auto mt-4 block w-full max-w-[240px] rounded-2xl bg-barber-gold px-5 py-3 text-sm font-bold text-black shadow-lg shadow-barber-gold/20 transition hover:bg-[#e7b65f] active:scale-[0.98] sm:max-w-[280px] md:max-w-none"
                    onClick={() => saveWorkingHour(workingHour)}
                    type="button"
                  >
                    Guardar horario
                  </button>
                </article>
              ))}
            </div>
          )}
            </div>
          )}
        </section>

      </section>
    </main>
  );
}


















