# Contributing to AuthHero

Thank you for your interest in contributing! This guide will help you get started.

## Getting Started

1. **Fork** the repository
2. **Clone** your fork:
   ```bash
   git clone https://github.com/<your-username>/authhero.git
   cd authhero
   ```
3. **Install dependencies:**
   ```bash
   bun add
   ```
4. **Set up environment:**
   ```bash
   cp .env.example .env
   # Fill in the required values (see README for details)
   ```
5. **Run database migrations:**
   ```bash
   bunx prisma migrate dev
   ```
6. **Create a branch:**
   ```bash
   git checkout -b feat/my-feature
   ```

## Development Workflow

```bash
# Start the dev server
bun run dev

# Start the email worker (separate terminal)
bun run worker

# Run tests
bun run test

# Run linting
bun run lint

# Format code
bun run format
```

## Code Style

- **TypeScript** — All source files must be typed; avoid `any`
- **ESLint + Prettier** — Run `npm run lint:fix` and `npm run format` before committing
- **Zod** — All request payloads must be validated with Zod schemas
- **Error handling** — Use `AppError` for user-facing errors; never expose stack traces

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add password strength meter
fix: prevent race condition in token refresh
docs: update OAuth setup instructions
chore: bump dependencies
```

## Pull Requests

1. Make sure all tests pass: `npm run test`
2. Make sure linting passes: `npm run lint`
3. Make sure formatting is correct: `npm run format:check`
4. Write a clear PR description explaining **what** and **why**
5. Keep PRs focused — one feature or fix per PR

## Adding a New OAuth Provider

1. Create `src/modules/auth/oauth/providers/<name>.provider.ts`
2. Implement the same interface as existing providers (fetch user profile, return `{ email, displayName, providerId }`)
3. Add the provider env vars to `src/config/env.ts` and `.env.example`
4. Register the provider in `oauth.service.ts`
5. Add tests

## Reporting Bugs

- Use [GitHub Issues](../../issues)
- Include steps to reproduce, expected vs actual behavior, and your environment (OS, Node version)

## Security Vulnerabilities

**Do NOT open a public issue for security vulnerabilities.** See [SECURITY.md](SECURITY.md) for responsible disclosure instructions.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
