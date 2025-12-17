import { NextRequest, NextResponse } from "next/server";

type Patient = {
  name: string;
  email: string;
  phone: string;
};

type BookRequestBody = {
  appointment_type: "consultation" | "followup" | "physical" | "specialist";
  date: string; // YYYY-MM-DD
  start_time: string; // HH:mm
  patient: Patient;
  reason?: string;
};

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | BookRequestBody
    | null;

  if (!body) {
    return NextResponse.json(
      { error: "Invalid JSON in request body." },
      { status: 400 },
    );
  }

  const { appointment_type, date, start_time, patient, reason } = body;

  if (
    !appointment_type ||
    !date ||
    !start_time ||
    !patient?.name ||
    !patient?.email ||
    !patient?.phone
  ) {
    return NextResponse.json(
      {
        error:
          "Missing required fields. Required: appointment_type, date, start_time, patient (name, email, phone).",
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

  if (!isValidTime(start_time)) {
    return NextResponse.json(
      { error: "Invalid start_time format. Expected HH:mm." },
      { status: 400 },
    );
  }

  if (
    !["consultation", "followup", "physical", "specialist"].includes(
      appointment_type,
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid appointment_type. Expected one of: consultation, followup, physical, specialist.",
      },
      { status: 400 },
    );
  }

  // Mock booking logic – in a real integration this would call Calendly APIs.
  const bookingId = `APPT-${date.replace(/-/g, "")}-${start_time.replace(
    ":",
    "",
  )}`;
  const confirmationCode = `CONF-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;

  return NextResponse.json({
    booking_id: bookingId,
    status: "confirmed",
    confirmation_code: confirmationCode,
    appointment_type,
    date,
    start_time,
    patient,
    reason: reason ?? null,
  });
}


