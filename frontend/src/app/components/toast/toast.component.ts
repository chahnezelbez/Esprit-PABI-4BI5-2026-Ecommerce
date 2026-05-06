import { Component, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { KpiAlert } from '../../models/kpi-alert.model';
import { AlertStoreService } from '../../services/alert-store.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast.component.html',
  styleUrls: ['./toast.component.scss'],
})
export class ToastComponent implements OnInit {

  visibleToasts: KpiAlert[] = [];
  private shownIds = new Set<string>();

  constructor(private store: AlertStoreService) {
    // Réagir aux nouvelles alertes via effect()
    effect(() => {
      const freshAlerts = this.store.alerts().filter(
        a => !this.shownIds.has(a.id) && !a.read
      );
      freshAlerts.forEach(a => this.showToast(a));
    });
  }

  ngOnInit(): void {}

  private showToast(alert: KpiAlert): void {
    this.shownIds.add(alert.id);
    this.visibleToasts = [alert, ...this.visibleToasts].slice(0, 4); // max 4 toasts

    // Auto-dismiss : 10s pour critique, 6s pour warning
    const delay = alert.severity === 'critical' ? 10_000 : 6_000;
    setTimeout(() => this.dismiss(alert.id), delay);
  }

  dismiss(id: string): void {
    this.visibleToasts = this.visibleToasts.filter(t => t.id !== id);
    this.store.markRead(id);
  }

  trackById(_: number, alert: KpiAlert): string {
    return alert.id;
  }
}