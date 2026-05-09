// components/report-builder/report-builder.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { jsPDF } from 'jspdf';
import { KpiItem, ReportSection, CustomReport } from '../../models/report-builder.model';
import { KpiReportService } from '../../services/kpi-report.service';
import { KpiSnapshot } from '../../services/kpi-report.service';
import { ScheduledReportService } from '../../services/scheduled-report.service';

@Component({
  selector: 'app-report-builder',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './report-builder.component.html',
  styleUrls: ['./report-builder.component.scss']
})
export class ReportBuilderComponent implements OnInit {
  availableKpis: KpiItem[] = [];
  reportSections: ReportSection[] = [
    {
      id: this.generateId(),
      title: 'KPIs principaux',
      type: 'kpi_table',
      businessGroup: 'Direction générale',
      kpis: [],
      content: '',
      settings: { showTrend: true, showThreshold: true }
    }
  ];

  businessGroups = ['Direction générale', 'Finance', 'Ventes', 'Marketing', 'Achat', 'Logistique', 'Autre'];
  savedReports: CustomReport[] = [];
  editingReport: CustomReport | null = null;
  reportName = '';
  reportDescription = '';
  selectedRecipients = '';
  scheduleEnabled = false;
  scheduleFrequency: 'once' | 'weekly' | 'monthly' = 'weekly';
  scheduleTime = '08:00';
  selectedPreviewSectionId = '';
  previewSnapshots: KpiSnapshot[] = [];
  previewGeneratedAt: Date | null = null;
  previewError = '';
  includeDateInFileName = true;
  showSavedReports = false;
  isDirty = false;
  isLoading = false;

  constructor(
    private kpiReportService: KpiReportService,
    private scheduledReportService: ScheduledReportService,
  ) {}

  ngOnInit() {
    this.loadAvailableKpis();
    this.loadSavedReports();
  }

  private loadAvailableKpis() {
    const metrics = this.kpiReportService.getAllMetrics();
    const uniqueByMetric = new Map<string, (typeof metrics)[number]>();
    for (const metric of metrics) {
      const existing = uniqueByMetric.get(metric.metric);
      if (!existing) {
        uniqueByMetric.set(metric.metric, metric);
        continue;
      }
      // Conserver le libellé le plus explicite et stable pour le builder.
      const preferred = metric.title.length > existing.title.length ? metric : existing;
      uniqueByMetric.set(metric.metric, preferred);
    }

    this.availableKpis = Array.from(uniqueByMetric.values()).map((m, index) => ({
      id: this.generateId(),
      metric: m.metric,
      title: m.title,
      role: 'global',
      unit: m.unit,
      isSelected: false,
      order: index
    }));
  }

  addKpiToSection(sectionIndex: number, kpi: KpiItem) {
    const section = this.reportSections[sectionIndex];
    if (section && !section.kpis.some(k => k.id === kpi.id)) {
      section.kpis.push(kpi);
      this.availableKpis = this.availableKpis.filter(k => k.id !== kpi.id);
      this.markAsDirty();
      void this.refreshPreview();
    }
  }

  removeKpiFromSection(sectionIndex: number, kpiIndex: number) {
    const removed = this.reportSections[sectionIndex].kpis.splice(kpiIndex, 1)[0];
    if (removed) {
      this.availableKpis.unshift(removed);
    }
    this.markAsDirty();
    void this.refreshPreview();
  }

  addSection() {
    this.reportSections.push({
      id: this.generateId(),
      title: `Nouvelle section ${this.reportSections.length + 1}`,
      type: 'kpi_table',
      businessGroup: 'Autre',
      kpis: [],
      content: '',
      settings: { showTrend: true, showThreshold: true }
    });
    this.markAsDirty();
  }

  removeSection(sectionIndex: number) {
    const section = this.reportSections[sectionIndex];
    if (section && section.kpis.length > 0) {
      this.availableKpis.unshift(...section.kpis);
    }
    this.reportSections.splice(sectionIndex, 1);
    if (this.selectedPreviewSectionId === section.id) {
      this.selectedPreviewSectionId = '';
    }
    this.markAsDirty();
    void this.refreshPreview();
  }

  changeSectionType(section: ReportSection, type: ReportSection['type']) {
    section.type = type;
    if (type !== 'text' && type !== 'header') {
      section.content = '';
    }
    this.markAsDirty();
    void this.refreshPreview();
  }

  moveSection(sectionIndex: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? sectionIndex - 1 : sectionIndex + 1;
    if (targetIndex < 0 || targetIndex >= this.reportSections.length) return;
    const [section] = this.reportSections.splice(sectionIndex, 1);
    this.reportSections.splice(targetIndex, 0, section);
    this.markAsDirty();
    void this.refreshPreview();
  }

  onSectionMetaChanged() {
    this.markAsDirty();
    void this.refreshPreview();
  }

  saveReport() {
    if (!this.reportName.trim()) {
      alert('Veuillez donner un nom au rapport');
      return;
    }

    if (this.getTotalKpiCount() === 0) {
      alert('Ajoutez au moins un KPI dans le rapport.');
      return;
    }

    const recipientsList = this.getRecipientsList();
    if (this.scheduleEnabled && recipientsList.length === 0) {
      alert('Ajoutez au moins un email destinataire pour la planification.');
      return;
    }

    const newReport: CustomReport = {
      id: this.editingReport?.id || this.generateId(),
      name: this.reportName,
      description: this.reportDescription,
      sections: JSON.parse(JSON.stringify(this.reportSections)),
      createdBy: 'current_user',
      createdAt: this.editingReport?.createdAt || new Date().toISOString(),
      recipients: recipientsList,
      schedule: {
        frequency: this.scheduleEnabled ? this.scheduleFrequency : 'once',
        time: this.scheduleTime,
        dayOfWeek: this.scheduleFrequency === 'weekly' ? 1 : undefined
      },
      isActive: true
    };

    if (this.editingReport) {
      const index = this.savedReports.findIndex(r => r.id === this.editingReport!.id);
      this.savedReports[index] = newReport;
    } else {
      this.savedReports.push(newReport);
    }

    if (this.scheduleEnabled) {
      this.scheduledReportService.updateReport(newReport);
    } else {
      this.scheduledReportService.removeReport(newReport.id);
    }

    this.saveToLocalStorage();
    this.resetForm();
    alert('Rapport sauvegardé avec succès !');
  }

  loadReport(report: CustomReport) {
    this.editingReport = report;
    this.reportName = report.name;
    this.reportDescription = report.description;
    this.reportSections = JSON.parse(JSON.stringify(report.sections));
    this.selectedRecipients = report.recipients.join(', ');
    this.scheduleEnabled = report.schedule.frequency !== 'once';
    this.scheduleFrequency = report.schedule.frequency === 'once' ? 'weekly' : report.schedule.frequency;
    this.scheduleTime = report.schedule.time;
    this.showSavedReports = false;
    this.markAsDirty();
    void this.refreshPreview();
  }

  deleteReport(reportId: string) {
    if (confirm('Supprimer ce rapport définitivement ?')) {
      this.savedReports = this.savedReports.filter(r => r.id !== reportId);
      this.scheduledReportService.removeReport(reportId);
      this.saveToLocalStorage();
    }
  }

  async previewReport() {
    await this.refreshPreview();
    if (this.previewError) {
      alert(this.previewError);
    }
  }

  async refreshPreview() {
    this.isLoading = true;
    this.previewError = '';
    try {
      const kpiSnapshots = await this.kpiReportService.fetchAllKpiValues();
      this.previewSnapshots = this.filterKpisBySections(kpiSnapshots);
      this.previewGeneratedAt = new Date();
    } catch (error) {
      console.error('Erreur aperçu:', error);
      this.previewError = this.formatPowerBiError(error);
      this.previewSnapshots = [];
    } finally {
      this.isLoading = false;
    }
  }

  async sendReportNow() {
    if (!this.reportName.trim()) {
      alert('Veuillez sauvegarder le rapport avant de l\'envoyer');
      return;
    }

    this.isLoading = true;
    try {
      const kpiSnapshots = await this.kpiReportService.fetchAllKpiValues();
      const filteredSnapshots = this.filterKpisBySections(kpiSnapshots);
      const pdfBase64 = await this.generateReportPDF(filteredSnapshots);
      const recipientsList = this.getRecipientsList();
      
      if (recipientsList.length === 0) {
        alert('Aucun destinataire valide spécifié');
        return;
      }
      
      for (const recipient of recipientsList) {
        await this.kpiReportService.sendCustomEmail(recipient, pdfBase64, {
          name: this.reportName,
          description: this.reportDescription
        });
      }
      
      alert(`Rapport "${this.reportName}" envoyé à ${recipientsList.length} destinataire(s) !`);
    } catch (error) {
      console.error('Erreur envoi rapport:', error);
      alert('Erreur lors de l\'envoi du rapport');
    } finally {
      this.isLoading = false;
    }
  }

  private async generateReportPDF(kpiSnapshots: KpiSnapshot[]): Promise<string> {
    const doc = new jsPDF();
    
    doc.setFillColor(30, 58, 138);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('SOUGUI BI Dashboard', 14, 20);
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.text(this.safePdfText(this.reportName), 14, 50);
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(this.safePdfText(this.reportDescription || 'Aucune description'), 14, 60);
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 14, 70);
    
    let y = 95;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('KPIs sélectionnés', 14, y);
    y += 10;
    
    const left = 14;
    const right = 196;
    const colKpi = 16;
    const colValue = 148;
    const colStatus = 190;

    doc.setFillColor(238, 244, 252);
    doc.roundedRect(left, y - 5, right - left, 8, 2, 2, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('KPI', colKpi, y);
    doc.text('Valeur', colValue, y, { align: 'right' });
    doc.text('Statut', colStatus, y, { align: 'right' });
    y += 6;
    
    kpiSnapshots.forEach((kpi, index) => {
      y += 8;
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.setFillColor(index % 2 === 0 ? 255 : 249, index % 2 === 0 ? 255 : 251, index % 2 === 0 ? 255 : 255);
      doc.rect(left, y - 5, right - left, 8, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(25, 34, 54);
      const kpiTitle = this.safePdfText(`${index + 1}. ${kpi.title}`);
      const maxTitleWidth = colValue - colKpi - 8;
      const trimmedTitle = doc.splitTextToSize(kpiTitle, maxTitleWidth)[0] ?? kpiTitle;
      doc.text(trimmedTitle, colKpi, y);

      const valueText = `${this.formatNumberForPdf(kpi.value)} ${this.safePdfText(kpi.unit)}`;
      doc.setFont('helvetica', 'bold');
      doc.text(valueText, colValue, y, { align: 'right' });

      const statusText = this.getStatusLabel(kpi.status);
      doc.setTextColor(this.getStatusColor(statusText)[0], this.getStatusColor(statusText)[1], this.getStatusColor(statusText)[2]);
      doc.text(statusText, colStatus, y, { align: 'right' });
    });
    
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFillColor(243, 244, 246);
      doc.rect(0, 285, 210, 12, 'F');
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(8);
      doc.text('SOUGUI BI — Document confidentiel', 14, 292);
      doc.text(`Page ${p} / ${pages}`, 196, 292, { align: 'right' });
    }
    
    return doc.output('datauristring').split(',')[1];
  }

  private getStatusLabel(status: KpiSnapshot['status']): string {
    return status === 'critical' ? 'CRITIQUE' : status === 'warning' ? 'ALERTE' : 'OK';
  }

  private getStatusColor(statusLabel: string): [number, number, number] {
    if (statusLabel === 'CRITIQUE') return [200, 38, 38];
    if (statusLabel === 'ALERTE') return [180, 120, 0];
    return [22, 163, 74];
  }

  private formatNumberForPdf(value: number): string {
    const fixed = Number.isInteger(value) ? value.toString() : value.toFixed(2);
    const [integerPart, decimalPart] = fixed.split('.');
    const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return decimalPart ? `${grouped}.${decimalPart}` : grouped;
  }

  private safePdfText(input: string): string {
    return input
      .normalize('NFKD')
      .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private formatPowerBiError(error: unknown): string {
    const defaultMessage = 'Erreur Power BI: impossible de récupérer les KPI réels.';
    if (!error || typeof error !== 'object') {
      return defaultMessage;
    }

    const anyError = error as any;
    const status = anyError.status;
    const backendDetail = anyError.error?.detail;
    const apiMessage =
      (typeof backendDetail === 'string' ? backendDetail : undefined) ||
      anyError.error?.error?.message ||
      anyError.error?.message ||
      anyError.message;

    if (status === 401 || status === 403) {
      return 'Erreur Power BI (401/403): accès refusé. Vérifie la session Keycloak et les permissions dataset/workspace.';
    }
    if (status === 404) {
      return 'Erreur Power BI (404): dataset/workspace introuvable. Vérifie les IDs configurés.';
    }
    if (typeof apiMessage === 'string' && apiMessage.trim()) {
      return `Erreur Power BI: ${apiMessage}`;
    }
    return defaultMessage;
  }

  async exportPdfNow() {
    if (!this.reportName.trim()) {
      alert('Veuillez nommer le rapport avant export PDF.');
      return;
    }
    this.isLoading = true;
    try {
      const snapshots = await this.kpiReportService.fetchAllKpiValues();
      const filtered = this.filterKpisBySections(snapshots);
      const pdfBase64 = await this.generateReportPDF(filtered);
      const fileName = this.buildReportFileName();
      this.downloadBase64Pdf(pdfBase64, fileName);
    } catch (error) {
      console.error('Erreur export PDF:', error);
      alert('Erreur pendant l’export PDF');
    } finally {
      this.isLoading = false;
    }
  }

  private filterKpisBySections(snapshots: KpiSnapshot[]): KpiSnapshot[] {
    const selectedMetrics = this.reportSections.flatMap(s => s.kpis.map(k => k.metric));
    return snapshots.filter(s => selectedMetrics.includes(s.metric));
  }

  private getTotalKpiCount(): number {
    return this.reportSections.reduce((sum, section) => sum + section.kpis.length, 0);
  }

  getSectionPreview(section: ReportSection): KpiSnapshot[] {
    const metrics = section.kpis.map(k => k.metric);
    return this.previewSnapshots.filter(k => metrics.includes(k.metric));
  }

  getRecipientsList(): string[] {
    return this.selectedRecipients
      .split(',')
      .map(email => email.trim())
      .filter(email => email && this.isValidEmail(email));
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private buildReportFileName(): string {
    const base = this.reportName.trim().replace(/[^\w\-]+/g, '_');
    if (!this.includeDateInFileName) {
      return `${base || 'rapport'}.pdf`;
    }
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    return `${base || 'rapport'}_${stamp}.pdf`;
  }

  private downloadBase64Pdf(base64: string, fileName: string) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private markAsDirty() { this.isDirty = true; }

  private saveToLocalStorage() {
    localStorage.setItem('custom_reports', JSON.stringify(this.savedReports));
  }

  private loadSavedReports() {
    const stored = localStorage.getItem('custom_reports');
    if (stored) {
      this.savedReports = JSON.parse(stored);
    }
  }

  resetForm() {
    this.editingReport = null;
    this.reportName = '';
    this.reportDescription = '';
    this.selectedRecipients = '';
    this.scheduleEnabled = false;
    this.isDirty = false;
    this.reportSections = [{
      id: this.generateId(),
      title: 'KPIs principaux',
      type: 'kpi_table',
      businessGroup: 'Direction générale',
      kpis: [],
      content: '',
      settings: { showTrend: true, showThreshold: true }
    }];
    this.previewSnapshots = [];
    this.previewGeneratedAt = null;
    this.previewError = '';
    this.selectedPreviewSectionId = '';
  }

  cancelEdit() {
    if (this.isDirty && !confirm('Annuler les modifications ?')) return;
    this.resetForm();
  }
}