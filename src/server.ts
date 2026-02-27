// ─── AuthHero — Standalone Server ────────────────────────────────────────────
// Run this file to start AuthHero as a standalone authentication server.
// Usage: node dist/server.js   (or:  bun src/server.ts)

import "dotenv/config";
import { createAuthHero } from "./createAuthHero";

async function main() {
  const { app, shutdown } = await createAuthHero();
  const PORT = process.env.PORT || 5000;

  const server = app.listen(PORT, () => {
    console.log(`🔐 AuthHero server running on http://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/health`);
  });

  const gracefulShutdown = async (signal: string) => {
    console.log(`\n${signal} received — shutting down...`);
    server.close();
    await shutdown();
    process.exit(0);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Failed to start AuthHero:", err);
  process.exit(1);
});
