import { google } from 'googleapis';
import { readFileSync } from 'node:fs';
import type { EnvConfig } from '../config/types.js';

let cachedAuth: ReturnType<typeof google.auth.GoogleAuth.prototype.getClient> | null = null;

export async function getGoogleAuth(env: EnvConfig) {
  if (cachedAuth) return cachedAuth;

  let credentials: Record<string, unknown> | undefined;

  if (env.googleCredentialsBase64) {
    const json = Buffer.from(env.googleCredentialsBase64, 'base64').toString('utf-8');
    credentials = JSON.parse(json);
  } else if (env.googleCredentialsPath) {
    const json = readFileSync(env.googleCredentialsPath, 'utf-8');
    credentials = JSON.parse(json);
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: [
      'https://www.googleapis.com/auth/analytics.readonly',
    ],
  });

  cachedAuth = auth.getClient();
  return cachedAuth;
}

export function clearAuthCache(): void {
  cachedAuth = null;
}
