import type { ClientsFile, EnvConfig, HealthCheckResult } from '../config/types.js';
import { getEventVolumes, getBaseline } from '../ga4/index.js';
import { analyzeDaily } from '../analysis/index.js';
import { sendEmailReport } from '../alerting/email.js';
import { renderConsoleReport } from '../alerting/template.js';
import { resolveClientEvents } from '../config/index.js';

export async function runDailyReport(clients: ClientsFile, env: EnvConfig): Promise<void> {
  console.log('\n📊 TrackGuard — Rapport Quotidien\n');
  console.log(`Analyse de ${clients.clients.length} client(s)...\n`);

  const results: HealthCheckResult[] = [];

  // Yesterday's date
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0]!;

  for (const client of clients.clients) {
    process.stdout.write(`  ${client.name}... `);

    const events = resolveClientEvents(client, clients.templates);

    // Get yesterday's data
    const current = await getEventVolumes(
      client.ga4_property_id,
      yesterdayStr,
      yesterdayStr,
      events,
      env
    );

    // Get baseline (same day of week, 4 weeks)
    const baseline = await getBaseline(
      client.ga4_property_id,
      events,
      4,
      env
    );

    // Analyze
    const result = analyzeDaily(client, current, baseline);
    results.push(result);

    const icon = result.status === 'OK' ? '✅' :
      result.status === 'WARNING' ? '⚠️ ' :
      result.status === 'ALERTE' ? '🟠' : '🔴';

    console.log(`${icon} ${result.status}`);
  }

  // Print console report
  console.log(renderConsoleReport(results));

  // Send email report
  await sendEmailReport(results, env);
}
