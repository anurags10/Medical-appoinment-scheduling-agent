import { NextRequest, NextResponse } from "next/server";

type CancelRequestBody = {
  booking_id: string;
  reason?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | CancelRequestBody
    | null;

  if (!body) {
    return NextResponse.json(
      { error: "Invalid JSON in request body." },
      { status: 400 },
    );
  }

  const { booking_id, reason } = body;

  if (!booking_id) {
    return NextResponse.json(
      { error: "Missing required field: booking_id." },
      { status: 400 },
    );
  }

  // Mock cancellation logic – in a real integration this would call Calendly APIs.
  return NextResponse.json({
    booking_id,
    status: "cancelled",
    reason: reason ?? null,
  });
}


