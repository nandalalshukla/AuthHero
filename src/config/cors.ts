import cors from "cors";
import { env } from "./env";

const allowedOrigins: string[] = [
  env.FRONTEND_URL,
  env.APP_URL,
  "http://localhost:8080", // Local development (default Next.js port)
  "http://localhost:5173", // Alternative local react development (Vite)
].filter(Boolean) as string[];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    //Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Strict equality check — never use startsWith() here because
    // "http://localhost:3000.evil.com" would pass a prefix check.
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

export default cors(corsOptions);
