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

  return new BetaAnalyticsDataClient();
}

export interface EventVolume {
  eventName: string;
  count: number;
}

export interface DailyReport {
  propertyId: string;
  date: string;
  totalPageviews: number;
  activePages: number;
  events: EventVolume[];
  error?: string;
}

/**
 * Get event volumes for a specific date range.
 * Used for both yesterday's data and baseline calculation.
 */
export async function getEventVolumes(
  propertyId: string,
  startDate: string,
  endDate: string,
  eventNames: string[],
  env: EnvConfig
): Promise<DailyReport> {
  try {
    const client = createClient(env);

    // Query event counts by event_name
    const [response] = await client.runReport({
      property: propertyId,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          inListFilter: {
            values: eventNames,
          },
        },
      },
    });

    const events: EventVolume[] = eventNames.map(name => {
      const row = response.rows?.find(
        r => r.dimensionValues?.[0]?.value === name
      );
      return {
        eventName: name,
        count: row ? parseInt(row.metricValues?.[0]?.value || '0', 10) : 0,
      };
    });

    const pageviews = events.find(e => e.eventName === 'page_view')?.count || 0;

    // Query active pages count
    const [pagesResponse] = await client.runReport({
      property: propertyId,
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }],
      limit: 10000,
    });

    const activePages = pagesResponse.rows?.length || 0;

    return {
      propertyId,
      date: endDate,
      totalPageviews: pageviews,
      activePages,
      events,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      propertyId,
      date: endDate,
      totalPageviews: 0,
      activePages: 0,
      events: [],
      error: message,
    };
  }
}

/**
 * Get baseline for a specific day of week over the past N weeks.
 * E.g., if today is Tuesday, get the average of the last 4 Tuesdays.
 */
export async function getBaseline(
  propertyId: string,
  eventNames: string[],
  weeksBack: number,
  env: EnvConfig
): Promise<{ avgPageviews: number; avgEvents: Record<string, number>; avgActivePages: number }> {
  const now = new Date();
  const dayOfWeek = now.getDay();

  const reports: DailyReport[] = [];

  for (let w = 1; w <= weeksBack; w++) {
    const date = new Date(now);
    date.setDate(date.getDate() - (w * 7));
    // Adjust to same day of week
    const diff = date.getDay() - dayOfWeek;
    date.setDate(date.getDate() - diff);

    const dateStr = formatDate(date);
    const report = await getEventVolumes(propertyId, dateStr, dateStr, eventNames, env);

    if (!report.error) {
      reports.push(report);
    }
  }

  if (reports.length === 0) {
    return { avgPageviews: 0, avgEvents: {}, avgActivePages: 0 };
  }

  const avgPageviews = reports.reduce((sum, r) => sum + r.totalPageviews, 0) / reports.length;
  const avgActivePages = reports.reduce((sum, r) => sum + r.activePages, 0) / reports.length;

  const avgEvents: Record<string, number> = {};
  for (const eventName of eventNames) {
    const total = reports.reduce((sum, r) => {
      const evt = r.events.find(e => e.eventName === eventName);
      return sum + (evt?.count || 0);
    }, 0);
    avgEvents[eventName] = total / reports.length;
  }

  return { avgPageviews, avgEvents, avgActivePages };
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]!;
}
