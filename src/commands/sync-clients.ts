import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EnvConfig, ClientsFile, ClientConfig } from '../config/types.js';
import { listProperties } from '../ga4/index.js';

const MV_API_BASE = 'https://api.intranet.mv-group.fr/client';

interface MVClient {
  code_client: string;
  raison_sociale: string;
  nom_usuel: string;
  website: string;
  statut_ferme: boolean;
  nature: string;
  secteur?: string;
  filiales?: string[];
}

/**
 * Fetch from MV Group intranet API using curl (SSL cert issues with fetch).
 */
async function mvApiFetch(endpoint: string): Promise<unknown> {
  const url = `${MV_API_BASE}${endpoint}`;
  const { execSync } = await import('node:child_process');
  try {
    const result = execSync(
      `curl -sk --max-time 15 "${url}"`,
      { encoding: 'utf-8', timeout: 20000 }
    );
    return JSON.parse(result);
  } catch {
    return null;
  }
}

/**
 * Search MV API for a client by name.
 */
async function searchMVClient(query: string): Promise<MVClient[]> {
  const result = await mvApiFetch(`/global/search?q=${encodeURIComponent(query)}`);
  if (!Array.isArray(result)) return [];
  return result as MVClient[];
}

/**
 * Get sites-web for a client code.
 */
async function getClientSites(codeClient: string): Promise<string[]> {
  const result = await mvApiFetch(`/flow-client-fiche/${codeClient}/sites-web`);
  if (!Array.isArray(result)) return [];
  return result as string[];
}

/**
 * Get prestations for a client — check if they have tracking/analytics services.
 */
async function getClientPrestations(codeClient: string): Promise<{ hasTracking: boolean; hasEcommerce: boolean }> {
  const result = await mvApiFetch(`/flow-client-fiche/${codeClient}/prestations-fast`);
  if (!Array.isArray(result)) return { hasTracking: false, hasEcommerce: false };

  const prestations = result as Array<{ expertise?: string; libelle_article?: string; libelle_famille_article_niv1?: string }>;

  const hasTracking = prestations.some(p =>
    p.expertise?.includes('webanalyse') ||
    p.libelle_famille_article_niv1?.includes('Tracking') ||
    p.libelle_article?.toLowerCase().includes('tracking')
  );

  const hasEcommerce = prestations.some(p =>
    p.libelle_article?.toLowerCase().includes('e-commerce') ||
    p.libelle_article?.toLowerCase().includes('ecommerce') ||
    p.libelle_article?.toLowerCase().includes('transaction')
  );

  return { hasTracking, hasEcommerce };
}

/**
 * Normalize URL for comparison (remove protocol, www, trailing slash).
 */
function normalizeUrl(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

/**
 * Try to match a GA4 property's website URL with MV API clients.
 */
async function matchPropertyToClient(
  propertyDisplayName: string,
  propertyWebsiteUrl: string | undefined
): Promise<{ mvClient: MVClient | null; sites: string[] }> {
  // Strategy 1: Search by property display name
  const searchResults = await searchMVClient(propertyDisplayName);

  if (searchResults.length === 1) {
    const sites = await getClientSites(searchResults[0]!.code_client);
    return { mvClient: searchResults[0]!, sites };
  }

  // Strategy 2: If we have a website URL from GA4, match against search results
  if (propertyWebsiteUrl && searchResults.length > 0) {
    const normalizedTarget = normalizeUrl(propertyWebsiteUrl);
    for (const client of searchResults) {
      if (client.website && normalizeUrl(client.website) === normalizedTarget) {
        const sites = await getClientSites(client.code_client);
        return { mvClient: client, sites };
      }
    }
  }

  // Strategy 3: Return first active non-closed match
  const activeClients = searchResults.filter(c => !c.statut_ferme && c.nature === 'CLI');
  if (activeClients.length > 0) {
    const sites = await getClientSites(activeClients[0]!.code_client);
    return { mvClient: activeClients[0]!, sites };
  }

  return { mvClient: null, sites: [] };
}

/**
 * Detect template based on prestations and client info.
 */
function detectTemplate(hasTracking: boolean, hasEcommerce: boolean): string {
  if (hasEcommerce) return 'ecommerce';
  if (hasTracking) return 'lead_gen';
  return 'vitrine';
}

export async function runSyncClients(env: EnvConfig): Promise<void> {
  console.log('\n🔄 TrackGuard — Synchronisation clients\n');

  // Step 1: List all GA4 properties from service account
  console.log('1️⃣  Récupération des propriétés GA4 via le service account...');
  let properties;
  try {
    properties = await listProperties(env);
  } catch (err) {
    console.error(`❌ Impossible de lister les propriétés GA4: ${err instanceof Error ? err.message : err}`);
    console.error('   Vérifiez que les credentials Google sont configurés dans .env');
    process.exitCode = 1;
    return;
  }

  if (properties.length === 0) {
    console.log('   Aucune propriété GA4 trouvée.');
    process.exitCode = 1;
    return;
  }

  console.log(`   ✅ ${properties.length} propriété(s) GA4 trouvée(s)\n`);

  // Step 2: For each property, try to match with MV API client
  console.log('2️⃣  Matching avec l\'API Flow Client MV Group...\n');

  const clients: ClientConfig[] = [];
  const unmatched: string[] = [];

  for (const prop of properties) {
    process.stdout.write(`   ${prop.displayName} (${prop.name})... `);

    const { mvClient, sites } = await matchPropertyToClient(prop.displayName, undefined);

    if (mvClient) {
      const presta = await getClientPrestations(mvClient.code_client);
      const template = detectTemplate(presta.hasTracking, presta.hasEcommerce);
      const url = mvClient.website || sites[0] || '';

      // Get template events
      const templateEvents: Record<string, string[]> = {
        vitrine: ['page_view'],
        lead_gen: ['page_view', 'form_submit', 'generate_lead'],
        ecommerce: ['page_view', 'form_submit', 'add_to_cart', 'begin_checkout', 'purchase'],
      };

      clients.push({
        name: `${mvClient.raison_sociale} (${mvClient.code_client})`,
        ga4_property_id: prop.name,
        template,
        url,
        events_monitored: templateEvents[template] || ['page_view'],
        critical_pages: ['/'],
        thresholds: {
          pageview_drop_pct: 40,
          event_zero_days: 1,
          active_users_min: 1,
        },
      });

      console.log(`✅ → ${mvClient.raison_sociale} (${template})`);
    } else {
      // Add with just GA4 info, manual enrichment needed
      clients.push({
        name: prop.displayName,
        ga4_property_id: prop.name,
        template: 'vitrine',
        url: '',
        events_monitored: ['page_view'],
        critical_pages: ['/'],
        thresholds: {
          pageview_drop_pct: 40,
          event_zero_days: 1,
          active_users_min: 1,
        },
      });

      unmatched.push(prop.displayName);
      console.log(`⚠️  Pas de correspondance MV API — ajouté en mode vitrine`);
    }
  }

  // Step 3: Write clients.json
  const outputPath = resolve(process.cwd(), 'clients.json');

  // Load existing templates or use defaults
  const clientsFile: ClientsFile = {
    clients,
    templates: {
      vitrine: { events: ['page_view'], description: 'Site vitrine — monitoring pageviews uniquement' },
      lead_gen: { events: ['page_view', 'form_submit', 'generate_lead'], description: 'Site lead generation — pageviews + formulaires' },
      ecommerce: { events: ['page_view', 'form_submit', 'add_to_cart', 'begin_checkout', 'purchase'], description: 'Site e-commerce — tunnel de conversion complet' },
    },
  };

  writeFileSync(outputPath, JSON.stringify(clientsFile, null, 2), 'utf-8');

  console.log(`\n3️⃣  Fichier clients.json généré: ${outputPath}`);
  console.log(`   ✅ ${clients.length} client(s) configuré(s)`);

  if (unmatched.length > 0) {
    console.log(`   ⚠️  ${unmatched.length} propriété(s) sans correspondance MV API:`);
    for (const name of unmatched) {
      console.log(`      • ${name} — à enrichir manuellement`);
    }
  }

  console.log('\n' + '─'.repeat(60));
  console.log('Prochaine étape: vérifier clients.json puis lancer `npm run check`');
}
