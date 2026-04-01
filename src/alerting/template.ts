import type { HealthCheckResult } from '../config/types.js';

export function renderEmailReport(results: HealthCheckResult[]): string {
  const date = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const clientRows = results.map(r => renderClientRow(r)).join('');

  const critiques = results.filter(r => r.status === 'CRITIQUE').length;
  const alertes = results.filter(r => r.status === 'ALERTE').length;
  const warnings = results.filter(r => r.status === 'WARNING').length;
  const ok = results.filter(r => r.status === 'OK').length;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: -apple-system, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
  .container { max-width: 680px; margin: 20px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
  .header { background: #1a1a2e; color: #fff; padding: 24px 32px; }
  .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
  .header .date { color: #aaa; font-size: 14px; margin-top: 4px; }
  .summary { display: flex; gap: 12px; padding: 20px 32px; border-bottom: 1px solid #eee; }
  .badge { padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; }
  .badge-critique { background: #FFEBEE; color: #C62828; }
  .badge-alerte { background: #FFF3E0; color: #E65100; }
  .badge-warning { background: #FFFDE7; color: #F57F17; }
  .badge-ok { background: #E8F5E9; color: #2E7D32; }
  .clients { padding: 16px 32px; }
  .client { border: 1px solid #eee; border-radius: 8px; margin-bottom: 16px; overflow: hidden; }
  .client-header { padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; }
  .client-name { font-weight: 600; font-size: 15px; }
  .status { padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
  .status-ok { background: #E8F5E9; color: #2E7D32; }
  .status-warning { background: #FFFDE7; color: #F57F17; }
  .status-alerte { background: #FFF3E0; color: #E65100; }
  .status-critique { background: #FFEBEE; color: #C62828; }
  .client-body { padding: 0 18px 14px; font-size: 13px; color: #555; }
  .metric { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #f5f5f5; }
  .metric-label { color: #777; }
  .metric-value { font-weight: 500; }
  .metric-value.drop { color: #C62828; }
  .metric-value.zero { color: #C62828; font-weight: 700; }
  .alert-detail { background: #FFF8E1; border-left: 3px solid #F57C00; padding: 8px 12px; margin: 8px 0; font-size: 12px; border-radius: 0 4px 4px 0; }
  .alert-detail.critique { background: #FFEBEE; border-left-color: #C62828; }
  .footer { padding: 16px 32px; border-top: 1px solid #eee; font-size: 12px; color: #999; text-align: center; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>TrackGuard</h1>
    <div class="date">Rapport du ${date}</div>
  </div>
  <div class="summary">
    ${critiques > 0 ? `<span class="badge badge-critique">${critiques} Critique${critiques > 1 ? 's' : ''}</span>` : ''}
    ${alertes > 0 ? `<span class="badge badge-alerte">${alertes} Alerte${alertes > 1 ? 's' : ''}</span>` : ''}
    ${warnings > 0 ? `<span class="badge badge-warning">${warnings} Warning${warnings > 1 ? 's' : ''}</span>` : ''}
    ${ok > 0 ? `<span class="badge badge-ok">${ok} OK</span>` : ''}
  </div>
  <div class="clients">
    ${clientRows}
  </div>
  <div class="footer">
    TrackGuard — Monitoring Analytics GA4 — MV Group
  </div>
</div>
</body>
</html>`;
}

function renderClientRow(result: HealthCheckResult): string {
  const statusClass = result.status.toLowerCase();
  const statusLabel = result.status === 'OK' ? '✅ OK' :
    result.status === 'WARNING' ? '⚠️ Warning' :
    result.status === 'ALERTE' ? '🟠 Alerte' : '🔴 Critique';

  let metricsHtml = '';

  if (result.pageviews) {
    const dropClass = result.pageviews.dropPct > 40 ? 'drop' : '';
    metricsHtml += `
      <div class="metric">
        <span class="metric-label">Pageviews</span>
        <span class="metric-value ${dropClass}">${result.pageviews.current.toLocaleString('fr-FR')} (baseline: ${result.pageviews.baseline.toFixed(0)}) ${result.pageviews.dropPct > 0 ? `↓${result.pageviews.dropPct.toFixed(0)}%` : ''}</span>
      </div>`;
  }

  for (const [eventName, data] of Object.entries(result.events)) {
    const valueClass = data.current === 0 && data.baseline > 0 ? 'zero' : '';
    metricsHtml += `
      <div class="metric">
        <span class="metric-label">${eventName}</span>
        <span class="metric-value ${valueClass}">${data.current} (baseline: ${data.baseline.toFixed(1)})</span>
      </div>`;
  }

  const alertsHtml = result.alerts.map(a => {
    const cls = a.level === 'CRITIQUE' ? 'critique' : '';
    return `<div class="alert-detail ${cls}"><strong>${a.message}</strong><br>${a.details}</div>`;
  }).join('');

  return `
    <div class="client">
      <div class="client-header">
        <span class="client-name">${result.client.name}</span>
        <span class="status status-${statusClass}">${statusLabel}</span>
      </div>
      <div class="client-body">
        ${metricsHtml}
        ${alertsHtml}
      </div>
    </div>`;
}

/**
 * Render a console-friendly report.
 */
export function renderConsoleReport(results: HealthCheckResult[]): string {
  const lines: string[] = [];
  const date = new Date().toLocaleDateString('fr-FR');

  lines.push(`\n📊 TrackGuard — Rapport du ${date}\n`);
  lines.push('─'.repeat(60));

  for (const result of results) {
    const icon = result.status === 'OK' ? '✅' :
      result.status === 'WARNING' ? '⚠️ ' :
      result.status === 'ALERTE' ? '🟠' : '🔴';

    lines.push(`\n${icon} ${result.client.name} (${result.client.ga4_property_id})`);
    lines.push(`   URL: ${result.client.url}`);

    if (result.pageviews) {
      const arrow = result.pageviews.dropPct > 0 ? '↓' : '→';
      lines.push(`   Pageviews: ${result.pageviews.current.toLocaleString('fr-FR')} (baseline: ${result.pageviews.baseline.toFixed(0)}) ${arrow}${result.pageviews.dropPct.toFixed(0)}%`);
    }

    for (const [eventName, data] of Object.entries(result.events)) {
      const warning = data.current === 0 && data.baseline > 0 ? ' ❌' : '';
      lines.push(`   ${eventName}: ${data.current} (baseline: ${data.baseline.toFixed(1)})${warning}`);
    }

    for (const alert of result.alerts) {
      lines.push(`   ⚡ [${alert.level}] ${alert.message}`);
      lines.push(`      ${alert.details}`);
    }
  }

  lines.push('\n' + '─'.repeat(60));

  const critiques = results.filter(r => r.status === 'CRITIQUE').length;
  const alertes = results.filter(r => r.status === 'ALERTE').length;
  const ok = results.filter(r => r.status === 'OK').length;

  lines.push(`Résumé: ${ok} OK, ${alertes} alertes, ${critiques} critiques`);

  return lines.join('\n');
}
