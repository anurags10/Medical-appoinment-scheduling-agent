import { NextRequest, NextResponse } from "next/server";

type RescheduleRequestBody = {
  booking_id: string;
  date: string; // YYYY-MM-DD
  start_time: string; // HH:mm
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
    | RescheduleRequestBody
    | null;

  if (!body) {
    return NextResponse.json(
      { error: "Invalid JSON in request body." },
      { status: 400 },
    );
  }

  const { booking_id, date, start_time } = body;

  if (!booking_id || !date || !start_time) {
    return NextResponse.json(
      {
        error:
          "Missing required fields. Required: booking_id, date, start_time.",
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

  // Mock reschedule logic – in a real integration this would call Calendly APIs.
  const newBookingId = `APPT-${date.replace(/-/g, "")}-${start_time.replace(
    ":",
    "",
  )}`;

  return NextResponse.json({
    booking_id: newBookingId,
    status: "rescheduled",
    previous_booking_id: booking_id,
    date,
    start_time,
  });
}


