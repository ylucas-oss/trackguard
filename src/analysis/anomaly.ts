import type { ClientConfig, AlertEvent, HealthCheckResult } from '../config/types.js';
import type { RealtimeResult, DailyReport } from '../ga4/index.js';

/**
 * Analyze realtime data for a client — detect dead tracking.
 */
export function analyzeRealtime(
  client: ClientConfig,
  realtime: RealtimeResult
): AlertEvent[] {
  const alerts: AlertEvent[] = [];

  if (realtime.error) {
    alerts.push({
      level: 'WARNING',
      client,
      message: `Erreur API Realtime`,
      details: realtime.error,
      timestamp: new Date(),
    });
    return alerts;
  }

  if (realtime.activeUsers === 0 && client.thresholds.active_users_min > 0) {
    alerts.push({
      level: 'CRITIQUE',
      client,
      message: `0 utilisateur actif — tracking potentiellement mort`,
      details: `Aucun utilisateur actif détecté sur ${client.url}. Le tracking GA4 pourrait être cassé.`,
      timestamp: new Date(),
    });
  }

  return alerts;
}

/**
 * Analyze daily data vs baseline — detect volume drops and missing events.
 */
export function analyzeDaily(
  client: ClientConfig,
  current: DailyReport,
  baseline: { avgPageviews: number; avgEvents: Record<string, number>; avgActivePages: number }
): HealthCheckResult {
  const alerts: AlertEvent[] = [];
  let status: HealthCheckResult['status'] = 'OK';

  if (current.error) {
    alerts.push({
      level: 'WARNING',
      client,
      message: `Erreur API Data`,
      details: current.error,
      timestamp: new Date(),
    });
    return {
      client,
      timestamp: new Date(),
      activeUsers: null,
      pageviews: null,
      events: {},
      status: 'WARNING',
      alerts,
    };
  }

  // Check pageview drop
  let pageviewDrop = 0;
  if (baseline.avgPageviews > 0) {
    pageviewDrop = ((baseline.avgPageviews - current.totalPageviews) / baseline.avgPageviews) * 100;
  }

  if (pageviewDrop >= client.thresholds.pageview_drop_pct) {
    const level = pageviewDrop >= 80 ? 'CRITIQUE' as const : 'ALERTE' as const;
    alerts.push({
      level,
      client,
      message: `Chute de pageviews: -${pageviewDrop.toFixed(0)}%`,
      details: `${current.totalPageviews} pageviews hier vs ${baseline.avgPageviews.toFixed(0)} en moyenne (même jour de semaine, 4 dernières semaines)`,
      timestamp: new Date(),
    });
    status = level;
  }

  // Check each monitored event
  const eventsResult: Record<string, { current: number; baseline: number }> = {};

  for (const eventName of client.events_monitored) {
    if (eventName === 'page_view') continue; // Already checked above

    const currentCount = current.events.find(e => e.eventName === eventName)?.count || 0;
    const baselineCount = baseline.avgEvents[eventName] || 0;

    eventsResult[eventName] = { current: currentCount, baseline: baselineCount };

    // Event dropped to 0 when it normally has volume
    if (currentCount === 0 && baselineCount > 0) {
      const level = 'ALERTE' as const;
      alerts.push({
        level,
        client,
        message: `Event "${eventName}" à 0`,
        details: `Aucun event "${eventName}" hier. Moyenne habituelle: ${baselineCount.toFixed(1)}/jour.`,
        timestamp: new Date(),
      });
      if (status === 'OK' || status === 'WARNING') status = level;
    }

    // Event dropped significantly (>60%)
    if (currentCount > 0 && baselineCount > 0) {
      const drop = ((baselineCount - currentCount) / baselineCount) * 100;
      if (drop >= 60) {
        alerts.push({
          level: 'WARNING',
          client,
          message: `Event "${eventName}" en baisse: -${drop.toFixed(0)}%`,
          details: `${currentCount} hier vs ${baselineCount.toFixed(1)} en moyenne.`,
          timestamp: new Date(),
        });
        if (status === 'OK') status = 'WARNING';
      }
    }
  }

  return {
    client,
    timestamp: new Date(),
    activeUsers: null,
    pageviews: {
      current: current.totalPageviews,
      baseline: baseline.avgPageviews,
      dropPct: pageviewDrop,
    },
    events: eventsResult,
    status,
    alerts,
  };
}
