"use client";

import Link from "next/link";
import { useEffect, useState, type ChangeEvent } from "react";
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
  appointment_status: AppointmentStatus;
  status_updated_at: string | null;
  status: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  whatsapp_cancel_notified_at: string | null;
};

type AppointmentStatus = "pending" | "completed" | "cancelled" | "no_show";

type HistoryStatusFilter =
  | "all"
  | "completed"
  | "cancelled"
  | "no_show"
  | "old_pending";

type ExistingAppointment = {
  appointment_time: string;
  duration_minutes: number | null;
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

type BlockCancelledAppointment = {
  id: string;
  service: string;
  appointment_date: string;
  appointment_time: string;
  customer_name: string;
  customer_phone: string;
  duration_minutes: number;
  status: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  whatsapp_cancel_notified_at: string | null;
};

type PendingScheduleChange = {
  workingHour: WorkingHour;
  originalWorkingHour: WorkingHour;
  affectedAppointments: BlockCancelledAppointment[];
};

type ManualAppointmentForm = {
  customer_name: string;
  customer_phone: string;
  service_id: string;
  appointment_date: string;
  appointment_time: string;
};

type EditAppointmentForm = {
  id: string;
  customer_name: string;
  customer_phone: string;
  service_id: string;
  appointment_date: string;
  appointment_time: string;
  duration_minutes: number;
};

type Review = {
  id: string;
  business_id: string;
  customer_user_id: string | null;
  customer_name: string;
  customer_avatar_url: string | null;
  rating: number;
  comment: string;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
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
  block_cancellation_message: string;
  booking_limit_enabled: boolean;
  booking_limit_value: number;
  booking_limit_mode: "days" | "weeks" | "months";
  weekly_release_enabled: boolean;
  weekly_release_day: number;
  weekly_release_window_days: number;
};

type BusinessUserAssignment = {
  business_id: string;
  role: string | null;
};

type BusinessDetails = {
  id: string;
  name: string | null;
  slug: string | null;
  plan_status: string | null;
  public_booking_enabled: boolean | null;
  profile_image_url: string | null;
  cover_image_url: string | null;
};

type PanelSectionKey =
  | "dayAgenda"
  | "reviews"
  | "history"
  | "manual"
  | "reminders"
  | "settings"
  | "services"
  | "blocks"
  | "schedule";

const defaultBlockCancellationMessage =
  "Hola {nombre}, sentimos avisarte de que tu cita del día {fecha} a las {hora}, ha sido cancelada porque la barbería no estará disponible en ese horario.\nDisculpa las molestias.";

const defaultScheduleChangeCancellationMessage =
  "Hola {nombre}, sentimos avisarte de que tu cita del día {fecha} a las {hora} para {servicio} ha sido cancelada por un cambio en el horario de la barbería. Disculpa las molestias.";

const defaultBusinessSettings: BusinessSettings = {
  id: "",
  business_name: "Pablo's Barbershop",
  slogan: "Reserva tu corte en menos de 30 segundos",
  whatsapp_phone: "",
  whatsapp_message: "Hola, quiero reservar una cita.",
  instagram_url: "",
  address: "",
  main_button_text: "Reservar cita",
  block_cancellation_message: defaultBlockCancellationMessage,
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

const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  pending: "Pendiente",
  completed: "Realizada",
  cancelled: "Cancelada",
  no_show: "No asistió"
};

const appointmentStatusActions: Array<{
  status: AppointmentStatus;
  label: string;
}> = [
  { status: "completed", label: "Realizada" },
  { status: "cancelled", label: "Cancelada" },
  { status: "no_show", label: "No asistió" },
  { status: "pending", label: "Pendiente" }
];

function isAppointmentCancelled(appointment: {
  appointment_status?: string | null;
  status?: string | null;
}) {
  return (
    appointment.appointment_status === "cancelled" ||
    appointment.status === "cancelled"
  );
}

const initialManualAppointmentForm: ManualAppointmentForm = {
  customer_name: "",
  customer_phone: "",
  service_id: "",
  appointment_date: "",
  appointment_time: ""
};

const initialEditAppointmentForm: EditAppointmentForm = {
  id: "",
  customer_name: "",
  customer_phone: "",
  service_id: "",
  appointment_date: "",
  appointment_time: "",
  duration_minutes: 30
};

const mainBarber = "Pablo";

const fullMonths = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre"
];

const calendarWeekDays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function createWhatsAppLink(phone: string) {
  const cleanPhone = phone.replace(/\D/g, "");
  const phoneWithCountryCode = cleanPhone.startsWith("34")
    ? cleanPhone
    : `34${cleanPhone}`;

  return `https://wa.me/${phoneWithCountryCode}?text=${encodeURIComponent(
    whatsAppMessage
  )}`;
}

function normalizeWhatsAppPhone(phone: string) {
  const cleanPhone = phone.replace(/\D/g, "");

  if (cleanPhone.length === 9 && /^[67]/.test(cleanPhone)) {
    return `34${cleanPhone}`;
  }

  return cleanPhone;
}

function getBusinessInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "B";
}

function getProfileInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "C";
}

function createAppointmentWhatsAppLink(
  appointment: Appointment,
  businessName: string
) {
  const phone = normalizeWhatsAppPhone(appointment.customer_phone);
  const message = `Hola ${appointment.customer_name}, te recordamos tu cita en ${businessName} el día ${appointment.appointment_date} a las ${formatAppointmentTime(
    appointment.appointment_time
  )} para ${appointment.service}. ¡Gracias!`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function createHistoryWhatsAppLink(
  appointment: Appointment,
  businessName: string
) {
  const phone = normalizeWhatsAppPhone(appointment.customer_phone);
  const message = `Hola ${appointment.customer_name}, te escribimos desde ${businessName} sobre tu cita del día ${appointment.appointment_date} a las ${formatAppointmentTime(
    appointment.appointment_time
  )} para ${appointment.service}.`;

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function createBlockCancellationWhatsAppLink(
  appointment: BlockCancelledAppointment,
  messageTemplate: string | null | undefined,
  businessName: string
) {
  const phone = normalizeWhatsAppPhone(appointment.customer_phone);
  const template =
    messageTemplate?.trim() || defaultBlockCancellationMessage;
  const message = template
    .replaceAll("{nombre}", appointment.customer_name)
    .replaceAll("{fecha}", formatReadableAppointmentDate(appointment.appointment_date))
    .replaceAll("{hora}", formatAppointmentTime(appointment.appointment_time))
    .replaceAll("{servicio}", appointment.service)
    .replaceAll("{barberia}", businessName);

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function createScheduleChangeCancellationWhatsAppLink(
  appointment: BlockCancelledAppointment,
  messageTemplate: string,
  businessName: string
) {
  const phone = normalizeWhatsAppPhone(appointment.customer_phone);
  const template =
    messageTemplate.trim() || defaultScheduleChangeCancellationMessage;
  const message = template
    .replaceAll("{nombre}", appointment.customer_name)
    .replaceAll("{fecha}", appointment.appointment_date)
    .replaceAll("{hora}", formatAppointmentTime(appointment.appointment_time))
    .replaceAll("{servicio}", appointment.service)
    .replaceAll("{barberia}", businessName);

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function formatAppointmentTime(time: string) {
  return time.slice(0, 5);
}

function formatReadableAppointmentDate(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateValue;
  }

  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function formatReviewDate(dateValue: string) {
  return new Date(dateValue).toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function renderStars(rating: number) {
  const safeRating = Math.min(5, Math.max(1, Math.round(rating)));

  return "★".repeat(safeRating) + "☆".repeat(5 - safeRating);
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

function normalizeAppointmentStatus(
  status: string | null | undefined
): AppointmentStatus {
  if (
    status === "completed" ||
    status === "cancelled" ||
    status === "no_show"
  ) {
    return status;
  }

  return "pending";
}

function timeToMinutes(time: string) {
  const [hours, minutes] = formatAppointmentTime(time).split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function generateSlots(start: string | null, end: string | null, slotMinutes: number) {
  if (!start || !end || slotMinutes <= 0) {
    return [];
  }

  const slots: string[] = [];
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);

  for (let minutes = startMinutes; minutes < endMinutes; minutes += slotMinutes) {
    slots.push(minutesToTime(minutes));
  }

  return slots;
}

function getAvailableHours(workingHour?: WorkingHour) {
  if (!workingHour || !workingHour.is_working) {
    return [];
  }

  const slotMinutes = Number(workingHour.slot_minutes) || 30;

  return [
    ...generateSlots(workingHour.morning_start, workingHour.morning_end, slotMinutes),
    ...generateSlots(
      workingHour.afternoon_start,
      workingHour.afternoon_end,
      slotMinutes
    )
  ];
}

function getWorkingHoursForDate(date: Date, workingHours: WorkingHour[]) {
  const dayOfWeek = date.getDay();

  return workingHours.find(
    (workingHour) => Number(workingHour.day_of_week) === dayOfWeek
  );
}

function getCurrentTimeInfo() {
  const now = new Date();

  return {
    today: formatDateForSupabase(now),
    minutes: now.getHours() * 60 + now.getMinutes()
  };
}

function isPastHourForToday(
  day: string,
  hour: string,
  today: string,
  currentMinutes: number
) {
  if (day !== today || hour === "") {
    return false;
  }

  return timeToMinutes(hour) <= currentMinutes;
}

function getPastHours(
  hours: string[],
  day: string,
  today: string,
  currentMinutes: number
) {
  if (day !== today) {
    return [];
  }

  return hours.filter((hour) => timeToMinutes(hour) <= currentMinutes);
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getAgendaCalendarDays(calendarMonth: Date, selectedDate: string) {
  const today = formatDateForSupabase(new Date());
  const firstDayOfMonth = new Date(
    calendarMonth.getFullYear(),
    calendarMonth.getMonth(),
    1
  );
  const firstCalendarDay = new Date(firstDayOfMonth);
  const mondayOffset = (firstDayOfMonth.getDay() + 6) % 7;
  firstCalendarDay.setDate(firstDayOfMonth.getDate() - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCalendarDay);
    date.setDate(firstCalendarDay.getDate() + index);
    const value = formatDateForSupabase(date);

    return {
      value,
      label: String(date.getDate()),
      isCurrentMonth: date.getMonth() === calendarMonth.getMonth(),
      isSelected: value === selectedDate,
      isToday: value === today
    };
  });
}

function rangesOverlap(
  startTime: string,
  durationMinutes: number,
  blockedStart: string,
  blockedEnd: string
) {
  const newStart = timeToMinutes(startTime);
  const newEnd = newStart + durationMinutes;
  const existingStart = timeToMinutes(blockedStart);
  const existingEnd = timeToMinutes(blockedEnd);

  return newStart < existingEnd && newEnd > existingStart;
}

function appointmentOverlaps(
  startTime: string,
  durationMinutes: number,
  existingAppointments: ExistingAppointment[]
) {
  return existingAppointments.some((appointment) =>
    rangesOverlap(
      startTime,
      durationMinutes,
      appointment.appointment_time,
      minutesToTime(
        timeToMinutes(appointment.appointment_time) +
          (appointment.duration_minutes || 30)
      )
    )
  );
}

function blockOverlaps(
  startTime: string,
  durationMinutes: number,
  blockedTimes: BlockedTime[]
) {
  return blockedTimes.some((blockedTime) => {
    if (blockedTime.is_full_day) {
      return true;
    }

    if (!blockedTime.start_time || !blockedTime.end_time) {
      return false;
    }

    return rangesOverlap(
      startTime,
      durationMinutes,
      blockedTime.start_time,
      blockedTime.end_time
    );
  });
}

function appointmentFitsInsideRange(
  appointmentStart: number,
  appointmentEnd: number,
  rangeStart: string | null,
  rangeEnd: string | null
) {
  if (!rangeStart || !rangeEnd) {
    return false;
  }

  return (
    appointmentStart >= timeToMinutes(rangeStart) &&
    appointmentEnd <= timeToMinutes(rangeEnd)
  );
}

function appointmentFitsInsideWorkingHour(
  appointment: BlockCancelledAppointment,
  workingHour: WorkingHour
) {
  if (!workingHour.is_working) {
    return false;
  }

  const appointmentStart = timeToMinutes(appointment.appointment_time);
  const appointmentEnd =
    appointmentStart + (Number(appointment.duration_minutes) || 30);

  return (
    appointmentFitsInsideRange(
      appointmentStart,
      appointmentEnd,
      workingHour.morning_start,
      workingHour.morning_end
    ) ||
    appointmentFitsInsideRange(
      appointmentStart,
      appointmentEnd,
      workingHour.afternoon_start,
      workingHour.afternoon_end
    )
  );
}

function workingHourHasChanged(
  previousWorkingHour: WorkingHour,
  nextWorkingHour: WorkingHour
) {
  return (
    previousWorkingHour.is_working !== nextWorkingHour.is_working ||
    formatAppointmentTime(previousWorkingHour.morning_start ?? "") !==
      formatAppointmentTime(nextWorkingHour.morning_start ?? "") ||
    formatAppointmentTime(previousWorkingHour.morning_end ?? "") !==
      formatAppointmentTime(nextWorkingHour.morning_end ?? "") ||
    formatAppointmentTime(previousWorkingHour.afternoon_start ?? "") !==
      formatAppointmentTime(nextWorkingHour.afternoon_start ?? "") ||
    formatAppointmentTime(previousWorkingHour.afternoon_end ?? "") !==
      formatAppointmentTime(nextWorkingHour.afternoon_end ?? "") ||
    Number(previousWorkingHour.slot_minutes) !== Number(nextWorkingHour.slot_minutes)
  );
}

export default function BarberPanel() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [historyAppointments, setHistoryAppointments] = useState<Appointment[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [pendingCancellationNotifications, setPendingCancellationNotifications] =
    useState<BlockCancelledAppointment[]>([]);
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
  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);
  const [panelAccessDenied, setPanelAccessDenied] = useState(false);
  const [panelBusinessMissing, setPanelBusinessMissing] = useState(false);
  const [currentBusinessId, setCurrentBusinessId] = useState<string | null>(null);
  const [currentBusinessName, setCurrentBusinessName] = useState("");
  const [currentBusinessSlug, setCurrentBusinessSlug] = useState("");
  const [currentBusinessProfileImageUrl, setCurrentBusinessProfileImageUrl] =
    useState("");
  const [currentBusinessPlanStatus, setCurrentBusinessPlanStatus] = useState<
    string | null
  >(null);
  const [currentBusinessPublicBookingEnabled, setCurrentBusinessPublicBookingEnabled] =
    useState<boolean | null>(null);
  const [publicBookingLinkMessage, setPublicBookingLinkMessage] = useState("");
  const [businessImageFile, setBusinessImageFile] = useState<File | null>(null);
  const [businessImageMessage, setBusinessImageMessage] = useState("");
  const [businessImageMessageType, setBusinessImageMessageType] = useState<
    "success" | "error"
  >("success");
  const [isUploadingBusinessImage, setIsUploadingBusinessImage] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isLoadingReviews, setIsLoadingReviews] = useState(true);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [isLoadingBlockedTimes, setIsLoadingBlockedTimes] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [hasCustomBlockCancellationMessage, setHasCustomBlockCancellationMessage] =
    useState(false);
  const [historyMessage, setHistoryMessage] = useState("");
  const [historyMessageType, setHistoryMessageType] = useState<"success" | "error">(
    "success"
  );
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewMessageType, setReviewMessageType] = useState<"success" | "error">(
    "success"
  );
  const [historyStatusFilter, setHistoryStatusFilter] =
    useState<HistoryStatusFilter>("all");
  const [historyDateFrom, setHistoryDateFrom] = useState("");
  const [historyDateTo, setHistoryDateTo] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [scheduleMessage, setScheduleMessage] = useState("");
  const [pendingScheduleChange, setPendingScheduleChange] =
    useState<PendingScheduleChange | null>(null);
  const [scheduleCancelledAppointments, setScheduleCancelledAppointments] =
    useState<BlockCancelledAppointment[]>([]);
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
  const [blockCancelledAppointments, setBlockCancelledAppointments] = useState<
    BlockCancelledAppointment[]
  >([]);
  const [manualAppointment, setManualAppointment] =
    useState<ManualAppointmentForm>(initialManualAppointmentForm);
  const [manualAvailableHours, setManualAvailableHours] = useState<string[]>([]);
  const [isLoadingManualHours, setIsLoadingManualHours] = useState(false);
  const [manualMessage, setManualMessage] = useState("");
  const [manualMessageType, setManualMessageType] = useState<"success" | "error">(
    "success"
  );
  const [agendaDate, setAgendaDate] = useState(() =>
    formatDateForSupabase(new Date())
  );
  const [agendaCalendarMonth, setAgendaCalendarMonth] = useState(() => {
    const today = new Date();

    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [agendaMessage, setAgendaMessage] = useState("");
  const [agendaMessageType, setAgendaMessageType] = useState<"success" | "error">(
    "success"
  );
  const [editingAppointment, setEditingAppointment] =
    useState<EditAppointmentForm | null>(null);
  const [editAvailableHours, setEditAvailableHours] = useState<string[]>([]);
  const [isLoadingEditHours, setIsLoadingEditHours] = useState(false);
  const [openSections, setOpenSections] = useState<Record<PanelSectionKey, boolean>>({
    dayAgenda: true,
    reviews: false,
    history: false,
    manual: true,
    reminders: false,
    settings: false,
    services: false,
    blocks: false,
    schedule: false
  });

  const publicBookingUrl = currentBusinessSlug
    ? `${
        typeof window !== "undefined"
          ? window.location.origin
          : "https://barberflow-citas.vercel.app"
      }/barberia/${currentBusinessSlug}`
    : "";
  const isPublicBookingVisible =
    currentBusinessPublicBookingEnabled === true &&
    (currentBusinessPlanStatus === "demo" || currentBusinessPlanStatus === "active");

  const todayDate = new Date();
  const tomorrowDate = new Date(todayDate);
  tomorrowDate.setDate(todayDate.getDate() + 1);

  const today = formatDateForSupabase(todayDate);
  const tomorrow = formatDateForSupabase(tomorrowDate);
  const tomorrowAppointments = appointments.filter(
    (appointment) =>
      appointment.appointment_date === tomorrow &&
      !isAppointmentCancelled(appointment)
  );
  const agendaCalendarDays = getAgendaCalendarDays(
    agendaCalendarMonth,
    agendaDate
  );
  const agendaCalendarTitle = `${
    fullMonths[agendaCalendarMonth.getMonth()]
  } ${agendaCalendarMonth.getFullYear()}`;
  const agendaSelectedDate = new Date(`${agendaDate}T00:00:00`);
  const agendaWorkingHour = getWorkingHoursForDate(
    agendaSelectedDate,
    workingHours
  );
  const agendaSlotMinutes = Number(agendaWorkingHour?.slot_minutes) || 30;
  const agendaSlots = getAvailableHours(agendaWorkingHour);
  const activeAppointments = appointments.filter(
    (appointment) => !isAppointmentCancelled(appointment)
  );
  const agendaAppointments = activeAppointments.filter(
    (appointment) => appointment.appointment_date === agendaDate
  );
  const agendaBlockedTimes = blockedTimes.filter(
    (blockedTime) => blockedTime.block_date === agendaDate
  );
  const isAgendaFullDayBlocked = agendaBlockedTimes.some(
    (blockedTime) => blockedTime.is_full_day
  );
  const isAgendaClosed = !agendaWorkingHour || !agendaWorkingHour.is_working;
  const historyBaseAppointments = historyAppointments.filter(
    (appointment) =>
      appointment.appointment_status === "completed" ||
      appointment.appointment_status === "cancelled" ||
      appointment.appointment_status === "no_show" ||
      (appointment.appointment_status === "pending" &&
        appointment.appointment_date < today)
  );
  const filteredHistoryAppointments = historyBaseAppointments.filter(
    (appointment) => {
      const matchesStatus =
        historyStatusFilter === "all" ||
        appointment.appointment_status === historyStatusFilter ||
        (historyStatusFilter === "old_pending" &&
          appointment.appointment_status === "pending" &&
          appointment.appointment_date < today);
      const matchesDateFrom =
        historyDateFrom === "" || appointment.appointment_date >= historyDateFrom;
      const matchesDateTo =
        historyDateTo === "" || appointment.appointment_date <= historyDateTo;
      const search = historySearch.trim().toLowerCase();
      const matchesSearch =
        search === "" ||
        appointment.customer_name.toLowerCase().includes(search) ||
        appointment.customer_phone.toLowerCase().includes(search);

      return matchesStatus && matchesDateFrom && matchesDateTo && matchesSearch;
    }
  );
  const visiblePendingCancellationNotifications =
    pendingCancellationNotifications.filter(
      (appointment) =>
        !blockCancelledAppointments.some(
          (cancelledAppointment) => cancelledAppointment.id === appointment.id
        )
    );

  useEffect(() => {
    checkSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        verifyAdminAccess();
      } else {
        clearPanelData();
        setIsCheckingAdmin(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    refreshManualAvailableHours();
  }, [
    isAuthenticated,
    manualAppointment.service_id,
    manualAppointment.appointment_date,
    services,
    workingHours
  ]);

  useEffect(() => {
    if (!editingAppointment) {
      return;
    }

    refreshEditAvailableHours(editingAppointment);
  }, [
    editingAppointment?.id,
    editingAppointment?.service_id,
    editingAppointment?.appointment_date,
    services,
    workingHours,
    appointments,
    blockedTimes
  ]);

  async function checkSession() {
    const { data } = await supabase.auth.getSession();

    if (data.session) {
      await verifyAdminAccess();
      return;
    }

    clearPanelData();
    setIsCheckingAdmin(false);
  }

  async function loadPanelData(businessId: string) {
    await cleanupExpiredBlockedTimes(businessId);
    loadAppointments(businessId);
    loadAppointmentHistory(businessId);
    loadReviews(businessId);
    loadPendingCancellationNotifications(businessId);
    loadBusinessSettings(true, businessId);
    loadWorkingHours(businessId);
    loadServices(businessId);
    loadBlockedTimes(businessId);
  }

  function clearPanelData(keepAccessDenied = false) {
    setIsAuthenticated(false);
    setCurrentBusinessId(null);
    setCurrentBusinessName("");
    setCurrentBusinessSlug("");
    setCurrentBusinessProfileImageUrl("");
    setCurrentBusinessPlanStatus(null);
    setCurrentBusinessPublicBookingEnabled(null);
    setPublicBookingLinkMessage("");
    setBusinessImageFile(null);
    setBusinessImageMessage("");
    setBusinessImageMessageType("success");
    setIsUploadingBusinessImage(false);
    setAppointments([]);
    setHistoryAppointments([]);
    setReviews([]);
    setPendingCancellationNotifications([]);
    setWorkingHours([]);
    setServices([]);
    setBlockedTimes([]);
    setBusinessSettings(defaultBusinessSettings);
    setBusinessForm(defaultBusinessSettings);
    setManualAppointment(initialManualAppointmentForm);
    setManualAvailableHours([]);
    setIsLoadingManualHours(false);
    setIsLoadingHistory(false);
    setIsLoadingReviews(false);
    setHistoryMessage("");
    setHistoryMessageType("success");
    setReviewMessage("");
    setReviewMessageType("success");
    setHasCustomBlockCancellationMessage(false);
    setHistoryStatusFilter("all");
    setHistoryDateFrom("");
    setHistoryDateTo("");
    setHistorySearch("");
    setAgendaMessage("");
    setAgendaMessageType("success");
    setPendingScheduleChange(null);
    setScheduleCancelledAppointments([]);
    setEditingAppointment(null);
    setEditAvailableHours([]);
    setIsLoadingEditHours(false);
    setIsLoading(false);
    setIsLoadingSchedule(false);
    setIsLoadingServices(false);
    setIsLoadingBlockedTimes(false);
    setServiceMessage("");
    setBlockMessage("");
    setBlockCancelledAppointments([]);
    setManualMessage("");
    setManualMessageType("success");
    setSettingsMessage("");
    setSettingsMessageType("success");
    if (!keepAccessDenied) {
      setPanelAccessDenied(false);
    }
    setPanelBusinessMissing(false);
  }

  async function verifyAdminAccess() {
    setIsCheckingAdmin(true);
    setPanelAccessDenied(false);
    setPanelBusinessMissing(false);

    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
      clearPanelData(true);
      setPanelAccessDenied(true);
      setIsCheckingAdmin(false);
      return;
    }

    if (process.env.NODE_ENV === "development") {
      console.log("Panel user:", {
        userId: user.id,
        email: user.email
      });
    }

    const assignedBusiness = await loadAssignedBusiness(user.id, user.email ?? "");

    if (!assignedBusiness) {
      const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");

      if (adminError) {
        console.error("Error checking admin permissions:", adminError);
      }

      clearPanelData(isAdmin !== true);

      if (isAdmin === true) {
        setPanelBusinessMissing(true);
      } else {
        setPanelAccessDenied(true);
      }

      setIsCheckingAdmin(false);
      return;
    }

    setCurrentBusinessId(assignedBusiness.businessId);
    setCurrentBusinessName(assignedBusiness.businessName);
    setCurrentBusinessSlug(assignedBusiness.businessSlug);
    setCurrentBusinessProfileImageUrl(assignedBusiness.profileImageUrl);
    setCurrentBusinessPlanStatus(assignedBusiness.planStatus);
    setCurrentBusinessPublicBookingEnabled(
      assignedBusiness.publicBookingEnabled
    );
    if (process.env.NODE_ENV === "development") {
      console.log("Panel business loaded:", {
        currentBusinessId: assignedBusiness.businessId,
        businessName: assignedBusiness.businessName,
        businessSlug: assignedBusiness.businessSlug
      });
    }
    setIsAuthenticated(true);
    setPanelAccessDenied(false);
    setIsCheckingAdmin(false);
    await loadPanelData(assignedBusiness.businessId);
  }

  async function loadAssignedBusiness(userId: string, userEmail: string) {
    const selectQuery = "business_id, role";
    let result = await supabase
      .from("business_users")
      .select(selectQuery)
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    if (!result.data && userEmail) {
      result = await supabase
        .from("business_users")
        .select(selectQuery)
        .eq("email", userEmail)
        .limit(1)
        .maybeSingle();
    }

    if (result.error) {
      console.error("Error loading assigned business:", result.error);
      return null;
    }

    const assignment = result.data as BusinessUserAssignment | null;

    if (!assignment?.business_id) {
      return null;
    }

    const { data: businessData, error: businessError } = await supabase
      .from("businesses")
      .select(
        "id, name, slug, plan_status, public_booking_enabled, profile_image_url, cover_image_url"
      )
      .eq("id", assignment.business_id)
      .maybeSingle();

    if (businessError || !businessData) {
      console.error("Error loading assigned business details:", businessError);
      return null;
    }

    const business = businessData as BusinessDetails;

    return {
      businessId: assignment.business_id,
      businessName: business.name ?? "",
      businessSlug: business.slug ?? "",
      profileImageUrl: business.profile_image_url ?? "",
      planStatus: business.plan_status ?? null,
      publicBookingEnabled: business.public_booking_enabled ?? null
    };
  }

  async function handleLogin() {
    setIsCheckingAdmin(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error) {
      setIsCheckingAdmin(false);
      setLoginError("Email o contraseña incorrectos.");
      return;
    }

    setLoginError("");
    setPassword("");
    await verifyAdminAccess();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setEmail("");
    setPassword("");
    clearPanelData();
  }

  async function copyPublicBookingLink() {
    if (!publicBookingUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(publicBookingUrl);
      setPublicBookingLinkMessage("Enlace copiado");
    } catch (error) {
      console.error("Error copying public booking link:", error);
      setPublicBookingLinkMessage("No se pudo copiar el enlace.");
    }
  }

  function handleBusinessImageFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setBusinessImageMessage("");

    if (!file) {
      setBusinessImageFile(null);
      return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    const maxSize = 3 * 1024 * 1024;

    if (!allowedTypes.includes(file.type)) {
      setBusinessImageFile(null);
      setBusinessImageMessageType("error");
      setBusinessImageMessage("Solo puedes subir imágenes JPG, PNG o WebP.");
      event.target.value = "";
      return;
    }

    if (file.size > maxSize) {
      setBusinessImageFile(null);
      setBusinessImageMessageType("error");
      setBusinessImageMessage("La imagen no puede superar 3 MB.");
      event.target.value = "";
      return;
    }

    setBusinessImageFile(file);
  }

  async function uploadBusinessImage() {
    if (!currentBusinessId || !businessImageFile) {
      setBusinessImageMessageType("error");
      setBusinessImageMessage("Selecciona una imagen antes de subirla.");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      setBusinessImageMessageType("error");
      setBusinessImageMessage("No se pudo comprobar tu sesión.");
      return;
    }

    setIsUploadingBusinessImage(true);
    setBusinessImageMessage("");

    const formData = new FormData();
    formData.append("business_id", currentBusinessId);
    formData.append("image", businessImageFile);

    try {
      const response = await fetch("/api/admin/business-image", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "No se pudo subir la imagen.");
      }

      setCurrentBusinessProfileImageUrl(result.profile_image_url ?? "");
      setBusinessImageFile(null);
      setBusinessImageMessageType("success");
      setBusinessImageMessage("Imagen subida correctamente.");
    } catch (error) {
      console.error("Error uploading business image:", error);
      setBusinessImageMessageType("error");
      setBusinessImageMessage("No se pudo subir la imagen.");
    } finally {
      setIsUploadingBusinessImage(false);
    }
  }

  async function removeBusinessImage() {
    if (!currentBusinessId) {
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      setBusinessImageMessageType("error");
      setBusinessImageMessage("No se pudo comprobar tu sesión.");
      return;
    }

    setIsUploadingBusinessImage(true);
    setBusinessImageMessage("");

    try {
      const response = await fetch("/api/admin/business-image", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          business_id: currentBusinessId
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "No se pudo quitar la imagen.");
      }

      setCurrentBusinessProfileImageUrl("");
      setBusinessImageFile(null);
      setBusinessImageMessageType("success");
      setBusinessImageMessage("Imagen quitada correctamente.");
    } catch (error) {
      console.error("Error removing business image:", error);
      setBusinessImageMessageType("error");
      setBusinessImageMessage("No se pudo quitar la imagen.");
    } finally {
      setIsUploadingBusinessImage(false);
    }
  }

  async function loadBusinessSettings(
    clearMessage = true,
    businessId = currentBusinessId
  ) {
    if (!businessId) {
      return;
    }

    if (clearMessage) {
      setSettingsMessage("");
    }

    const { data, error } = await supabase
      .from("business_settings")
      .select(
        "id, business_id, business_name, slogan, whatsapp_phone, whatsapp_message, instagram_url, address, main_button_text, block_cancellation_message, booking_limit_enabled, booking_limit_value, booking_limit_mode, weekly_release_enabled, weekly_release_day, weekly_release_window_days"
      )
      .eq("business_id", businessId)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      console.error("Error loading business settings:", error);
      setBusinessSettings(defaultBusinessSettings);
      setBusinessForm(defaultBusinessSettings);
      setHasCustomBlockCancellationMessage(false);
      return;
    }

    const nextBusinessSettings = {
      id: data.id,
      business_name: data.business_name || defaultBusinessSettings.business_name,
      slogan: data.slogan || defaultBusinessSettings.slogan,
      whatsapp_phone:
        typeof data.whatsapp_phone === "string" ? data.whatsapp_phone : "",
      whatsapp_message:
        typeof data.whatsapp_message === "string" &&
        data.whatsapp_message.trim() !== ""
          ? data.whatsapp_message
          : defaultBusinessSettings.whatsapp_message,
      instagram_url:
        typeof data.instagram_url === "string" ? data.instagram_url : "",
      address: typeof data.address === "string" ? data.address : "",
      main_button_text:
        data.main_button_text || defaultBusinessSettings.main_button_text,
      block_cancellation_message:
        data.block_cancellation_message ||
        defaultBusinessSettings.block_cancellation_message,
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
    setHasCustomBlockCancellationMessage(
      typeof data.block_cancellation_message === "string" &&
        data.block_cancellation_message.trim() !== ""
    );
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

  function normalizeBusinessSettings(data: BusinessSettings): BusinessSettings {
    return {
      id: data.id,
      business_name: data.business_name || defaultBusinessSettings.business_name,
      slogan: data.slogan || defaultBusinessSettings.slogan,
      whatsapp_phone:
        typeof data.whatsapp_phone === "string" ? data.whatsapp_phone : "",
      whatsapp_message:
        typeof data.whatsapp_message === "string" &&
        data.whatsapp_message.trim() !== ""
          ? data.whatsapp_message
          : defaultBusinessSettings.whatsapp_message,
      instagram_url:
        typeof data.instagram_url === "string" ? data.instagram_url : "",
      address: typeof data.address === "string" ? data.address : "",
      main_button_text:
        data.main_button_text || defaultBusinessSettings.main_button_text,
      block_cancellation_message:
        data.block_cancellation_message ||
        defaultBusinessSettings.block_cancellation_message,
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
  }

  async function updateBusinessSettingsWithApi(
    settingsToSave: Omit<BusinessSettings, "id"> & { id: string },
    errorMessage: string
  ) {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      setSettingsMessageType("error");
      setSettingsMessage(errorMessage);
      return null;
    }

    const response = await fetch("/api/admin/business-settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        ...settingsToSave,
        business_id: currentBusinessId
      })
    });

    if (!response.ok) {
      setSettingsMessageType("error");
      setSettingsMessage(errorMessage);
      return null;
    }

    const result = await response.json();
    const nextBusinessSettings = normalizeBusinessSettings(
      result.business_settings as BusinessSettings
    );

    setBusinessSettings(nextBusinessSettings);
    setBusinessForm(nextBusinessSettings);
    setSettingsMessageType("success");
    setSettingsMessage("Configuración guardada correctamente.");

    return nextBusinessSettings;
  }

  async function saveBusinessSettings() {
    setSettingsMessage("");

    if (!businessSettings.id || !currentBusinessId) {
      console.error("Error saving business settings:", "Missing business settings id");
      setSettingsMessageType("error");
      setSettingsMessage("No se pudo guardar la configuración.");
      return;
    }

    const settingsToSave = {
      id: businessSettings.id,
      business_name: businessForm.business_name.trim(),
      slogan: businessForm.slogan.trim(),
      whatsapp_phone: businessForm.whatsapp_phone.trim(),
      whatsapp_message: businessForm.whatsapp_message.trim(),
      instagram_url: businessForm.instagram_url.trim(),
      address: businessForm.address.trim(),
      main_button_text: businessForm.main_button_text.trim(),
      block_cancellation_message:
        businessForm.block_cancellation_message.trim() ||
        defaultBlockCancellationMessage,
      booking_limit_enabled: businessForm.booking_limit_enabled,
      booking_limit_value: Number(businessForm.booking_limit_value),
      booking_limit_mode: businessForm.booking_limit_mode,
      weekly_release_enabled: businessForm.weekly_release_enabled,
      weekly_release_day: Number(businessForm.weekly_release_day),
      weekly_release_window_days:
        Number(businessForm.weekly_release_window_days)
    };

    const nextBusinessSettings = await updateBusinessSettingsWithApi(
      settingsToSave,
      "No se pudo guardar la configuración."
    );

    if (!nextBusinessSettings) {
      setSettingsMessageType("error");
      setSettingsMessage("No se pudo guardar la configuración.");
      return;
    }
  }

  async function saveBookingSettings() {
    setSettingsMessage("");

    if (!businessSettings.id || !currentBusinessId) {
      console.error("Error saving booking settings:", "Missing business settings id");
      setSettingsMessageType("error");
      setSettingsMessage("No se pudo guardar la configuración de reservas.");
      return;
    }

    const bookingSettingsToSave = {
      id: businessSettings.id,
      business_name: businessForm.business_name,
      slogan: businessForm.slogan,
      whatsapp_phone: businessForm.whatsapp_phone,
      whatsapp_message: businessForm.whatsapp_message,
      instagram_url: businessForm.instagram_url,
      address: businessForm.address,
      main_button_text: businessForm.main_button_text,
      block_cancellation_message:
        businessForm.block_cancellation_message || defaultBlockCancellationMessage,
      booking_limit_enabled: businessForm.booking_limit_enabled,
      booking_limit_value: Number(businessForm.booking_limit_value),
      booking_limit_mode: businessForm.booking_limit_mode,
      weekly_release_enabled: businessForm.weekly_release_enabled,
      weekly_release_day: Number(businessForm.weekly_release_day),
      weekly_release_window_days: Number(businessForm.weekly_release_window_days)
    };

    console.log("Saving booking settings:", {
      booking_limit_enabled: businessForm.booking_limit_enabled,
      booking_limit_value: businessForm.booking_limit_value,
      booking_limit_mode: businessForm.booking_limit_mode,
      weekly_release_enabled: businessForm.weekly_release_enabled,
      weekly_release_day: businessForm.weekly_release_day,
      weekly_release_window_days: businessForm.weekly_release_window_days
    });

    const nextBusinessSettings = await updateBusinessSettingsWithApi(
      bookingSettingsToSave,
      "No se pudo guardar la configuración de reservas."
    );

    if (!nextBusinessSettings) {
      setSettingsMessageType("error");
      setSettingsMessage("No se pudo guardar la configuración de reservas.");
      return;
    }
  }

  async function saveBlockCancellationMessage() {
    setBlockMessage("");
    setBlockCancelledAppointments([]);

    if (!businessSettings.id || !currentBusinessId) {
      setBlockMessage("No se pudo guardar el mensaje.");
      return;
    }

    const messageToSave =
      businessForm.block_cancellation_message.trim() ||
      defaultBlockCancellationMessage;
    const settingsToSave = {
      id: businessSettings.id,
      business_name: businessForm.business_name,
      slogan: businessForm.slogan,
      whatsapp_phone: businessForm.whatsapp_phone,
      whatsapp_message: businessForm.whatsapp_message,
      instagram_url: businessForm.instagram_url,
      address: businessForm.address,
      main_button_text: businessForm.main_button_text,
      block_cancellation_message: messageToSave,
      booking_limit_enabled: businessForm.booking_limit_enabled,
      booking_limit_value: Number(businessForm.booking_limit_value),
      booking_limit_mode: businessForm.booking_limit_mode,
      weekly_release_enabled: businessForm.weekly_release_enabled,
      weekly_release_day: Number(businessForm.weekly_release_day),
      weekly_release_window_days: Number(businessForm.weekly_release_window_days)
    };
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      setBlockMessage("No se pudo guardar el mensaje.");
      return;
    }

    const response = await fetch("/api/admin/business-settings", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        ...settingsToSave,
        business_id: currentBusinessId
      })
    });

    if (!response.ok) {
      setBlockMessage("No se pudo guardar el mensaje.");
      return;
    }

    const result = await response.json();
    const nextBusinessSettings = normalizeBusinessSettings(
      result.business_settings as BusinessSettings
    );

    setBusinessSettings(nextBusinessSettings);
    setBusinessForm(nextBusinessSettings);
    setHasCustomBlockCancellationMessage(true);
    setBlockMessage("Mensaje guardado correctamente");
  }

  async function loadAppointments(businessId = currentBusinessId) {
    if (!businessId) {
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .eq("business_id", businessId)
      .gte("appointment_date", today)
      .or("status.is.null,status.neq.cancelled")
      .or("appointment_status.is.null,appointment_status.neq.cancelled")
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true });

    setIsLoading(false);

    if (error) {
      console.error("Error loading appointments:", error);
      setErrorMessage("No se pudieron cargar las citas.");
      return;
    }

    const normalizedAppointments = ((data ?? []) as Appointment[]).map(
      (appointment) => ({
        ...appointment,
        appointment_status: normalizeAppointmentStatus(
          appointment.appointment_status
        )
      })
    );

    if (process.env.NODE_ENV === "development") {
      console.log("Appointments loaded:", {
        currentBusinessId: businessId,
        count: normalizedAppointments.length
      });
    }

    setAppointments(normalizedAppointments);
  }

  async function loadAppointmentHistory(businessId = currentBusinessId) {
    if (!businessId) {
      return;
    }

    setIsLoadingHistory(true);
    setHistoryMessage("");
    setHistoryMessageType("success");

    const { data, error } = await supabase
      .from("appointments")
      .select(
        "id, service, appointment_date, appointment_time, customer_name, customer_phone, barber_name, duration_minutes, reminder_sent_at, reminder_status, reminder_error, appointment_status, status_updated_at, status, cancelled_at, cancellation_reason, whatsapp_cancel_notified_at"
      )
      .eq("business_id", businessId)
      .order("appointment_date", { ascending: false })
      .order("appointment_time", { ascending: false });

    setIsLoadingHistory(false);

    if (error) {
      console.error("Error loading appointment history:", error);
      setHistoryMessageType("error");
      setHistoryMessage("No se pudo cargar el historial de citas.");
      return;
    }

    setHistoryAppointments(
      ((data ?? []) as Appointment[]).map((appointment) => ({
        ...appointment,
        appointment_status: normalizeAppointmentStatus(
          appointment.appointment_status
        )
      }))
    );
  }

  async function loadReviews(businessId = currentBusinessId) {
    if (!businessId) {
      return;
    }

    setIsLoadingReviews(true);
    setReviewMessage("");
    setReviewMessageType("success");

    const { data, error } = await supabase
      .from("reviews")
      .select("*")
      .eq("business_id", businessId)
      .eq("is_visible", true)
      .order("created_at", { ascending: false });

    setIsLoadingReviews(false);

    if (error) {
      console.error("Error loading reviews:", error);
      setReviewMessageType("error");
      setReviewMessage("No se pudieron cargar las reseñas.");
      return;
    }

    setReviews((data ?? []) as Review[]);
  }

  async function deleteReview(reviewId: string) {
    if (!currentBusinessId) {
      return;
    }

    const confirmed = window.confirm("¿Seguro que quieres eliminar esta reseña?");

    if (!confirmed) {
      return;
    }

    setReviewMessage("");

    const { error } = await supabase
      .from("reviews")
      .delete()
      .eq("id", reviewId)
      .eq("business_id", currentBusinessId);

    if (error) {
      console.error("Error deleting review:", error);
      setReviewMessageType("error");
      setReviewMessage("No se pudo eliminar la reseña.");
      return;
    }

    await loadReviews();
    setReviewMessageType("success");
    setReviewMessage("Reseña eliminada correctamente.");
  }

  async function loadPendingCancellationNotifications(
    businessId = currentBusinessId
  ) {
    if (!businessId) {
      return;
    }

    const { data, error } = await supabase
      .from("appointments")
      .select(
        "id, service, appointment_date, appointment_time, customer_name, customer_phone, duration_minutes, status, cancelled_at, cancellation_reason, whatsapp_cancel_notified_at"
      )
      .eq("business_id", businessId)
      .eq("status", "cancelled")
      .is("whatsapp_cancel_notified_at", null)
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true });

    if (error) {
      console.error("Error loading pending cancellation notifications:", error);
      return;
    }

    setPendingCancellationNotifications(
      ((data ?? []) as BlockCancelledAppointment[]).map((appointment) => ({
        ...appointment,
        duration_minutes: Number(appointment.duration_minutes) || 30
      }))
    );
  }

  async function deleteAppointmentHistory() {
    if (!currentBusinessId) {
      setHistoryMessageType("error");
      setHistoryMessage("No se pudo cargar la barbería.");
      return;
    }

    if (historyBaseAppointments.length === 0) {
      setHistoryMessageType("error");
      setHistoryMessage("No hay citas en el historial para eliminar.");
      return;
    }

    const confirmed = window.confirm(
      "¿Seguro que quieres eliminar todo el historial de citas? Esta acción no se puede deshacer."
    );

    if (!confirmed) {
      return;
    }

    const { error: statusError } = await supabase
      .from("appointments")
      .delete()
      .eq("business_id", currentBusinessId)
      .in("appointment_status", ["completed", "cancelled", "no_show"]);

    if (statusError) {
      console.error("Error deleting appointment history:", statusError);
      setHistoryMessageType("error");
      setHistoryMessage("No se pudo eliminar el historial.");
      return;
    }

    const { error: pendingError } = await supabase
      .from("appointments")
      .delete()
      .eq("business_id", currentBusinessId)
      .eq("appointment_status", "pending")
      .lt("appointment_date", today);

    if (pendingError) {
      console.error("Error deleting appointment history:", pendingError);
      setHistoryMessageType("error");
      setHistoryMessage("No se pudo eliminar el historial.");
      return;
    }

    await loadAppointments();
    await loadAppointmentHistory();
    setHistoryMessageType("success");
    setHistoryMessage("Historial eliminado correctamente.");
  }

  async function loadBlockedTimes(businessId = currentBusinessId) {
    if (!businessId) {
      return;
    }

    setIsLoadingBlockedTimes(true);

    const { data, error } = await supabase
      .from("blocked_times")
      .select("id, block_date, is_full_day, start_time, end_time, reason")
      .eq("business_id", businessId)
      .order("block_date", { ascending: true })
      .order("start_time", { ascending: true });

    setIsLoadingBlockedTimes(false);

    if (error) {
      setBlockMessage("No se pudieron cargar los bloqueos.");
      return;
    }

    setBlockedTimes((data ?? []) as BlockedTime[]);
  }

  async function cleanupExpiredBlockedTimes(businessId = currentBusinessId) {
    if (!businessId) {
      return;
    }

    const currentTimeInfo = getCurrentTimeInfo();
    const currentTime = minutesToTime(currentTimeInfo.minutes);

    const { error: pastDateError } = await supabase
      .from("blocked_times")
      .delete()
      .eq("business_id", businessId)
      .lt("block_date", currentTimeInfo.today);

    if (pastDateError) {
      console.error("Error cleaning expired blocked times:", pastDateError);
      return;
    }

    const { error: todayError } = await supabase
      .from("blocked_times")
      .delete()
      .eq("business_id", businessId)
      .eq("block_date", currentTimeInfo.today)
      .not("end_time", "is", null)
      .lte("end_time", currentTime);

    if (todayError) {
      console.error("Error cleaning expired blocked times:", todayError);
    }
  }

  async function loadWorkingHours(businessId = currentBusinessId) {
    if (!businessId) {
      return;
    }

    setIsLoadingSchedule(true);
    setScheduleMessage("");

    const { data, error } = await supabase
      .from("working_hours")
      .select(
        "id, day_of_week, day_name, is_working, morning_start, morning_end, afternoon_start, afternoon_end, slot_minutes"
      )
      .eq("business_id", businessId)
      .order("day_of_week", { ascending: true });

    setIsLoadingSchedule(false);

    if (error) {
      setScheduleMessage("No se pudo cargar el horario de trabajo.");
      return;
    }

    setWorkingHours((data ?? []) as WorkingHour[]);
  }

  async function loadServices(businessId = currentBusinessId) {
    if (!businessId) {
      return;
    }

    setIsLoadingServices(true);

    const { data, error } = await supabase
      .from("services")
      .select("id, name, price, duration_minutes, is_active")
      .eq("business_id", businessId)
      .order("created_at", { ascending: true });

    setIsLoadingServices(false);

    if (error) {
      setServiceMessage("No se pudieron cargar los servicios.");
      return;
    }

    setServices((data ?? []) as Service[]);
  }

  function updateManualAppointment(
    field: keyof ManualAppointmentForm,
    value: string
  ) {
    setManualAppointment((currentForm) => {
      if (field === "service_id" || field === "appointment_date") {
        return {
          ...currentForm,
          [field]: value,
          appointment_time: ""
        };
      }

      return {
        ...currentForm,
        [field]: value
      };
    });
    setManualMessage("");
    setManualMessageType("success");
  }

  function isPastDate(dateValue: string) {
    if (dateValue === "") {
      return false;
    }

    return (
      startOfLocalDay(new Date(`${dateValue}T00:00:00`)) <
      startOfLocalDay(new Date())
    );
  }

  async function calculateManualAvailableHoursFor(
    dateValue: string,
    durationMinutes: number
  ) {
    if (!currentBusinessId) {
      return {
        hours: [],
        message: "No se pudo cargar la barbería."
      };
    }

    if (isPastDate(dateValue)) {
      return {
        hours: [],
        message: "No se puede crear una cita en una fecha pasada."
      };
    }

    const selectedDate = new Date(`${dateValue}T00:00:00`);
    const workingHour = getWorkingHoursForDate(selectedDate, workingHours);

    if (!workingHour || !workingHour.is_working) {
      return {
        hours: [],
        message: "La barbería está cerrada ese día."
      };
    }

    const [appointmentsResult, blockedTimesResult] = await Promise.all([
      supabase
        .from("appointment_slots")
        .select("appointment_time, duration_minutes")
        .eq("business_id", currentBusinessId)
        .eq("appointment_date", dateValue),
      supabase
        .from("blocked_times")
        .select("id, block_date, is_full_day, start_time, end_time, reason")
        .eq("business_id", currentBusinessId)
        .eq("block_date", dateValue)
    ]);

    if (appointmentsResult.error || blockedTimesResult.error) {
      return {
        hours: [],
        message: "No se pudieron cargar las horas disponibles."
      };
    }

    const dayAppointments =
      (appointmentsResult.data ?? []) as ExistingAppointment[];
    const dayBlockedTimes = (blockedTimesResult.data ?? []) as BlockedTime[];

    if (dayBlockedTimes.some((blockedTime) => blockedTime.is_full_day)) {
      return {
        hours: [],
        message: "Ese día está bloqueado."
      };
    }

    const allHours = getAvailableHours(workingHour);
    const currentTimeInfo = getCurrentTimeInfo();
    const pastHours = getPastHours(
      allHours,
      dateValue,
      currentTimeInfo.today,
      currentTimeInfo.minutes
    );
    const availableHours = allHours.filter(
      (hour) =>
        !pastHours.includes(hour) &&
        !appointmentOverlaps(hour, durationMinutes, dayAppointments) &&
        !blockOverlaps(hour, durationMinutes, dayBlockedTimes)
    );

    return {
      hours: availableHours,
      message:
        availableHours.length === 0
          ? "No hay horas disponibles para ese día."
          : ""
    };
  }

  async function refreshManualAvailableHours() {
    if (
      manualAppointment.service_id.trim() === "" ||
      manualAppointment.appointment_date.trim() === ""
    ) {
      setManualAvailableHours([]);
      return;
    }

    const selectedService = services.find(
      (service) => service.id === manualAppointment.service_id
    );

    if (!selectedService) {
      setManualAvailableHours([]);
      return;
    }

    setIsLoadingManualHours(true);
    const result = await calculateManualAvailableHoursFor(
      manualAppointment.appointment_date,
      selectedService.duration_minutes
    );
    setIsLoadingManualHours(false);
    setManualAvailableHours(result.hours);

    if (
      manualAppointment.appointment_time !== "" &&
      !result.hours.includes(manualAppointment.appointment_time)
    ) {
      setManualAppointment((currentForm) => ({
        ...currentForm,
        appointment_time: ""
      }));
    }

    if (result.message) {
      setManualMessageType("error");
      setManualMessage(result.message);
      return;
    }

    setManualMessage("");
    setManualMessageType("success");
  }

  async function createManualAppointment() {
    if (!currentBusinessId) {
      setManualMessageType("error");
      setManualMessage("No se pudo cargar la barbería.");
      return;
    }

    const selectedService = services.find(
      (service) => service.id === manualAppointment.service_id
    );

    if (
      manualAppointment.customer_name.trim() === "" ||
      manualAppointment.customer_phone.trim() === "" ||
      manualAppointment.service_id.trim() === "" ||
      manualAppointment.appointment_date.trim() === ""
    ) {
      setManualMessageType("error");
      setManualMessage("Rellena nombre, teléfono, servicio y fecha.");
      return;
    }

    if (manualAppointment.appointment_time.trim() === "") {
      setManualMessageType("error");
      setManualMessage("Elige una hora.");
      return;
    }

    if (!selectedService) {
      setManualMessageType("error");
      setManualMessage("Elige un servicio válido.");
      return;
    }

    if (isPastDate(manualAppointment.appointment_date)) {
      setManualMessageType("error");
      setManualMessage("No se puede crear una cita en una fecha pasada.");
      return;
    }

    const currentTimeInfo = getCurrentTimeInfo();

    if (
      isPastHourForToday(
        manualAppointment.appointment_date,
        manualAppointment.appointment_time,
        currentTimeInfo.today,
        currentTimeInfo.minutes
      )
    ) {
      setManualMessageType("error");
      setManualMessage("No se puede crear una cita en una hora que ya ha pasado.");
      return;
    }

    setIsLoadingManualHours(true);
    const result = await calculateManualAvailableHoursFor(
      manualAppointment.appointment_date,
      selectedService.duration_minutes
    );
    setIsLoadingManualHours(false);
    setManualAvailableHours(result.hours);

    if (!result.hours.includes(manualAppointment.appointment_time)) {
      setManualMessageType("error");
      setManualMessage(
        result.message || "Esa hora ya no está disponible. Elige otra hora."
      );
      setManualAppointment((currentForm) => ({
        ...currentForm,
        appointment_time: ""
      }));
      return;
    }

    const { error } = await supabase.from("appointments").insert({
      id: crypto.randomUUID(),
      service: selectedService.name,
      appointment_date: manualAppointment.appointment_date,
      appointment_time: manualAppointment.appointment_time,
      customer_name: manualAppointment.customer_name.trim(),
      customer_phone: manualAppointment.customer_phone.trim(),
      customer_user_id: null,
      business_id: currentBusinessId,
      barber_name: mainBarber,
      duration_minutes: selectedService.duration_minutes,
      appointment_status: "pending",
      reminder_status: "pending"
    });

    if (error) {
      console.error("Error creating manual appointment:", error);
      setManualMessageType("error");
      setManualMessage("No se pudo crear la cita.");
      return;
    }

    setManualAppointment(initialManualAppointmentForm);
    setManualAvailableHours([]);
    setManualMessageType("success");
    setManualMessage("Cita creada correctamente.");
    await loadAppointments();
    await loadAppointmentHistory();
  }

  function calculateEditAvailableHoursFor(
    dateValue: string,
    durationMinutes: number,
    excludedAppointmentId: string
  ) {
    if (isPastDate(dateValue)) {
      return {
        hours: [],
        message: "No se puede modificar una cita a una fecha pasada."
      };
    }

    const selectedDate = new Date(`${dateValue}T00:00:00`);
    const workingHour = getWorkingHoursForDate(selectedDate, workingHours);

    if (!workingHour || !workingHour.is_working) {
      return {
        hours: [],
        message: "La barbería está cerrada ese día."
      };
    }

    const dayBlockedTimes = blockedTimes.filter(
      (blockedTime) => blockedTime.block_date === dateValue
    );

    if (dayBlockedTimes.some((blockedTime) => blockedTime.is_full_day)) {
      return {
        hours: [],
        message: "Ese día está bloqueado."
      };
    }

    const otherAppointments = appointments
      .filter(
        (appointment) =>
          appointment.appointment_date === dateValue &&
          appointment.id !== excludedAppointmentId &&
          appointment.appointment_status !== "cancelled"
      )
      .map((appointment) => ({
        appointment_time: appointment.appointment_time,
        duration_minutes: appointment.duration_minutes
      }));
    const allHours = getAvailableHours(workingHour);
    const currentTimeInfo = getCurrentTimeInfo();
    const pastHours = getPastHours(
      allHours,
      dateValue,
      currentTimeInfo.today,
      currentTimeInfo.minutes
    );
    const availableHours = allHours.filter(
      (hour) =>
        !pastHours.includes(hour) &&
        !appointmentOverlaps(hour, durationMinutes, otherAppointments) &&
        !blockOverlaps(hour, durationMinutes, dayBlockedTimes)
    );

    return {
      hours: availableHours,
      message:
        availableHours.length === 0
          ? "No hay horas disponibles para ese día."
          : ""
    };
  }

  function refreshEditAvailableHours(form: EditAppointmentForm) {
    const selectedService = services.find((service) => service.id === form.service_id);

    if (!selectedService || form.appointment_date.trim() === "") {
      setEditAvailableHours([]);
      return;
    }

    setIsLoadingEditHours(true);
    const result = calculateEditAvailableHoursFor(
      form.appointment_date,
      selectedService.duration_minutes,
      form.id
    );
    setIsLoadingEditHours(false);
    setEditAvailableHours(result.hours);

    if (
      form.appointment_time !== "" &&
      !result.hours.includes(form.appointment_time)
    ) {
      setEditingAppointment((currentForm) =>
        currentForm ? { ...currentForm, appointment_time: "" } : currentForm
      );
    }
  }

  function openEditAppointment(appointment: Appointment) {
    const selectedService = services.find(
      (service) => service.name === appointment.service
    );

    setAgendaMessage("");
    setAgendaMessageType("success");
    setEditingAppointment({
      id: appointment.id,
      customer_name: appointment.customer_name,
      customer_phone: appointment.customer_phone,
      service_id: selectedService?.id ?? "",
      appointment_date: appointment.appointment_date,
      appointment_time: formatAppointmentTime(appointment.appointment_time),
      duration_minutes: appointment.duration_minutes || selectedService?.duration_minutes || 30
    });
  }

  function updateEditingAppointment(
    field: Exclude<keyof EditAppointmentForm, "duration_minutes">,
    value: string
  ) {
    setEditingAppointment((currentForm) => {
      if (!currentForm) {
        return currentForm;
      }

      if (field === "service_id") {
        const selectedService = services.find((service) => service.id === value);

        return {
          ...currentForm,
          service_id: value,
          duration_minutes:
            selectedService?.duration_minutes ?? currentForm.duration_minutes,
          appointment_time: ""
        };
      }

      if (field === "appointment_date") {
        return {
          ...currentForm,
          appointment_date: value,
          appointment_time: ""
        };
      }

      return {
        ...currentForm,
        [field]: value
      };
    });
    setAgendaMessage("");
    setAgendaMessageType("success");
  }

  async function saveEditedAppointment() {
    if (!editingAppointment) {
      return;
    }

    if (!currentBusinessId) {
      setAgendaMessageType("error");
      setAgendaMessage("No se pudo cargar la barbería.");
      return;
    }

    const selectedService = services.find(
      (service) => service.id === editingAppointment.service_id
    );

    if (
      editingAppointment.customer_name.trim() === "" ||
      editingAppointment.customer_phone.trim() === "" ||
      editingAppointment.service_id.trim() === "" ||
      editingAppointment.appointment_date.trim() === ""
    ) {
      setAgendaMessageType("error");
      setAgendaMessage("Rellena nombre, teléfono, servicio y fecha.");
      return;
    }

    if (editingAppointment.appointment_time.trim() === "") {
      setAgendaMessageType("error");
      setAgendaMessage("Elige una hora.");
      return;
    }

    if (!selectedService) {
      setAgendaMessageType("error");
      setAgendaMessage("Elige un servicio válido.");
      return;
    }

    if (isPastDate(editingAppointment.appointment_date)) {
      setAgendaMessageType("error");
      setAgendaMessage("No se puede modificar una cita a una fecha pasada.");
      return;
    }

    const currentTimeInfo = getCurrentTimeInfo();

    if (
      isPastHourForToday(
        editingAppointment.appointment_date,
        editingAppointment.appointment_time,
        currentTimeInfo.today,
        currentTimeInfo.minutes
      )
    ) {
      setAgendaMessageType("error");
      setAgendaMessage("No se puede elegir una hora que ya ha pasado.");
      return;
    }

    const result = calculateEditAvailableHoursFor(
      editingAppointment.appointment_date,
      selectedService.duration_minutes,
      editingAppointment.id
    );

    setEditAvailableHours(result.hours);

    if (!result.hours.includes(editingAppointment.appointment_time)) {
      setAgendaMessageType("error");
      setAgendaMessage(
        result.message || "Esa hora ya no está disponible. Elige otra hora."
      );
      setEditingAppointment((currentForm) =>
        currentForm ? { ...currentForm, appointment_time: "" } : currentForm
      );
      return;
    }

    const { error } = await supabase
      .from("appointments")
      .update({
        customer_name: editingAppointment.customer_name.trim(),
        customer_phone: editingAppointment.customer_phone.trim(),
        service: selectedService.name,
        appointment_date: editingAppointment.appointment_date,
        appointment_time: editingAppointment.appointment_time,
        duration_minutes: selectedService.duration_minutes
      })
      .eq("id", editingAppointment.id)
      .eq("business_id", currentBusinessId);

    if (error) {
      console.error("Error updating appointment:", error);
      setAgendaMessageType("error");
      setAgendaMessage("No se pudo modificar la cita.");
      return;
    }

    setEditingAppointment(null);
    setEditAvailableHours([]);
    setAgendaMessageType("success");
    setAgendaMessage("Cita modificada correctamente.");
    await loadAppointments();
    await loadAppointmentHistory();
  }

  async function deleteAgendaAppointment(id: string) {
    if (!currentBusinessId) {
      setAgendaMessageType("error");
      setAgendaMessage("No se pudo cargar la barbería.");
      return;
    }

    const confirmed = window.confirm("¿Seguro que quieres eliminar esta cita?");

    if (!confirmed) {
      return;
    }

    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", id)
      .eq("business_id", currentBusinessId);

    if (error) {
      console.error("Error deleting appointment:", error);
      setAgendaMessageType("error");
      setAgendaMessage("No se pudo eliminar la cita.");
      return;
    }

    setAgendaMessageType("success");
    setAgendaMessage("Cita eliminada correctamente.");
    await loadAppointments();
    await loadAppointmentHistory();
  }

  function openAppointmentWhatsApp(appointment: Appointment) {
    const phone = normalizeWhatsAppPhone(appointment.customer_phone);

    if (!phone) {
      setAgendaMessageType("error");
      setAgendaMessage("Esta cita no tiene teléfono.");
      return;
    }

    const businessName =
      businessSettings.business_name || defaultBusinessSettings.business_name;
    window.open(
      createAppointmentWhatsAppLink(appointment, businessName),
      "_blank",
      "noopener,noreferrer"
    );
  }

  async function updateAppointmentStatus(
    id: string,
    nextStatus: AppointmentStatus
  ) {
    if (!currentBusinessId) {
      setAgendaMessageType("error");
      setAgendaMessage("No se pudo cargar la barbería.");
      return;
    }

    if (nextStatus === "cancelled") {
      const confirmed = window.confirm(
        "¿Seguro que quieres cancelar esta cita? El hueco quedará libre para nuevas reservas."
      );

      if (!confirmed) {
        return;
      }
    }

    const { error } = await supabase
      .from("appointments")
      .update({
        appointment_status: nextStatus,
        status_updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .eq("business_id", currentBusinessId);

    if (error) {
      console.error("Error updating appointment status:", error);
      setAgendaMessageType("error");
      setAgendaMessage("No se pudo actualizar el estado de la cita.");
      return;
    }

    setAgendaMessageType("success");
    setAgendaMessage(
      nextStatus === "cancelled"
        ? "Cita cancelada correctamente."
        : "Estado de cita actualizado."
    );
    await loadAppointments();
    await loadAppointmentHistory();
  }

  function getAgendaAppointmentClass(status: AppointmentStatus) {
    if (status === "completed") {
      return "grid grid-cols-[64px_1fr] gap-3 rounded-2xl border border-green-400/45 bg-green-400/10 p-3";
    }

    if (status === "cancelled") {
      return "grid grid-cols-[64px_1fr] gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 opacity-60";
    }

    if (status === "no_show") {
      return "grid grid-cols-[64px_1fr] gap-3 rounded-2xl border border-yellow-400/45 bg-yellow-400/10 p-3";
    }

    return "grid grid-cols-[64px_1fr] gap-3 rounded-2xl border border-barber-gold/50 bg-barber-gold/10 p-3";
  }

  function getAgendaContinuationClass(status: AppointmentStatus) {
    if (status === "completed") {
      return "grid grid-cols-[64px_1fr] gap-3 rounded-2xl border border-green-400/25 bg-green-400/[0.06] p-3";
    }

    if (status === "cancelled") {
      return "grid grid-cols-[64px_1fr] gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-3 opacity-50";
    }

    if (status === "no_show") {
      return "grid grid-cols-[64px_1fr] gap-3 rounded-2xl border border-yellow-400/25 bg-yellow-400/[0.06] p-3";
    }

    return "grid grid-cols-[64px_1fr] gap-3 rounded-2xl border border-barber-gold/25 bg-barber-gold/[0.06] p-3";
  }

  function getHistoryAppointmentClass(status: AppointmentStatus) {
    if (status === "completed") {
      return "rounded-2xl border border-green-400/35 bg-green-400/10 p-4";
    }

    if (status === "cancelled") {
      return "rounded-2xl border border-white/10 bg-white/[0.03] p-4 opacity-65";
    }

    if (status === "no_show") {
      return "rounded-2xl border border-yellow-400/35 bg-yellow-400/10 p-4";
    }

    return "rounded-2xl border border-barber-gold/30 bg-barber-gold/10 p-4";
  }

  function openHistoryWhatsApp(appointment: Appointment) {
    const phone = normalizeWhatsAppPhone(appointment.customer_phone);

    if (!phone) {
      setHistoryMessageType("error");
      setHistoryMessage("Esta cita no tiene teléfono.");
      return;
    }

    const businessName =
      businessSettings.business_name || defaultBusinessSettings.business_name;
    window.open(
      createHistoryWhatsAppLink(appointment, businessName),
      "_blank",
      "noopener,noreferrer"
    );
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
    if (!currentBusinessId) {
      setServiceMessage("No se pudo cargar la barbería.");
      return;
    }

    const { error } = await supabase
      .from("services")
      .update({
        name: service.name.trim(),
        price: Number(service.price),
        duration_minutes: Number(service.duration_minutes),
        is_active: service.is_active
      })
      .eq("id", service.id)
      .eq("business_id", currentBusinessId);

    if (error) {
      setServiceMessage("No se pudo guardar el servicio.");
      return;
    }

    setServiceMessage("Servicio actualizado correctamente.");
    await loadServices();
  }

  async function addService() {
    if (!currentBusinessId) {
      setServiceMessage("No se pudo cargar la barbería.");
      return;
    }

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
      is_active: true,
      business_id: currentBusinessId
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
    if (!currentBusinessId) {
      setServiceMessage("No se pudo cargar la barbería.");
      return;
    }

    const { error } = await supabase
      .from("services")
      .delete()
      .eq("id", id)
      .eq("business_id", currentBusinessId);

    if (error) {
      setServiceMessage("No se pudo eliminar el servicio.");
      return;
    }

    setServiceMessage("Servicio eliminado correctamente.");
    await loadServices();
  }
  async function addBlockedTime() {
    if (!currentBusinessId) {
      setBlockMessage("No se pudo cargar la barbería.");
      return;
    }

    setBlockCancelledAppointments([]);

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
      reason: emptyToNull(newBlockedTime.reason),
      business_id: currentBusinessId
    });

    if (error) {
      setBlockMessage("No se pudo añadir el bloqueo.");
      return;
    }

    const { data: pendingAppointments, error: appointmentsError } = await supabase
      .from("appointments")
      .select(
        "id, service, appointment_date, appointment_time, customer_name, customer_phone, duration_minutes, status, cancelled_at, cancellation_reason, whatsapp_cancel_notified_at"
      )
      .eq("business_id", currentBusinessId)
      .eq("appointment_date", newBlockedTime.block_date)
      .eq("appointment_status", "pending")
      .or("status.is.null,status.neq.cancelled")
      .order("appointment_time", { ascending: true });

    if (appointmentsError) {
      console.error("Error loading appointments affected by block:", appointmentsError);
      setBlockMessage(
        "Bloqueo creado correctamente, pero no se pudieron revisar las citas afectadas."
      );
      await cleanupExpiredBlockedTimes();
      await loadBlockedTimes();
      return;
    }

    const affectedAppointments = ((pendingAppointments ?? []) as BlockCancelledAppointment[])
      .map((appointment) => ({
        ...appointment,
        duration_minutes: Number(appointment.duration_minutes) || 30
      }))
      .filter((appointment) => {
        if (newBlockedTime.is_full_day) {
          return true;
        }

        return rangesOverlap(
          appointment.appointment_time,
          appointment.duration_minutes,
          newBlockedTime.start_time,
          newBlockedTime.end_time
        );
      });

    const cancellationReason =
      newBlockedTime.reason.trim() || "Horario bloqueado por la barbería";
    const cancelledAt = new Date().toISOString();

    if (affectedAppointments.length > 0) {
      const { error: cancelError } = await supabase
        .from("appointments")
        .update({
          status: "cancelled",
          cancelled_at: cancelledAt,
          cancellation_reason: cancellationReason,
          whatsapp_cancel_notified_at: null,
          appointment_status: "cancelled",
          status_updated_at: cancelledAt
        })
        .eq("business_id", currentBusinessId)
        .or("status.is.null,status.neq.cancelled")
        .in(
          "id",
          affectedAppointments.map((appointment) => appointment.id)
        );

      if (cancelError) {
        console.error("Error cancelling appointments affected by block:", cancelError);
        setBlockMessage(
          "Bloqueo creado correctamente, pero no se pudieron cancelar las citas afectadas."
        );
        await cleanupExpiredBlockedTimes();
        await loadBlockedTimes();
        return;
      }
    }

    const cancelledAppointments = affectedAppointments.map((appointment) => ({
      ...appointment,
      status: "cancelled",
      cancelled_at: cancelledAt,
      cancellation_reason: cancellationReason,
      whatsapp_cancel_notified_at: null
    }));

    setNewBlockedTime({
      block_date: "",
      is_full_day: true,
      start_time: "",
      end_time: "",
      reason: ""
    });
    setBlockCancelledAppointments(cancelledAppointments);
    setBlockMessage(
      affectedAppointments.length > 0
        ? `Bloqueo creado. Se han cancelado ${affectedAppointments.length} citas. Debes avisar a los clientes por WhatsApp.`
        : "Bloqueo creado correctamente. No había citas afectadas."
    );
    await cleanupExpiredBlockedTimes();
    await loadBlockedTimes();
    await loadAppointments();
    await loadAppointmentHistory();
    await loadPendingCancellationNotifications();
  }

  async function deleteBlockedTime(id: string) {
    if (!currentBusinessId) {
      setBlockMessage("No se pudo cargar la barbería.");
      return;
    }

    const { error } = await supabase
      .from("blocked_times")
      .delete()
      .eq("id", id)
      .eq("business_id", currentBusinessId);

    if (error) {
      setBlockMessage("No se pudo eliminar el bloqueo.");
      return;
    }

    setBlockMessage("Bloqueo eliminado correctamente.");
    await cleanupExpiredBlockedTimes();
    await loadBlockedTimes();
  }

  async function markCancellationAsNotified(appointmentId: string) {
    if (!currentBusinessId) {
      setBlockMessage("No se pudo cargar la barbería.");
      return;
    }

    const notifiedAt = new Date().toISOString();
    const { error } = await supabase
      .from("appointments")
      .update({
        whatsapp_cancel_notified_at: notifiedAt
      })
      .eq("id", appointmentId)
      .eq("business_id", currentBusinessId);

    if (error) {
      console.error("Error marking cancellation as notified:", error);
      setBlockMessage("No se pudo marcar el cliente como avisado.");
      return;
    }

    setBlockCancelledAppointments((currentAppointments) =>
      currentAppointments.map((appointment) =>
        appointment.id === appointmentId
          ? { ...appointment, whatsapp_cancel_notified_at: notifiedAt }
          : appointment
      )
    );
    setPendingCancellationNotifications((currentAppointments) =>
      currentAppointments.filter((appointment) => appointment.id !== appointmentId)
    );
    setBlockMessage("Cliente marcado como avisado.");
  }

  async function markCancellationWhatsAppAsSent(appointmentId: string) {
    if (!currentBusinessId) {
      setBlockMessage("Se abrió WhatsApp, pero no se pudo marcar como avisado.");
      return;
    }

    const notifiedAt = new Date().toISOString();
    const { error } = await supabase
      .from("appointments")
      .update({
        whatsapp_cancel_notified_at: notifiedAt
      })
      .eq("id", appointmentId)
      .eq("business_id", currentBusinessId);

    if (error) {
      console.error("Error marking cancellation WhatsApp as sent:", error);
      setBlockMessage("Se abrió WhatsApp, pero no se pudo marcar como avisado.");
      return;
    }

    setBlockCancelledAppointments((currentAppointments) =>
      currentAppointments.map((appointment) =>
        appointment.id === appointmentId
          ? { ...appointment, whatsapp_cancel_notified_at: notifiedAt }
          : appointment
      )
    );
    setPendingCancellationNotifications((currentAppointments) =>
      currentAppointments.filter((appointment) => appointment.id !== appointmentId)
    );
    setBlockMessage("WhatsApp abierto y cliente marcado como avisado.");
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
    if (!currentBusinessId) {
      setErrorMessage("No se pudo cargar la barbería.");
      return;
    }

    const { error } = await supabase
      .from("appointments")
      .update({
        reminder_status: "sent",
        reminder_sent_at: new Date().toISOString(),
        reminder_error: null
      })
      .eq("id", id)
      .eq("business_id", currentBusinessId);

    if (error) {
      setErrorMessage("No se pudo marcar el recordatorio como enviado.");
      return;
    }

    await loadAppointments();
  }
  async function deleteAppointment(id: string) {
    if (!currentBusinessId) {
      setErrorMessage("No se pudo cargar la barbería.");
      return;
    }

    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", id)
      .eq("business_id", currentBusinessId);

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
    setPendingScheduleChange(null);
    setScheduleCancelledAppointments([]);
  }

  async function updateWorkingHourInDatabase(workingHour: WorkingHour) {
    if (!currentBusinessId) {
      setScheduleMessage("No se pudo cargar la barbería.");
      return false;
    }

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
      .eq("id", workingHour.id)
      .eq("business_id", currentBusinessId);

    if (error) {
      setScheduleMessage("No se pudo actualizar el horario.");
      return false;
    }

    return true;
  }

  async function loadOriginalWorkingHour(id: string) {
    if (!currentBusinessId) {
      return null;
    }

    const { data, error } = await supabase
      .from("working_hours")
      .select(
        "id, day_of_week, day_name, is_working, morning_start, morning_end, afternoon_start, afternoon_end, slot_minutes"
      )
      .eq("id", id)
      .eq("business_id", currentBusinessId)
      .maybeSingle();

    if (error || !data) {
      console.error("Error loading original working hour:", error);
      return null;
    }

    return data as WorkingHour;
  }

  async function findAppointmentsAffectedByWorkingHour(workingHour: WorkingHour) {
    if (!currentBusinessId) {
      return [];
    }

    const { data, error } = await supabase
      .from("appointments")
      .select(
        "id, service, appointment_date, appointment_time, customer_name, customer_phone, duration_minutes"
      )
      .eq("business_id", currentBusinessId)
      .eq("appointment_status", "pending")
      .gte("appointment_date", formatDateForSupabase(new Date()))
      .order("appointment_date", { ascending: true })
      .order("appointment_time", { ascending: true });

    if (error) {
      console.error("Error loading appointments affected by schedule:", error);
      setScheduleMessage("No se pudieron revisar las citas afectadas.");
      return null;
    }

    return ((data ?? []) as BlockCancelledAppointment[])
      .map((appointment) => ({
        ...appointment,
        duration_minutes: Number(appointment.duration_minutes) || 30
      }))
      .filter((appointment) => {
        const appointmentDate = new Date(`${appointment.appointment_date}T00:00:00`);

        return (
          appointmentDate.getDay() === Number(workingHour.day_of_week) &&
          !appointmentFitsInsideWorkingHour(appointment, workingHour)
        );
      });
  }

  async function saveWorkingHour(workingHour: WorkingHour) {
    if (!currentBusinessId) {
      setScheduleMessage("No se pudo cargar la barbería.");
      return;
    }

    setScheduleCancelledAppointments([]);
    setPendingScheduleChange(null);

    const originalWorkingHour = await loadOriginalWorkingHour(workingHour.id);

    if (!originalWorkingHour) {
      setScheduleMessage("No se pudo comprobar el horario actual.");
      return;
    }

    if (workingHourHasChanged(originalWorkingHour, workingHour)) {
      const affectedAppointments =
        await findAppointmentsAffectedByWorkingHour(workingHour);

      if (affectedAppointments === null) {
        return;
      }

      if (affectedAppointments.length > 0) {
        setPendingScheduleChange({
          workingHour: { ...workingHour },
          originalWorkingHour,
          affectedAppointments
        });
        setWorkingHours((currentWorkingHours) =>
          currentWorkingHours.map((currentWorkingHour) =>
            currentWorkingHour.id === originalWorkingHour.id
              ? originalWorkingHour
              : currentWorkingHour
          )
        );
        setScheduleMessage(
          `Hay ${affectedAppointments.length} citas pendientes que quedarían fuera del nuevo horario.`
        );
        return;
      }
    }

    const saved = await updateWorkingHourInDatabase(workingHour);

    if (!saved) {
      return;
    }

    setScheduleMessage("Horario actualizado correctamente.");
    await loadWorkingHours();
  }

  function cancelPendingScheduleChange() {
    if (pendingScheduleChange) {
      setWorkingHours((currentWorkingHours) =>
        currentWorkingHours.map((workingHour) =>
          workingHour.id === pendingScheduleChange.originalWorkingHour.id
            ? pendingScheduleChange.originalWorkingHour
            : workingHour
        )
      );
    }

    setPendingScheduleChange(null);
    setScheduleCancelledAppointments([]);
    setScheduleMessage("");
  }

  async function confirmPendingScheduleChange() {
    if (!pendingScheduleChange || !currentBusinessId) {
      return;
    }

    const saved = await updateWorkingHourInDatabase(
      pendingScheduleChange.workingHour
    );

    if (!saved) {
      return;
    }

    const { error } = await supabase
      .from("appointments")
      .update({
        appointment_status: "cancelled",
        status_updated_at: new Date().toISOString()
      })
      .eq("business_id", currentBusinessId)
      .eq("appointment_status", "pending")
      .in(
        "id",
        pendingScheduleChange.affectedAppointments.map(
          (appointment) => appointment.id
        )
      );

    if (error) {
      console.error("Error cancelling appointments affected by schedule:", error);
      setScheduleMessage(
        "Horario guardado, pero no se pudieron cancelar las citas afectadas."
      );
      return;
    }

    setScheduleCancelledAppointments(pendingScheduleChange.affectedAppointments);
    setScheduleMessage(
      `Horario guardado y ${pendingScheduleChange.affectedAppointments.length} citas canceladas automáticamente.`
    );
    setPendingScheduleChange(null);
    await loadWorkingHours();
    await loadAppointments();
    await loadAppointmentHistory();
  }

  function toggleSection(section: PanelSectionKey) {
    setOpenSections((currentSections) => ({
      ...currentSections,
      [section]: !currentSections[section]
    }));
  }

  function getAgendaSlotInfo(hour: string) {
    const slotStart = timeToMinutes(hour);
    const slotEnd = slotStart + agendaSlotMinutes;

    const startingAppointment = agendaAppointments.find(
      (appointment) => timeToMinutes(appointment.appointment_time) === slotStart
    );

    if (startingAppointment) {
      return {
        type: "appointment-start" as const,
        appointment: startingAppointment,
        blockedTime: null
      };
    }

    const continuingAppointment = agendaAppointments.find((appointment) => {
      const appointmentStart = timeToMinutes(appointment.appointment_time);
      const appointmentEnd =
        appointmentStart + (Number(appointment.duration_minutes) || 30);

      return slotStart > appointmentStart && slotStart < appointmentEnd;
    });

    if (continuingAppointment) {
      return {
        type: "appointment-continuation" as const,
        appointment: continuingAppointment,
        blockedTime: null
      };
    }

    const blockedTime = agendaBlockedTimes.find((block) => {
      if (block.is_full_day || !block.start_time || !block.end_time) {
        return false;
      }

      return slotStart < timeToMinutes(block.end_time) &&
        slotEnd > timeToMinutes(block.start_time);
    });

    if (blockedTime) {
      return {
        type: "blocked" as const,
        appointment: null,
        blockedTime
      };
    }

    return {
      type: "free" as const,
      appointment: null,
      blockedTime: null
    };
  }

  function changeAgendaCalendarMonth(monthsToAdd: number) {
    setAgendaCalendarMonth((currentMonth) => {
      const nextMonth = new Date(currentMonth);
      nextMonth.setMonth(currentMonth.getMonth() + monthsToAdd);

      return new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1);
    });
  }

  function selectAgendaCalendarDay(dayValue: string) {
    const nextDate = new Date(`${dayValue}T00:00:00`);

    setAgendaDate(dayValue);
    setAgendaCalendarMonth(
      new Date(nextDate.getFullYear(), nextDate.getMonth(), 1)
    );
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

  if (isCheckingAdmin) {
    return (
      <main className="min-h-screen bg-barber-black px-5 py-6 text-barber-cream">
        <section className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-md flex-col justify-center rounded-[2rem] border border-white/10 bg-gradient-to-b from-barber-gray to-barber-black p-6 text-center shadow-2xl shadow-black/50">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-barber-gold">
            BARBERFLOW
          </p>
          <h1 className="mt-6 text-3xl font-bold text-white">
            Comprobando permisos...
          </h1>
        </section>
      </main>
    );
  }

  if (panelAccessDenied) {
    return (
      <main className="min-h-screen bg-barber-black px-5 py-6 text-barber-cream">
        <section className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-md flex-col justify-center rounded-[2rem] border border-white/10 bg-gradient-to-b from-barber-gray to-barber-black p-6 shadow-2xl shadow-black/50">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-barber-gold">
            BARBERFLOW
          </p>
          <h1 className="mt-6 text-3xl font-bold text-white">
            Acceso restringido
          </h1>
          <p className="mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold leading-6 text-red-100">
            No tienes permiso para acceder al panel del barbero.
          </p>
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

  if (panelBusinessMissing) {
    return (
      <main className="min-h-screen bg-barber-black px-5 py-6 text-barber-cream">
        <section className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-md flex-col justify-center rounded-[2rem] border border-white/10 bg-gradient-to-b from-barber-gray to-barber-black p-6 shadow-2xl shadow-black/50">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-barber-gold">
            BARBERFLOW
          </p>
          <h1 className="mt-6 text-3xl font-bold text-white">
            Área barbero
          </h1>
          <p className="mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold leading-6 text-red-100">
            No tienes ninguna barbería asignada.
          </p>
          <button
            className="mt-4 rounded-2xl border border-red-400/30 px-4 py-3 text-xs font-semibold text-red-100 transition hover:bg-red-400/10"
            onClick={handleLogout}
            type="button"
          >
            Cerrar sesión
          </button>
        </section>
      </main>
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
      <section className="mx-auto flex w-full max-w-md flex-col rounded-[2rem] border border-white/10 bg-gradient-to-b from-barber-gray to-barber-black p-6 shadow-2xl shadow-black/50">
        <header className="mb-8 space-y-5">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-barber-gold">
            BARBERFLOW
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">Panel del barbero</h1>
            </div>
            <div className="flex sm:justify-end">
              <button
                className="rounded-2xl border border-red-400/30 px-4 py-3 text-xs font-semibold text-red-100 transition hover:bg-red-400/10"
                onClick={handleLogout}
                type="button"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </header>

        <section className="order-4 mt-8 border-t border-white/10 pt-6">
          {renderAccordionHeader("manual", "Crear cita manual")}
          {openSections.manual && (
            <div className="mt-4 space-y-4">
              <p className="text-sm leading-6 text-white/65">
                Crea una cita para clientes que llaman, escriben por WhatsApp o
                reservan en persona.
              </p>

              {manualMessage && (
                <p
                  className={
                    manualMessageType === "success"
                      ? "rounded-2xl border border-barber-gold/30 bg-barber-gold/10 p-4 text-sm font-semibold text-barber-gold"
                      : "rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold text-red-100"
                  }
                >
                  {manualMessage}
                </p>
              )}

              <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="grid w-full max-w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-white/60">
                      Nombre del cliente
                    </span>
                    <input
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                      onChange={(event) =>
                        updateManualAppointment("customer_name", event.target.value)
                      }
                      placeholder="Nombre y apellidos"
                      type="text"
                      value={manualAppointment.customer_name}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-white/60">
                      Teléfono del cliente
                    </span>
                    <input
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                      onChange={(event) =>
                        updateManualAppointment("customer_phone", event.target.value)
                      }
                      placeholder="600 000 000"
                      type="tel"
                      value={manualAppointment.customer_phone}
                    />
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-white/60">
                      Servicio
                    </span>
                    <select
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-barber-gold"
                      onChange={(event) =>
                        updateManualAppointment("service_id", event.target.value)
                      }
                      value={manualAppointment.service_id}
                    >
                      <option className="bg-barber-gray" value="">
                        Elige un servicio
                      </option>
                      {services
                        .filter((service) => service.is_active)
                        .map((service) => (
                          <option
                            className="bg-barber-gray"
                            key={service.id}
                            value={service.id}
                          >
                            {service.name} · {service.duration_minutes} min
                          </option>
                        ))}
                    </select>
                  </label>

                  <label className="block w-full max-w-full min-w-0">
                    <span className="mb-2 block text-xs font-semibold text-white/60">
                      Fecha
                    </span>
                    <input
                      className="block w-full max-w-full min-w-0 box-border rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-barber-gold"
                      min={today}
                      onChange={(event) =>
                        updateManualAppointment(
                          "appointment_date",
                          event.target.value
                        )
                      }
                      type="date"
                      value={manualAppointment.appointment_date}
                    />
                  </label>

                  <div className="block sm:col-span-2">
                    <span className="mb-2 block text-xs font-semibold text-white/60">
                      Hora disponible
                    </span>
                    {isLoadingManualHours ? (
                      <p className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/65">
                        Cargando horas...
                      </p>
                    ) : manualAvailableHours.length === 0 ? (
                      <p className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/65">
                        No hay horas disponibles para ese día.
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                        {manualAvailableHours.map((hour) => {
                          const isSelected =
                            manualAppointment.appointment_time === hour;

                          return (
                            <button
                              className={
                                isSelected
                                  ? "rounded-2xl border border-barber-gold bg-barber-gold px-3 py-3 text-sm font-bold text-black shadow-lg shadow-barber-gold/20 transition active:scale-[0.98]"
                                  : "rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-sm font-bold text-white transition hover:border-barber-gold/60 hover:text-barber-gold active:scale-[0.98]"
                              }
                              key={hour}
                              onClick={() =>
                                setManualAppointment((currentForm) => ({
                                  ...currentForm,
                                  appointment_time: hour
                                }))
                              }
                              type="button"
                            >
                              {formatAppointmentTime(hour)}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <p className="mt-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-white/70">
                      Hora seleccionada:{" "}
                      <span className="text-barber-gold">
                        {manualAppointment.appointment_time
                          ? formatAppointmentTime(manualAppointment.appointment_time)
                          : "ninguna"}
                      </span>
                    </p>
                  </div>
                </div>

                <button
                  className="mt-4 w-full rounded-2xl bg-barber-gold px-5 py-3 text-sm font-bold text-black shadow-lg shadow-barber-gold/20 transition hover:bg-[#e7b65f] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isLoadingManualHours}
                  onClick={createManualAppointment}
                  type="button"
                >
                  Crear cita
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="order-1 mt-8">
          {renderAccordionHeader("dayAgenda", "Agenda")}
          {openSections.dayAgenda && (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <button
                    aria-label="Mes anterior"
                    className="h-11 w-11 rounded-2xl border border-white/10 bg-black/30 text-lg font-bold text-white transition hover:border-barber-gold/50 hover:text-barber-gold active:scale-[0.98]"
                    onClick={() => changeAgendaCalendarMonth(-1)}
                    type="button"
                  >
                    ‹
                  </button>
                  <p className="min-w-0 flex-1 text-center text-base font-bold text-white">
                    {agendaCalendarTitle}
                  </p>
                  <button
                    aria-label="Mes siguiente"
                    className="h-11 w-11 rounded-2xl border border-white/10 bg-black/30 text-lg font-bold text-white transition hover:border-barber-gold/50 hover:text-barber-gold active:scale-[0.98]"
                    onClick={() => changeAgendaCalendarMonth(1)}
                    type="button"
                  >
                    ›
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {calendarWeekDays.map((weekDay) => (
                    <div
                      className="py-2 text-center text-[11px] font-bold uppercase text-white/45"
                      key={weekDay}
                    >
                      {weekDay}
                    </div>
                  ))}

                  {agendaCalendarDays.map((day) => (
                    <button
                      className={
                        day.isSelected
                          ? "min-h-12 rounded-2xl border border-barber-gold bg-barber-gold p-1 text-center text-sm font-bold text-black shadow-lg shadow-barber-gold/20 transition active:scale-[0.98]"
                          : day.isToday
                            ? "min-h-12 rounded-2xl border border-barber-gold/50 bg-black/30 p-1 text-center text-sm font-bold text-barber-gold transition hover:border-barber-gold active:scale-[0.98]"
                            : day.isCurrentMonth
                              ? "min-h-12 rounded-2xl border border-white/10 bg-black/30 p-1 text-center text-sm font-bold text-white transition hover:border-barber-gold/50 active:scale-[0.98]"
                              : "min-h-12 rounded-2xl border border-white/5 bg-black/15 p-1 text-center text-sm font-bold text-white/35 transition hover:border-barber-gold/40 active:scale-[0.98]"
                      }
                      key={day.value}
                      onClick={() => selectAgendaCalendarDay(day.value)}
                      type="button"
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>

              <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-xs font-semibold text-white/60">
                Día seleccionado:{" "}
                <span className="text-barber-gold">{agendaDate}</span>
              </p>

              {agendaMessage && (
                <p
                  className={
                    agendaMessageType === "success"
                      ? "rounded-2xl border border-barber-gold/30 bg-barber-gold/10 p-4 text-sm font-semibold text-barber-gold"
                      : "rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold text-red-100"
                  }
                >
                  {agendaMessage}
                </p>
              )}

              {editingAppointment && (
                <div className="rounded-2xl border border-barber-gold/40 bg-black/40 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-white">
                        Modificar cita
                      </h3>
                      <p className="mt-1 text-xs font-semibold text-white/50">
                        Actualiza los datos y elige una hora disponible.
                      </p>
                    </div>
                    <button
                      className="rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-white/65 transition hover:border-barber-gold/50 hover:text-barber-gold"
                      onClick={() => {
                        setEditingAppointment(null);
                        setEditAvailableHours([]);
                      }}
                      type="button"
                    >
                      Cerrar
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold text-white/60">
                        Nombre del cliente
                      </span>
                      <input
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                        onChange={(event) =>
                          updateEditingAppointment(
                            "customer_name",
                            event.target.value
                          )
                        }
                        type="text"
                        value={editingAppointment.customer_name}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold text-white/60">
                        Teléfono
                      </span>
                      <input
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                        onChange={(event) =>
                          updateEditingAppointment(
                            "customer_phone",
                            event.target.value
                          )
                        }
                        type="tel"
                        value={editingAppointment.customer_phone}
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-xs font-semibold text-white/60">
                        Servicio
                      </span>
                      <select
                        className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-barber-gold"
                        onChange={(event) =>
                          updateEditingAppointment("service_id", event.target.value)
                        }
                        value={editingAppointment.service_id}
                      >
                        <option className="bg-barber-gray" value="">
                          Elige un servicio
                        </option>
                        {services.map((service) => (
                          <option
                            className="bg-barber-gray"
                            key={service.id}
                            value={service.id}
                          >
                            {service.name} · {service.duration_minutes} min
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block min-w-0">
                      <span className="mb-2 block text-xs font-semibold text-white/60">
                        Fecha
                      </span>
                      <input
                        className="box-border w-full max-w-full min-w-0 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-barber-gold"
                        min={today}
                        onChange={(event) =>
                          updateEditingAppointment(
                            "appointment_date",
                            event.target.value
                          )
                        }
                        type="date"
                        value={editingAppointment.appointment_date}
                      />
                    </label>

                    <div className="sm:col-span-2">
                      <span className="mb-2 block text-xs font-semibold text-white/60">
                        Hora
                      </span>
                      {isLoadingEditHours ? (
                        <p className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/65">
                          Cargando horas...
                        </p>
                      ) : editAvailableHours.length === 0 ? (
                        <p className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/65">
                          No hay horas disponibles para ese día.
                        </p>
                      ) : (
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                          {editAvailableHours.map((hour) => {
                            const isSelected =
                              editingAppointment.appointment_time === hour;

                            return (
                              <button
                                className={
                                  isSelected
                                    ? "rounded-2xl border border-barber-gold bg-barber-gold px-3 py-3 text-sm font-bold text-black shadow-lg shadow-barber-gold/20 transition active:scale-[0.98]"
                                    : "rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-sm font-bold text-white transition hover:border-barber-gold/60 hover:text-barber-gold active:scale-[0.98]"
                                }
                                key={hour}
                                onClick={() =>
                                  updateEditingAppointment(
                                    "appointment_time",
                                    hour
                                  )
                                }
                                type="button"
                              >
                                {formatAppointmentTime(hour)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      className="rounded-2xl border border-white/10 px-4 py-3 text-xs font-semibold text-white/70 transition hover:border-barber-gold/50 hover:text-barber-gold active:scale-[0.98]"
                      onClick={() => {
                        setEditingAppointment(null);
                        setEditAvailableHours([]);
                      }}
                      type="button"
                    >
                      Cancelar
                    </button>
                    <button
                      className="rounded-2xl bg-barber-gold px-4 py-3 text-xs font-bold text-black shadow-lg shadow-barber-gold/20 transition hover:bg-[#e7b65f] active:scale-[0.98]"
                      onClick={saveEditedAppointment}
                      type="button"
                    >
                      Guardar cambios
                    </button>
                  </div>
                </div>
              )}

              {isLoading || isLoadingSchedule || isLoadingBlockedTimes ? (
                <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
                  Cargando agenda...
                </p>
              ) : isAgendaFullDayBlocked ? (
                <p className="rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold text-red-100">
                  Este día está bloqueado completo.
                </p>
              ) : isAgendaClosed ? (
                <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
                  Este día no hay horario de trabajo.
                </p>
              ) : agendaSlots.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
                  No hay tramos horarios configurados para este día.
                </p>
              ) : (
                <div className="space-y-2">
                  {agendaSlots.map((hour) => {
                    const slotInfo = getAgendaSlotInfo(hour);
                    const appointment = slotInfo.appointment;
                    const blockedTime = slotInfo.blockedTime;

                    return (
                      <article
                        className={
                          slotInfo.type === "appointment-start"
                            ? getAgendaAppointmentClass(
                                appointment?.appointment_status ?? "pending"
                              )
                            : slotInfo.type === "appointment-continuation"
                              ? getAgendaContinuationClass(
                                  appointment?.appointment_status ?? "pending"
                                )
                              : slotInfo.type === "blocked"
                                ? "grid grid-cols-[64px_1fr] gap-3 rounded-2xl border border-red-400/35 bg-red-400/10 p-3"
                                : "grid grid-cols-[64px_1fr] gap-3 rounded-2xl border border-white/10 bg-black/20 p-3"
                        }
                        key={hour}
                      >
                        <p className="text-sm font-bold text-white/70">
                          {formatAppointmentTime(hour)}
                        </p>

                        {slotInfo.type === "appointment-start" && appointment && (
                          <div>
                            <p className="font-bold text-white">
                              {formatAppointmentTime(appointment.appointment_time)} -{" "}
                              {appointment.customer_name}
                            </p>
                            <p className="mt-1 text-sm text-white/72">
                              {appointment.service} · {appointment.duration_minutes} min
                            </p>
                            <p className="mt-1 text-xs font-semibold text-white/55">
                              Tel: {appointment.customer_phone}
                            </p>
                            <p className="mt-2 text-xs font-bold uppercase tracking-[0.12em] text-white/50">
                              Estado:{" "}
                              <span className="text-barber-gold">
                                {
                                  appointmentStatusLabels[
                                    appointment.appointment_status
                                  ]
                                }
                              </span>
                            </p>
                            <div className="mt-3 grid grid-cols-3 gap-2">
                              <button
                                className="rounded-full border border-barber-gold/50 px-3 py-2 text-xs font-semibold text-barber-gold transition hover:bg-barber-gold/10 active:scale-[0.98]"
                                onClick={() => openEditAppointment(appointment)}
                                type="button"
                              >
                                Modificar
                              </button>
                              <button
                                className="rounded-full border border-red-400/45 px-3 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-400/10 active:scale-[0.98]"
                                onClick={() => deleteAgendaAppointment(appointment.id)}
                                type="button"
                              >
                                Eliminar
                              </button>
                              <button
                                className="rounded-full border border-green-400/45 px-3 py-2 text-xs font-semibold text-green-200 transition hover:bg-green-400/10 active:scale-[0.98]"
                                onClick={() => openAppointmentWhatsApp(appointment)}
                                type="button"
                              >
                                WhatsApp
                              </button>
                            </div>
                            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                              {appointmentStatusActions.map((action) => {
                                const isCurrentStatus =
                                  appointment.appointment_status === action.status;

                                return (
                                  <button
                                    className={
                                      isCurrentStatus
                                        ? "rounded-full border border-white/25 bg-white/15 px-3 py-2 text-xs font-bold text-white"
                                        : "rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-white/60 transition hover:border-barber-gold/50 hover:text-barber-gold active:scale-[0.98]"
                                    }
                                    disabled={isCurrentStatus}
                                    key={action.status}
                                    onClick={() =>
                                      updateAppointmentStatus(
                                        appointment.id,
                                        action.status
                                      )
                                    }
                                    type="button"
                                  >
                                    {action.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {slotInfo.type === "appointment-continuation" &&
                          appointment && (
                            <div>
                              <p className="text-sm font-bold text-barber-gold">
                                {appointment.appointment_status === "cancelled"
                                  ? `Cancelada: ${appointment.customer_name}`
                                  : `Ocupado por ${appointment.customer_name}`}
                              </p>
                              <p className="mt-1 text-xs text-white/50">
                                {appointment.service}
                              </p>
                            </div>
                          )}

                        {slotInfo.type === "blocked" && blockedTime && (
                          <div>
                            <p className="text-sm font-bold text-red-100">
                              Bloqueado
                            </p>
                            {blockedTime.reason && (
                              <p className="mt-1 text-xs text-red-100/70">
                                {blockedTime.reason}
                              </p>
                            )}
                          </div>
                        )}

                        {slotInfo.type === "free" && (
                          <p className="text-sm font-semibold text-white/45">
                            Libre
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="order-2 mt-8 border-t border-white/10 pt-6">
          {renderAccordionHeader("reviews", "Reseñas")}
          {openSections.reviews && (
            <div className="mt-4 space-y-5">
              {reviewMessage && (
                <p
                  className={
                    reviewMessageType === "success"
                      ? "rounded-2xl border border-barber-gold/30 bg-barber-gold/10 p-4 text-sm font-semibold text-barber-gold"
                      : "rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold text-red-100"
                  }
                >
                  {reviewMessage}
                </p>
              )}

              {isLoadingReviews ? (
                <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
                  Cargando reseñas...
                </p>
              ) : reviews.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
                  No hay reseñas todavía.
                </p>
              ) : (
                <div className="space-y-3">
                  {reviews.map((review) => (
                    <article
                      className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                      key={review.id}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-center gap-3">
                          {review.customer_avatar_url?.trim() ? (
                            <img
                              alt={review.customer_name}
                              className="h-12 w-12 rounded-full border border-barber-gold/25 object-cover"
                              src={review.customer_avatar_url}
                            />
                          ) : (
                            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-barber-gold/25 bg-barber-gold/10 text-base font-bold text-barber-gold">
                              {getProfileInitial(review.customer_name)}
                            </div>
                          )}
                          <div>
                            <p className="text-base font-bold text-white">
                              {review.customer_name}
                            </p>
                            <p className="mt-1 text-sm font-bold text-barber-gold">
                              {renderStars(review.rating)}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs font-semibold text-white/45">
                          {formatReviewDate(review.created_at)}
                        </p>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-white/70">
                        {review.comment}
                      </p>
                      <button
                        className="mt-4 w-full rounded-full border border-red-400/45 px-3 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-400/10 active:scale-[0.98]"
                        onClick={() => deleteReview(review.id)}
                        type="button"
                      >
                        Eliminar reseña
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="order-3 mt-8 border-t border-white/10 pt-6">
          {renderAccordionHeader("history", "Historial de citas")}
          {openSections.history && (
            <div className="mt-4 space-y-4">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="grid w-full max-w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-white/60">
                      Estado
                    </span>
                    <select
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-barber-gold"
                      onChange={(event) =>
                        setHistoryStatusFilter(
                          event.target.value as HistoryStatusFilter
                        )
                      }
                      value={historyStatusFilter}
                    >
                      <option className="bg-barber-gray" value="all">
                        Todas
                      </option>
                      <option className="bg-barber-gray" value="completed">
                        Realizadas
                      </option>
                      <option className="bg-barber-gray" value="cancelled">
                        Canceladas
                      </option>
                      <option className="bg-barber-gray" value="no_show">
                        No asistió
                      </option>
                      <option className="bg-barber-gray" value="old_pending">
                        Pendientes antiguas
                      </option>
                    </select>
                  </label>

                  <label className="block">
                    <span className="mb-2 block text-xs font-semibold text-white/60">
                      Buscar por cliente
                    </span>
                    <input
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
                      onChange={(event) => setHistorySearch(event.target.value)}
                      placeholder="Nombre o teléfono"
                      type="search"
                      value={historySearch}
                    />
                  </label>

                  <label className="block w-full max-w-full min-w-0">
                    <span className="mb-2 block text-xs font-semibold text-white/60">
                      Fecha desde
                    </span>
                    <input
                      className="block w-full max-w-full min-w-0 box-border rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-barber-gold"
                      onChange={(event) => setHistoryDateFrom(event.target.value)}
                      type="date"
                      value={historyDateFrom}
                    />
                  </label>

                  <label className="block w-full max-w-full min-w-0">
                    <span className="mb-2 block text-xs font-semibold text-white/60">
                      Fecha hasta
                    </span>
                    <input
                      className="block w-full max-w-full min-w-0 box-border rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-barber-gold"
                      onChange={(event) => setHistoryDateTo(event.target.value)}
                      type="date"
                      value={historyDateTo}
                    />
                  </label>
                </div>
                <button
                  className="mt-4 w-full rounded-2xl border border-red-400/45 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100 transition hover:bg-red-400/20 active:scale-[0.98]"
                  onClick={deleteAppointmentHistory}
                  type="button"
                >
                  Eliminar historial
                </button>
              </div>

              {historyMessage && (
                <p
                  className={
                    historyMessageType === "success"
                      ? "rounded-2xl border border-barber-gold/30 bg-barber-gold/10 p-4 text-sm font-semibold text-barber-gold"
                      : "rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold text-red-100"
                  }
                >
                  {historyMessage}
                </p>
              )}

              {isLoadingHistory ? (
                <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
                  Cargando historial...
                </p>
              ) : filteredHistoryAppointments.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65">
                  No hay citas en el historial con estos filtros.
                </p>
              ) : (
                <div className="space-y-3">
                  {filteredHistoryAppointments.map((appointment) => (
                    <article
                      className={getHistoryAppointmentClass(
                        appointment.appointment_status
                      )}
                      key={appointment.id}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-base font-bold text-white">
                            {appointment.customer_name}
                          </p>
                          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-barber-gold">
                            {appointmentStatusLabels[appointment.appointment_status]}
                          </p>
                        </div>
                        <button
                          className="rounded-full border border-green-400/45 px-3 py-2 text-xs font-semibold text-green-200 transition hover:bg-green-400/10 active:scale-[0.98]"
                          onClick={() => openHistoryWhatsApp(appointment)}
                          type="button"
                        >
                          WhatsApp
                        </button>
                      </div>

                      <div className="mt-4 space-y-2 text-sm leading-6 text-white/70">
                        <p>
                          <span className="font-semibold text-white">Teléfono:</span>{" "}
                          {appointment.customer_phone}
                        </p>
                        <p>
                          <span className="font-semibold text-white">Servicio:</span>{" "}
                          {appointment.service}
                        </p>
                        <p>
                          <span className="font-semibold text-white">Fecha:</span>{" "}
                          {appointment.appointment_date} a las{" "}
                          {formatAppointmentTime(appointment.appointment_time)}
                        </p>
                        <p>
                          <span className="font-semibold text-white">Duración:</span>{" "}
                          {appointment.duration_minutes} min
                        </p>
                        {appointment.status_updated_at && (
                          <p>
                            <span className="font-semibold text-white">
                              Estado actualizado:
                            </span>{" "}
                            {new Date(
                              appointment.status_updated_at
                            ).toLocaleString("es-ES")}
                          </p>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="order-3 mt-8 border-t border-white/10 pt-6">
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
        <section className="order-8 mt-8 border-t border-white/10 pt-6">
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

              <div className="rounded-2xl border border-barber-gold/25 bg-barber-gold/10 p-4">
                <p className="text-lg font-bold text-white">
                  Enlace público de reservas
                </p>
                <p className="mt-2 text-sm leading-6 text-white/65">
                  Comparte este enlace con tus clientes para que puedan reservar
                  cita directamente.
                </p>

                <div className="mt-4 space-y-3">
                  <div className="break-all rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-semibold text-white/80">
                    {publicBookingUrl || "Cargando enlace..."}
                  </div>
                  <button
                    className="w-full rounded-2xl bg-barber-gold px-5 py-3 text-sm font-bold text-black shadow-lg shadow-barber-gold/20 transition hover:bg-[#e7b65f] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!publicBookingUrl}
                    onClick={copyPublicBookingLink}
                    type="button"
                  >
                    Copiar enlace
                  </button>
                  {publicBookingLinkMessage && (
                    <p
                      className={
                        publicBookingLinkMessage === "Enlace copiado"
                          ? "text-sm font-semibold text-barber-gold"
                          : "text-sm font-semibold text-red-100"
                      }
                    >
                      {publicBookingLinkMessage}
                    </p>
                  )}
                </div>

                {!isPublicBookingVisible && (
                  <p className="mt-4 rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-3 text-sm font-semibold text-yellow-100">
                    Tu barbería no está visible para reservas públicas.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-lg font-bold text-white">
                  Imagen de la barbería
                </p>
                <p className="mt-2 text-sm leading-6 text-white/65">
                  Sube un logo o foto de perfil para mostrarlo en la página
                  pública de reservas.
                </p>

                <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
                  {currentBusinessProfileImageUrl ? (
                    <img
                      alt={currentBusinessName || businessSettings.business_name}
                      className="h-24 w-24 rounded-full border border-barber-gold/35 object-cover shadow-lg shadow-black/30"
                      src={currentBusinessProfileImageUrl}
                    />
                  ) : (
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border border-barber-gold/35 bg-barber-gold/10 text-4xl font-bold text-barber-gold shadow-lg shadow-black/30">
                      {getBusinessInitial(
                        currentBusinessName || businessSettings.business_name
                      )}
                    </div>
                  )}

                  <div className="w-full space-y-3">
                    <input
                      accept="image/jpeg,image/png,image/webp"
                      className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white file:mr-4 file:rounded-full file:border-0 file:bg-barber-gold file:px-4 file:py-2 file:text-sm file:font-bold file:text-black"
                      onChange={handleBusinessImageFileChange}
                      type="file"
                    />
                    <p className="text-xs leading-5 text-white/45">
                      Formatos permitidos: JPG, PNG o WebP. Tamaño máximo: 3 MB.
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <button
                        className="rounded-2xl bg-barber-gold px-5 py-3 text-sm font-bold text-black shadow-lg shadow-barber-gold/20 transition hover:bg-[#e7b65f] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={!businessImageFile || isUploadingBusinessImage}
                        onClick={uploadBusinessImage}
                        type="button"
                      >
                        {isUploadingBusinessImage ? "Subiendo..." : "Subir imagen"}
                      </button>
                      <button
                        className="rounded-2xl border border-red-400/35 px-5 py-3 text-sm font-bold text-red-100 transition hover:bg-red-400/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={
                          !currentBusinessProfileImageUrl ||
                          isUploadingBusinessImage
                        }
                        onClick={removeBusinessImage}
                        type="button"
                      >
                        Quitar imagen
                      </button>
                    </div>
                    {businessImageMessage && (
                      <p
                        className={
                          businessImageMessageType === "success"
                            ? "text-sm font-semibold text-barber-gold"
                            : "text-sm font-semibold text-red-100"
                        }
                      >
                        {businessImageMessage}
                      </p>
                    )}
                  </div>
                </div>
              </div>

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
                  onClick={() => saveBookingSettings()}
                  type="button"
                >
                  Guardar configuración
                </button>
              </div>
            </div>
          )}
        </section>
        <section className="order-5 mt-8 border-t border-white/10 pt-6">
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
          <p className="order-5 mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold text-red-100">
            {errorMessage}
          </p>
        )}

        <section className="order-7 mt-8 border-t border-white/10 pt-6">
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

          {blockCancelledAppointments.length > 0 && (
            <div className="mt-4 space-y-3">
              {blockCancelledAppointments.map((appointment) => (
                <article
                  className="rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-4"
                  key={appointment.id}
                >
                  <div className="space-y-1 text-sm leading-6 text-white/75">
                    <p className="text-base font-bold text-white">
                      {formatAppointmentTime(appointment.appointment_time)} -{" "}
                      {appointment.customer_name}
                    </p>
                    <p>{appointment.service}</p>
                    <p>Tel: {appointment.customer_phone}</p>
                    <p className="font-semibold text-yellow-100">
                      {appointment.whatsapp_cancel_notified_at
                        ? "Cliente avisado por WhatsApp"
                        : "Pendiente de avisar por WhatsApp"}
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <a
                      className="block rounded-2xl border border-green-400/40 px-4 py-3 text-center text-xs font-semibold text-green-200 transition hover:bg-green-400/10 active:scale-[0.98]"
                      href={createBlockCancellationWhatsAppLink(
                        appointment,
                        businessSettings.block_cancellation_message,
                        businessSettings.business_name ||
                          defaultBusinessSettings.business_name
                      )}
                      onClick={() => markCancellationWhatsAppAsSent(appointment.id)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Enviar WhatsApp
                    </a>
                    <button
                      className="rounded-2xl border border-barber-gold/40 px-4 py-3 text-xs font-semibold text-barber-gold transition hover:bg-barber-gold/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={appointment.whatsapp_cancel_notified_at !== null}
                      onClick={() => markCancellationAsNotified(appointment.id)}
                      type="button"
                    >
                      Marcar como avisado
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <h3 className="text-lg font-bold text-white">
              Cancelaciones pendientes de avisar
            </h3>
            {visiblePendingCancellationNotifications.length === 0 ? (
              <p className="mt-3 text-sm text-white/60">
                No hay clientes pendientes de avisar por WhatsApp.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {visiblePendingCancellationNotifications.map((appointment) => (
                  <article
                    className="rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-4"
                    key={appointment.id}
                  >
                    <div className="space-y-1 text-sm leading-6 text-white/75">
                      <p className="text-base font-bold text-white">
                        {appointment.customer_name}
                      </p>
                      <p>{appointment.customer_phone}</p>
                      <p>{appointment.service}</p>
                      <p>
                        {appointment.appointment_date} ·{" "}
                        {formatAppointmentTime(appointment.appointment_time)}
                      </p>
                      <p className="font-semibold text-yellow-100">
                        Pendiente de avisar por WhatsApp
                      </p>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <a
                        className="block rounded-2xl border border-green-400/40 px-4 py-3 text-center text-xs font-semibold text-green-200 transition hover:bg-green-400/10 active:scale-[0.98]"
                        href={createBlockCancellationWhatsAppLink(
                          appointment,
                          businessSettings.block_cancellation_message,
                          businessSettings.business_name ||
                            defaultBusinessSettings.business_name
                        )}
                        onClick={() => markCancellationWhatsAppAsSent(appointment.id)}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Enviar WhatsApp
                      </a>
                      <button
                        className="rounded-2xl border border-barber-gold/40 px-4 py-3 text-xs font-semibold text-barber-gold transition hover:bg-barber-gold/10 active:scale-[0.98]"
                        onClick={() => markCancellationAsNotified(appointment.id)}
                        type="button"
                      >
                        Marcar como avisado
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="mx-auto w-[240px] max-w-full min-w-0 justify-self-center sm:w-full">
                <label className="mb-2 block text-xs font-semibold text-white/60" htmlFor="block-date">
                  Fecha
                </label>
                <input
                  className="box-border w-full max-w-full min-w-0 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none focus:border-barber-gold"
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

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <h3 className="text-lg font-bold text-white">
              Mensaje de WhatsApp para citas canceladas por bloqueo
            </h3>
            <p className="mt-2 text-sm leading-6 text-white/60">
              Este mensaje se usará para avisar a los clientes cuando una cita se
              cancele automáticamente por un bloqueo.
            </p>
            <textarea
              className="mt-4 min-h-32 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
              onChange={(event) => {
                setBusinessForm((currentForm) => ({
                  ...currentForm,
                  block_cancellation_message: event.target.value
                }));
                setBlockMessage("");
              }}
              value={businessForm.block_cancellation_message}
            />
            <p className="mt-2 text-xs font-semibold leading-5 text-white/45">
              Puedes usar: {"{nombre}"}, {"{fecha}"}, {"{hora}"},{" "}
              {"{servicio}"}, {"{barberia}"}
            </p>
            <button
              className="mt-4 w-full rounded-2xl bg-barber-gold px-5 py-3 text-sm font-bold text-black shadow-lg shadow-barber-gold/20 transition hover:bg-[#e7b65f] active:scale-[0.98]"
              onClick={saveBlockCancellationMessage}
              type="button"
            >
              Guardar mensaje
            </button>
          </div>
            </div>
          )}
        </section>
        <section className="order-6 mt-8 border-t border-white/10 pt-6">
          {renderAccordionHeader("schedule", "Horarios de trabajo")}
          {openSections.schedule && (
            <div className="mt-4 space-y-4">


          {scheduleMessage && (
            <p className="mt-4 rounded-2xl border border-barber-gold/30 bg-barber-gold/10 p-4 text-sm font-semibold text-barber-gold">
              {scheduleMessage}
            </p>
          )}

          {pendingScheduleChange && (
            <div className="mt-4 space-y-3 rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-4">
              <div className="space-y-3">
                {pendingScheduleChange.affectedAppointments.map((appointment) => (
                  <article
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                    key={appointment.id}
                  >
                    <div className="space-y-1 text-sm leading-6 text-white/75">
                      <p className="font-bold text-white">
                        {appointment.appointment_date} ·{" "}
                        {formatAppointmentTime(appointment.appointment_time)}
                      </p>
                      <p>{appointment.customer_name}</p>
                      <p>{appointment.service}</p>
                      <p>Tel: {appointment.customer_phone}</p>
                    </div>
                  </article>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  className="rounded-2xl border border-white/15 px-4 py-3 text-xs font-semibold text-white/75 transition hover:border-white/30 hover:text-white active:scale-[0.98]"
                  onClick={cancelPendingScheduleChange}
                  type="button"
                >
                  Cancelar cambio
                </button>
                <button
                  className="rounded-2xl bg-barber-gold px-4 py-3 text-xs font-bold text-black shadow-lg shadow-barber-gold/20 transition hover:bg-[#e7b65f] active:scale-[0.98]"
                  onClick={confirmPendingScheduleChange}
                  type="button"
                >
                  Guardar horario y cancelar citas afectadas
                </button>
              </div>
            </div>
          )}

          {scheduleCancelledAppointments.length > 0 && (
            <div className="mt-4 space-y-3">
              {scheduleCancelledAppointments.map((appointment) => (
                <article
                  className="rounded-2xl border border-yellow-400/30 bg-yellow-400/10 p-4"
                  key={appointment.id}
                >
                  <div className="space-y-1 text-sm leading-6 text-white/75">
                    <p className="text-base font-bold text-white">
                      {appointment.appointment_date} ·{" "}
                      {formatAppointmentTime(appointment.appointment_time)} -{" "}
                      {appointment.customer_name}
                    </p>
                    <p>{appointment.service}</p>
                    <p>Tel: {appointment.customer_phone}</p>
                  </div>
                  <a
                    className="mt-3 block rounded-2xl border border-green-400/40 px-4 py-3 text-center text-xs font-semibold text-green-200 transition hover:bg-green-400/10 active:scale-[0.98]"
                    href={createScheduleChangeCancellationWhatsAppLink(
                      appointment,
                      hasCustomBlockCancellationMessage
                        ? businessSettings.block_cancellation_message
                        : defaultScheduleChangeCancellationMessage,
                      businessSettings.business_name ||
                        defaultBusinessSettings.business_name
                    )}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Avisar por WhatsApp
                  </a>
                </article>
              ))}
            </div>
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


















