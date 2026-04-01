import type { ClientsFile, EnvConfig } from '../config/types.js';
import { getRealtimeActiveUsers } from '../ga4/index.js';
import { analyzeRealtime } from '../analysis/index.js';

export async function runPulseCheck(clients: ClientsFile, env: EnvConfig): Promise<void> {
  console.log('\n🫀 TrackGuard — Pulse Check (Realtime)\n');
  console.log(`Vérification de ${clients.clients.length} client(s)...\n`);

  let hasAlerts = false;

  for (const client of clients.clients) {
    process.stdout.write(`  ${client.name}... `);

    const result = await getRealtimeActiveUsers(client.ga4_property_id, env);
    const alerts = analyzeRealtime(client, result);

    if (result.error) {
      console.log(`⚠️  Erreur: ${result.error}`);
      continue;
    }

    if (alerts.length > 0) {
      hasAlerts = true;
      console.log(`🔴 ${result.activeUsers} active users`);
      for (const alert of alerts) {
        console.log(`     ⚡ [${alert.level}] ${alert.message}`);
      }
    } else {
      console.log(`✅ ${result.activeUsers} active users`);
    }
  }

  console.log('');

  if (hasAlerts) {
    console.log('⚠️  Des alertes ont été détectées. Vérifiez les propriétés GA4 concernées.');
    process.exitCode = 1;
  } else {
    console.log('✅ Tous les clients sont OK.');
  }
}
