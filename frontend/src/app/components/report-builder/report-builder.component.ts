// components/report-builder/report-builder.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { jsPDF } from 'jspdf';
import { KpiItem, ReportSection, CustomReport } from '../../models/report-builder.model';
import { KpiReportService } from '../../services/kpi-report.service';
import { KpiSnapshot } from '../../services/kpi-report.service';

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
      kpis: [],
      settings: { showTrend: true, showThreshold: true }
    }
  ];
  
  savedReports: CustomReport[] = [];
  editingReport: CustomReport | null = null;
  reportName = '';
  reportDescription = '';
  selectedRecipients: string = '';
  scheduleEnabled = false;
  scheduleFrequency: 'once' | 'weekly' | 'monthly' = 'weekly';
  scheduleTime = '08:00';
  showSavedReports = false;
  isDirty = false;
  isLoading = false;

  constructor(private kpiReportService: KpiReportService) {}

  ngOnInit() {
    this.loadAvailableKpis();
    this.loadSavedReports();
  }

  private loadAvailableKpis() {
    const metrics = this.kpiReportService.getAllMetrics();
    this.availableKpis = metrics.map((m, index) => ({
      id: this.generateId(),
      metric: m.metric,
      title: m.title,
      role: m.role,
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
    }
  }

  removeKpiFromSection(sectionIndex: number, kpiIndex: number) {
    const removed = this.reportSections[sectionIndex].kpis.splice(kpiIndex, 1)[0];
    if (removed) {
      this.availableKpis.unshift(removed);
    }
    this.markAsDirty();
  }

  addSection() {
    this.reportSections.push({
      id: this.generateId(),
      title: `Nouvelle section ${this.reportSections.length + 1}`,
      type: 'kpi_table',
      kpis: [],
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
    this.markAsDirty();
  }

  changeSectionType(section: ReportSection, type: ReportSection['type']) {
    section.type = type;
    this.markAsDirty();
  }

  saveReport() {
    if (!this.reportName.trim()) {
      alert('Veuillez donner un nom au rapport');
      return;
    }

    const recipientsList = this.selectedRecipients
      .split(',')
      .map(email => email.trim())
      .filter(email => email);

    const newReport: CustomReport = {
      id: this.editingReport?.id || this.generateId(),
      name: this.reportName,
      description: this.reportDescription,
      sections: JSON.parse(JSON.stringify(this.reportSections)),
      createdBy: 'current_user',
      createdAt: new Date(),
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
  }

  deleteReport(reportId: string) {
    if (confirm('Supprimer ce rapport définitivement ?')) {
      this.savedReports = this.savedReports.filter(r => r.id !== reportId);
      this.saveToLocalStorage();
    }
  }

  async previewReport() {
    this.isLoading = true;
    try {
      const kpiSnapshots = await this.kpiReportService.fetchAllKpiValues();
      const filteredSnapshots = this.filterKpisBySections(kpiSnapshots);
      
      let previewText = `📊 Aperçu du rapport: ${this.reportName || 'Sans nom'}\n\n`;
      previewText += `Sections: ${this.reportSections.length}\n`;
      previewText += `KPIs sélectionnés: ${this.getTotalKpiCount()}\n\n`;
      previewText += `📈 VALEURS RÉELLES POWER BI:\n`;
      previewText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      
      filteredSnapshots.forEach(kpi => {
        const statusIcon = kpi.status === 'critical' ? '🔴' : kpi.status === 'warning' ? '🟠' : '🟢';
        previewText += `${statusIcon} ${kpi.title}: ${kpi.value.toLocaleString('fr-FR')} ${kpi.unit}\n`;
      });
      
      if (filteredSnapshots.length === 0) {
        previewText += `Aucun KPI sélectionné. Ajoutez des KPIs à votre rapport.`;
      }
      
      alert(previewText);
    } catch (error) {
      console.error('Erreur aperçu:', error);
      alert('Erreur lors de la récupération des données Power BI');
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
      
      const recipientsList = this.selectedRecipients
        .split(',')
        .map(email => email.trim())
        .filter(email => email);
      
      if (recipientsList.length === 0) {
        alert('Aucun destinataire spécifié');
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
    doc.text('SOUGI Dashboard', 14, 20);
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.text(this.reportName, 14, 50);
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(this.reportDescription || 'Aucune description', 14, 60);
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 14, 70);
    
    let y = 95;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('KPIs sélectionnés', 14, y);
    y += 10;
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('KPI', 14, y);
    doc.text('Valeur', 120, y);
    doc.text('Statut', 170, y);
    y += 5;
    doc.setDrawColor(200, 200, 200);
    doc.line(14, y, 196, y);
    
    kpiSnapshots.forEach((kpi, index) => {
      y += 8;
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
      doc.setFont('helvetica', 'normal');
      doc.text(`${index + 1}. ${kpi.title}`, 14, y);
      doc.text(`${kpi.value.toLocaleString('fr-FR')} ${kpi.unit}`, 120, y);
      
      const statusText = kpi.status === 'critical' ? '🔴 CRITIQUE' : kpi.status === 'warning' ? '🟠 WARNING' : '🟢 OK';
      doc.text(statusText, 170, y);
    });
    
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setFillColor(243, 244, 246);
      doc.rect(0, 285, 210, 12, 'F');
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(8);
      doc.text('SOUGI Dashboard — Document confidentiel', 14, 292);
      doc.text(`Page ${p} / ${pages}`, 196, 292, { align: 'right' });
    }
    
    return doc.output('datauristring').split(',')[1];
  }

  private filterKpisBySections(snapshots: KpiSnapshot[]): KpiSnapshot[] {
    const selectedMetrics = this.reportSections.flatMap(s => s.kpis.map(k => k.metric));
    return snapshots.filter(s => selectedMetrics.includes(s.metric));
  }

  private getTotalKpiCount(): number {
    return this.reportSections.reduce((sum, section) => sum + section.kpis.length, 0);
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
    if (stored) this.savedReports = JSON.parse(stored);
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
      kpis: [],
      settings: { showTrend: true, showThreshold: true }
    }];
  }

  cancelEdit() {
    if (this.isDirty && !confirm('Annuler les modifications ?')) return;
    this.resetForm();
  }
}