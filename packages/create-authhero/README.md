# create-authhero

Scaffold a production-ready [AuthHero](https://github.com/<your-username>/authhero) authentication server in seconds.

## Usage

```bash
npx create-authhero my-auth-server
```

This will:

1. Clone the AuthHero template into `my-auth-server/`
2. Generate cryptographic secrets for JWT & MFA
3. Create a `.env` file with all secrets pre-filled
4. Install npm dependencies
5. Initialize a fresh git repository

## What You Get

- Express 5 auth server with email/password, OAuth, and MFA
- PostgreSQL (Prisma) + Redis session management
- Rate limiting, input validation, structured logging
- Ready-to-run with `npm run dev`

See the main [AuthHero README](https://github.com/<your-username>/authhero#readme) for full documentation.

## License

MIT
