import type { EnvConfig } from '../config/types.js';
import { listProperties } from '../ga4/index.js';

export async function runListProperties(env: EnvConfig): Promise<void> {
  console.log('\n🔍 TrackGuard — Propriétés GA4 accessibles\n');
  console.log('Interrogation du service account...\n');

  try {
    const properties = await listProperties(env);

    if (properties.length === 0) {
      console.log('Aucune propriété GA4 trouvée.');
      console.log('Vérifiez que le service account a les droits Viewer sur vos propriétés GA4.');
      return;
    }

    console.log(`${properties.length} propriété(s) trouvée(s):\n`);

    for (const prop of properties) {
      console.log(`  📊 ${prop.displayName}`);
      console.log(`     ID: ${prop.name}`);
      console.log(`     Type: ${prop.propertyType}`);
      console.log('');
    }

    console.log('─'.repeat(60));
    console.log('Pour ajouter un client, copiez le property ID (properties/XXXXX)');
    console.log('dans votre fichier clients.json.');
  } catch (err) {
    console.error(`❌ ${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  }
}
