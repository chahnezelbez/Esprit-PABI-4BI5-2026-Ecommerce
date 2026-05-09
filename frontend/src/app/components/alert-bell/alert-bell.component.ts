import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertStoreService } from '../../services/alert-store.service';

@Component({
  selector: 'app-alert-bell',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './alert-bell.component.html',
  styleUrls: ['./alert-bell.component.scss'],
})
export class AlertBellComponent {
  open = false;

  constructor(readonly store: AlertStoreService) {}

  toggle(): void {
    this.open = !this.open;
  }

  close(): void {
    this.open = false;
  }

  // Fermer en cliquant en dehors
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('app-alert-bell')) {
      this.open = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.open = false;
  }

  trackById(_: number, alert: any): string {
    return alert.id;
  }
}