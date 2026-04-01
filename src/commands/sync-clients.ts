import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { EnvConfig, ClientsFile, ClientConfig } from '../config/types.js';

const MV_API_BASE = 'https://api.intranet.mv-group.fr/client';

interface MVSiteWeb {
  id: number;
  code_client: string;
  url: string;
  analytics_fournisseur: string | null;
  analytics_id: string | null;
  tag_manager_tool: string | null;
  tag_manager_id: string | null;
}

interface MVClient {
  code_client: string;
  raison_sociale: string;
  website: string;
  statut_ferme: boolean;
  nature: string;
}

const TEMPLATE_EVENTS: Record<string, string[]> = {
  vitrine: ['page_view'],
  lead_gen: ['page_view', 'form_submit', 'generate_lead'],
  ecommerce: ['page_view', 'form_submit', 'add_to_cart', 'begin_checkout', 'purchase'],
};

/**
 * Fetch from MV Group intranet API using curl (internal SSL certs).
 */
function mvApiFetch<T>(endpoint: string): T | null {
  const url = `${MV_API_BASE}${endpoint}`;
  try {
    const result = execSync(`curl -sk --max-time 15 "${url}"`, {
      encoding: 'utf-8',
      timeout: 20000,
    });
    return JSON.parse(result) as T;
  } catch {
    return null;
  }
}

/**
 * Get structured sites-web for a client (with GA4/GTM IDs).
 */
function getClientSitesWeb(codeClient: string): MVSiteWeb[] {
  const result = mvApiFetch<MVSiteWeb[]>(`/sites-web/by-client/${codeClient}`);
  if (!Array.isArray(result)) return [];
  return result;
}

/**
 * Search MV API for clients.
 */
function searchMVClients(query: string): MVClient[] {
  const result = mvApiFetch<MVClient[]>(`/global/search?q=${encodeURIComponent(query)}`);
  if (!Array.isArray(result)) return [];
  return result;
}

/**
 * Get all active clients with websites by searching A-Z.
 */
function getAllClientsWithWebsites(): Map<string, MVClient> {
  const clients = new Map<string, MVClient>();
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';

  for (const letter of alphabet) {
    const results = searchMVClients(letter);
    for (const c of results) {
      if (!c.statut_ferme && c.website?.startsWith('http') && !clients.has(c.code_client)) {
        clients.set(c.code_client, c);
      }
    }
  }

  return clients;
}

/**
 * Detect template based on prestations.
 */
function detectTemplate(codeClient: string): string {
  const prestations = mvApiFetch<Array<{
    expertise?: string;
    libelle_article?: string;
    libelle_famille_article_niv1?: string;
  }>>(`/flow-client-fiche/${codeClient}/prestations-fast`);

  if (!Array.isArray(prestations)) return 'vitrine';

  const hasEcommerce = prestations.some(p =>
    p.libelle_article?.toLowerCase().includes('e-commerce') ||
    p.libelle_article?.toLowerCase().includes('ecommerce') ||
    p.libelle_article?.toLowerCase().includes('transaction')
  );
  if (hasEcommerce) return 'ecommerce';

  const hasTracking = prestations.some(p =>
    p.expertise?.includes('webanalyse') ||
    p.libelle_famille_article_niv1?.includes('Tracking') ||
    p.libelle_article?.toLowerCase().includes('tracking')
  );
  if (hasTracking) return 'lead_gen';

  return 'vitrine';
}

/**
 * Normalize GA4 property ID to properties/XXXXXXX format.
 */
function normalizePropertyId(analyticsId: string): string {
  const trimmed = analyticsId.trim();
  // Already in properties/ format
  if (trimmed.startsWith('properties/')) return trimmed;
  // Pure numeric ID
  if (/^\d+$/.test(trimmed)) return `properties/${trimmed}`;
  // G- measurement ID (not a property ID, but store it)
  if (trimmed.startsWith('G-')) return trimmed;
  return trimmed;
}

export async function runSyncClients(env: EnvConfig): Promise<void> {
  console.log('\n🔄 TrackGuard — Synchronisation clients depuis API Flow Client\n');

  // Step 1: Get all clients with websites
  console.log('1️⃣  Récupération de tous les clients actifs avec un site web...');
  const allClients = getAllClientsWithWebsites();
  console.log(`   ✅ ${allClients.size} clients actifs avec website\n`);

  // Step 2: For each client, get sites-web with GA4/GTM IDs
  console.log('2️⃣  Récupération des sites-web avec IDs GA4/GTM...\n');

  const clientConfigs: ClientConfig[] = [];
  let scanned = 0;
  let withGA4 = 0;

  for (const [code, client] of allClients) {
    scanned++;
    if (scanned % 50 === 0) {
      console.log(`   Progression: ${scanned}/${allClients.size}...`);
    }

    const sites = getClientSitesWeb(code);
    const ga4Sites = sites.filter(s =>
      s.analytics_fournisseur === 'GA4' && s.analytics_id
    );

    if (ga4Sites.length === 0) continue;

    // Detect template from prestations
    const template = detectTemplate(code);
    const events = TEMPLATE_EVENTS[template] || ['page_view'];

    // Group sites by property ID (multiple URLs can share same property)
    const byProperty = new Map<string, MVSiteWeb[]>();
    for (const site of ga4Sites) {
      const propId = normalizePropertyId(site.analytics_id!);
      if (!byProperty.has(propId)) byProperty.set(propId, []);
      byProperty.get(propId)!.push(site);
    }

    for (const [propertyId, propertySites] of byProperty) {
      // Skip measurement IDs (G-XXX) — we need property IDs for the API
      if (propertyId.startsWith('G-')) continue;

      const mainSite = propertySites[0]!;
      const gtmId = (mainSite.tag_manager_id || '').trim() || undefined;

      withGA4++;
      clientConfigs.push({
        name: `${client.raison_sociale} (${code})`,
        ga4_property_id: propertyId,
        template,
        url: mainSite.url,
        events_monitored: events,
        critical_pages: ['/'],
        thresholds: {
          pageview_drop_pct: 40,
          event_zero_days: 1,
          active_users_min: 1,
        },
      });
    }
  }

  console.log(`\n   ✅ ${withGA4} propriétés GA4 trouvées sur ${scanned} clients scannés\n`);

  // Step 3: Write clients.json
  const outputPath = resolve(process.cwd(), 'clients.json');

  const clientsFile: ClientsFile = {
    clients: clientConfigs,
    templates: {
      vitrine: { events: ['page_view'], description: 'Site vitrine — monitoring pageviews uniquement' },
      lead_gen: { events: ['page_view', 'form_submit', 'generate_lead'], description: 'Site lead generation — pageviews + formulaires' },
      ecommerce: { events: ['page_view', 'form_submit', 'add_to_cart', 'begin_checkout', 'purchase'], description: 'Site e-commerce — tunnel de conversion complet' },
    },
  };

  writeFileSync(outputPath, JSON.stringify(clientsFile, null, 2), 'utf-8');

  console.log(`3️⃣  Fichier clients.json généré: ${outputPath}`);
  console.log(`   ✅ ${clientConfigs.length} site(s) GA4 à monitorer\n`);

  // Summary
  console.log('─'.repeat(60));
  console.log('📊 Résumé par template:');
  const byTemplate = { vitrine: 0, lead_gen: 0, ecommerce: 0 };
  for (const c of clientConfigs) {
    byTemplate[c.template as keyof typeof byTemplate]++;
  }
  console.log(`   Vitrine:    ${byTemplate.vitrine}`);
  console.log(`   Lead Gen:   ${byTemplate.lead_gen}`);
  console.log(`   E-commerce: ${byTemplate.ecommerce}`);
  console.log('\nProchaine étape: vérifier clients.json puis lancer `npm run check`');
}
