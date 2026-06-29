"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type BookingForm = {
  service: string;
  day: string;
  hour: string;
  customerName: string;
  customerPhone: string;
};

type FormMessage = {
  text: string;
  type: "success" | "error";
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

type WorkingHourFromSupabase = Omit<WorkingHour, "day_of_week" | "is_working" | "slot_minutes"> & {
  day_of_week: number | string;
  is_working: boolean | string;
  slot_minutes: number | string | null;
};

type Service = {
  id: string;
  name: string;
  price: number;
  duration_minutes: number;
  is_active: boolean;
};

type ExistingAppointment = {
  appointment_time: string;
  duration_minutes: number | null;
};

type BlockedTime = {
  id: string;
  block_date: string;
  is_full_day: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
};

type BusinessSettings = {
  business_name: string;
  slogan: string;
  whatsapp_phone: string;
  whatsapp_message: string;
  instagram_url: string;
  address: string;
  main_button_text: string;
};

type DayOption = {
  value: string;
  label: string;
  dateText: string;
  dayOfWeek: number;
  workingHour?: WorkingHour;
};

type PushReminderAppointment = {
  id: string;
  customerPhone: string;
};


const mainBarber = "Pablo";

const weekDays = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado"
];

const months = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic"
];

const defaultBusinessSettings: BusinessSettings = {
  business_name: "Pablo's Barbershop",
  slogan: "Reserva tu corte en menos de 30 segundos",
  whatsapp_phone: "34675070848",
  whatsapp_message: "Hola, quiero reservar una cita en Pablo's Barbershop.",
  instagram_url: "https://www.instagram.com/peluqueria_pablos?igsh=MWdrbXhoY3Rvbmp2Mw==",
  address: "Calle San Francisco,13, 21800, Moguer (Huelva)",
  main_button_text: "Reservar cita"
};

const initialForm: BookingForm = {
  service: "",
  day: "",
  hour: "",
  customerName: "",
  customerPhone: ""
};

function hasEmptyFields(form: BookingForm) {
  return Object.values(form).some((value) => value.trim() === "");
}

function isDuplicateError(code?: string) {
  return code === "23505";
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("es-ES", {
    maximumFractionDigits: 2
  }).format(price);
}

function formatServiceText(service: Service) {
  return `${service.name} · ${formatPrice(service.price)} €`;
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

function timeToMinutes(time: string) {
  const [hours, minutes] = formatAppointmentTime(time).split(":").map(Number);
  return hours * 60 + minutes;
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

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
}

function getAvailableHours(workingHour?: WorkingHour) {
  if (!workingHour || !workingHour.is_working) {
    return [];
  }

  const slotMinutes = workingHour.slot_minutes || 30;

  return [
    ...generateSlots(workingHour.morning_start, workingHour.morning_end, slotMinutes),
    ...generateSlots(
      workingHour.afternoon_start,
      workingHour.afternoon_end,
      slotMinutes
    )
  ];
}

function normalizeWorkingHour(workingHour: WorkingHourFromSupabase): WorkingHour {
  return {
    ...workingHour,
    day_of_week: Number(workingHour.day_of_week),
    is_working:
      workingHour.is_working === true || workingHour.is_working === "true",
    slot_minutes: Number(workingHour.slot_minutes) || 30
  };
}

function getWorkingHoursForDate(date: Date, workingHours: WorkingHour[]) {
  const dayOfWeek = date.getDay();

  return workingHours.find(
    (workingHour) => Number(workingHour.day_of_week) === dayOfWeek
  );
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

function getOccupiedHours(
  hours: string[],
  existingAppointments: ExistingAppointment[],
  durationMinutes: number
) {
  return hours.filter((hour) =>
    appointmentOverlaps(hour, durationMinutes, existingAppointments)
  );
}

function getBlockedHours(
  hours: string[],
  blockedTimes: BlockedTime[],
  durationMinutes: number
) {
  return hours.filter((hour) => blockOverlaps(hour, durationMinutes, blockedTimes));
}

function getNextThirtyThreeDays(workingHours: WorkingHour[]) {
  const today = new Date();

  return Array.from({ length: 33 }, (_, index): DayOption => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);

    let label = weekDays[date.getDay()];

    if (index === 0) {
      label = "Hoy";
    }

    if (index === 1) {
      label = "Mañana";
    }

    return {
      value: formatDateForSupabase(date),
      label,
      dateText: `${date.getDate()} ${months[date.getMonth()]}`,
      dayOfWeek: date.getDay(),
      workingHour: getWorkingHoursForDate(date, workingHours)
    };
  });
}

export default function Home() {
  const [formMessage, setFormMessage] = useState<FormMessage | null>(null);
  const [formData, setFormData] = useState<BookingForm>(initialForm);
  const [services, setServices] = useState<Service[]>([]);
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings>(
    defaultBusinessSettings
  );
  const [workingHours, setWorkingHours] = useState<WorkingHour[]>([]);
  const [availableHours, setAvailableHours] = useState<string[]>([]);
  const [dayAppointments, setDayAppointments] = useState<ExistingAppointment[]>([]);
  const [blockedTimes, setBlockedTimes] = useState<BlockedTime[]>([]);
  const [dayBlockedTimes, setDayBlockedTimes] = useState<BlockedTime[]>([]);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);
  const [isLoadingServices, setIsLoadingServices] = useState(true);
  const [isLoadingHours, setIsLoadingHours] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState("");
  const [lastAppointment, setLastAppointment] =
    useState<PushReminderAppointment | null>(null);
  const [pushMessage, setPushMessage] = useState<FormMessage | null>(null);
  const [isActivatingPush, setIsActivatingPush] = useState(false);
  const [currentTimeInfo, setCurrentTimeInfo] = useState(getCurrentTimeInfo);

  const secondaryLinks = [
    {
      label: "WhatsApp",
      href: `https://wa.me/${businessSettings.whatsapp_phone}?text=${encodeURIComponent(
        businessSettings.whatsapp_message
      )}`
    },
    {
      label: "Instagram",
      href: businessSettings.instagram_url
    },
    {
      label: "Cómo llegar",
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        businessSettings.address
      )}`
    }
  ];

  const dayOptions = getNextThirtyThreeDays(workingHours);
  const selectedDay = dayOptions.find((day) => day.value === formData.day);
  const selectedService = services.find(
    (service) => formatServiceText(service) === formData.service
  );
  const selectedServiceDuration = selectedService?.duration_minutes ?? 30;
  const occupiedHours = getOccupiedHours(
    availableHours,
    dayAppointments,
    selectedServiceDuration
  );
  const blockedHours = getBlockedHours(
    availableHours,
    dayBlockedTimes,
    selectedServiceDuration
  );
  const pastHours = getPastHours(
    availableHours,
    formData.day,
    currentTimeInfo.today,
    currentTimeInfo.minutes
  );
  const unavailableHours = Array.from(
    new Set([...occupiedHours, ...blockedHours, ...pastHours])
  );
  const isSelectedDayFullyBlocked = dayBlockedTimes.some(
    (blockedTime) => blockedTime.is_full_day
  );
  const allHoursOccupied =
    formData.day !== "" &&
    availableHours.length > 0 &&
    availableHours.every((hour) => unavailableHours.includes(hour));
  const isClosedSelectedDay =
    formData.day !== "" &&
    (selectedDay?.workingHour?.is_working === false || isSelectedDayFullyBlocked);
  const hasNoHoursForOpenDay =
    formData.day !== "" &&
    selectedDay?.workingHour?.is_working === true &&
    availableHours.length === 0;

  useEffect(() => {
    loadBusinessSettings();
    loadServices();
    loadWorkingHours();
    loadBlockedTimes();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTimeInfo(getCurrentTimeInfo());
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (
      formData.day !== "" &&
      blockedTimes.some(
        (blockedTime) =>
          blockedTime.block_date === formData.day && blockedTime.is_full_day
      )
    ) {
      setAvailableHours([]);
      setDayAppointments([]);
      setDayBlockedTimes([]);
      setFormData((currentForm) => ({ ...currentForm, day: "", hour: "" }));
      setFormMessage({
        text: "Este día está bloqueado.",
        type: "error"
      });
      return;
    }

    if (formData.day === "" || availableHours.length === 0) {
      return;
    }

    const nextOccupiedHours = getOccupiedHours(
      availableHours,
      dayAppointments,
      selectedServiceDuration
    );
    const nextBlockedHours = getBlockedHours(
      availableHours,
      dayBlockedTimes,
      selectedServiceDuration
    );
    const nextPastHours = getPastHours(
      availableHours,
      formData.day,
      currentTimeInfo.today,
      currentTimeInfo.minutes
    );
    const nextUnavailableHours = Array.from(
      new Set([...nextOccupiedHours, ...nextBlockedHours, ...nextPastHours])
    );

    if (formData.hour !== "" && nextUnavailableHours.includes(formData.hour)) {
      setFormData((currentForm) => ({
        ...currentForm,
        hour: ""
      }));
    }
  }, [formData.service, formData.day, formData.hour, availableHours, dayAppointments, dayBlockedTimes, blockedTimes, selectedServiceDuration, currentTimeInfo]);

  async function loadBusinessSettings() {
    const { data, error } = await supabase
      .from("business_settings")
      .select(
        "business_name, slogan, whatsapp_phone, whatsapp_message, instagram_url, address, main_button_text"
      )
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      setBusinessSettings(defaultBusinessSettings);
      return;
    }

    setBusinessSettings({
      business_name: data.business_name || defaultBusinessSettings.business_name,
      slogan: data.slogan || defaultBusinessSettings.slogan,
      whatsapp_phone: data.whatsapp_phone || defaultBusinessSettings.whatsapp_phone,
      whatsapp_message:
        data.whatsapp_message || defaultBusinessSettings.whatsapp_message,
      instagram_url: data.instagram_url || defaultBusinessSettings.instagram_url,
      address: data.address || defaultBusinessSettings.address,
      main_button_text:
        data.main_button_text || defaultBusinessSettings.main_button_text
    });
  }
  async function loadServices() {
    setIsLoadingServices(true);

    const { data, error } = await supabase
      .from("services")
      .select("id, name, price, duration_minutes, is_active")
      .eq("is_active", true)
      .order("name", { ascending: true });

    setIsLoadingServices(false);

    if (error) {
      setFormMessage({
        text: "No se pudieron cargar los servicios. Inténtalo de nuevo.",
        type: "error"
      });
      return;
    }

    const activeServices = (data ?? []) as Service[];
    setServices(activeServices);
    setFormData((currentForm) => ({
      ...currentForm,
      service: currentForm.service || (activeServices[0] ? formatServiceText(activeServices[0]) : "")
    }));
  }

  async function loadBlockedTimes() {
    const today = new Date();
    const lastDay = new Date(today);
    lastDay.setDate(today.getDate() + 32);

    const { data, error } = await supabase
      .from("blocked_times")
      .select("id, block_date, is_full_day, start_time, end_time, reason")
      .gte("block_date", formatDateForSupabase(today))
      .lte("block_date", formatDateForSupabase(lastDay))
      .order("block_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) {
      setFormMessage({
        text: "No se pudieron cargar los bloqueos de horario.",
        type: "error"
      });
      return;
    }

    setBlockedTimes((data ?? []) as BlockedTime[]);
  }

  async function loadWorkingHours() {
    setIsLoadingSchedule(true);

    const { data, error } = await supabase
      .from("working_hours")
      .select(
        "id, day_of_week, day_name, is_working, morning_start, morning_end, afternoon_start, afternoon_end, slot_minutes"
      )
      .order("day_of_week", { ascending: true });

    setIsLoadingSchedule(false);

    if (error) {
      setWorkingHours([]);
      setScheduleError("No se pudieron cargar los horarios de trabajo.");
      setFormMessage({
        text: "No se pudieron cargar los horarios de trabajo.",
        type: "error"
      });
      return;
    }

    const nextWorkingHours = ((data ?? []) as WorkingHourFromSupabase[])
      .map(normalizeWorkingHour)
      .filter((workingHour) => !Number.isNaN(workingHour.day_of_week));

    if (nextWorkingHours.length === 0) {
      setWorkingHours([]);
      setScheduleError("No se pudieron cargar los horarios de trabajo.");
      setFormMessage({
        text: "No se pudieron cargar los horarios de trabajo.",
        type: "error"
      });
      return;
    }

    setScheduleError("");
    setWorkingHours(nextWorkingHours);
  }

  function updateField(field: keyof BookingForm, value: string) {
    if (
      field === "hour" &&
      isPastHourForToday(
        formData.day,
        value,
        currentTimeInfo.today,
        currentTimeInfo.minutes
      )
    ) {
      setFormData({ ...formData, hour: "" });
      setFormMessage({
        text: "No puedes reservar una hora que ya ha pasado.",
        type: "error"
      });
      return;
    }

    setFormData({ ...formData, [field]: value });
    setFormMessage(null);
  }

  async function selectDay(day: DayOption) {
    if (scheduleError) {
      setFormMessage({
        text: "No se pudieron cargar los horarios de trabajo.",
        type: "error"
      });
      return;
    }

    const workingHour = day.workingHour;
    const isBlockedDay = blockedTimes.some(
      (blockedTime) =>
        blockedTime.block_date === day.value && blockedTime.is_full_day
    );

    if (isBlockedDay) {
      setAvailableHours([]);
      setDayAppointments([]);
      setDayBlockedTimes([]);
      setFormData((currentForm) => ({ ...currentForm, day: "", hour: "" }));
      setFormMessage({
        text: "Este día está bloqueado.",
        type: "error"
      });
      return;
    }

    if (!workingHour || !workingHour.is_working) {
      setAvailableHours([]);
      setDayAppointments([]);
      setDayBlockedTimes([]);
      setFormData((currentForm) => ({ ...currentForm, day: "", hour: "" }));
      setFormMessage({
        text: "Este día la barbería está cerrada.",
        type: "error"
      });
      return;
    }

    const nextAvailableHours = getAvailableHours(workingHour);
    setAvailableHours(nextAvailableHours);
    setIsLoadingHours(true);
    setFormMessage(null);

    const [appointmentsResult, blockedTimesResult] = await Promise.all([
      supabase
        .from("appointment_slots")
        .select("appointment_time, duration_minutes")
        .eq("appointment_date", day.value),
      supabase
        .from("blocked_times")
        .select("id, block_date, is_full_day, start_time, end_time, reason")
        .eq("block_date", day.value)
    ]);

    setIsLoadingHours(false);

    if (appointmentsResult.error || blockedTimesResult.error) {
      setDayAppointments([]);
      setDayBlockedTimes([]);
      setFormMessage({
        text: "No se pudieron cargar las horas disponibles. Inténtalo de nuevo.",
        type: "error"
      });
      setFormData((currentForm) => ({ ...currentForm, day: day.value, hour: "" }));
      return;
    }

    const nextDayAppointments = (appointmentsResult.data ?? []) as ExistingAppointment[];
    const nextDayBlockedTimes = (blockedTimesResult.data ?? []) as BlockedTime[];

    if (nextDayBlockedTimes.some((blockedTime) => blockedTime.is_full_day)) {
      setAvailableHours([]);
      setDayAppointments(nextDayAppointments);
      setDayBlockedTimes(nextDayBlockedTimes);
      setFormData((currentForm) => ({ ...currentForm, day: "", hour: "" }));
      setFormMessage({
        text: "Este día está bloqueado.",
        type: "error"
      });
      return;
    }
    const nextOccupiedHours = getOccupiedHours(
      nextAvailableHours,
      nextDayAppointments,
      selectedServiceDuration
    );
    const nextBlockedHours = getBlockedHours(
      nextAvailableHours,
      nextDayBlockedTimes,
      selectedServiceDuration
    );
    const nextTimeInfo = getCurrentTimeInfo();
    const nextPastHours = getPastHours(
      nextAvailableHours,
      day.value,
      nextTimeInfo.today,
      nextTimeInfo.minutes
    );
    setCurrentTimeInfo(nextTimeInfo);
    const nextUnavailableHours = Array.from(
      new Set([...nextOccupiedHours, ...nextBlockedHours, ...nextPastHours])
    );
    const firstAvailableHour = nextAvailableHours.find(
      (hour) => !nextUnavailableHours.includes(hour)
    );

    setDayAppointments(nextDayAppointments);
    setDayBlockedTimes(nextDayBlockedTimes);
    setFormData((currentForm) => ({
      ...currentForm,
      day: day.value,
      hour: firstAvailableHour ?? ""
    }));
  }

  async function confirmBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (hasEmptyFields(formData)) {
      setFormMessage({
        text: "Rellena todos los campos antes de reservar.",
        type: "error"
      });
      return;
    }

    const isAllowedDay = dayOptions.some(
      (dayOption) => dayOption.value === formData.day
    );

    if (!isAllowedDay) {
      setFormMessage({
        text: "Solo puedes reservar dentro de los próximos 33 días.",
        type: "error"
      });
      return;
    }

    if (!selectedDay?.workingHour?.is_working || isSelectedDayFullyBlocked) {
      setFormMessage({
        text: isSelectedDayFullyBlocked
          ? "Este día está bloqueado."
          : "Este día la barbería está cerrada.",
        type: "error"
      });
      return;
    }

    if (!selectedService) {
      setFormMessage({
        text: "Rellena todos los campos antes de reservar.",
        type: "error"
      });
      return;
    }

    const bookingTimeInfo = getCurrentTimeInfo();

    if (
      isPastHourForToday(
        formData.day,
        formData.hour,
        bookingTimeInfo.today,
        bookingTimeInfo.minutes
      )
    ) {
      setCurrentTimeInfo(bookingTimeInfo);
      setFormMessage({
        text: "No puedes reservar una hora que ya ha pasado.",
        type: "error"
      });
      return;
    }

    if (!availableHours.includes(formData.hour)) {
      setFormMessage({
        text: "No hay horas disponibles para este día.",
        type: "error"
      });
      return;
    }

    if (appointmentOverlaps(formData.hour, selectedService.duration_minutes, dayAppointments)) {
      setFormMessage({
        text: "Ese horario se solapa con otra cita. Elige otra hora.",
        type: "error"
      });
      return;
    }

    if (blockOverlaps(formData.hour, selectedService.duration_minutes, dayBlockedTimes)) {
      setFormMessage({
        text: "Ese horario no está disponible. Elige otra hora.",
        type: "error"
      });
      return;
    }

    setIsSaving(true);
    setFormMessage(null);
    setLastAppointment(null);
    setPushMessage(null);

    const [existingAppointmentsResult, blockedTimesResult] = await Promise.all([
      supabase
        .from("appointment_slots")
        .select("appointment_time, duration_minutes")
        .eq("appointment_date", formData.day),
      supabase
        .from("blocked_times")
        .select("id, block_date, is_full_day, start_time, end_time, reason")
        .eq("block_date", formData.day)
    ]);

    if (existingAppointmentsResult.error || blockedTimesResult.error) {
      setIsSaving(false);
      setFormMessage({
        text: "No se pudo comprobar el horario. Inténtalo de nuevo.",
        type: "error"
      });
      return;
    }

    const checkedAppointments =
      (existingAppointmentsResult.data ?? []) as ExistingAppointment[];
    const checkedBlockedTimes = (blockedTimesResult.data ?? []) as BlockedTime[];

    if (checkedBlockedTimes.some((blockedTime) => blockedTime.is_full_day)) {
      setIsSaving(false);
      setFormMessage({
        text: "Este día está bloqueado.",
        type: "error"
      });
      return;
    }

    if (
      appointmentOverlaps(
        formData.hour,
        selectedService.duration_minutes,
        checkedAppointments
      )
    ) {
      setIsSaving(false);
      setFormMessage({
        text: "Ese horario se solapa con otra cita. Elige otra hora.",
        type: "error"
      });
      return;
    }

    if (blockOverlaps(formData.hour, selectedService.duration_minutes, checkedBlockedTimes)) {
      setIsSaving(false);
      setFormMessage({
        text: "Ese horario no está disponible. Elige otra hora.",
        type: "error"
      });
      return;
    }

    const latestTimeInfo = getCurrentTimeInfo();

    if (
      isPastHourForToday(
        formData.day,
        formData.hour,
        latestTimeInfo.today,
        latestTimeInfo.minutes
      )
    ) {
      setIsSaving(false);
      setCurrentTimeInfo(latestTimeInfo);
      setFormMessage({
        text: "No puedes reservar una hora que ya ha pasado.",
        type: "error"
      });
      return;
    }

    const customerPhone = formData.customerPhone.trim();
    const appointmentId = crypto.randomUUID();

    const { error } = await supabase.from("appointments").insert({
      id: appointmentId,
      service: formData.service,
      appointment_date: formData.day,
      appointment_time: formData.hour,
      customer_name: formData.customerName.trim(),
      customer_phone: customerPhone,
      barber_name: mainBarber,
      duration_minutes: selectedService.duration_minutes
    });

    setIsSaving(false);

    if (isDuplicateError(error?.code)) {
      setFormMessage({
        text: "Ese horario se solapa con otra cita. Elige otra hora.",
        type: "error"
      });
      return;
    }

    if (error) {
      console.error("Error al guardar la cita:", error);
      setFormMessage({
        text: "No se pudo guardar la cita. Inténtalo de nuevo.",
        type: "error"
      });
      return;
    }

    const nextDayAppointments = [
      ...dayAppointments,
      {
        appointment_time: formData.hour,
        duration_minutes: selectedService.duration_minutes
      }
    ];
    const nextOccupiedHours = getOccupiedHours(
      availableHours,
      nextDayAppointments,
      selectedService.duration_minutes
    );
    const nextBlockedHours = getBlockedHours(
      availableHours,
      dayBlockedTimes,
      selectedService.duration_minutes
    );
    const nextPastHours = getPastHours(
      availableHours,
      formData.day,
      currentTimeInfo.today,
      currentTimeInfo.minutes
    );
    const nextUnavailableHours = Array.from(
      new Set([...nextOccupiedHours, ...nextBlockedHours, ...nextPastHours])
    );
    setDayAppointments(nextDayAppointments);
    setLastAppointment({
      id: appointmentId,
      customerPhone
    });
    setFormMessage({
      text: "Cita reservada correctamente. Te esperamos en Pablo's Barbershop.",
      type: "success"
    });
    setFormData({
      ...formData,
      hour: availableHours.find((hour) => !nextUnavailableHours.includes(hour)) ?? "",
      customerName: "",
      customerPhone: ""
    });
  }

  async function activatePushReminder() {
    if (!lastAppointment) {
      setPushMessage({
        text: "Primero confirma una reserva para activar el recordatorio.",
        type: "error"
      });
      return;
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

    if (!publicKey) {
      setPushMessage({
        text: "No está configurada la clave pública de notificaciones.",
        type: "error"
      });
      return;
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPushMessage({
        text: "Este navegador no permite notificaciones push.",
        type: "error"
      });
      return;
    }

    setIsActivatingPush(true);
    setPushMessage(null);

    try {
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        setPushMessage({
          text: "No se activó el recordatorio porque no aceptaste las notificaciones.",
          type: "error"
        });
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const currentSubscription = await registration.pushManager.getSubscription();
      const subscription =
        currentSubscription ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey)
        }));

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          appointment_id: lastAppointment.id,
          customer_phone: lastAppointment.customerPhone,
          subscription,
          user_agent: navigator.userAgent
        })
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "No se pudo guardar el recordatorio.");
      }

      setPushMessage({
        text: "Recordatorio activado correctamente.",
        type: "success"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo activar el recordatorio.";

      setPushMessage({
        text: message,
        type: "error"
      });
    } finally {
      setIsActivatingPush(false);
    }
  }

  return (
    <main className="min-h-screen bg-barber-black px-5 py-6 text-barber-cream">
      <section className="mx-auto flex min-h-[calc(100vh-48px)] w-full max-w-md flex-col justify-between rounded-[2rem] border border-white/10 bg-gradient-to-b from-barber-gray to-barber-black p-6 shadow-2xl shadow-black/50">
        <div>
          <div className="mb-8 flex items-center justify-between">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-barber-gold">
              BARBERFLOW
            </p>
            <Link
              className="text-xs font-semibold text-white/40 transition hover:text-barber-gold"
              href="/panel"
            >
              Acceso barbero
            </Link>
          </div>

          <div className="mb-9">
            <h1 className="text-4xl font-bold leading-tight text-white">
              {businessSettings.business_name}
            </h1>
            <p className="mt-4 max-w-xs text-lg leading-7 text-white/72">
              {businessSettings.slogan}
            </p>
          </div>

          <a
            className="mb-8 block w-full rounded-2xl bg-barber-gold px-6 py-4 text-center text-base font-bold text-black shadow-lg shadow-barber-gold/20 transition hover:bg-[#e7b65f] active:scale-[0.98]"
            href="#reserva"
          >
            {businessSettings.main_button_text}
          </a>

          <div className="space-y-5">
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-white/50">
                Servicios
              </h2>
              <div className="space-y-3">
                {isLoadingServices ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/60">
                    Cargando servicios...
                  </div>
                ) : services.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/60">
                    No hay servicios disponibles.
                  </div>
                ) : (
                  services.map((service) => (
                    <div
                      className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3"
                      key={service.id}
                    >
                      <span className="font-medium text-white">{service.name}</span>
                      <span className="font-semibold text-barber-gold">
                        {formatPrice(service.price)} €
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-white/50">
                Horario
              </h2>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-white/75">
                <p>Consulta los días disponibles en el formulario de reserva.</p>
              </div>
            </section>
          </div>
        </div>

        <div className="mt-8 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {secondaryLinks.map((link) => (
              <a
                className="min-h-12 rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-3 text-center text-sm font-semibold text-white transition hover:border-barber-gold/60 hover:text-barber-gold active:scale-[0.98]"
                href={link.href}
                key={link.label}
                rel="noreferrer"
                target="_blank"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </section>

      <section
        className="mx-auto mt-6 w-full max-w-md scroll-mt-6 rounded-[2rem] border border-white/10 bg-barber-gray p-6 shadow-2xl shadow-black/40"
        id="reserva"
      >
        <h2 className="text-2xl font-bold text-white">Reserva tu cita</h2>
        <p className="mt-2 text-sm leading-6 text-white/65">
          Elige servicio, día y hora para preparar tu próxima visita.
        </p>

        <form className="mt-6 space-y-4" noValidate onSubmit={confirmBooking}>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-white/70">
              Servicio
            </span>
            <select
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-barber-gold"
              onChange={(event) => updateField("service", event.target.value)}
              required
              value={formData.service}
            >
              {services.length === 0 ? (
                <option className="bg-barber-gray" value="">
                  No hay servicios disponibles
                </option>
              ) : (
                services.map((service) => {
                  const serviceText = formatServiceText(service);

  return (
                    <option className="bg-barber-gray" key={service.id} value={serviceText}>
                      {serviceText}
                    </option>
                  );
                })
              )}
            </select>
          </label>

          <div>
            <span className="mb-2 block text-sm font-semibold text-white/70">
              Día
            </span>
            <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
              {dayOptions.map((day) => {
                const isSelected = formData.day === day.value;
                const isBlocked = blockedTimes.some(
                  (blockedTime) =>
                    blockedTime.block_date === day.value && blockedTime.is_full_day
                );
                const isClosed =
                  !scheduleError && (!day.workingHour?.is_working || isBlocked);

  return (
                  <button
                    aria-disabled={isClosed || isLoadingSchedule || !!scheduleError}
                    className={
                      isSelected
                        ? "min-w-28 rounded-2xl border border-barber-gold bg-barber-gold px-4 py-3 text-left text-black shadow-lg shadow-barber-gold/20 transition active:scale-[0.98]"
                        : isClosed
                          ? "min-w-28 cursor-not-allowed rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-left text-white/35 transition"
                          : "min-w-28 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-left text-white transition hover:border-barber-gold/50 active:scale-[0.98]"
                    }
                    key={day.value}
                    onClick={() => selectDay(day)}
                    type="button"
                  >
                    <span className="block text-sm font-bold">{day.label}</span>
                    <span
                      className={
                        isSelected
                          ? "mt-1 block text-xs font-semibold text-black/65"
                          : "mt-1 block text-xs font-semibold text-white/55"
                      }
                    >
                      {day.dateText}
                    </span>
                    {isClosed && (
                      <span className="mt-2 block text-xs font-bold text-red-200/80">
                        {isBlocked ? "Bloqueado" : "Cerrado"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {scheduleError && (
              <p className="mt-2 rounded-2xl border border-red-400/30 bg-red-400/10 p-3 text-sm font-semibold text-red-100">
                {scheduleError}
              </p>
            )}
          </div>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-white/70">
              Hora
            </span>
            <select
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-barber-gold disabled:cursor-not-allowed disabled:opacity-60"
              disabled={
                isLoadingSchedule ||
                isLoadingHours ||
                isClosedSelectedDay ||
                hasNoHoursForOpenDay ||
                allHoursOccupied
              }
              onChange={(event) => updateField("hour", event.target.value)}
              required
              value={formData.hour}
            >
              {availableHours.length === 0 ? (
                <option className="bg-barber-gray" value="">
                  Selecciona un día disponible
                </option>
              ) : (
                availableHours.map((hour) => {
                  const isOccupied = occupiedHours.includes(hour);
                  const isBlocked = blockedHours.includes(hour);
                  const isPast = pastHours.includes(hour);
                  const isUnavailable = isOccupied || isBlocked || isPast;

  return (
                    <option
                      className="bg-barber-gray"
                      disabled={isUnavailable}
                      key={hour}
                      value={hour}
                    >
                      {isPast
                        ? `${hour} - Pasada`
                        : isOccupied
                        ? `${hour} - Ocupada`
                        : isBlocked
                          ? `${hour} - No disponible`
                          : hour}
                    </option>
                  );
                })
              )}
            </select>
          </label>

          {(isLoadingSchedule || isLoadingHours) && (
            <p className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white/60">
              Comprobando horas disponibles...
            </p>
          )}

          {isClosedSelectedDay && (
            <p className="rounded-2xl border border-red-400/30 bg-red-400/10 p-3 text-sm font-semibold text-red-100">
              {isSelectedDayFullyBlocked
                ? "Este día está bloqueado."
                : "Este día la barbería está cerrada."}
            </p>
          )}

          {(allHoursOccupied || hasNoHoursForOpenDay) && (
            <p className="rounded-2xl border border-red-400/30 bg-red-400/10 p-3 text-sm font-semibold text-red-100">
              No hay horas disponibles para este día.
            </p>
          )}

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-white/70">
              Nombre del cliente
            </span>
            <input
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
              onChange={(event) => updateField("customerName", event.target.value)}
              placeholder="Tu nombre"
              required
              type="text"
              value={formData.customerName}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-white/70">
              Teléfono del cliente
            </span>
            <input
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-barber-gold"
              onChange={(event) => updateField("customerPhone", event.target.value)}
              placeholder="Tu teléfono"
              required
              type="tel"
              value={formData.customerPhone}
            />
          </label>

          <button
            className="w-full rounded-2xl bg-barber-gold px-6 py-4 text-base font-bold text-black shadow-lg shadow-barber-gold/20 transition hover:bg-[#e7b65f] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={
              isSaving ||
              isLoadingServices ||
              isLoadingSchedule ||
              isLoadingHours ||
              isClosedSelectedDay ||
              hasNoHoursForOpenDay ||
              allHoursOccupied
            }
            type="submit"
          >
            {isSaving ? "Guardando cita..." : "Confirmar reserva"}
          </button>
        </form>

        {formMessage && (
          <div
            className={
              formMessage.type === "success"
                ? "mt-5 rounded-2xl border border-barber-gold/30 bg-barber-gold/10 p-4 text-sm font-semibold leading-6 text-barber-gold"
                : "mt-5 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-semibold leading-6 text-red-100"
            }
          >
            {formMessage.text}
          </div>
        )}

        {lastAppointment && formMessage?.type === "success" && (
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-sm font-semibold leading-6 text-white">
              ¿Quieres recibir un recordatorio en tu móvil el día antes de la cita?
            </p>
            <button
              className="mt-3 w-full rounded-2xl border border-barber-gold/50 bg-barber-gold/10 px-4 py-3 text-sm font-bold text-barber-gold transition hover:bg-barber-gold hover:text-black active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isActivatingPush}
              onClick={activatePushReminder}
              type="button"
            >
              {isActivatingPush ? "Activando..." : "Activar recordatorio"}
            </button>
            {pushMessage && (
              <p
                className={
                  pushMessage.type === "success"
                    ? "mt-3 text-sm font-semibold text-barber-gold"
                    : "mt-3 text-sm font-semibold text-red-100"
                }
              >
                {pushMessage.text}
              </p>
            )}
          </div>
        )}
      </section>
    </main>
  );
}













