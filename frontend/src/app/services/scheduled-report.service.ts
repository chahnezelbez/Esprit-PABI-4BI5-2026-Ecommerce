// services/scheduled-report.service.ts
import { Injectable } from '@angular/core';
import { CustomReport } from '../models/report-builder.model';
import { KpiReportService } from './kpi-report.service';

@Injectable({ providedIn: 'root' })
export class ScheduledReportService {
  
  private timers: Map<string, any> = new Map();
  private reports: CustomReport[] = [];

  constructor(private kpiReportService: KpiReportService) {
    this.loadReports();
    this.startSchedulers();
  }

  addReport(report: CustomReport) {
    const existingIndex = this.reports.findIndex(r => r.id === report.id);
    if (existingIndex >= 0) {
      this.cancelSchedule(report.id);
      this.reports[existingIndex] = report;
    } else {
      this.reports.push(report);
    }
    this.saveReports();
    this.scheduleReport(report);
  }

  updateReport(report: CustomReport) {
    this.addReport(report);
  }

  removeReport(reportId: string) {
    this.reports = this.reports.filter(r => r.id !== reportId);
    this.saveReports();
    this.cancelSchedule(reportId);
  }

  getReports(): CustomReport[] {
    return [...this.reports];
  }

  private scheduleReport(report: CustomReport) {
    if (!report.isActive) return;
    
    const nextRun = this.getNextRunTime(report.schedule);
    const delay = nextRun.getTime() - Date.now();
    
    if (delay <= 0) return;
    
    const timer = setTimeout(async () => {
      await this.executeReport(report);
      if (report.schedule.frequency !== 'once') {
        this.scheduleReport(report); // Reschedule
      }
    }, delay);
    
    this.timers.set(report.id, timer);
    console.log(`[Scheduler] Rapport "${report.name}" planifié à ${nextRun}`);
  }

  private async executeReport(report: CustomReport) {
    console.log(`[Scheduler] Exécution rapport "${report.name}"`);
    
    try {
      // Récupérer uniquement les KPIs sélectionnés
      const allKpis = await this.kpiReportService.fetchAllKpiValues();
      const selectedMetrics = report.sections.flatMap(s => s.kpis.map(k => k.metric));
      const filteredKpis = allKpis.filter(k => selectedMetrics.includes(k.metric));
      
      // Générer PDF avec les sections personnalisées
      const pdf = await this.generateCustomReportPDF(report, filteredKpis);
      
      // Envoyer aux destinataires
      for (const recipient of report.recipients) {
        await this.kpiReportService.sendCustomEmail(recipient, pdf, report);
      }
      
      report.lastSent = new Date();
      this.saveReports();
      
    } catch (error) {
      console.error(`Erreur rapport "${report.name}":`, error);
    }
  }

  private getNextRunTime(schedule: CustomReport['schedule']): Date {
    const now = new Date();
    const [hours, minutes] = schedule.time.split(':').map(Number);
    
    const next = new Date();
    next.setHours(hours, minutes, 0, 0);
    
    if (schedule.frequency === 'weekly') {
      const targetDay = schedule.dayOfWeek || 1; // Lundi
      const currentDay = now.getDay() || 7;
      let daysUntil = targetDay - currentDay;
      if (daysUntil < 0 || (daysUntil === 0 && now > next)) {
        daysUntil += 7;
      }
      next.setDate(now.getDate() + daysUntil);
    } else if (schedule.frequency === 'monthly') {
      if (now > next) {
        next.setMonth(now.getMonth() + 1);
      }
      next.setDate(1); // 1er du mois
    }
    
    if (next <= now) {
      if (schedule.frequency === 'weekly') next.setDate(next.getDate() + 7);
      else if (schedule.frequency === 'monthly') next.setMonth(next.getMonth() + 1);
    }
    
    return next;
  }

  private cancelSchedule(reportId: string) {
    const timer = this.timers.get(reportId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(reportId);
    }
  }

  private startSchedulers() {
    this.reports.forEach(r => this.scheduleReport(r));
  }

  private loadReports() {
    const stored = localStorage.getItem('scheduled_reports');
    if (stored) {
      this.reports = JSON.parse(stored);
    }
  }

  private saveReports() {
    localStorage.setItem('scheduled_reports', JSON.stringify(this.reports));
  }

  private async generateCustomReportPDF(report: CustomReport, kpis: any[]): Promise<string> {
    // Implémentez la génération PDF personnalisée
    return 'base64_pdf_content';
  }
}