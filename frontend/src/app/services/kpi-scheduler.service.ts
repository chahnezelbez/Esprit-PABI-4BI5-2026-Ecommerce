import { Injectable, OnDestroy } from '@angular/core';
import { KpiReportService } from './kpi-report.service';
import { AlertStoreService } from './alert-store.service';

@Injectable({ providedIn: 'root' })
export class KpiSchedulerService implements OnDestroy {

  private weeklyTimer?:  ReturnType<typeof setTimeout>;
  private monthlyTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private reportService: KpiReportService,
    private alertStore:    AlertStoreService,
  ) {}

  start(): void {
    this.scheduleWeekly();
    this.scheduleMonthly();
  }

  // ── Lundi 8h ──────────────────────────────────────────────
  private scheduleWeekly(): void {
    const ms = this.getMsUntil(1, 8); // 1 = lundi
    console.log(`[Scheduler] Rapport hebdo dans ${Math.round(ms / 3_600_000)}h`);

    this.weeklyTimer = setTimeout(async () => {
      const alerts = this.alertStore.getAll();
      await this.reportService.sendReports(alerts, 'weekly');
      this.alertStore.clearAll();
      this.scheduleWeekly(); // replanifier
    }, ms);
  }

  // ── 1er du mois 8h ────────────────────────────────────────
  private scheduleMonthly(): void {
    const ms = this.getMsUntilFirstOfMonth();
    console.log(`[Scheduler] Rapport mensuel dans ${Math.round(ms / 3_600_000)}h`);

    this.monthlyTimer = setTimeout(async () => {
      const alerts = this.alertStore.getAll();
      await this.reportService.sendReports(alerts, 'monthly');
      this.scheduleMonthly(); // replanifier
    }, ms);
  }

  private getMsUntil(targetDay: number, targetHour: number): number {
    const now  = new Date();
    const next = new Date();
    const day  = now.getDay();
    const days = (targetDay - day + 7) % 7 || 7;
    next.setDate(now.getDate() + days);
    next.setHours(targetHour, 0, 0, 0);
    return next.getTime() - now.getTime();
  }

  private getMsUntilFirstOfMonth(): number {
    const now  = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 8, 0, 0, 0);
    return next.getTime() - now.getTime();
  }

  // Déclenche immédiatement le rapport sans attendre le timer
async testReport(type: 'weekly' | 'monthly' = 'weekly'): Promise<void> {
  console.log(`[Scheduler] Test rapport ${type} déclenché manuellement`);
  const alerts = this.alertStore.getAll();
  await this.reportService.sendReports(alerts, type);
  console.log(`[Scheduler] Test rapport ${type} terminé`);
}
  ngOnDestroy(): void {
    clearTimeout(this.weeklyTimer);
    clearTimeout(this.monthlyTimer);
  }
}