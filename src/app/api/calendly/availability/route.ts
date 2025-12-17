import { NextRequest, NextResponse } from "next/server";

const APPOINTMENT_TYPE_CONFIG = {
  consultation: { durationMinutes: 30, label: "General Consultation" },
  followup: { durationMinutes: 15, label: "Follow-up" },
  physical: { durationMinutes: 45, label: "Physical Exam" },
  specialist: { durationMinutes: 60, label: "Specialist Consultation" },
} as const;

type AppointmentType = keyof typeof APPOINTMENT_TYPE_CONFIG;

type Slot = {
  start_time: string;
  end_time: string;
  available: boolean;
};

function isValidDate(value: string) {
  // Basic YYYY-MM-DD validation
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function generateSlots(date: string, appointmentType: AppointmentType): Slot[] {
  const { durationMinutes } = APPOINTMENT_TYPE_CONFIG[appointmentType];

  const startHour = 9;
  const endHour = 17;

  const totalMinutes = (endHour - startHour) * 60;
  const slotCount = Math.floor(totalMinutes / durationMinutes);

  const slots: Slot[] = [];

  for (let i = 0; i < slotCount; i += 1) {
    const minutesFromStart = i * durationMinutes;
    const startMinutes = startHour * 60 + minutesFromStart;
    const endMinutes = startMinutes + durationMinutes;

    const startTime = `${String(Math.floor(startMinutes / 60)).padStart(
      2,
      "0",
    )}:${String(startMinutes % 60).padStart(2, "0")}`;
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(
      2,
      "0",
    )}:${String(endMinutes % 60).padStart(2, "0")}`;

    // Deterministic "random" availability based on hash of date + type + index
    const hashSource = `${date}-${appointmentType}-${i}`;
    let hash = 0;
    for (let j = 0; j < hashSource.length; j += 1) {
      hash = (hash * 31 + hashSource.charCodeAt(j)) >>> 0;
    }

    const available = hash % 3 !== 0; // Around 2/3 of slots available

    slots.push({
      start_time: startTime,
      end_time: endTime,
      available,
    });
  }

  return slots;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const appointmentType = searchParams.get(
    "appointment_type",
  ) as AppointmentType | null;

  if (!date || !appointmentType) {
    return NextResponse.json(
      {
        error: "Missing required parameters: date and appointment_type",
      },
      { status: 400 },
    );
  }

  if (!isValidDate(date)) {
    return NextResponse.json(
      { error: "Invalid date format. Expected YYYY-MM-DD." },
      { status: 400 },
    );
  }

  if (!Object.hasOwn(APPOINTMENT_TYPE_CONFIG, appointmentType)) {
    return NextResponse.json(
      {
        error:
          "Invalid appointment_type. Expected one of: consultation, followup, physical, specialist.",
      },
      { status: 400 },
    );
  }

  const availableSlots = generateSlots(date, appointmentType);

  return NextResponse.json({
    date,
    appointment_type: appointmentType,
    available_slots: availableSlots,
  });
}


