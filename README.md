# MentorSpace — 1-on-1 Live Mentorship Platform

A real-time mentorship platform where mentors and students collaborate through a shared code editor, WebRTC video calling, live chat, and code execution — all in one browser tab.

**Live:** [1-on1-mentorship.vercel.app](https://1-on1-mentorship.vercel.app)

---

## Features

### Video Meeting (Google Meet-style)
- Host-controlled meeting — students cannot join until mentor starts and enters the call
- Camera preview lobby for both mentor and student before joining
- Waiting room — students click "Ask to join", mentor sees a popup with their name to Admit or Deny
- Per-participant permissions — mentor can mute mic, disable camera, allow/block screen sharing
- Screen sharing with tab audio support
- Draggable PiP (picture-in-picture) local video
- In-call chat (ephemeral, not stored)
- Hand raise with toast notifications
- "No one in call" state when peer leaves
- End call only (return to editor) or end call + close session
- Camera light turns off immediately when call ends

### Collaborative Code Editor
- Monaco Editor (VS Code engine) with full syntax highlighting
- Real-time code sync between mentor and student (throttled at 120ms)
- Multi-file workspace with folder support and file tabs
- Language auto-detection from file extension
- Student read-only mode — mentor drives, student follows
- File tree persisted in localStorage per session
- Mentor opens a file → student's editor switches to it automatically

### Code Execution
- Run code directly in the browser
- Local execution for JavaScript, TypeScript, Python (if installed)
- JDoodle API fallback for Java, C++, Go, Rust (200 free executions/day)
- Output panel with error/success states, 15s timeout

### Session Chat
- Persistent chat stored in Supabase, survives page refresh
- Role badges (mentor/student) on each message

### Session Management
- Mentor creates a session with title and language
- Shareable link — student joins via URL
- Session status: waiting → active → ended
- Delete session from dashboard (both mentor and student)
- Dashboard with session stats

### Authentication
- Supabase Auth (email + password)
- Role selection at signup (mentor or student)
- Forgot password with email reset link
- Password strength indicator on reset

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Code Editor | Monaco Editor |
| Real-time | Socket.io v4 |
| Video | WebRTC (native browser API) |
| Backend | Node.js, Express 5, TypeScript |
| Database & Auth | Supabase (PostgreSQL + Auth) |
| Code Execution | Local runtimes + JDoodle API |
| Deployment | Vercel (frontend) + Render (backend) |

---

## Project Structure

```
1-on-1-mentorship/
├── frontend/
│   ├── app/
│   │   ├── page.tsx              # Landing page
│   │   ├── dashboard/            # Session dashboard
│   │   ├── session/[id]/         # Session workspace
│   │   └── auth/                 # Login, signup, reset password
│   ├── components/
│   │   ├── VideoPanel.tsx        # Full WebRTC video call UI
│   │   ├── ChatPanel.tsx         # Persistent session chat
│   │   ├── FileExplorer.tsx      # File tree sidebar
│   │   └── Footer.tsx
│   └── lib/
│       ├── api.ts                # REST API client
│       ├── auth.ts               # Auth helpers
│       ├── socket.ts             # Socket.io client singleton
│       └── supabase.ts
│
└── backend/
    └── src/
        ├── index.ts              # Server entry, CORS, routes
        ├── socket/index.ts       # All Socket.io event handlers
        ├── routes/
        │   ├── sessions.ts       # Session CRUD + delete API
        │   └── run.ts            # Code execution API
        └── middleware/auth.ts    # JWT auth middleware
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project
- (Optional) [JDoodle API](https://www.jdoodle.com/compiler-api/) credentials

### 1. Supabase Setup

Run in your Supabase SQL editor:

```sql
create table profiles (
  id uuid references auth.users primary key,
  email text, name text,
  role text check (role in ('mentor', 'student')),
  created_at timestamptz default now()
);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  language text default 'javascript',
  status text default 'waiting' check (status in ('waiting', 'active', 'ended')),
  mentor_id uuid references profiles(id),
  student_id uuid references profiles(id),
  created_at timestamptz default now(),
  ended_at timestamptz
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  user_id uuid references profiles(id),
  content text not null,
  created_at timestamptz default now()
);
```

### 2. Backend

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
PORT=4000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...your_service_role_key
FRONTEND_URL=http://localhost:3000
JDOODLE_CLIENT_ID=your_jdoodle_client_id
JDOODLE_CLIENT_SECRET=your_jdoodle_client_secret
```

```bash
npm run dev
```

### 3. Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
```

```bash
npm run dev
```

---

## Deployment

### Frontend → Vercel
1. Import repo, set Root Directory to `frontend`
2. Add env vars in Vercel dashboard (same as `.env.local` but with production URLs)

### Backend → Render
1. New Web Service, Root Directory `backend`
2. Build: `npm install && npm run build` · Start: `npm start`
3. Add env vars from `backend/.env`
4. Set `FRONTEND_URL` to your Vercel URL

### Supabase Auth
- Site URL: `https://your-app.vercel.app`
- Redirect URLs: `https://your-app.vercel.app/auth/reset-password`

---

## Video Meeting Flow

```
Mentor opens Video tab
  → Camera preview lobby → clicks "Join now"
  → Emits mentor-joined-call → students notified

Student opens Video tab
  → Camera preview lobby
  → If mentor not in call: "Waiting for host..." (disabled button)
  → If mentor in call: "Ask to join" button
  → Clicks → knocking overlay shown
  → Mentor sees popup: "[Name] wants to join" → Admit / Deny
  → Admitted → student enters call directly

In call:
  → WebRTC peer connection (STUN + TURN)
  → Mentor can mute/disable cam/allow screen share per participant
  → Screen share with renegotiation for tab sharing
  → Hand raise, in-call chat, participants panel
  → End call only OR end call + close session
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/sessions` | Create session (mentor) |
| `GET` | `/api/sessions` | Get my sessions |
| `GET` | `/api/sessions/:id` | Get session by ID |
| `POST` | `/api/sessions/:id/join` | Join session (student) |
| `POST` | `/api/sessions/:id/end` | End session (mentor) |
| `DELETE` | `/api/sessions/:id` | Delete session (mentor or student) |
| `GET` | `/api/sessions/:id/messages` | Get messages |
| `POST` | `/api/run` | Execute code |
| `GET` | `/health` | Health check |

---

## Developer

**Ahmad Raza Khan**
- Email: [razakhanahmad68@gmail.com](mailto:razakhanahmad68@gmail.com)
- Phone: +91 87678 87220
- Location: Begusarai, Bihar — 851211

---

© 2026 MentorSpace. All rights reserved.
