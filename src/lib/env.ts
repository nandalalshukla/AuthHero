const getEnvVariable = function (key: string, defaultValule?: string): string {
  const value = process.env[key] || defaultValule;
  if (!value) {
    throw new Error("No Key Provided for Env Variable");
  }
  return value;
};

export const NODE_ENV = getEnvVariable("NODE_ENV", "development");
export const PORT = Number(getEnvVariable("PORT", "4000"));
export const DATABASE_URL = getEnvVariable("DATABASE_URL");
export const CLIENT_URL = getEnvVariable("CLIENT_URL", "http://localhost:5173");
export const JWT_ACCESS_TOKEN_SECRET = getEnvVariable("JWT_ACCESS_TOKEN_SECRET");
export const JWT_REFRESH_TOKEN_SECRET = getEnvVariable("JWT_REFRESH_TOKEN_SECRET");
