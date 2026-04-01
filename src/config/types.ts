export interface ClientThresholds {
  pageview_drop_pct: number;
  event_zero_days: number;
  active_users_min: number;
}

export interface ClientConfig {
  name: string;
  ga4_property_id: string;
  template: string;
  url: string;
  events_monitored: string[];
  critical_pages: string[];
  thresholds: ClientThresholds;
}

export interface TemplateConfig {
  events: string[];
  description: string;
}

export interface ClientsFile {
  clients: ClientConfig[];
  templates: Record<string, TemplateConfig>;
}

export type AlertLevel = 'CRITIQUE' | 'ALERTE' | 'WARNING' | 'INFO';

export interface AlertEvent {
  level: AlertLevel;
  client: ClientConfig;
  message: string;
  details: string;
  timestamp: Date;
}

export interface HealthCheckResult {
  client: ClientConfig;
  timestamp: Date;
  activeUsers: number | null;
  pageviews: { current: number; baseline: number; dropPct: number } | null;
  events: Record<string, { current: number; baseline: number }>;
  status: 'OK' | 'WARNING' | 'ALERTE' | 'CRITIQUE';
  alerts: AlertEvent[];
}

export interface EnvConfig {
  googleCredentialsPath?: string;
  googleCredentialsBase64?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  alertEmailTo: string[];
  slackWebhookUrl?: string;
  dryRun: boolean;
}
