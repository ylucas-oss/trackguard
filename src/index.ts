#!/usr/bin/env node

import { Command } from 'commander';
import { loadEnv, loadClients } from './config/index.js';
import { runPulseCheck } from './commands/pulse.js';
import { runDailyReport } from './commands/daily.js';
import { runListProperties } from './commands/list-properties.js';
import { runCheckConfig } from './commands/check-config.js';
import { runSyncClients } from './commands/sync-clients.js';

const program = new Command();

program
  .name('trackguard')
  .description('TrackGuard — Monitoring Analytics GA4')
  .version('0.1.0');

program
  .command('pulse')
  .description('Pulse Check — Vérifier les active users en temps réel (Realtime API)')
  .option('--dry-run', 'Mode dry-run, pas d\'envoi d\'alertes')
  .action(async (opts) => {
    const env = loadEnv();
    if (opts.dryRun) env.dryRun = true;
    const clients = loadClients();
    await runPulseCheck(clients, env);
  });

program
  .command('daily')
  .description('Rapport Quotidien — Analyser les volumes J-1 vs baseline (Data API)')
  .option('--dry-run', 'Mode dry-run, pas d\'envoi d\'alertes')
  .action(async (opts) => {
    const env = loadEnv();
    if (opts.dryRun) env.dryRun = true;
    const clients = loadClients();
    await runDailyReport(clients, env);
  });

program
  .command('list-properties')
  .description('Lister toutes les propriétés GA4 accessibles par le service account')
  .action(async () => {
    const env = loadEnv();
    await runListProperties(env);
  });

program
  .command('check-config')
  .alias('check')
  .description('Vérifier la configuration (credentials, clients, SMTP)')
  .action(async () => {
    const env = loadEnv();
    await runCheckConfig(env);
  });

program
  .command('sync-clients')
  .alias('sync')
  .description('Synchroniser les clients depuis GA4 Admin API + API Flow Client MV Group')
  .action(async () => {
    const env = loadEnv();
    await runSyncClients(env);
  });

program.parse();
