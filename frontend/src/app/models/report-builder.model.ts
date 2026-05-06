// models/report-builder.model.ts

export interface KpiItem {
  id: string;
  metric: string;      // [CA Total]
  title: string;       // CA Total
  role: string;        // financier
  unit: string;        // TND
  isSelected: boolean;
  order: number;
}

export interface ReportSection {
  id: string;
  title: string;
  type: 'header' | 'kpi_table' | 'chart' | 'text';
  kpis: KpiItem[];
  settings: {
    showTrend?: boolean;
    showThreshold?: boolean;
    chartType?: 'line' | 'bar' | 'gauge';
  };
}

export interface CustomReport {
  id: string;
  name: string;
  description: string;
  sections: ReportSection[];
  createdBy: string;
  createdAt: Date;
  recipients: string[];  // emails
  schedule: {
    frequency: 'once' | 'weekly' | 'monthly';
    dayOfWeek?: number;   // 1=Lundi
    time: string;         // "08:00"
  };
  lastSent?: Date;
  isActive: boolean;
}

export interface ReportTemplate {
  id: string;
  name: string;
  sections: ReportSection[];
  previewImage?: string;
}