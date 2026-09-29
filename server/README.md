# IT Ticket Board Backend

Express.js + PostgreSQL + Redis backend for the IT Ticket Board.

## Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose

### Setup

1. **Install dependencies**
```bash
cd server
npm install
```

2. **Start services**
```bash
docker-compose up -d
```

3. **Create .env file**
```bash
cp .env.example .env
```

4. **Run migrations**
```bash
npm run migrate
```

5. **Start dev server**
```bash
npm run dev
```

Server runs on `http://localhost:3001`

## API Endpoints

### Auth
- `POST /api/auth/signup` — Create account
- `POST /api/auth/login` — Login and get token

### Tickets
- `GET /api/teams/:teamId/tickets` — List tickets
- `GET /api/tickets/:id` — Get ticket
- `POST /api/tickets` — Create ticket
- `PUT /api/tickets/:id` — Update ticket

All endpoints except signup/login require `Authorization: Bearer <token>` header.

## Database

Schema defined in `src/db/schema.sql`. Migrations run automatically on startup or with `npm run migrate`.

### Tables
- users
- teams
- team_members
- queues
- tickets
- work_notes
