# Open From ZIP And Run

This guide explains how to open the project after receiving it as a ZIP file, install dependencies, start the backend server, start the dashboard, and check that the system is working.

## 1. Extract The ZIP

1. Right-click the ZIP file.
2. Click **Extract All**.
3. Extract it to a simple folder path, for example:

```text
D:\ai-for-bharat
```

After extracting, the folder should look like this:

```text
ai-for-bharat
├── apps
│   ├── backend
│   └── rm-dashboard
├── README.md
├── ARCHITECTURE.md
└── system_design.png
```

## 2. Open The Project In VS Code

1. Open VS Code.
2. Click **File > Open Folder**.
3. Select the extracted project folder:

```text
D:\ai-for-bharat
```

Open a VS Code terminal:

```text
Terminal > New Terminal
```

## 3. Install Required Software

Install these before starting:

- Node.js
- npm
- Docker Desktop, for Redis

The backend also needs working credentials in:

```text
apps/backend/.env
```

The dashboard can use:

```text
apps/rm-dashboard/.env.local
```

Example dashboard env:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

## 4. Start Redis

From the project root:

```bash
docker compose up -d redis
```

Redis should run on:

```text
localhost:6379
```

## 5. Install Backend Dependencies

In the terminal:

```bash
cd apps/backend
npm install
npx prisma generate
```

If this is a fresh database, run:

```bash
npx prisma db push
```

## 6. Start Backend Server

From:

```text
apps/backend
```

Run:

```bash
npm run dev
```

Backend should start on:

```text
http://localhost:4000
```

Check backend health in the browser:

```text
http://localhost:4000/health
```

Voice test page:

```text
http://localhost:4000/test-voice-pipeline
```

Keep this terminal running.

## 7. Install Dashboard Dependencies

Open a second terminal from the project root.

```bash
cd apps/rm-dashboard
npm install
```

## 8. Start Dashboard

From:

```text
apps/rm-dashboard
```

Run:

```bash
npm run dev
```

Dashboard should start on:

```text
http://localhost:3000
```

If port `3000` is busy, Next.js may use another port. Use the URL shown in the terminal.

## 9. Check The App Is Working

1. Open the dashboard:

```text
http://localhost:3000
```

2. Add a lead from the dashboard.
3. Open the voice test page:

```text
http://localhost:4000/test-voice-pipeline
```

4. Select or enter the lead ID.
5. Start a call.
6. Allow microphone permission.
7. Speak to the agent.
8. End the call.
9. Go back to the dashboard and open that lead.
10. Confirm that the call summary, transcript, score, status, and recording chunks are visible.

## 10. Common Commands

Backend:

```bash
cd apps/backend
npm run dev
npm run build
npm test
```

Dashboard:

```bash
cd apps/rm-dashboard
npm run dev
npm run build
```

Redis:

```bash
docker compose up -d redis
docker compose logs redis
docker compose down
```

## 11. Troubleshooting

### Backend does not start

Check:

- `apps/backend/.env` exists.
- `DATABASE_URL` is correct.
- `REDIS_URL` is correct.
- Redis is running.
- Port `4000` is free.
- Dependencies are installed.

### Dashboard cannot connect to backend

Check:

- Backend is running on `http://localhost:4000`.
- `apps/rm-dashboard/.env.local` has `NEXT_PUBLIC_API_URL=http://localhost:4000`.
- Restart the dashboard after changing `.env.local`.

### Voice call does not work

Check:

- Browser microphone permission is allowed.
- `DEEPGRAM_API_KEY` is set.
- `SARVAM_API_KEY` is set.
- LLM/Ollama endpoint is reachable.
- Backend terminal logs for errors.

### Recordings are not visible

Check:

- AWS credentials are set in `apps/backend/.env`.
- `AWS_BUCKET_NAME` is correct.
- The S3 bucket allows `PutObject` and `GetObject`.
- The call ended properly, because recordings upload at call end.

