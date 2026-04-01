import { AnalyticsAdminServiceClient } from '@google-analytics/admin';
import type { EnvConfig } from '../config/types.js';
import { readFileSync } from 'node:fs';

function createAdminClient(env: EnvConfig): AnalyticsAdminServiceClient {
  if (env.googleCredentialsBase64) {
    const json = Buffer.from(env.googleCredentialsBase64, 'base64').toString('utf-8');
    const credentials = JSON.parse(json);
    return new AnalyticsAdminServiceClient({ credentials });
  }

  if (env.googleCredentialsPath) {
    const json = readFileSync(env.googleCredentialsPath, 'utf-8');
    const credentials = JSON.parse(json);
    return new AnalyticsAdminServiceClient({ credentials });
  }

  return new AnalyticsAdminServiceClient();
}

export interface GA4Property {
  name: string;
  displayName: string;
  propertyType: string;
  createTime: string;
}

/**
 * List all GA4 properties accessible by the service account.
 */
export async function listProperties(env: EnvConfig): Promise<GA4Property[]> {
  try {
    const client = createAdminClient(env);

    const properties: GA4Property[] = [];

    // List all accounts first
    const accountsIterable = client.listAccountsAsync({});
    const accounts: string[] = [];

    for await (const account of accountsIterable) {
      if (account.name) accounts.push(account.name);
    }

    // Then list properties for each account
    for (const account of accounts) {
      const propertiesIterable = client.listPropertiesAsync({
        filter: `parent:${account}`,
      });

      for await (const property of propertiesIterable) {
        properties.push({
          name: property.name || '',
          displayName: property.displayName || '',
          propertyType: property.propertyType?.toString() || 'UNKNOWN',
          createTime: property.createTime?.seconds?.toString() || '',
        });
      }
    }

    return properties;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Erreur lors de la récupération des propriétés GA4: ${message}`);
  }
}
