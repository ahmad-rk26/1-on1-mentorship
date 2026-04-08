# MentorSpace — 1-on-1 Live Mentorship Platform

A real-time mentorship platform where mentors and students collaborate through a shared code editor, WebRTC video calling, live chat, and code execution — all in one browser tab.

**Live:** [1-on1-mentorship.vercel.app](https://1-on1-mentorship.vercel.app)

---

## Features

### Video Meeting (Google Meet-style)
- Host-controlled meeting start — students cannot join until mentor starts and enters the call
- Waiting room — students request to join, mentor admits or denies each participant
- Per-participant permissions — mentor can mute mic, disable camera, allow/block screen sharing
- Screen sharing with system audio support (YouTube, music, etc.)
- Draggable PiP (picture-in-picture) local video
- In-call chat (ephemeral, not stored)
- Hand raise with toast notifications
- End call only (return to editor) or end call + close session
- ICE candidate buffering for reliable WebRTC connection across different networks
- TURN server support for NAT traversal

### Collaborative Code Editor
- Monaco Editor (VS Code engine) with full syntax highlighting
- Real-time code sync between mentor and student (throttled at 120ms)
- Multi-file workspace with folder support
- File tabs with close button
- Language auto-detection from file extension
- Student read-only mode — mentor drives, student follows
- File tree persisted in localStorage per session
- Mentor opens a file → student's editor switches to it automatically

### Code Execution
- Run code directly in the browser
- Local execution for JavaScript, TypeScript, Python (if installed)
- JDoodle API fallback for Java, C++, Go, Rust (200 free executions/day)
- Output panel with error/success states
- 15 second timeout with clear error message

### Session Chat
- Persistent chat stored in Supabase
- Messages survive page refresh
- Role badges (mentor/student) on each message
- Timestamps on all messages

### Session Management
- Mentor creates a session with title and language
- Shareable link — student joins via URL
- Session status: waiting → active → ended
- Dashboard with session stats (total, active, waiting, completed)
- Student can rejoin active sessions from dashboard

### Authentication
- Supabase Auth (email + password)
- Role selection at signup (mentor or student)
- Forgot password with email reset link
- Password strength indicator on reset
- Protected routes — unauthenticated users redirected to login

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, TypeScript |
| Styling | Tailwind CSS v4 |
| Code Editor | Monaco Editor (`@monaco-editor/react`) |
| Real-time | Socket.io v4 (client + server) |
| Video | WebRTC (native browser API) |
| Backend | Node.js, Express 5, TypeScript |
| Database & Auth | Supabase (PostgreSQL + Auth) |
| Code Execution | Local runtimes + JDoodle API |
| Deployment | Vercel (frontend) + Render (backend) |

---

## Project Structure

```
1-on-1-mentorship/
├── frontend/                   # Next.js app
│   ├── app/
│   │   ├── page.tsx            # Landing page
│   │   ├── layout.tsx          # Root layout
│   │   ├── dashboard/          # Session dashboard
│   │   ├── session/[id]/       # Session workspace
│   │   └── auth/               # Login, signup, reset password
│   ├── components/
│   │   ├── VideoPanel.tsx      # Full WebRTC video call UI
│   │   ├── ChatPanel.tsx       # Persistent session chat
│   │   ├── FileExplorer.tsx    # File tree sidebar
│   │   └── Footer.tsx          # Site footer
│   └── lib/
│       ├── api.ts              # REST API client
│       ├── auth.ts             # Auth helpers
│       ├── socket.ts           # Socket.io client singleton
│       └── supabase.ts         # Supabase client
│
└── backend/                    # Express + Socket.io server
    └── src/
        ├── index.ts            # Server entry, CORS, routes
        ├── db.ts               # Supabase connection check
        ├── supabase.ts         # Supabase service role client
        ├── socket/
        │   └── index.ts        # All Socket.io event handlers
        ├── routes/
        │   ├── sessions.ts     # Session CRUD API
        │   └── run.ts          # Code execution API
        └── middleware/
            └── auth.ts         # JWT auth middleware
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project
- (Optional) [JDoodle API](https://www.jdoodle.com/compiler-api/) credentials for Java/C++/Go/Rust execution

### 1. Supabase Setup

Create the following tables in your Supabase SQL editor:

```sql
-- Profiles (synced with auth.users)
create table profiles (
  id uuid references auth.users primary key,
  email text,
  name text,
  role text check (role in ('mentor', 'student')),
  created_at timestamptz default now()
);

-- Sessions
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

-- Messages
create table messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  user_id uuid references profiles(id),
  content text not null,
  created_at timestamptz default now()
);
```

Enable Row Level Security and set your Supabase Auth redirect URL to your frontend domain.

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

Backend runs at `http://localhost:4000`.

### 3. Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...your_anon_key
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
```

```bash
npm run dev
```

Frontend runs at `http://localhost:3000`.

---

## Deployment

### Frontend → Vercel

1. Import the repo on [vercel.com](https://vercel.com)
2. Set Root Directory to `frontend`
3. Add environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_API_URL` → your Render backend URL
   - `NEXT_PUBLIC_SOCKET_URL` → your Render backend URL

### Backend → Render

1. Create a new Web Service on [render.com](https://render.com)
2. Set Root Directory to `backend`
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Add environment variables (same as `backend/.env`)
6. Set `FRONTEND_URL` to your Vercel URL

### Supabase Auth

In Supabase dashboard → Authentication → URL Configuration:
- Site URL: `https://your-app.vercel.app`
- Redirect URLs: `https://your-app.vercel.app/auth/reset-password`

---

## Socket.io Events Reference

### Session
| Event | Direction | Description |
|-------|-----------|-------------|
| `join-session` | client → server | Join a session room |
| `user-joined` | server → client | Peer joined the session |
| `user-left` | server → client | Peer left the session |
| `session-ended` | server → client | Session closed by mentor |

### Meeting (Video Call)
| Event | Direction | Description |
|-------|-----------|-------------|
| `meeting-start` | client → server | Mentor opens the meeting lobby |
| `meeting-started` | server → client | Broadcast meeting is live |
| `mentor-joined-call` | client → server | Mentor entered the call |
| `mentor-in-call` | server → client | Notify students mentor is live |
| `mentor-left-call` | server ↔ client | Mentor left the call |
| `meeting-request-join` | client → server | Student requests to join |
| `participant-waiting` | server → client | Notify mentor of waiting student |
| `meeting-admit` | client → server | Mentor admits a student |
| `meeting-admitted` | server → client | Student is admitted |
| `meeting-deny` | client → server | Mentor denies a student |
| `meeting-denied` | server → client | Student is denied |
| `meeting-end-call` | client → server | Mentor ends the call |
| `call-ended` | server → client | Broadcast call ended |
| `host-set-permission` | client → server | Mentor changes participant permissions |
| `permission-changed` | server → client | Notify participant of permission change |
| `meeting-remove` | client → server | Mentor removes a participant |
| `host-remove-me` | server → client | Participant is removed |

### WebRTC Signaling
| Event | Direction | Description |
|-------|-----------|-------------|
| `webrtc-offer` | client ↔ server | SDP offer relay |
| `webrtc-answer` | client ↔ server | SDP answer relay |
| `webrtc-ice-candidate` | client ↔ server | ICE candidate relay |
| `peer-ready` | client ↔ server | Student signals ready for offer |

### Collaboration
| Event | Direction | Description |
|-------|-----------|-------------|
| `fs-sync` | client → server | Full file tree sync |
| `fs-file-update` | client ↔ server | File content change |
| `fs-create` | client ↔ server | New file/folder created |
| `fs-rename` | client ↔ server | File/folder renamed |
| `fs-delete` | client ↔ server | File/folder deleted |
| `fs-open-file` | client ↔ server | Active file changed |
| `send-message` | client → server | Send chat message (persisted) |
| `new-message` | server → client | Broadcast new message |
| `incall-message` | client ↔ server | In-call ephemeral message |
| `raise-hand` | client ↔ server | Student raises hand |
| `lower-hand` | client ↔ server | Student lowers hand |

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/sessions` | mentor | Create a session |
| `GET` | `/api/sessions` | any | Get my sessions |
| `GET` | `/api/sessions/:id` | any | Get session by ID |
| `POST` | `/api/sessions/:id/join` | student | Join a session |
| `POST` | `/api/sessions/:id/end` | mentor | End a session |
| `GET` | `/api/sessions/:id/messages` | any | Get session messages |
| `POST` | `/api/run` | any | Execute code |
| `GET` | `/health` | none | Health check |

---

## Developer

**Ahmad Raza Khan**
- Email: [razakhanahmad68@gmail.com](mailto:razakhanahmad68@gmail.com)
- Phone: +91 87678 87220
- Location: Begusarai, Bihar — 851211

---

© 2026 MentorSpace. All rights reserved.
