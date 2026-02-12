import cors from "cors";

const allowedOrigins: (string | RegExp)[] = [
  process.env.FRONTEND_URL, // Production frontend
  "http://localhost:3000", // Local development (default Next.js port)
  "http://localhost:5173", // Alternative local react development (Vite)
].filter(Boolean) as (string | RegExp)[]; 
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    const isAllowed = allowedOrigins.some((allowedOrigin) => {
      if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return (
        origin.startsWith(allowedOrigin as string) || allowedOrigin === origin
      );
    });

    if (isAllowed) {
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