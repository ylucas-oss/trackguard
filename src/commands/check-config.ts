import type { EnvConfig } from '../config/types.js';
import { loadClients } from '../config/index.js';

export async function runCheckConfig(env: EnvConfig): Promise<void> {
  console.log('\n🔧 TrackGuard — Vérification de la configuration\n');

  let hasErrors = false;

  // Check Google credentials
  console.log('Google Service Account:');
  if (env.googleCredentialsPath) {
    console.log(`  ✅ GOOGLE_APPLICATION_CREDENTIALS: ${env.googleCredentialsPath}`);
  } else if (env.googleCredentialsBase64) {
    console.log(`  ✅ GOOGLE_CREDENTIALS_BASE64: configuré`);
  } else {
    console.log(`  ❌ Aucun credentials Google configuré`);
    hasErrors = true;
  }

  // Check SMTP
  console.log('\nEmail (SMTP):');
  if (env.smtpHost && env.smtpUser) {
    console.log(`  ✅ SMTP: ${env.smtpHost}:${env.smtpPort || 587}`);
    console.log(`  ✅ From: ${env.smtpFrom}`);
  } else {
    console.log(`  ⚠️  SMTP non configuré — les emails ne seront pas envoyés`);
  }

  // Check alert recipients
  console.log('\nDestinataires alertes:');
  if (env.alertEmailTo.length > 0) {
    for (const email of env.alertEmailTo) {
      console.log(`  ✅ ${email}`);
    }
  } else {
    console.log(`  ⚠️  Aucun destinataire configuré`);
  }

  // Check Slack
  console.log('\nSlack:');
  if (env.slackWebhookUrl) {
    console.log(`  ✅ Webhook configuré`);
  } else {
    console.log(`  ℹ️  Non configuré (optionnel)`);
  }

  // Check dry-run mode
  console.log(`\nMode: ${env.dryRun ? '🧪 DRY-RUN (pas d\'envoi réel)' : '🚀 PRODUCTION'}`);

  // Check clients config
  console.log('\nClients:');
  try {
    const clients = loadClients();
    console.log(`  ✅ ${clients.clients.length} client(s) configuré(s):`);
    for (const client of clients.clients) {
      console.log(`     • ${client.name} (${client.ga4_property_id}) — template: ${client.template}`);
      console.log(`       Events: ${client.events_monitored.join(', ')}`);
      console.log(`       Seuils: pageview drop >${client.thresholds.pageview_drop_pct}%, event zero >${client.thresholds.event_zero_days}j`);
    }
  } catch (err) {
    console.log(`  ❌ ${err instanceof Error ? err.message : err}`);
    hasErrors = true;
  }

  console.log('\n' + '─'.repeat(60));

  if (hasErrors) {
    console.log('❌ Des erreurs de configuration ont été détectées.');
    process.exitCode = 1;
  } else {
    console.log('✅ Configuration OK — TrackGuard est prêt.');
  }
}
