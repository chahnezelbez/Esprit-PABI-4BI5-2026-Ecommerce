// services/kpi-report.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { jsPDF } from 'jspdf';
import emailjs from 'emailjs-com';
import { environment } from '../../environments/environment';
import { KpiAlert } from '../models/kpi-alert.model';
import { KeycloakService } from 'keycloak-angular';
import { PowerbiConfigService } from './powerbi-config.service';

declare const powerbi: any;

export interface KpiSnapshot {
  metric: string;
  title: string;
  role: string;
  value: number;
  unit: string;
  status: 'critical' | 'warning' | 'ok';
  threshold: number;
}

@Injectable({ providedIn: 'root' })
export class KpiReportService {

  private readonly EMAILJS_SERVICE_ID = environment.emailjs.serviceId;
  private readonly EMAILJS_TEMPLATE_ID = environment.emailjs.templateId;
  private readonly EMAILJS_USER_ID = environment.emailjs.userId;

  private kpiHistory: Map<string, number[]> = new Map();

  private readonly roleEmails: Record<string, string> = {
    financier: 'financier@votreentreprise.com',
    general_manager: 'directeur@votreentreprise.com',
    achat: 'achat@votreentreprise.com',
    vente_b2b: 'b2b@votreentreprise.com',
    vente_b2c: 'b2c@votreentreprise.com',
    marketing: 'marketing@votreentreprise.com',
  };

  private readonly roleLabels: Record<string, string> = {
    financier: 'Responsable Financier',
    general_manager: 'Direction Générale',
    achat: 'Responsable Achats',
    vente_b2b: 'Responsable B2B',
    vente_b2c: 'Responsable B2C',
    marketing: 'Responsable Marketing',
  };

  private readonly allMetrics = [
    { metric: '[CA Total]', title: 'CA Total', role: 'financier', unit: 'TND', criticalBelow: 1_500_000, warningBelow: 2_000_000 },
    { metric: '[Marge Nette]', title: 'Marge nette', role: 'financier', unit: '%', criticalBelow: 10, warningBelow: 15 },
    { metric: '[CA Total]', title: 'CA Consolidé', role: 'general_manager', unit: 'TND', criticalBelow: 2_000_000, warningBelow: 2_500_000 },
    { metric: '[Objectif Global]', title: 'Objectif global', role: 'general_manager', unit: '%', criticalBelow: 80, warningBelow: 90 },
    { metric: '[Stock Critique]', title: 'Stock critique', role: 'achat', unit: 'art.', criticalAbove: 50, warningAbove: 20 },
    { metric: '[Délai Livraison]', title: 'Délai livraison', role: 'achat', unit: 'j', criticalAbove: 14, warningAbove: 10 },
    { metric: '[Commandes B2B]', title: 'Commandes B2B', role: 'vente_b2b', unit: 'cmd', criticalBelow: 20, warningBelow: 40 },
    { metric: '[CA B2B]', title: 'CA B2B', role: 'vente_b2b', unit: 'TND', criticalBelow: 500_000, warningBelow: 800_000 },
    { metric: '[Taux Conversion]', title: 'Taux conversion', role: 'vente_b2c', unit: '%', criticalBelow: 2, warningBelow: 4 },
    { metric: '[Panier Moyen]', title: 'Panier moyen', role: 'vente_b2c', unit: 'TND', criticalBelow: 80, warningBelow: 120 },
    { metric: '[Taux Engagement]', title: 'Taux engagement', role: 'marketing', unit: '%', criticalBelow: 1, warningBelow: 3 },
    { metric: '[Leads Générés]', title: 'Leads générés', role: 'marketing', unit: 'leads', criticalBelow: 50, warningBelow: 100 },
  ];

  constructor(
    private http: HttpClient,
    private keycloak: KeycloakService,
    private powerbiConfig: PowerbiConfigService,
  ) {}

  getAllMetrics(): Omit<KpiSnapshot, 'value' | 'status'>[] {
    return this.allMetrics.map(m => ({
      metric: m.metric,
      title: m.title,
      role: m.role,
      unit: m.unit,
      threshold: (m as any).criticalBelow ?? (m as any).criticalAbove ?? 0
    }));
  }

  async sendReports(alerts: KpiAlert[], type: 'weekly' | 'monthly'): Promise<void> {
    try {
      const snapshots = await this.fetchAllKpiValues();
      this.updateHistory(snapshots);

      for (const role of Object.keys(this.roleEmails)) {
        const roleSnapshots = snapshots.filter(s => s.role === role);
        const roleAlerts = alerts.filter(a => a.role === role);
        const pdf = this.generateFullReport(role, roleSnapshots, roleAlerts, type);
        await this.sendEmail(role, pdf, roleAlerts.length, roleSnapshots, type);
      }
    } catch (err) {
      console.error('[KpiReportService] Erreur génération rapport', err);
    }
  }

  async sendCustomEmail(recipientEmail: string, pdfBase64: string, report: { name: string; description: string }): Promise<void> {
    await emailjs.send(
      this.EMAILJS_SERVICE_ID,
      this.EMAILJS_TEMPLATE_ID,
      {
        to_email: recipientEmail,
        to_name: recipientEmail.split('@')[0],
        report_type: 'Personnalisé',
        week_start: new Date().toLocaleDateString('fr-FR'),
        week_end: new Date().toLocaleDateString('fr-FR'),
        health_score: 'N/A',
        alert_count: 0,
        critical_count: 0,
        warning_count: 0,
        status: `Rapport personnalisé: ${report.name}`,
        pdf_content: pdfBase64,
        report_date: new Date().toLocaleDateString('fr-FR'),
      },
      this.EMAILJS_USER_ID,
    );
    console.log(`[KpiReportService] Email personnalisé envoyé → ${recipientEmail}`);
  }

  // ⭐⭐ MÉTHODE PRINCIPALE - Extraction via embed invisible ⭐⭐
  public async fetchAllKpiValues(): Promise<KpiSnapshot[]> {
    try {
      const extractedData = await this.extractKpisFromEmbeddedReport('general_manager');
      
      return this.allMetrics.map(m => {
        const value = extractedData[m.metric] ?? 0;
        let status: 'critical' | 'warning' | 'ok' = 'ok';

        if ((m as any).criticalBelow !== undefined && value < (m as any).criticalBelow) status = 'critical';
        else if ((m as any).criticalAbove !== undefined && value > (m as any).criticalAbove) status = 'critical';
        else if ((m as any).warningBelow !== undefined && value < (m as any).warningBelow) status = 'warning';
        else if ((m as any).warningAbove !== undefined && value > (m as any).warningAbove) status = 'warning';

        return {
          metric: m.metric,
          title: m.title,
          role: m.role,
          unit: m.unit,
          value,
          status,
          threshold: (m as any).criticalBelow ?? (m as any).criticalAbove ?? 0,
        };
      });
    } catch (error) {
      console.error('[KpiReportService] Erreur extraction KPIs, fallback sur valeurs simulées:', error);
      return this.getSimulatedKpiValues();
    }
  }

  private async extractKpisFromEmbeddedReport(reportKey: string): Promise<Record<string, number>> {
    return new Promise((resolve, reject) => {
      const container = document.createElement('div');
      container.style.cssText = `
        position: absolute;
        top: -9999px;
        left: -9999px;
        width: 1px;
        height: 1px;
        visibility: hidden;
        pointer-events: none;
      `;
      document.body.appendChild(container);

      const config = this.powerbiConfig.getConfig(reportKey);
      if (!config) {
        reject(new Error(`Configuration ${reportKey} introuvable`));
        container.remove();
        return;
      }

      if (typeof powerbi === 'undefined') {
        reject(new Error('Power BI JavaScript API non chargée'));
        container.remove();
        return;
      }

      const report = powerbi.embed(container, {
        type: 'report',
        embedUrl: config.embedUrl,
        tokenType: 0,
        settings: {
          filterPaneEnabled: false,
          navContentPaneEnabled: false,
          background: null
        }
      });

      const timeout = setTimeout(() => {
        reject(new Error('Timeout extraction KPI (30s)'));
        container.remove();
      }, 30000);

      report.on('loaded', async () => {
        try {
          const pages = await report.getPages();
          const allData: Record<string, number> = {};
          
          for (const page of pages) {
            const visuals = await page.getVisuals();
            for (const visual of visuals) {
              try {
                const exportResult = await visual.exportData(1);
                if (exportResult && exportResult.data) {
                  const parsed = this.parseVisualData(exportResult);
                  Object.assign(allData, parsed);
                }
              } catch (err) {
                // Ignorer les visuels qui ne peuvent pas exporter
              }
            }
          }
          
          clearTimeout(timeout);
          resolve(allData);
          container.remove();
          
          setTimeout(() => {
            try { powerbi.reset(container); } catch (e) {}
          }, 100);
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
          container.remove();
        }
      });

      report.on('error', (error: any) => {
        clearTimeout(timeout);
        reject(new Error(`Power BI error: ${error?.message || 'unknown'}`));
        container.remove();
      });
    });
  }

  private parseVisualData(exportData: any): Record<string, number> {
    const result: Record<string, number> = {};
    if (!exportData || !exportData.data) return result;
    
    for (const row of exportData.data) {
      const measure = row.Measure || row['Measure'] || row.metric || row['Metric'];
      const value = row.Value || row['Value'] || row.valeur || row['Valeur'];
      
      if (measure && value !== undefined && value !== null) {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          let cleanMeasure = measure;
          if (!measure.startsWith('[')) cleanMeasure = `[${measure}]`;
          result[cleanMeasure] = numValue;
        }
      }
      
      for (const [key, val] of Object.entries(row)) {
        if (key !== 'Measure' && key !== 'metric' && !key.startsWith('__')) {
          const numValue = parseFloat(val as string);
          if (!isNaN(numValue)) {
            let cleanKey = key;
            if (!key.startsWith('[')) cleanKey = `[${key}]`;
            result[cleanKey] = numValue;
          }
        }
      }
    }
    return result;
  }

  private getSimulatedKpiValues(): KpiSnapshot[] {
    const simulatedValues: Record<string, number> = {
      '[CA Total]': 1_850_000,
      '[Marge Nette]': 12.5,
      '[Stock Critique]': 28,
      '[Délai Livraison]': 11,
      '[Commandes B2B]': 35,
      '[CA B2B]': 720_000,
      '[Taux Conversion]': 3.2,
      '[Panier Moyen]': 95,
      '[Taux Engagement]': 2.1,
      '[Leads Générés]': 78,
      '[Objectif Global]': 87
    };

    return this.allMetrics.map(m => {
      const value = simulatedValues[m.metric] ?? 0;
      let status: 'critical' | 'warning' | 'ok' = 'ok';

      if ((m as any).criticalBelow !== undefined && value < (m as any).criticalBelow) status = 'critical';
      else if ((m as any).criticalAbove !== undefined && value > (m as any).criticalAbove) status = 'critical';
      else if ((m as any).warningBelow !== undefined && value < (m as any).warningBelow) status = 'warning';
      else if ((m as any).warningAbove !== undefined && value > (m as any).warningAbove) status = 'warning';

      return {
        metric: m.metric,
        title: m.title,
        role: m.role,
        unit: m.unit,
        value,
        status,
        threshold: (m as any).criticalBelow ?? (m as any).criticalAbove ?? 0,
      };
    });
  }

  private updateHistory(snapshots: KpiSnapshot[]): void {
    for (const s of snapshots) {
      const key = `${s.role}-${s.metric}`;
      const hist = this.kpiHistory.get(key) ?? [];
      hist.push(s.value);
      if (hist.length > 7) hist.shift();
      this.kpiHistory.set(key, hist);
    }
  }

  private generateFullReport(role: string, snapshots: KpiSnapshot[], alerts: KpiAlert[], type: 'weekly' | 'monthly'): string {
    const doc = new jsPDF();
    const period = type === 'weekly' ? this.getWeekRange() : this.getMonthRange();
    const critical = snapshots.filter(s => s.status === 'critical').length;
    const warning = snapshots.filter(s => s.status === 'warning').length;
    const ok = snapshots.filter(s => s.status === 'ok').length;
    const health = Math.round((ok / snapshots.length) * 100);

    this.drawHeader(doc, role, period, type);
    this.drawHealthScore(doc, health, critical, warning, ok);
    this.drawKpiTable(doc, snapshots);

    doc.addPage();
    this.drawEvolutionCharts(doc, snapshots, role);

    if (alerts.length > 0) {
      doc.addPage();
      this.drawAlertsTable(doc, alerts);
    }

    this.drawFooter(doc);
    return doc.output('datauristring').split(',')[1];
  }

  private drawHeader(doc: jsPDF, role: string, period: any, type: string): void {
    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, 210, 42, 'F');
    doc.setFillColor(59, 130, 246);
    doc.rect(0, 38, 210, 4, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('SOUGI Dashboard', 14, 16);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Rapport ${type === 'weekly' ? 'Hebdomadaire' : 'Mensuel'} — ${this.roleLabels[role]}`, 14, 26);
    doc.text(`Période : ${period.start} → ${period.end}`, 14, 34);
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 130, 34);
  }

  private drawHealthScore(doc: jsPDF, health: number, critical: number, warning: number, ok: number): void {
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Score de santé global', 14, 58);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 63, 182, 32, 3, 3, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(14, 63, 182, 32, 3, 3, 'S');

    const color = health >= 80 ? [22, 163, 74] : health >= 60 ? [180, 120, 0] : [220, 38, 38];
    doc.setFillColor(color[0], color[1], color[2]);
    doc.roundedRect(14, 63, 40, 32, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(`${health}%`, 34, 83, { align: 'center' });

    doc.setFontSize(9);
    doc.setTextColor(220, 38, 38);
    doc.setFont('helvetica', 'bold');
    doc.text(`${critical} critique(s)`, 62, 73);
    doc.setTextColor(180, 120, 0);
    doc.text(`${warning} warning(s)`, 62, 83);
    doc.setTextColor(22, 163, 74);
    doc.text(`${ok} nominal`, 62, 93);

    doc.setFillColor(226, 232, 240);
    doc.roundedRect(120, 74, 70, 8, 4, 4, 'F');
    doc.setFillColor(color[0], color[1], color[2]);
    doc.roundedRect(120, 74, (70 * health) / 100, 8, 4, 4, 'F');
  }

  private drawKpiTable(doc: jsPDF, snapshots: KpiSnapshot[]): void {
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('Valeurs actuelles des KPIs', 14, 108);
    doc.setFillColor(30, 58, 138);
    doc.rect(14, 113, 182, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('KPI', 18, 120);
    doc.text('Valeur', 90, 120);
    doc.text('Seuil', 125, 120);
    doc.text('Évolution', 155, 120);
    doc.text('Statut', 183, 120);

    let y = 123;
    snapshots.forEach((s, i) => {
      doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 252 : 255);
      doc.rect(14, y, 182, 11, 'F');
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(s.title, 18, y + 7);
      doc.setFont('helvetica', 'bold');
      doc.text(`${s.value.toLocaleString('fr-FR')} ${s.unit}`, 90, y + 7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(`${s.threshold.toLocaleString('fr-FR')} ${s.unit}`, 125, y + 7);

      const hist = this.kpiHistory.get(`${s.role}-${s.metric}`) ?? [];
      const trend = hist.length >= 2 ? hist[hist.length - 1] > hist[hist.length - 2] ? '↑' : hist[hist.length - 1] < hist[hist.length - 2] ? '↓' : '→' : '—';
      const trendColor = trend === '↑' ? [22, 163, 74] : trend === '↓' ? [220, 38, 38] : [100, 100, 100];
      doc.setTextColor(trendColor[0], trendColor[1], trendColor[2]);
      doc.setFont('helvetica', 'bold');
      doc.text(trend, 162, y + 7);

      if (s.status === 'critical') {
        doc.setFillColor(254, 226, 226);
        doc.roundedRect(178, y + 2, 16, 7, 2, 2, 'F');
        doc.setTextColor(220, 38, 38);
        doc.setFontSize(7);
        doc.text('CRIT.', 186, y + 7, { align: 'center' });
      } else if (s.status === 'warning') {
        doc.setFillColor(254, 243, 199);
        doc.roundedRect(178, y + 2, 16, 7, 2, 2, 'F');
        doc.setTextColor(180, 120, 0);
        doc.setFontSize(7);
        doc.text('WARN', 186, y + 7, { align: 'center' });
      } else {
        doc.setFillColor(220, 252, 231);
        doc.roundedRect(178, y + 2, 16, 7, 2, 2, 'F');
        doc.setTextColor(22, 163, 74);
        doc.setFontSize(7);
        doc.text('OK', 186, y + 7, { align: 'center' });
      }
      y += 11;
    });
    doc.setDrawColor(226, 232, 240);
    doc.rect(14, 113, 182, snapshots.length * 11 + 10);
  }

  private drawEvolutionCharts(doc: jsPDF, snapshots: KpiSnapshot[], role: string): void {
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Évolution des KPIs', 14, 20);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Basé sur les 7 derniers relevés (polling toutes les 5 min)', 14, 28);

    let col = 0, row = 0;
    snapshots.forEach((s) => {
      const x = 14 + col * 95;
      const y = 38 + row * 55;
      const hist = this.kpiHistory.get(`${s.role}-${s.metric}`) ?? [s.value];

      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x, y, 88, 48, 3, 3, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, y, 88, 48, 3, 3, 'S');
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(s.title, x + 4, y + 8);

      const color = s.status === 'critical' ? [220, 38, 38] : s.status === 'warning' ? [180, 120, 0] : [22, 163, 74];
      doc.setTextColor(color[0], color[1], color[2]);
      doc.setFontSize(11);
      doc.text(`${s.value.toLocaleString('fr-FR')} ${s.unit}`, x + 4, y + 18);
      this.drawSparkline(doc, hist, x + 4, y + 24, 80, 18, s.status);

      col++;
      if (col >= 2) { col = 0; row++; }
    });
  }

  private drawSparkline(doc: jsPDF, data: number[], x: number, y: number, width: number, height: number, status: string): void {
    if (data.length < 2) {
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(7);
      doc.text('Données insuffisantes', x + 2, y + height / 2);
      return;
    }
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const stepX = width / (data.length - 1);
    const color = status === 'critical' ? [220, 38, 38] : status === 'warning' ? [180, 120, 0] : [22, 163, 74];
    doc.setDrawColor(color[0], color[1], color[2]);
    for (let i = 0; i < data.length - 1; i++) {
      const x1 = x + i * stepX;
      const y1 = y + height - ((data[i] - min) / range) * height;
      const x2 = x + (i + 1) * stepX;
      const y2 = y + height - ((data[i + 1] - min) / range) * height;
      doc.setLineWidth(0.8);
      doc.line(x1, y1, x2, y2);
    }
    const lastX = x + (data.length - 1) * stepX;
    const lastY = y + height - ((data[data.length - 1] - min) / range) * height;
    doc.setFillColor(color[0], color[1], color[2]);
    doc.circle(lastX, lastY, 1, 'F');
  }

  private drawAlertsTable(doc: jsPDF, alerts: KpiAlert[]): void {
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Détail des alertes déclenchées', 14, 20);
    doc.setFillColor(30, 58, 138);
    doc.rect(14, 26, 182, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('KPI', 18, 33);
    doc.text('Valeur', 75, 33);
    doc.text('Seuil', 108, 33);
    doc.text('Sévérité', 140, 33);
    doc.text('Horodatage', 168, 33);

    let y = 36;
    alerts.forEach((a, i) => {
      doc.setFillColor(i % 2 === 0 ? 248 : 255, i % 2 === 0 ? 250 : 255, i % 2 === 0 ? 252 : 255);
      doc.rect(14, y, 182, 10, 'F');
      doc.setTextColor(30, 41, 59);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(a.title, 18, y + 7);
      doc.text(`${a.value} ${a.unit}`, 75, y + 7);
      doc.text(`${a.threshold} ${a.unit}`, 108, y + 7);
      if (a.severity === 'critical') {
        doc.setTextColor(220, 38, 38);
        doc.setFont('helvetica', 'bold');
        doc.text('CRITIQUE', 140, y + 7);
      } else {
        doc.setTextColor(180, 120, 0);
        doc.setFont('helvetica', 'bold');
        doc.text('WARNING', 140, y + 7);
      }
      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'normal');
      doc.text(new Date(a.timestamp).toLocaleString('fr-FR'), 168, y + 7);
      y += 10;
      if (y > 270) { doc.addPage(); y = 20; }
    });
    doc.setDrawColor(226, 232, 240);
    doc.rect(14, 26, 182, alerts.length * 10 + 10);
  }

  private drawFooter(doc: jsPDF): void {
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFillColor(243, 244, 246);
      doc.rect(0, 285, 210, 12, 'F');
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(8);
      doc.text('SOUGI Dashboard — Document confidentiel — Ne pas diffuser', 14, 292);
      doc.text(`Page ${p} / ${pages}`, 196, 292, { align: 'right' });
    }
  }

  private async sendEmail(role: string, pdfBase64: string, alertCount: number, snapshots: KpiSnapshot[], type: 'weekly' | 'monthly'): Promise<void> {
    const email = this.roleEmails[role];
    const period = type === 'weekly' ? this.getWeekRange() : this.getMonthRange();
    const health = Math.round((snapshots.filter(s => s.status === 'ok').length / snapshots.length) * 100);
    const critical = snapshots.filter(s => s.status === 'critical').length;
    const warning = snapshots.filter(s => s.status === 'warning').length;

    await emailjs.send(this.EMAILJS_SERVICE_ID, this.EMAILJS_TEMPLATE_ID, {
      to_email: email,
      to_name: this.roleLabels[role],
      report_type: type === 'weekly' ? 'Hebdomadaire' : 'Mensuel',
      week_start: period.start,
      week_end: period.end,
      health_score: `${health}%`,
      alert_count: alertCount,
      critical_count: critical,
      warning_count: warning,
      status: alertCount === 0 ? '✓ Tous les KPIs sont nominaux' : `⚠ ${alertCount} alerte(s) détectée(s)`,
      pdf_content: pdfBase64,
      report_date: new Date().toLocaleDateString('fr-FR'),
    }, this.EMAILJS_USER_ID);
    console.log(`[KpiReportService] Rapport ${type} envoyé → ${email}`);
  }

  private getWeekRange(): { start: string; end: string } {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now); monday.setDate(diff);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    return {
      start: monday.toLocaleDateString('fr-FR'),
      end: sunday.toLocaleDateString('fr-FR'),
    };
  }

  private getMonthRange(): { start: string; end: string } {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      start: first.toLocaleDateString('fr-FR'),
      end: last.toLocaleDateString('fr-FR'),
    };
  }
}