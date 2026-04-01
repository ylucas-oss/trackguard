import { BetaAnalyticsDataClient } from '@google-analytics/data';
import type { EnvConfig } from '../config/types.js';
import { readFileSync } from 'node:fs';

function createClient(env: EnvConfig): BetaAnalyticsDataClient {
  if (env.googleCredentialsBase64) {
    const json = Buffer.from(env.googleCredentialsBase64, 'base64').toString('utf-8');
    const credentials = JSON.parse(json);
    return new BetaAnalyticsDataClient({ credentials });
  }

  if (env.googleCredentialsPath) {
    const json = readFileSync(env.googleCredentialsPath, 'utf-8');
    const credentials = JSON.parse(json);
    return new BetaAnalyticsDataClient({ credentials });
  }

  // Falls back to GOOGLE_APPLICATION_CREDENTIALS env var
  return new BetaAnalyticsDataClient();
}

export interface RealtimeResult {
  propertyId: string;
  activeUsers: number;
  error?: string;
}

export async function getRealtimeActiveUsers(
  propertyId: string,
  env: EnvConfig
): Promise<RealtimeResult> {
  try {
    const client = createClient(env);

    const [response] = await client.runRealtimeReport({
      property: propertyId,
      metrics: [{ name: 'activeUsers' }],
    });

    const activeUsers = response.rows?.[0]?.metricValues?.[0]?.value;

    return {
      propertyId,
      activeUsers: activeUsers ? parseInt(activeUsers, 10) : 0,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      propertyId,
      activeUsers: -1,
      error: message,
    };
  }
}
