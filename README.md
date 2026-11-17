<p align="center">
  <img src="logo/logo.png" alt="Jobaton" width="110" />
</p>

<h1 align="center">Jobaton OSS</h1>

<p align="center">
  A self-hosted, open-source job search toolkit powered by your own AI key.
</p>

---

## Overview

Jobaton brings your job search into one place: find roles, score your resume against them, write tailored cover letters and prepare for interviews. It runs on your own machine, stores everything in a local SQLite database and sends data only to the AI provider you choose.

## Features

| Feature | Description |
|---|---|
| Job search | Search Indeed, LinkedIn and Glassdoor and save the roles you want to pursue |
| Resume builder | Upload a PDF or build a resume from scratch, with AI suggestions |
| ATS scanner | Score your resume against a job description and see what's missing |
| Cover letters | Generate a cover letter tailored to a specific role |
| Job prep | Get a study guide and likely interview questions for each saved job |
| Interview practice | Practice with AI-generated questions and mock sessions |
| Dashboard | Track saved jobs, resumes and progress in one view |

## Quick start

Docker Compose is the recommended setup, as it includes the job search service.

```bash
git clone https://github.com/nepica-llc/jobaton-oss.git
cd jobaton-oss
docker compose up --build
```

Open http://localhost:3050, go to **Settings** and add your AI provider key.

To try it with a single container from Docker Hub:

```bash
docker run -d -p 127.0.0.1:3050:3001 -v jobaton_data:/app/data nepica/jobaton
```

Everything works in this mode except job search, which needs the `jobspy` service that Docker Compose starts.

**Requirements:** Docker with Compose, and an API key from a supported AI provider.

## AI providers

Add a key in **Settings** and choose the active provider. Keys can also be set through environment variables.

| Provider | Default model | Environment variable |
|---|---|---|
| OpenAI | `gpt-4o-mini` (configurable in Settings) | `OPENAI_API_KEY` |
| Anthropic | `claude-sonnet-4-20250514` | `ANTHROPIC_API_KEY` |
| Google AI | `gemini-2.0-flash` | `GOOGLE_AI_KEY` |
| Mistral | `mistral-large-latest` | `MISTRAL_API_KEY` |

## Configuration

Copy `.env.example` to `.env` to change the defaults.

| Variable | Default | Purpose |
|---|---|---|
| `API_PORT` | `3001` | Port the app listens on |
| `HOST` | `127.0.0.1` | Bind address (the Docker image uses `0.0.0.0` inside the container) |
| `DATA_DIR` | `./data` | Location of the local database |
| `CORS_ORIGIN` | none | Comma-separated origins allowed to call the API cross-origin |
| `JOBSPY_URL` | set by Compose | Address of the job search service |

## Privacy and security

Jobaton OSS has no login. It is designed to run on your own computer with your own AI key.

- The commands above publish the app on `127.0.0.1` only, so it is reachable from your machine and nowhere else.
- Cross-origin requests are blocked unless `CORS_ORIGIN` is set.
- Resumes and settings stay in the `jobaton_data` volume. Your AI key is sent only to the provider you select.

To access it from another device, place it behind a reverse proxy that adds authentication. Do not expose it to a network directly.

## Development

```bash
pnpm install   # requires pnpm 9
pnpm dev       # API and web app with hot reload
```

```
jobaton-oss/
├── api/                 Express API: AI proxy and SQLite storage
├── web/                 React app (Vite, Tailwind CSS)
├── jobspy/              Python job search service (FastAPI, python-jobspy)
├── Dockerfile           Multi-stage build serving the API and web app
└── docker-compose.yml   App and job search service
```

Built with React 18, Vite, Tailwind CSS, Express, Node.js 22, SQLite (better-sqlite3), FastAPI and Docker.

## Contributing

Bug reports, ideas and pull requests are welcome.

1. Open an [issue](https://github.com/nepica-llc/jobaton-oss/issues) describing the bug or idea
2. Fork the repository and create a branch
3. Run `pnpm install && pnpm dev` and make your change
4. Open a pull request

## Jobaton Pro

[Jobaton Pro](https://jobaton.com) adds cloud sync, unlimited AI credits, mock interviews, sprint training and mentorship for $9.99/month.

## License

[MIT](LICENSE)
