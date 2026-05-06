export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertRole =
  | 'financier'
  | 'achat'
  | 'vente_b2b'
  | 'vente_b2c'
  | 'marketing'
  | 'general_manager';

export interface KpiAlert {
  id: string;
  role: AlertRole;
  title: string;
  message: string;
  severity: AlertSeverity;
  value: number;
  threshold: number;
  unit: string;
  timestamp: Date;
  read: boolean;
}

export interface KpiThreshold {
  role: AlertRole;
  metric: string;
  title: string;
  unit: string;
  warningBelow?: number;
  criticalBelow?: number;
  warningAbove?: number;
  criticalAbove?: number;
}