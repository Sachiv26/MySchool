# MySchool Connect — Parents/School Communication Platform

A production-structured MVP that turns WhatsApp-style school messages into a
structured, grade-filtered communication and reminder system for parents.

Schools drop text, Markdown, PDF or image (poster) messages into an
`/incoming-messages` folder. The app scans the folder, OCRs images, extracts
structured information via an AI layer, lets a school administrator review and
approve the result, then surfaces grade-appropriate messages, events, action
items, payments and a calendar to each parent — with a configurable reminder
engine.

> **This MVP does not integrate with WhatsApp.** Messages are ingested from the
> local `incoming-messages` folder so the whole flow runs end to end locally.

---

## Features

- Parent and school-administrator registration + login (JWT in httpOnly cookie).
- Parent-child relationships (multiple children, multiple parents per child).
- Configurable **grades & classes** per school (not hard-coded).
- **Folder ingestion** stored events of file types (.txt, .md, .pdf, images).
- **Modular OCR** (`OcrService` interface) — local dev driver + Tesseract.js; the
  cloud stubs (Google Vision / Azure / AWS Textract) describe how to plug them in.
- **AI extraction** returning structured JSON validated with **Zod** —
  rule-based offline extractor (default) or a hosted model (`AI_MODE=remote`).
  Never invents information — uncertain fields stay `null`.
- **Admin dashboard** — messages, review, grades, parents, absences, scan folder.
- **Message review screen** — original vs. extracted, edit, approve/reject/reprocess.
- **Parent dashboard** — today, upcoming, action-required, notifications, children.
- **Event detail**, **calendar** (filter by child), **payments** (mock flow),
  **absences + sick notes**, **in-app notifications**.
- **Reminder engine** driven by configurable `ReminderRule`s.
- **In-app notifications** abstraction (email/SMS/push/WhatsApp ready behind flags).
- **Audit log** for message import/approve/edit, registration, absence, reminders,
  payments.
- **Multi-school** architecture throughout.
- **Feature flags** (parent chat, payments, WhatsApp, email, SMS, teacher accounts).
- **PWA** — manifest, service worker, app icons (mobile-installable).
- **Unit tests (Vitest)** for the most critical business logic.

---

## Tech stack

| Area         | Choice                                            |
|--------------|---------------------------------------------------|
| Framework    | Next.js 14 (App Router) + React 18                  |
| Language     | TypeScript (strict)                               |
| Styling      | Tailwind CSS                                      |
| Database     | PostgreSQL via Prisma ORM                         |
| Validation   | Zod                                               |
| Auth         | jose (JWT) httpOnly cookie + bcryptjs hashing      |
| OCR          | OcrService interface; Dev + Tesseract providers    |
| PDF          | pdf-parse                                         |
| AI extraction| rule-based (dev) / OpenAI-compatible remote       |
| Tests        | Vitest                                            |
| Utilities    | dayjs (dates), lucide-react (icons)               |

---

## Project structure

```
app/                      Next.js routes
  api/                   server-side API routes
  admin/                 admin UI
  login/ register/       auth screens
  page.tsx               parent dashboard
  calendar/ messages/ events/[id]/ children/ notifications/
  payments/ absences/ more/
components/              shared UI (PageShell, BottomNav, ui, AdminShell)
lib/
  services/              business logic (one file per bounded context)
    ocr/                 OcrService + dev/tesseract providers
    ai/                  extraction schema, rule-based + remote service
    pipeline.ts          end-to-end ingestion orchestration
    fileScanner.ts, textExtractor.ts, messageService.ts, gradeService.ts,
    reminderService.ts, notificationService.ts, paymentService.ts,
    absenceService.ts, authorization.ts, parentViews.ts, adminViews.ts,
    audit.ts, featureFlags.ts, storage.ts, parentService.ts, adminGuard.ts
  auth/       password.ts, session.ts
  validation/ schemas.ts (all Zod input/action schemas)
  client/     typed API helpers
prisma/
  schema.prisma           full data model
  seed.ts                 demo school + grades + accounts + sample messages
incoming-messages/        seeded message fixtures (txt/md/image+ocr sidecar)
public/                   manifest, icons, service worker
scripts/                  PWA icon generator
tests/                    Vitest suites
```

---

## Database models

`User`, `SchoolMembership`, `School`, `Grade`, `Class`, `ParentProfile`, `Child`,
`ParentChild`, `Message`, `MessageGrade`, `MessageTypeOption`, `SchoolEvent`,
`EventRegistration`, `ActionItem`, `ActionItemState`, `ReminderRule`, `Reminder`,
`Absence`, `Attachment`, `PaymentRequest`, `Payment`, `Notification`,
`AuditLog`, `FeatureFlag`.

Relationships and indexes cover the commonly-queried fields (`schoolId`,
`gradeId`, `parentId`, `childId`, `eventDate`, `deadline`, `status`), and every
school-specific entity carries `schoolId` for the multi-school design.

---

## Setup

### 1. Start PostgreSQL (Docker)
```bash
docker compose up -d
```
Starts `postgres:16-alpine` on `localhost:5432` (user/pass/db = `myschool`).
Skip this step if you already have Postgres — just update `DATABASE_URL`.

### 2. Environment
```bash
cp .env.example .env
```
Set at minimum:
```
DATABASE_URL="postgresql://myschool:myschool@localhost:5432/myschool?schema=public"
AUTH_SECRET="<32+ byte random hex>"
```
Generate a secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Optional: feature flags (`FT_*`), OCR/AI mode + keys (see below).

### 3. Install, migrate, seed
```bash
npm install            # runs prisma generate automatically
npx prisma migrate dev --name init
npm run db:seed
```
(`npm run db:push` also syncs the schema if you'd rather not use migrations.)

### 4. Run
```bash
npm run dev
```
Open http://localhost:3000

Demo / seeded accounts:
| Role            | Email                | Password      |
|-----------------|----------------------|---------------|
| School admin    | admin@myschool.edu   | `admin12345`  |
| Parent          | parent@myschool.edu  | `parent12345` |

The seeded parent has two children: **Sarah (Grade 4)** and **John (Grade 7)**.

---

## How OCR works
`/incoming-messages` files are classified by extension:
- `.txt`, `.md` → read directly as text.
- `.pdf` → text is buffered with `pdf-parse`.
- `.jpg/.jpeg/.png/.webp` → passed to the active `OcrService`.

The active OCR is selected by `OCR_MODE`:
- `dev` (default): for an image named `foo.png` it reads the sidecar
  `foo.ocr.txt` in the same folder (offline, deterministic — perfect for demos
  and tests). With no sidecar it returns empty text and flags the message for
  review.
- `tesseract`: runs local Tesseract (`tesseract.js` is installed).
- `google` / `azure` / `aws`: provider stubs that throw a clear
  `OcrNotConfiguredError` until a provider is implemented behind the
  `OcrService` interface and the keys are added to `.env`.

If OCR confidence is low the message is marked `NEEDS_REVIEW`.

**Adding a provider:** implement the `OcrService` interface
(`lib/services/ocr/ocrService.ts`: `recognize(filePath, mime?)` + `supports`),
register it in `lib/services/ocr/index.ts`, and set `OCR_MODE`.

## How AI extraction works
After text is extracted, `AiExtractionService.extract(text, context)` returns a
structured object validated by the Zod schema in `lib/services/ai/aiSchemas.ts`.
It decides:

- message type (EVENT, SPORTS, PAYMENT, DEADLINE, …)
- applicable grade(s) (or `allGrades`) and whether grades are ambiguous
- event date / time / location
- deadline, amount + currency
- required items, action items, contact information
- registration / permission flags, importance, and whether reminders apply

The schema is the single contract every path (rule-based or hosted model) must
satisfy. Unknown values must be `null` — the system never invents facts. Every
result carries per-field `confidence`, and any result that fails the schema is
rejected rather than stored (empty < null < trusted).

`AI_MODE=dev` uses the deterministic `RuleBasedAiExtractionService` (no network,
no cost). `AI_MODE=remote` uses `RemoteAiExtractionService` via an
OpenAI-compatible chat-completions endpoint (set `OPENAI_API_KEY` /
`OPENAI_MODEL`). Implement `lib/services/ai/aiService.ts` to use another vendor.

## Message ingestion flow
1. Drop a file into `/incoming-messages`.
2. As admin, open **Admin → Messages** and press **Scan Folder** (the page lists
   newly found files).
3. The pipeline: classify → extract text (txt/md/pdf) or OCR (image) → run AI
   extraction → validate with Zod → store with processing status
   (`PROCESSED` / `NEEDS_REVIEW` / `FAILED`).
4. Review at **Admin → Messages → Review**: original vs. extracted fields,
   edit everything, then **Approve** (or Reject / Reprocess).
5. On approval the message becomes visible to parents whose children’s grades
   match, and the reminder engine schedules reminders.

Folder watching isn't wired automatically; the manual **Scan** button exercises
the identical pipeline, so nothing is duplicated. (fs.watch-based watching is a
simple, future enhancement.)

## Sample messages
`/incoming-messages` includes fixtures for a Grade 4 sports day, a Grade 5
payment reminder, an all-school announcement, a Grade 7 athletics event, an
event-as-image (with `.ocr.txt` sidecar), a “bring items” science-fair note,
a library returns deadline, and a report-card deadline.

## Security
- Passwords hashed with `bcryptjs`; session JWT (`jose`) in an httpOnly cookie;
  edge middleware guards routes.
- Role-based access: parents only see their own children and messages for
  their children's grades. Admins are scoped to their own school. Parent/child
  relationships are resolved from the authenticated session — never from the
  frontend payload.
- Every input is validated server-side with Zod; user-generated text is
  sanitized/escaped by React rendering.
- Uploaded attachments (sick notes) live outside `public/` and are served only
  through an authorized, authenticated download route.

## Tests
```bash
npm run test        # vitest run
```
Suites cover grade filtering, AI/OCR extraction validation (including
“never invent” behaviour), reminder calculation, parent/child authorization,
event deadlines, absence creation, and payment status.

## Creating an admin or parent
Easiest is the seed. For manual creation, follow `prisma/seed.ts`: hash the
password with `hashPassword` (lib/auth/password.ts), create a `User` with the
appropriate `role`, then link a `SchoolMembership` (`ADMIN`) for staff.

## Future integration points (prepared, gated by feature flags)
- **Parent chat** — schema + privacy/moderation foundations exist; hidden behind
  the `parent-chat` flag.
- **WhatsApp / Email / SMS / push** — the notification layer is channel-aware;
  add providers behind a channel interface.
- **Payment provider (Stripe / PayFast)** — implement the `PaymentProvider`
  interface currently served by a mock; flip the `payments` flag.
- **Teacher accounts** — `Role.TEACHER` and the `teachers` flag exist.

## Troubleshooting
- Prisma errors: confirm Postgres is up (`docker compose up -d`) and
  `DATABASE_URL` matches.
- Missing icons: `node scripts/make-icons.mjs` regenerates `public/icons`.
- Build: `npm run build` runs `prisma generate` + `next build`.