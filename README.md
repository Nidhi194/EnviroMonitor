# EnviroMonitor (AQI Reporting Tool)

EnviroMonitor is a full-stack environmental monitoring and compliance platform for **Industries** and **Monitoring Agencies** to submit readings, compute AQI, and generate compliant reports.

## What’s in this repo

- **Backend**: Node.js + Express (`server.js`)
- **Frontend**: Static pages under `public/pages/` (served by Express)
- **Database**: MySQL (configured via environment variables)

## Quick start (local)

### Prerequisites

- Node.js (recent LTS recommended)
- A MySQL database you can connect to

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment variables

Create a `.env` file in the repo root:

```bash
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=user_db
PORT=3000
```

### 3) Run DB migrations (required)

This project **does not** mutate schema at runtime anymore. Run:

```bash
npm run migrate
```

### 4) Start the app

```bash
npm start
```

Then open `http://localhost:3000`.

## Development notes

- **Landing page**: served from `public/pages/index.html`
- **Live Server**: opening the repo root works because `index.html` redirects to `public/pages/index.html`
- **Health endpoint**: `GET /api/health` (used by smoke tests and basic monitoring)

## Security notes

- **Passwords** are now stored as **bcrypt hashes**.
- If a legacy user exists with a plaintext password in the DB, login will **transparently upgrade** it to bcrypt on successful authentication.
- Auth endpoints have a simple per-IP rate limit (in-memory). This is good as a baseline, but not a substitute for a shared store limiter in multi-instance deployments.

## Scripts

- `npm run migrate`: create/upgrade required MySQL tables/columns (idempotent)
- `npm run lint`: run ESLint
- `npm test`: smoke test (starts server and checks `/` + `/api/health`)
- `npm start`: start Express server

## Project layout (high-level)

```text
.
├── public/
│   ├── css/
│   ├── js/
│   ├── images/
│   └── pages/
├── scripts/
│   ├── migrate.js
│   └── smoke.js
├── server.js
├── vercel.json
└── package.json
```