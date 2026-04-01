# MentorSpace – 1-on-1 Live Mentorship Platform

Real-time mentorship platform with collaborative code editing, chat, and WebRTC video calling.

## Tech Stack

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS, Monaco Editor, Socket.io-client
- **Backend**: Node.js, Express, Socket.io, WebRTC signaling
- **Database**: PostgreSQL
- **Auth**: JWT + bcrypt

## Project Structure

```
mentor-platform/
├── frontend/   # Next.js app
└── backend/    # Express + Socket.io server
```

## Quick Start

### 1. Database

Create a PostgreSQL database and run `backend/schema.sql`.

### 2. Backend

```bash
cd backend
cp .env.example .env
# Fill in DATABASE_URL and JWT_SECRET in .env
npm run dev
```

### 3. Frontend

```bash
cd frontend
cp .env.local.example .env.local
# Set NEXT_PUBLIC_API_URL and NEXT_PUBLIC_SOCKET_URL
npm run dev
```

App runs at `http://localhost:3000`, backend at `http://localhost:4000`.

## Features

- Signup / Login with Mentor or Student role
- Mentor creates a session → shares link with student
- Real-time collaborative Monaco code editor (throttled sync via Socket.io)
- Session-based chat with message persistence
- WebRTC 1-on-1 video call with mic/camera toggle
- Session lifecycle: waiting → active → ended

## Deployment

- **Frontend** → Vercel (`NEXT_PUBLIC_API_URL` = your Railway/Render URL)
- **Backend** → Railway or Render
- **Database** → Supabase or Railway PostgreSQL

## Environment Variables

### Backend `.env`
```
PORT=4000
DATABASE_URL=postgresql://...
JWT_SECRET=your_secret
FRONTEND_URL=http://localhost:3000
```

### Frontend `.env.local`
```
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
```
