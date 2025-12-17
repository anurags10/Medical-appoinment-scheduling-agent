## Medical Appointment Scheduling Assistant (Calendly-style)

This project is a **stateless conversational medical appointment scheduling assistant** built with **Next.js App Router**, **React**, and **Tailwind CSS**.  
Patients can **book, reschedule, and cancel appointments** via a chat interface that integrates with **mock Calendly APIs** (and can be wired to real Calendly APIs in the future).

---

## 1. Setup Instructions

### 1.1 Install dependencies

From the `app` directory:

```bash
npm install
```

### 1.2 Environment variables

The current implementation uses **mock Calendly APIs only** and does **not require any environment variables**.

If you later integrate with the **real Calendly API**, you will typically add a `.env.local` file like:

```bash
CALENDLY_API_KEY=your_calendly_personal_access_token
CALENDLY_ORG_URI=https://api.calendly.com/organizations/xxxx
CALENDLY_SCHEDULED_EVENT_TYPE_URL=https://api.calendly.com/event_types/xxxx
```

You would then read these in Next.js using `process.env.CALENDLY_API_KEY` inside **server-side** code only (e.g. in `app/api/calendly/*`).

### 1.3 Running the application

From the `app` directory:

```bash
npm run dev
```

Then open `http://localhost:3000` in your browser.

Try prompts like:

- “Book a physical exam tomorrow morning”
- “I want to reschedule my appointment”
- “Cancel my appointment APPT-20240115-1000”

---

## 2. System Design

### 2.1 Agent conversation flow

- **Input**: User types a natural language message in the chat UI (`page.tsx`).
- **Intent detection** (simple, stateless, rule-based):
  - Contains “reschedul” → intent: **reschedule**
  - Contains “cancel” → intent: **cancel**
  - Otherwise → intent: **book**
- **Booking flow**:
  - Ask / infer **appointment type**.
  - Ask for **date** (YYYY-MM-DD, “today”, “tomorrow”).
  - Call **availability API**, suggest top slots, let user pick.
  - Collect **name**, **email**, **phone**, **reason**.
  - Call **book API**, show confirmation.
- **Rescheduling flow**:
  - Ask for **booking ID**.
  - Ask for **new date** and **new time**.
  - Call **reschedule API**, show updated details.
- **Cancellation flow**:
  - Ask for **booking ID**.
  - Ask for optional **cancellation reason** (user can “skip”).
  - Call **cancel API**, confirm cancellation.
- The **conversation state** (intent, date, appointment type, selected slot, patient info, booking ID, etc.) is held in **React state only** and is **not persisted** (no DB, no sessions).

### 2.2 Calendly integration approach

Current implementation (v1):

- Uses **Next.js API routes** under `app/src/app/api/calendly/*` to simulate Calendly:
  - `GET /api/calendly/availability`
  - `POST /api/calendly/book`
  - `POST /api/calendly/reschedule`
  - `POST /api/calendly/cancel`
- The frontend chat agent calls these endpoints using `fetch` from the browser.
- All logic is **stateless** per request and does **not** persist any bookings.

Future real Calendly integration (outline):

- Replace/mock handlers in `app/api/calendly/*` with:
  - Real calls to Calendly’s **availability** endpoints to fetch slots.
  - Real **create event** calls to schedule an appointment.
  - Real **reschedule** and **cancel** behavior (via event update / cancellation endpoints).
- Use **server-side** API routes only (no Calendly keys on the client).

### 2.3 RAG pipeline for FAQs (future design)

> Note: A full RAG pipeline is **not implemented in this v1**, but this is the intended design if/when FAQs are added.

- **Retrieval layer**:
  - Store clinic FAQs, policies, and generic scheduling information as documents (e.g., in a vector store or static embeddings file).
  - On each user question that looks informational (not scheduling), retrieve top-k FAQ chunks.
- **Generation layer**:
  - Pass retrieved FAQ snippets into an LLM prompt to generate a concise answer.
- **Routing**:
  - Simple **intent router** decides between:
    - Scheduling intents (handled by the current tool-calling agent), or
    - FAQ intents (handled by the RAG component).
- **Statelessness**:
  - Retrieval is done per request; no user profile or long-term memory is stored.

### 2.4 Tool calling strategy

Inside `page.tsx`, the “agent” is a **deterministic orchestrator** that calls tools (our mock APIs) based on conversation state:

- **Availability tool**: `GET /api/calendly/availability`
  - Called when we know **appointment type** and **date**.
  - Returns a list of slots; the agent filters to a few top available options.

- **Booking tool**: `POST /api/calendly/book`
  - Called after collecting all patient details and chosen slot.

- **Reschedule tool**: `POST /api/calendly/reschedule`
  - Called when user has provided **booking ID**, **new date**, and **new start time**.

- **Cancel tool**: `POST /api/calendly/cancel`
  - Called when user has provided **booking ID** and optional **reason**.

The agent logic is rule-based (no external LLM calls in v1), but the same pattern is compatible with an LLM-powered tool-calling setup.

---

## 3. Scheduling Logic

### 3.1 How available slots are determined

Implementation: `app/src/app/api/calendly/availability/route.ts`

- Accepts:
  - `date` (YYYY-MM-DD)
  - `appointment_type` (`consultation | followup | physical | specialist`)
- Each appointment type has a **configured duration**:
  - General Consultation → **30 min**
  - Follow-up → **15 min**
  - Physical Exam → **45 min**
  - Specialist Consultation → **60 min**
- The clinic day is modeled as:
  - Start: **09:00**
  - End: **17:00**
- The handler:
  - Divides the clinic day into **slots** of that duration.
  - Generates deterministic “pseudo-random” availability by hashing `(date, type, index)` and marking ~2/3 of slots as `available: true`.
  - Returns structured `available_slots` with `start_time`, `end_time`, `available`.

### 3.2 Appointment type handling

- The chat agent maps user text to appointment types:
  - Mentions “follow-up” / “followup” → `followup`
  - Mentions “physical” → `physical`
  - Mentions “specialist” → `specialist`
  - Mentions “consultation”, “general”, “checkup” → `consultation`
- If the type **cannot be inferred**, the agent explicitly asks:
  - “What type of appointment would you like? General Consultation, Follow-up, Physical Exam, or Specialist Consultation?”
- The chosen type is stored in the **conversation state** and used both for:
  - Availability lookup, and
  - The booking payload.

### 3.3 Conflict prevention

In this mock, stateless implementation:

- There is **no shared database or single source of truth** for bookings.
- Instead, **conflict prevention is simulated** by:
  - Only offering **available** slots from the mock `availability` endpoint.
  - Using deterministic hashing so availability is stable for a given date and type.
- In a real Calendly integration:
  - Calendly itself enforces **no double-booking** across their calendars.
  - The app would:
    - Always call **up-to-date availability** before booking.
    - Handle **“slot no longer available”** errors from Calendly gracefully and prompt the user to pick another time.

---

## 4. Testing

### 4.1 Example conversations

- **Booking – simple path**
  1. User: “Book a general consultation tomorrow”
  2. Agent: Asks for date (if needed) and then shows top available slots.
  3. User: “2”
  4. Agent: Asks for name, email, phone, and reason.
  5. User: Provides details.
  6. Agent: Returns booking confirmation with `booking_id` and `confirmation_code`.

- **Rescheduling**
  1. User: “I need to reschedule my appointment”
  2. Agent: “What is your booking ID?”
  3. User: “APPT-20240115-1000”
  4. Agent: Asks for new date and then new time.
  5. User: Provides date and time.
  6. Agent: Confirms rescheduled booking with new and previous booking IDs.

- **Cancellation**
  1. User: “Cancel my appointment APPT-20240115-1000”
  2. Agent: Asks for confirmation/optional reason.
  3. User: “I’m not feeling well enough to come in.”
  4. Agent: Confirms cancellation and echoes booking ID.

### 4.2 Edge cases covered

- **Invalid / missing date**
  - User provides unparseable date → agent asks again with clear format examples.
  - API guards against invalid `YYYY-MM-DD` and returns `400` with error message.

- **No available slots**
  - If `available_slots` is empty for chosen date and type, agent:
    - Apologizes and prompts user to try another date.

- **Missing appointment type**
  - If date is provided but type is missing, agent:
    - Detects missing type and explicitly asks for it before fetching availability.

- **Missing booking ID for reschedule/cancel**
  - If user tries to reschedule or cancel without a booking ID:
    - Agent asks for it and will not call tools until it is provided.

- **Bad time format in rescheduling**
  - If new time is not in `HH:mm` format:
    - Agent explains the expected format and re-prompts.

- **API failures**
  - For any `fetch` error (availability, book, reschedule, cancel):
    - Agent shows a generic “Something went wrong…” message.
    - Conversation state is reset or steered back to a safe step (e.g., ask date again).


