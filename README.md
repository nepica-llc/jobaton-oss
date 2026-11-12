# Jobaton OSS — AI-Powered Job Search Toolkit

> Self-hosted, open-source career toolkit. Upload your resume, scan it against job descriptions, generate cover letters, and prep for interviews — all powered by your own AI key.

## Features

- **Resume Builder** — Upload PDF or build manually, AI-powered suggestions
- **ATS Scanner** — Score your resume against any job description
- **Cover Letter Generator** — AI-generated, tailored cover letters
- **Interview Prep** — AI-driven interview questions and mock sessions
- **100% Local** — Your data stays on your machine. No cloud, no tracking.

## Quick Start

```bash

# Option 1: Pull from Docker Hub (easiest)
docker run -p 127.0.0.1:3050:3001 -v jobaton_data:/app/data nepica/jobaton

# Option 2: Clone and build locally
git clone https://github.com/nepica-llc/jobaton-oss.git
cd jobaton-oss
docker compose up --build

# Open http://localhost:3050
```

## Requirements

- Docker & Docker Compose
- An OpenAI API key (or compatible provider)

## Configuration

Set your AI key in the Settings page after launching, or via environment variable:

```bash
# .env
OPENAI_API_KEY=sk-...
```

## Security

Jobaton OSS has no login: it is meant to run on your own machine with your own AI key.
The commands above publish it on `127.0.0.1` only. Don't expose it to a network unless it's behind a reverse proxy that adds authentication.

## Development (without Docker)

```bash
# Install dependencies
pnpm install

# Start API + frontend
pnpm dev
```

## Architecture

```
jobaton-oss/
├── api/          # Express API server (AI proxy, local storage)
├── web/          # React SPA (Vite + TailwindCSS)
├── data/         # Local JSON storage (created at runtime)
├── Dockerfile    # Multi-stage build
└── docker-compose.yml
```

## Tech Stack

- **Frontend**: React 18, Vite, TailwindCSS
- **Backend**: Express, Node.js 22
- **AI**: OpenAI API (BYOK — Bring Your Own Key)
- **Storage**: Local JSON files (no database required)
- **Container**: Docker

## License

MIT — Free to use, modify, and distribute.

## Docker Hub

```bash
docker pull nepica/jobaton
docker run -d -p 127.0.0.1:3050:3001 -v jobaton_data:/app/data nepica/jobaton
```

See [nepica/jobaton on Docker Hub](https://hub.docker.com/r/nepica/jobaton) for all available tags.

## Contributing

Contributions welcome! Please open issues and PRs on [GitHub](https://github.com/nepica-llc/jobaton-oss).

## Jobaton Pro

Want cloud sync, unlimited AI credits, mock interviews, sprint training, and mentorship?
Check out [Jobaton Pro](https://jobaton.com) — $9.99/month.
