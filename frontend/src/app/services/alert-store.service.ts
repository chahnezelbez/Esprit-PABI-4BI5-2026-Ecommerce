import { Injectable, signal, computed } from '@angular/core';
import { KpiAlert } from '../models/kpi-alert.model';

@Injectable({ providedIn: 'root' })
export class AlertStoreService {

  private _alerts = signal<KpiAlert[]>([]);

  // ── Signals publics ─────────────────────────────────────────
  readonly alerts        = this._alerts.asReadonly();
  readonly unreadCount   = computed(() => this._alerts().filter(a => !a.read).length);
  readonly criticalCount = computed(() => this._alerts().filter(a => a.severity === 'critical' && !a.read).length);

  // ── Alertes filtrées par rôle ───────────────────────────────
  forRole(role: string) {
    return computed(() => this._alerts().filter(a => a.role === role));
  }

  // ── Ajouter des alertes (dédoublonnage par role+title) ──────
  addAlerts(newAlerts: KpiAlert[]): void {
    if (!newAlerts.length) return;

    this._alerts.update(current => {
      const filtered = current.filter(existing =>
        !newAlerts.some(n => n.role === existing.role && n.title === existing.title)
      );
      return [...newAlerts, ...filtered].slice(0, 50); // max 50 alertes
    });
  }

  markRead(id: string): void {
    this._alerts.update(alerts =>
      alerts.map(a => a.id === id ? { ...a, read: true } : a)
    );
  }

  markAllRead(): void {
    this._alerts.update(alerts => alerts.map(a => ({ ...a, read: true })));
  }

  dismiss(id: string): void {
    this._alerts.update(alerts => alerts.filter(a => a.id !== id));
  }
getAll(): KpiAlert[] {
  return this._alerts();
}
  clearAll(): void {
    this._alerts.set([]);
  }
}