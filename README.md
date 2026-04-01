# TrackGuard

Monitoring automatique de la collecte analytics GA4 pour les clients MV Group.

## Fonctionnalités

- **Pulse Check** — Vérifie en temps réel que le tracking est vivant (Realtime API, toutes les 4h)
- **Rapport Quotidien** — Compare les volumes J-1 vs baseline par jour de semaine (Data API)
- **Alerting** — 4 niveaux (CRITIQUE, ALERTE, WARNING, INFO) avec notifications email
- **Multi-clients** — Templates métier (vitrine, lead gen, e-commerce)

## Installation

```bash
npm install
```

## Configuration

### 1. Google Service Account

Le service account doit avoir le rôle **Viewer** sur chaque propriété GA4 à monitorer.

```bash
cp .env.example .env
# Éditer .env avec le chemin vers le fichier JSON du service account
```

### 2. Clients

```bash
cp clients.example.json clients.json
# Éditer clients.json avec vos propriétés GA4
```

### 3. Vérifier la configuration

```bash
npm run check
```

## Utilisation

```bash
# Lister les propriétés GA4 accessibles
npm run list

# Pulse Check (active users en temps réel)
npm run pulse

# Rapport Quotidien (volumes J-1 vs baseline)
npm run daily

# Mode dry-run (pas d'envoi d'alertes)
npx tsx src/index.ts pulse --dry-run
npx tsx src/index.ts daily --dry-run
```

## Cron

```bash
# Pulse Check toutes les 4h
0 */4 * * * cd /path/to/trackguard && npm run pulse

# Rapport Quotidien chaque matin à 7h
0 7 * * * cd /path/to/trackguard && npm run daily
```

## Templates clients

| Template | Events monitorés |
|----------|-----------------|
| **vitrine** | page_view |
| **lead_gen** | page_view, form_submit, generate_lead |
| **ecommerce** | page_view, form_submit, add_to_cart, begin_checkout, purchase |

## Architecture

```
src/
├── config/      # Chargement config, validation, types
├── ga4/         # Modules API GA4 (auth, realtime, data, properties)
├── analysis/    # Détection d'anomalies, comparaison baseline
├── alerting/    # Email, templates HTML, niveaux d'alerte
├── commands/    # Commandes CLI (pulse, daily, list, check)
└── index.ts     # Point d'entrée CLI
```
