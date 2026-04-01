import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ClientsFile, ClientConfig, EnvConfig } from './types.js';

export function loadEnv(): EnvConfig {
  // Load .env file if present
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }

  return {
    googleCredentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    googleCredentialsBase64: process.env.GOOGLE_CREDENTIALS_BASE64,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    smtpFrom: process.env.SMTP_FROM || 'TrackGuard <noreply@trackguard.local>',
    alertEmailTo: (process.env.ALERT_EMAIL_TO || '').split(',').map(e => e.trim()).filter(Boolean),
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
    dryRun: process.env.DRY_RUN === 'true',
  };
}

export function loadClients(path?: string): ClientsFile {
  const clientsPath = path || resolve(process.cwd(), 'clients.json');

  if (!existsSync(clientsPath)) {
    throw new Error(
      `Fichier clients introuvable: ${clientsPath}\n` +
      `Copier clients.example.json vers clients.json et configurer vos clients.`
    );
  }

  const raw = readFileSync(clientsPath, 'utf-8');
  let data: ClientsFile;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Erreur de parsing JSON dans ${clientsPath}`);
  }

  validateClients(data);
  return data;
}

function validateClients(data: ClientsFile): void {
  if (!data.clients || !Array.isArray(data.clients)) {
    throw new Error('Le fichier clients doit contenir un tableau "clients"');
  }

  if (data.clients.length === 0) {
    throw new Error('Aucun client configuré dans clients.json');
  }

  for (const client of data.clients) {
    const errors: string[] = [];

    if (!client.name) errors.push('name manquant');
    if (!client.ga4_property_id) errors.push('ga4_property_id manquant');
    if (!client.ga4_property_id?.startsWith('properties/')) {
      errors.push('ga4_property_id doit commencer par "properties/"');
    }
    if (!client.template) errors.push('template manquant');
    if (!client.events_monitored?.length) errors.push('events_monitored vide');
    if (!client.thresholds) errors.push('thresholds manquant');

    if (errors.length > 0) {
      throw new Error(
        `Client "${client.name || 'inconnu'}": ${errors.join(', ')}`
      );
    }
  }
}

export function resolveClientEvents(client: ClientConfig, templates: ClientsFile['templates']): string[] {
  if (client.events_monitored.length > 0) {
    return client.events_monitored;
  }
  const template = templates[client.template];
  if (!template) {
    throw new Error(`Template "${client.template}" introuvable pour le client "${client.name}"`);
  }
  return template.events;
}
