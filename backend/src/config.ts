// Centralised environment configuration for the Katei API.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.BACKEND_PORT ?? 3000),
  host: process.env.BACKEND_HOST ?? '0.0.0.0',
  databaseUrl: required('DATABASE_URL'),
  nodeEnv: process.env.NODE_ENV ?? 'development',
} as const;
