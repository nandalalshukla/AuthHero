#!/usr/bin/env node

//create-authhero — Zero-dependency CLI scaffolder.
//Usage: npx create-authhero my-app

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import crypto from "node:crypto";
import process from "node:process";
import console from "node:console";

// ── Helpers ──────────────────────────────────────────────────────────────────

const REPO_URL = "https://github.com/<your-username>/authhero.git";

const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

function log(msg) {
  console.log(msg);
}

function success(msg) {
  log(`${GREEN}✔${RESET} ${msg}`);
}

function warn(msg) {
  log(`${YELLOW}⚠${RESET} ${msg}`);
}

function error(msg) {
  log(`${RED}✖${RESET} ${msg}`);
}

function heading(msg) {
  log(`\n${BOLD}${CYAN}${msg}${RESET}`);
}

function generateSecret() {
  return crypto.randomBytes(32).toString("hex");
}

async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  heading("🔐 create-authhero");
  log("Scaffold a production-ready authentication server\n");

  // Get project name from args or prompt
  let projectName = process.argv[2];

  if (!projectName) {
    projectName = await ask(`${BOLD}Project name:${RESET} `);
  }

  if (!projectName) {
    error("Project name is required.");
    process.exit(1);
  }

  const projectPath = path.resolve(process.cwd(), projectName);

  if (fs.existsSync(projectPath)) {
    error(`Directory "${projectName}" already exists.`);
    process.exit(1);
  }

  // Clone the repo
  heading("📦 Cloning AuthHero template...");
  try {
    execSync(`git clone --depth 1 ${REPO_URL} "${projectPath}"`, {
      stdio: "pipe",
    });
    success("Template cloned");
  } catch {
    error("Failed to clone repository. Make sure git is installed.");
    process.exit(1);
  }

  // Remove .git directory so the user starts fresh
  const gitDir = path.join(projectPath, ".git");
  fs.rmSync(gitDir, { recursive: true, force: true });
  success("Cleaned up .git history");

  // Remove the create-authhero package dir (it's the scaffolder itself)
  const packagesDir = path.join(projectPath, "packages");
  if (fs.existsSync(packagesDir)) {
    fs.rmSync(packagesDir, { recursive: true, force: true });
  }

  // Generate secrets and create .env
  heading("🔑 Generating secrets...");
  const envExamplePath = path.join(projectPath, ".env.example");
  const envPath = path.join(projectPath, ".env");

  if (fs.existsSync(envExamplePath)) {
    let envContent = fs.readFileSync(envExamplePath, "utf-8");

    // Auto-fill secret fields with generated values
    const secretFields = [
      "ACCESS_TOKEN_SECRET",
      "REFRESH_TOKEN_SECRET",
      "VERIFY_EMAIL_TOKEN_SECRET",
      "FORGOT_PSWD_TOKEN_SECRET",
      "RESET_PSWD_TOKEN_SECRET",
      "MFA_ENCRYPTION_KEY",
      "MFA_TEMP_TOKEN_SECRET",
    ];

    for (const field of secretFields) {
      // Replace empty value assignments like SECRET_KEY=
      const regex = new RegExp(`^(${field}=)$`, "m");
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `$1${generateSecret()}`);
        success(`Generated ${field}`);
      }
    }

    fs.writeFileSync(envPath, envContent);
    success("Created .env with generated secrets");
  }

  // Update package.json name
  const pkgPath = path.join(projectPath, "package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    pkg.name = projectName;
    pkg.version = "0.1.0";
    pkg.repository = {};
    pkg.author = "";
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    success(`Updated package.json name to "${projectName}"`);
  }

  // Install dependencies
  heading("📥 Installing dependencies...");
  try {
    execSync("npm install", { cwd: projectPath, stdio: "inherit" });
    success("Dependencies installed");
  } catch {
    warn("Failed to install dependencies. Run `npm install` manually.");
  }

  // Init git
  heading("🗃️  Initializing git...");
  try {
    execSync("git init", { cwd: projectPath, stdio: "pipe" });
    execSync("git add -A", { cwd: projectPath, stdio: "pipe" });
    execSync('git commit -m "Initial commit from create-authhero"', {
      cwd: projectPath,
      stdio: "pipe",
    });
    success("Git repository initialized");
  } catch {
    warn("Failed to initialize git. You can do this manually.");
  }

  // Done!
  heading("🚀 Your AuthHero project is ready!\n");
  log(`  ${BOLD}cd ${projectName}${RESET}`);
  log("");
  log("  Next steps:");
  log(`  ${CYAN}1.${RESET} Configure your database URL in ${BOLD}.env${RESET}`);
  log(`  ${CYAN}2.${RESET} Configure your email SMTP settings in ${BOLD}.env${RESET}`);
  log(
    `  ${CYAN}3.${RESET} Run database migrations:  ${BOLD}npx prisma migrate dev${RESET}`,
  );
  log(`  ${CYAN}4.${RESET} Start the server:         ${BOLD}npm run dev${RESET}`);
  log(`  ${CYAN}5.${RESET} Start the email worker:   ${BOLD}npm run worker${RESET}`);
  log("");
  log(`  Server will be at ${BOLD}http://localhost:5000${RESET}`);
  log(`  Health check:    ${BOLD}GET /health${RESET}`);
  log("");
  log(
    `  ${CYAN}Docs:${RESET} See ${BOLD}README.md${RESET} for full API reference and setup guide.`,
  );
  log("");
}

main().catch((err) => {
  error(err.message);
  process.exit(1);
});
