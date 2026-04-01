import { createTransport } from 'nodemailer';
import type { EnvConfig, HealthCheckResult } from '../config/types.js';
import { renderEmailReport } from './template.js';

export async function sendEmailReport(
  results: HealthCheckResult[],
  env: EnvConfig
): Promise<void> {
  if (env.dryRun) {
    console.log('📧 [DRY-RUN] Email non envoyé. Contenu:');
    console.log(`   Destinataires: ${env.alertEmailTo.join(', ')}`);
    console.log(`   Sujet: ${getSubject(results)}`);
    return;
  }

  if (!env.smtpHost || !env.smtpUser || !env.smtpPass) {
    console.warn('⚠️  SMTP non configuré — email non envoyé');
    return;
  }

  if (env.alertEmailTo.length === 0) {
    console.warn('⚠️  Aucun destinataire configuré — email non envoyé');
    return;
  }

  const transporter = createTransport({
    host: env.smtpHost,
    port: env.smtpPort || 587,
    secure: env.smtpPort === 465,
    auth: {
      user: env.smtpUser,
      pass: env.smtpPass,
    },
  });

  const html = renderEmailReport(results);

  await transporter.sendMail({
    from: env.smtpFrom,
    to: env.alertEmailTo.join(', '),
    subject: getSubject(results),
    html,
  });

  console.log(`📧 Email envoyé à ${env.alertEmailTo.join(', ')}`);
}

function getSubject(results: HealthCheckResult[]): string {
  const critiques = results.filter(r => r.status === 'CRITIQUE').length;
  const alertes = results.filter(r => r.status === 'ALERTE').length;
  const date = new Date().toLocaleDateString('fr-FR');

  if (critiques > 0) {
    return `🔴 TrackGuard — ${critiques} CRITIQUE(S) détecté(s) — ${date}`;
  }
  if (alertes > 0) {
    return `🟠 TrackGuard — ${alertes} ALERTE(S) — ${date}`;
  }
  return `✅ TrackGuard — Tout OK — ${date}`;
}
