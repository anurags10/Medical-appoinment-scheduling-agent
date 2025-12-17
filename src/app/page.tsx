"use client";

import { FormEvent, useMemo, useState } from "react";

type MessageAuthor = "user" | "agent";

type Message = {
  id: string;
  author: MessageAuthor;
  text: string;
};

type AppointmentTypeKey =
  | "consultation"
  | "followup"
  | "physical"
  | "specialist";

type AppointmentTypeConfig = {
  key: AppointmentTypeKey;
  label: string;
  durationMinutes: number;
};

type AvailabilitySlot = {
  start_time: string;
  end_time: string;
  available: boolean;
};

type Intent = "book" | "reschedule" | "cancel";

type ConversationStep =
  | "idle"
  | "askIntent"
  | "askType"
  | "askDate"
  | "fetchingSlots"
  | "selectSlot"
  | "askName"
  | "askEmail"
  | "askPhone"
  | "askReason"
  | "confirmingBooking"
  | "bookingComplete"
  | "askBookingIdForReschedule"
  | "askNewDateForReschedule"
  | "askNewTimeForReschedule"
  | "rescheduling"
  | "rescheduleComplete"
  | "askBookingIdForCancel"
  | "askReasonForCancel"
  | "cancelling"
  | "cancelComplete";

type ConversationState = {
  intent: Intent | null;
  step: ConversationStep;
  appointmentType: AppointmentTypeConfig | null;
  date: string | null;
  slots: AvailabilitySlot[];
  selectedSlot: AvailabilitySlot | null;
  patientName: string | null;
  patientEmail: string | null;
  patientPhone: string | null;
  reason: string | null;
  bookingId: string | null;
};

const APPOINTMENT_TYPES: AppointmentTypeConfig[] = [
  {
    key: "consultation",
    label: "General Consultation",
    durationMinutes: 30,
  },
  {
    key: "followup",
    label: "Follow-up",
    durationMinutes: 15,
  },
  {
    key: "physical",
    label: "Physical Exam",
    durationMinutes: 45,
  },
  {
    key: "specialist",
    label: "Specialist Consultation",
    durationMinutes: 60,
  },
];

function createInitialState(): ConversationState {
  return {
    intent: null,
    step: "askIntent",
    appointmentType: null,
    date: null,
    slots: [],
    selectedSlot: null,
    patientName: null,
    patientEmail: null,
    patientPhone: null,
    reason: null,
    bookingId: null,
  };
}

function detectIntent(input: string): Intent {
  const text = input.toLowerCase();
  if (text.includes("reschedul")) return "reschedule";
  if (text.includes("cancel")) return "cancel";
  return "book";
}

function detectAppointmentType(input: string): AppointmentTypeConfig | null {
  const text = input.toLowerCase();

  if (text.includes("follow") || text.includes("follow-up")) {
    return APPOINTMENT_TYPES.find((t) => t.key === "followup") ?? null;
  }
  if (text.includes("physical")) {
    return APPOINTMENT_TYPES.find((t) => t.key === "physical") ?? null;
  }
  if (text.includes("specialist")) {
    return APPOINTMENT_TYPES.find((t) => t.key === "specialist") ?? null;
  }
  if (
    text.includes("consult") ||
    text.includes("general") ||
    text.includes("checkup") ||
    text.includes("check-up")
  ) {
    return APPOINTMENT_TYPES.find((t) => t.key === "consultation") ?? null;
  }

  return null;
}

function normalizeDateFromInput(input: string): string | null {
  const isoMatch = input.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (isoMatch) {
    return isoMatch[0];
  }

  const text = input.toLowerCase();
  const today = new Date();

  if (text.includes("today")) {
    return today.toISOString().slice(0, 10);
  }

  if (text.includes("tomorrow")) {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    return tomorrow.toISOString().slice(0, 10);
  }

  return null;
}

function parseSlotSelection(
  input: string,
  slots: AvailabilitySlot[],
): AvailabilitySlot | null {
  if (!slots.length) return null;

  const numericMatch = input.trim().match(/^\d+$/);
  if (numericMatch) {
    const index = Number(numericMatch[0]) - 1;
    if (index >= 0 && index < slots.length) {
      return slots[index];
    }
  }

  const timeMatch = input.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
  if (timeMatch) {
    const time = timeMatch[0].padStart(5, "0");
    return (
      slots.find((slot) => slot.start_time === time && slot.available) ?? null
    );
  }

  return null;
}

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function fetchAvailability(
  date: string,
  appointmentType: AppointmentTypeConfig,
): Promise<AvailabilitySlot[]> {
  const params = new URLSearchParams({
    date,
    appointment_type: appointmentType.key,
  });

  const res = await fetch(`/api/calendly/availability?${params.toString()}`);
  if (!res.ok) {
    throw new Error("Failed to fetch availability");
  }

  const data = (await res.json()) as {
    available_slots: AvailabilitySlot[];
  };

  return data.available_slots ?? [];
}

async function bookAppointment(options: {
  appointmentType: AppointmentTypeConfig;
  date: string;
  slot: AvailabilitySlot;
  name: string;
  email: string;
  phone: string;
  reason: string | null;
}) {
  const res = await fetch("/api/calendly/book", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appointment_type: options.appointmentType.key,
      date: options.date,
      start_time: options.slot.start_time,
      patient: {
        name: options.name,
        email: options.email,
        phone: options.phone,
      },
      reason: options.reason,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const message = data?.error ?? "Failed to book appointment.";
    throw new Error(message);
  }

  return res.json() as Promise<{
    booking_id: string;
    status: string;
    confirmation_code: string;
  }>;
}

async function rescheduleAppointment(options: {
  bookingId: string;
  date: string;
  startTime: string;
}) {
  const res = await fetch("/api/calendly/reschedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      booking_id: options.bookingId,
      date: options.date,
      start_time: options.startTime,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const message = data?.error ?? "Failed to reschedule appointment.";
    throw new Error(message);
  }

  return res.json() as Promise<{
    booking_id: string;
    status: string;
    previous_booking_id: string;
  }>;
}

async function cancelAppointment(options: {
  bookingId: string;
  reason: string | null;
}) {
  const res = await fetch("/api/calendly/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      booking_id: options.bookingId,
      reason: options.reason,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const message = data?.error ?? "Failed to cancel appointment.";
    throw new Error(message);
  }

  return res.json() as Promise<{
    booking_id: string;
    status: string;
  }>;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: createId(),
      author: "agent",
      text: "Hi, I’m your scheduling assistant. I can help you book, reschedule, or cancel a medical appointment. What would you like to do?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [state, setState] = useState<ConversationState>(() =>
    createInitialState(),
  );

  const canSend = useMemo(
    () => input.trim().length > 0 && !isBusy,
    [input, isBusy],
  );

  const appendMessage = (message: Message) => {
    setMessages((prev) => [...prev, message]);
  };

  const appendAgentMessage = (text: string) => {
    appendMessage({
      id: createId(),
      author: "agent",
      text,
    });
  };

  const handleBookingFlow = async (userText: string) => {
    let currentState = state;

    if (!currentState.intent) {
      currentState = {
        ...currentState,
        intent: "book",
      };
    }

    if (!currentState.appointmentType) {
      const inferredType = detectAppointmentType(userText);
      if (inferredType) {
        currentState = {
          ...currentState,
          appointmentType: inferredType,
          step: "askDate",
        };
        setState(currentState);
        appendAgentMessage(
          `Great, a ${inferredType.label.toLowerCase()}. On which date would you like to come in? You can write YYYY-MM-DD, “today”, or “tomorrow”.`,
        );
        return;
      }

      currentState = { ...currentState, step: "askType" };
      setState(currentState);
      appendAgentMessage(
        "What type of appointment would you like? I can schedule a General Consultation, Follow-up, Physical Exam, or Specialist Consultation.",
      );
      return;
    }

    if (!currentState.date) {
      const date = normalizeDateFromInput(userText);
      if (!date) {
        appendAgentMessage(
          "I couldn’t understand that date. Please use YYYY-MM-DD, “today”, or “tomorrow”.",
        );
        return;
      }

      currentState = {
        ...currentState,
        date,
        step: "fetchingSlots",
      };
      setState(currentState);

      const appointmentType = currentState.appointmentType;
      if (!appointmentType) {
        appendAgentMessage(
          "I’m missing the appointment type to look up availability. Let’s choose that first.",
        );
        setState({
          ...currentState,
          step: "askType",
        });
        return;
      }

      try {
        setIsBusy(true);
        const slots = await fetchAvailability(date, appointmentType);
        const available = slots.filter((slot) => slot.available).slice(0, 5);

        if (!available.length) {
          appendAgentMessage(
            "I’m sorry, there are no available slots for that date. Try another date.",
          );
          setState({
            ...currentState,
            slots: [],
            step: "askDate",
          });
          return;
        }

        setState({
          ...currentState,
          slots: available,
          step: "selectSlot",
        });

        const optionsText = available
          .map(
            (slot, index) =>
              `${index + 1}) ${slot.start_time}–${slot.end_time}`,
          )
          .join("\n");

        appendAgentMessage(
          `Here are some available times on ${date}:\n${optionsText}\n\nReply with the number of your preferred slot or the start time (e.g. “10:00”).`,
        );
      } catch (error) {
        console.error(error);
        appendAgentMessage(
          "Something went wrong while fetching availability. Please try again in a moment.",
        );
        setState({
          ...currentState,
          step: "askDate",
        });
      } finally {
        setIsBusy(false);
      }

      return;
    }

    if (!currentState.selectedSlot && currentState.slots.length) {
      const slot = parseSlotSelection(userText, currentState.slots);
      if (!slot) {
        appendAgentMessage(
          "I couldn’t match that to one of the suggested times. Please reply with the number or exact start time (e.g. “10:00”).",
        );
        return;
      }

      currentState = {
        ...currentState,
        selectedSlot: slot,
        step: "askName",
      };
      setState(currentState);

      appendAgentMessage(
        `Perfect, I’ll hold ${slot.start_time}–${slot.end_time} on ${currentState.date}. What is your full name?`,
      );
      return;
    }

    if (!currentState.patientName) {
      currentState = {
        ...currentState,
        patientName: userText.trim(),
        step: "askEmail",
      };
      setState(currentState);
      appendAgentMessage("Thanks. What is the best email to send confirmation?");
      return;
    }

    if (!currentState.patientEmail) {
      currentState = {
        ...currentState,
        patientEmail: userText.trim(),
        step: "askPhone",
      };
      setState(currentState);
      appendAgentMessage(
        "Got it. And what phone number can the clinic use if they need to reach you?",
      );
      return;
    }

    if (!currentState.patientPhone) {
      currentState = {
        ...currentState,
        patientPhone: userText.trim(),
        step: "askReason",
      };
      setState(currentState);
      appendAgentMessage(
        "Lastly, what’s the reason for your visit? (A short phrase is fine.)",
      );
      return;
    }

    if (!currentState.reason) {
      currentState = {
        ...currentState,
        reason: userText.trim(),
        step: "confirmingBooking",
      };
      setState(currentState);

      if (
        !currentState.appointmentType ||
        !currentState.date ||
        !currentState.selectedSlot ||
        !currentState.patientName ||
        !currentState.patientEmail ||
        !currentState.patientPhone
      ) {
        appendAgentMessage(
          "I’m missing some information to complete your booking. Let’s start over.",
        );
        setState(createInitialState());
        return;
      }

      try {
        setIsBusy(true);
        const result = await bookAppointment({
          appointmentType: currentState.appointmentType,
          date: currentState.date,
          slot: currentState.selectedSlot,
          name: currentState.patientName,
          email: currentState.patientEmail,
          phone: currentState.patientPhone,
          reason: currentState.reason,
        });

        setState({
          ...currentState,
          bookingId: result.booking_id,
          step: "bookingComplete",
        });

        appendAgentMessage(
          `You’re all set! Your appointment is confirmed.\n\nBooking ID: ${result.booking_id}\nConfirmation code: ${result.confirmation_code}\n\nIf you’d like, you can say “reschedule” or “cancel” followed by your booking ID.`,
        );
      } catch (error) {
        console.error(error);
        appendAgentMessage(
          "Something went wrong while booking your appointment. Please try again or adjust your details.",
        );
        setState({
          ...currentState,
          step: "askDate",
        });
      } finally {
        setIsBusy(false);
      }
    }
  };

  const handleRescheduleFlow = async (userText: string) => {
    let currentState = state;

    if (!currentState.bookingId && currentState.step === "askBookingIdForReschedule") {
      const id = userText.trim();
      if (!id) {
        appendAgentMessage(
          "Please provide the booking ID you’d like to reschedule.",
        );
        return;
      }
      currentState = {
        ...currentState,
        bookingId: id,
        step: "askNewDateForReschedule",
      };
      setState(currentState);
      appendAgentMessage(
        "Got it. What new date would you like? (Use YYYY-MM-DD, “today”, or “tomorrow”.)",
      );
      return;
    }

    if (!currentState.date && currentState.step === "askNewDateForReschedule") {
      const date = normalizeDateFromInput(userText);
      if (!date) {
        appendAgentMessage(
          "I couldn’t understand that date. Please use YYYY-MM-DD, “today”, or “tomorrow”.",
        );
        return;
      }

      currentState = {
        ...currentState,
        date,
        step: "askNewTimeForReschedule",
      };
      setState(currentState);
      appendAgentMessage(
        "What new time would you prefer? Please provide a time like HH:mm (e.g. 10:30).",
      );
      return;
    }

    if (currentState.date && currentState.step === "askNewTimeForReschedule") {
      const timeMatch = userText.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);
      if (!timeMatch) {
        appendAgentMessage(
          "I couldn’t read that time. Please use HH:mm, for example 10:30.",
        );
        return;
      }

      const startTime = timeMatch[0].padStart(5, "0");

      if (!currentState.bookingId || !currentState.date) {
        appendAgentMessage(
          "I’m missing some information to reschedule this appointment. Let’s start over.",
        );
        setState(createInitialState());
        return;
      }

      const bookingId = currentState.bookingId;
      const date = currentState.date;
      if (!bookingId || !date) {
        appendAgentMessage(
          "I’m missing some information to reschedule this appointment. Let’s start over.",
        );
        setState(createInitialState());
        return;
      }

      currentState = { ...currentState, step: "rescheduling" };
      setState(currentState);

      try {
        setIsBusy(true);
        const result = await rescheduleAppointment({
          bookingId,
          date,
          startTime,
        });

        setState({
          ...currentState,
          bookingId: result.booking_id,
          step: "rescheduleComplete",
        });

        appendAgentMessage(
          `Your appointment has been rescheduled.\n\nNew booking ID: ${result.booking_id}\nPrevious booking ID: ${result.previous_booking_id}\nDate: ${currentState.date}\nTime: ${startTime}`,
        );
      } catch (error) {
        console.error(error);
        appendAgentMessage(
          "Something went wrong while rescheduling your appointment. Please try again.",
        );
        setState(createInitialState());
      } finally {
        setIsBusy(false);
      }
    }
  };

  const handleCancelFlow = async (userText: string) => {
    let currentState = state;

    if (!currentState.bookingId && currentState.step === "askBookingIdForCancel") {
      const id = userText.trim();
      if (!id) {
        appendAgentMessage(
          "Please provide the booking ID you’d like to cancel.",
        );
        return;
      }
      currentState = {
        ...currentState,
        bookingId: id,
        step: "askReasonForCancel",
      };
      setState(currentState);
      appendAgentMessage(
        "I can include an optional note with your cancellation. What’s the reason? (You can say “skip” to leave this blank.)",
      );
      return;
    }

    if (currentState.step === "askReasonForCancel") {
      const reason =
        userText.trim().toLowerCase() === "skip" ? null : userText.trim();
      currentState = {
        ...currentState,
        reason,
        step: "cancelling",
      };
      setState(currentState);

      if (!currentState.bookingId) {
        appendAgentMessage(
          "I’m missing the booking ID for this cancellation. Let’s start over.",
        );
        setState(createInitialState());
        return;
      }

      try {
        setIsBusy(true);
        const result = await cancelAppointment({
          bookingId: currentState.bookingId,
          reason,
        });

        setState({
          ...currentState,
          bookingId: result.booking_id,
          step: "cancelComplete",
        });

        appendAgentMessage(
          `Your appointment has been cancelled.\n\nBooking ID: ${result.booking_id}`,
        );
      } catch (error) {
        console.error(error);
        appendAgentMessage(
          "Something went wrong while cancelling your appointment. Please try again.",
        );
        setState(createInitialState());
      } finally {
        setIsBusy(false);
      }
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isBusy) return;

    const userMessage: Message = {
      id: createId(),
      author: "user",
      text: trimmed,
    };

    appendMessage(userMessage);
    setInput("");

    if (state.step === "idle" || state.step === "askIntent") {
      const intent = detectIntent(trimmed);
      const nextState: ConversationState = {
        ...createInitialState(),
        intent,
      };

      if (intent === "book") {
        setState(nextState);
        await handleBookingFlow(trimmed);
        return;
      }

      if (intent === "reschedule") {
        setState({
          ...nextState,
          step: "askBookingIdForReschedule",
        });
        appendAgentMessage(
          "Sure, let’s reschedule. What is your booking ID?",
        );
        return;
      }

      if (intent === "cancel") {
        setState({
          ...nextState,
          step: "askBookingIdForCancel",
        });
        appendAgentMessage("Okay, I can help with that. What is your booking ID?");
        return;
      }
    }

    if (state.intent === "book" || state.step === "askType" || state.step === "askDate") {
      await handleBookingFlow(trimmed);
      return;
    }

    if (
      state.intent === "reschedule" ||
      state.step === "askBookingIdForReschedule" ||
      state.step === "askNewDateForReschedule" ||
      state.step === "askNewTimeForReschedule"
    ) {
      await handleRescheduleFlow(trimmed);
      return;
    }

    if (
      state.intent === "cancel" ||
      state.step === "askBookingIdForCancel" ||
      state.step === "askReasonForCancel"
    ) {
      await handleCancelFlow(trimmed);
      return;
    }

    await handleBookingFlow(trimmed);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-white to-emerald-50 px-4 py-10 font-sans text-zinc-900">
      <main className="flex w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-sky-100 bg-white/90 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-md">
        <header className="flex items-center justify-between border-b border-sky-100 px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-zinc-900">
              Medical Scheduling Assistant
            </h1>
            <p className="text-xs text-zinc-500">
              Book, reschedule, or cancel appointments via Calendly-style APIs.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Available
          </div>
        </header>

        <section className="flex flex-1 flex-col gap-4 bg-gradient-to-b from-white to-sky-50/40 px-4 py-4 sm:px-6 sm:py-6">
          <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl bg-white/80 p-4 shadow-inner">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${
                  message.author === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm sm:px-4 sm:py-2.5 ${
                    message.author === "user"
                      ? "bg-sky-600 text-sky-50"
                      : "bg-zinc-50 text-zinc-800"
                  }`}
                >
                  {message.text}
                </div>
              </div>
            ))}
            {isBusy && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl bg-zinc-50 px-3 py-2 text-xs text-zinc-500 shadow-sm sm:px-4 sm:py-2.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:0.1s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:0.2s]" />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-2xl border border-sky-100 bg-white/80 p-3 shadow-sm sm:p-4">
            <form
              onSubmit={handleSubmit}
              className="flex items-center gap-2 sm:gap-3"
            >
              <input
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask to book, reschedule, or cancel an appointment..."
                className="flex-1 rounded-2xl border border-zinc-200 bg-zinc-50/60 px-3 py-2 text-sm outline-none ring-sky-200 placeholder:text-zinc-400 focus:border-sky-400 focus:bg-white focus:ring-2 sm:px-4 sm:py-2.5"
              />
              <button
                type="submit"
                disabled={!canSend}
                className="inline-flex items-center justify-center rounded-2xl bg-sky-600 px-3 py-2 text-sm font-medium text-sky-50 shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-200 sm:px-4 sm:py-2.5"
              >
                Send
              </button>
            </form>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500 sm:text-xs">
              <p>
                Try:{" "}
                <span className="font-medium text-sky-700">
                  “Book a physical exam next Tuesday morning”
                </span>
              </p>
              <p>Stateless mock integration · Single-doctor · English only</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

