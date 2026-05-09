// app.component.ts - Version finale : Logo → Menu → Alerte → Logout
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { KeycloakRoleService } from './services/keycloak-role.service';
import { KeycloakService } from 'keycloak-angular';
import { KpiAlertService } from './services/kpi-alert.service';
import { AlertStoreService } from './services/alert-store.service';
import { AlertBellComponent } from './components/alert-bell/alert-bell.component';
import { ToastComponent } from './components/toast/toast.component';
import { KpiSchedulerService } from './services/kpi-scheduler.service';
import { ChatbotComponent } from './components/chatbot/chatbot.component';
import { CalendarComponent } from './components/calendar/calendar.component';
import { FullCalendarModule } from '@fullcalendar/angular';
import { VideoCallComponent } from './components/video-call/video-call.component';
import { VoiceDashboardComponent } from "./components/voice-dashboard/voice-dashboard.component";

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    AlertBellComponent,
    ToastComponent,
    ChatbotComponent,
    CalendarComponent,
    FullCalendarModule,
    VideoCallComponent,
    VoiceDashboardComponent
  ],
  template: `
    <div class="app-layout">
      <button class="menu-toggle" (click)="toggleSidebar()" [class.active]="sidebarVisible">
        ☰
      </button>

      <nav class="sidebar" [class.sidebar--open]="sidebarVisible" [class.sidebar--collapsed]="sidebarCollapsed">
        
        <!-- ⭐ LOGO EN HAUT ⭐ -->
        <div class="logo-middle-wrapper">
          <button class="logo-middle-btn" (click)="onNavigate()" routerLink="/home">
            <img src="https://sougui.tn/wp-content/uploads/2021/08/Logo-Sougui-arabe.png.webp"
                 alt="Sougui" class="logo-middle-img" />
          </button>
        </div>

        <!-- ⭐ MENU PRINCIPAL ⭐ -->
        <ul>
          <li class="group-label" *ngIf="!sidebarCollapsed">Espace de travail</li>
          <li>
            <a routerLink="/home" routerLinkActive="active" (click)="onNavigate()">
              <span class="icon">🏠</span><span class="nav-label">Accueil</span>
            </a>
          </li>
          
          <li *ngIf="roleService.hasRole('general_manager') || roleService.hasRole('financier') || roleService.hasRole('achat') || roleService.hasRole('vente_b2c') || roleService.hasRole('vente_b2b') || roleService.hasRole('marketing')">
            <a routerLink="/calendar" routerLinkActive="active" (click)="onNavigate()">
              <span class="icon">📅</span><span class="nav-label">Calendrier</span>
            </a>
          </li>
          
          <li *ngIf="roleService.hasRole('general_manager') || roleService.hasRole('financier') || roleService.hasRole('achat') || roleService.hasRole('vente_b2c') || roleService.hasRole('vente_b2b') || roleService.hasRole('marketing')">
            <a routerLink="/events" routerLinkActive="active" (click)="onNavigate()">
              <span class="icon">🎉</span><span class="nav-label">Événements</span>
              <span class="notif-badge" *ngIf="alertStore.unreadCount() > 0 && !sidebarCollapsed">{{ alertStore.unreadCount() }}</span>
            </a>
          </li>
          
          <li class="group-label" *ngIf="!sidebarCollapsed">Modules</li>
          
          <!-- Achats -->
          <li *ngIf="roleService.hasRole('achat')">
            <a routerLink="/purchase" routerLinkActive="active" (click)="onNavigate()">
              <span class="icon">🛒</span><span class="nav-label">Achats</span>
            </a>
          </li>
          <li *ngIf="roleService.hasRole('achat')">
            <a routerLink="/report/achat" routerLinkActive="active" (click)="onNavigate()">
              <span class="icon">📊</span><span>Rapport Achats</span>
            </a>
          </li>

          <!-- Commercial B2C -->
          <li *ngIf="roleService.hasRole('vente_b2c')">
            <a routerLink="/commercial" routerLinkActive="active" (click)="onNavigate()">
              <span class="icon">📈</span><span>Ventes B2C</span>
            </a>
          </li>
          <li *ngIf="roleService.hasRole('vente_b2c')">
            <a routerLink="/report/commercial" routerLinkActive="active" (click)="onNavigate()">
              <span class="icon">📊</span><span>Rapport B2C</span>
            </a>
          </li>

          <!-- Marketing -->
          <li *ngIf="roleService.hasRole('marketing')">
            <a routerLink="/marketing" routerLinkActive="active" (click)="onNavigate()">
              <span class="icon">🎯</span><span>Marketing</span>
            </a>
          </li>
          <li *ngIf="roleService.hasRole('marketing')">
            <a routerLink="/report/marketing" routerLinkActive="active" (click)="onNavigate()">
              <span class="icon">📊</span><span>Rapport Marketing</span>
            </a>
          </li>

          <!-- Direction Générale -->
          <li *ngIf="roleService.hasRole('general_manager')">
            <a routerLink="/gm" routerLinkActive="active" (click)="onNavigate()">
              <span class="icon">🏢</span><span class="nav-label">Direction</span>
            </a>
          </li>
          <li *ngIf="roleService.hasRole('general_manager')">
            <a routerLink="/report/gm" routerLinkActive="active" (click)="onNavigate()">
              <span class="icon">📊</span><span>Rapport Direction</span>
            </a>
          </li>

          <!-- B2B -->
          <li *ngIf="roleService.hasRole('vente_b2b')">
            <a routerLink="/b2b" routerLinkActive="active" (click)="onNavigate()">
              <span class="icon">🤝</span><span>Ventes B2B</span>
            </a>
          </li>
          <li *ngIf="roleService.hasRole('vente_b2b')">
            <a routerLink="/report/b2b" routerLinkActive="active" (click)="onNavigate()">
              <span class="icon">📊</span><span>Rapport B2B</span>
            </a>
          </li>

          <!-- Finances -->
          <li *ngIf="roleService.hasRole('financier')">
            <a routerLink="/financier" routerLinkActive="active" (click)="onNavigate()">
              <span class="icon">💰</span><span>Finances</span>
            </a>
          </li>
          <li *ngIf="roleService.hasRole('financier')">
            <a routerLink="/report/financier" routerLinkActive="active" (click)="onNavigate()">
              <span class="icon">📊</span><span>Rapport Finances</span>
            </a>
          </li>
        </ul>

        <!-- ⭐ ALERTE (1 ligne) ⭐ -->
        <div class="alert-row">
          <app-alert-bell />
          <div class="alert-text" *ngIf="!sidebarCollapsed">
            <span *ngIf="alertStore.unreadCount() > 0">
              ⚠️ {{ alertStore.unreadCount() }} alerte(s) non lue(s)
            </span>
            <span *ngIf="alertStore.unreadCount() === 0">
              ✅ Aucune alerte
            </span>
          </div>
        </div>

        <!-- ⭐ DÉCONNEXION (1 ligne) ⭐ -->
        <div class="logout-row" (click)="logout()">
          <span class="icon">🔒</span>
          <span class="nav-label" *ngIf="!sidebarCollapsed">Déconnexion</span>
        </div>
      </nav>

      <main class="content" [class.content--shifted]="sidebarVisible" [class.content--collapsed]="sidebarVisible && sidebarCollapsed">
        <router-outlet />
      </main>
    </div>

    <!-- Composants flottants -->
    <app-toast />
    <app-video-call />
    <app-voice-dashboard></app-voice-dashboard>
    <app-chatbot />
  `,
  styles: [`
    :host {
      --sougui-blue: #0b276f;
      --sougui-blue-deep: #050c4e;
      --sougui-blue-soft: #122f7f;
      --sougui-gold: #c4922a;
      --sougui-gold-soft: #e8c46a;
      --sougui-orange: #e07a3f;
      --sougui-beige: #f5e9da;
      --sougui-beige-light: #faf8f3;
      --sougui-ink: #0d1b2a;
      font-family: 'DM Sans', 'Segoe UI', sans-serif;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    .app-layout {
      display: flex;
      min-height: 100vh;
      background: var(--sougui-beige-light);
      position: relative;
    }

    /* Menu toggle button */
    .menu-toggle {
      position: fixed;
      top: 1rem;
      left: 1rem;
      z-index: 1100;
      background: var(--sougui-gold);
      border: 1px solid rgba(255,255,255,0.25);
      font-size: 1.35rem;
      padding: 0.5rem 0.82rem;
      border-radius: 14px;
      cursor: pointer;
      color: #fff;
      font-weight: 700;
      box-shadow: 0 8px 18px rgba(11,39,111,0.14);
      transition: all 0.22s ease;
      line-height: 1;
    }

    .menu-toggle:hover {
      transform: translateY(-1px);
      background: #b6841f;
    }

    .menu-toggle.active {
      left: 290px;
      background: var(--sougui-blue-deep);
      color: #fff;
    }

    /* Sidebar */
    .sidebar {
      position: fixed;
      top: 0;
      left: 0;
      width: 280px;
      height: 100vh;
      background: linear-gradient(180deg, var(--sougui-blue) 0%, var(--sougui-blue-deep) 100%);
      color: #fff;
      display: flex;
      flex-direction: column;
      padding: 1.5rem 1rem;
      box-shadow: 6px 0 22px rgba(5,12,78,0.16);
      transform: translateX(-100%);
      transition: transform 0.28s cubic-bezier(0.2,0.9,0.4,1.1);
      z-index: 1000;
      overflow-y: auto;
      border-right: 1px solid rgba(226, 235, 244, 0.2);
    }

    .sidebar.sidebar--open {
      transform: translateX(0);
    }

    .sidebar.sidebar--collapsed {
      width: 84px;
      padding-left: 0.7rem;
      padding-right: 0.7rem;
    }

    /* Logo */
    .logo-middle-wrapper {
      display: flex;
      justify-content: center;
      margin-bottom: 24px;
      padding: 8px 0;
    }

    .logo-middle-btn {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: linear-gradient(135deg, rgba(255,255,255,0.45), rgba(255,255,255,0.4));
      border: 2px solid var(--sougui-gold);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      padding: 0;
      overflow: hidden;
    }

    .logo-middle-btn:hover {
      transform: scale(1.05);
      border-color: var(--sougui-gold-soft);
      background: linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.08));
      box-shadow: 0 0 18px rgba(196,146,42,0.4);
    }

    .logo-middle-img {
      width: 38px;
      height: 38px;
      object-fit: contain;
    }

    /* Menu */
    ul {
      list-style: none;
      padding: 0;
      margin: 0;
      flex: 1;
    }

    li {
      margin: 4px 0;
    }

    .group-label {
      margin: 14px 0 6px;
      padding: 0 10px;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.58);
    }

    a {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      border-radius: 12px;
      text-decoration: none;
      font-size: 0.88rem;
      font-weight: 500;
      color: rgba(255,255,255,0.82);
      border: 1px solid transparent;
      transition: all 0.2s ease;
      cursor: pointer;
    }

    .icon {
      font-size: 1.1rem;
      width: 24px;
      text-align: center;
      flex-shrink: 0;
    }

    .nav-label {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    a:hover {
      background: rgba(255,255,255,0.08);
      border-color: rgba(255,255,255,0.14);
      color: #fff;
      transform: translateX(3px);
    }

    a.active {
      background: linear-gradient(135deg, #14398f, #0b276f);
      color: #fff;
      border-color: rgba(255,255,255,0.16);
      box-shadow: 0 8px 18px rgba(5,12,78,0.24);
      font-weight: 700;
    }

    li a[routerlink*="report"] {
      padding-left: 24px;
      font-size: 0.8rem;
      color: rgba(255,255,255,0.7);
    }

    li a[routerlink*="report"]:hover {
      color: white;
    }

    li a[routerlink*="report"].active {
      background: linear-gradient(135deg, #1d4aa8, #123581);
      color: #fff;
      border-color: transparent;
    }

    .notif-badge {
      margin-left: auto;
      min-width: 18px;
      height: 18px;
      padding: 0 6px;
      border-radius: 999px;
      background: #dc2626;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    /* ⭐ ALERTE (1 ligne) ⭐ */
    .alert-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      margin-top: 16px;
      border-radius: 12px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      transition: background 0.2s;
    }

    .alert-row:hover {
      background: rgba(255,255,255,0.1);
    }

    .alert-text {
      font-size: 13px;
      font-weight: 500;
      color: rgba(255,255,255,0.9);
    }

    /* ⭐ DÉCONNEXION (1 ligne) ⭐ */
    .logout-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      margin-top: 8px;
      border-radius: 12px;
      font-size: 0.9rem;
      font-weight: 500;
      color: rgba(255,255,255,0.86);
      cursor: pointer;
      transition: all 0.2s ease;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
    }

    .logout-row:hover {
      background: rgba(220,38,38,0.3);
      color: white;
      border-color: rgba(220,38,38,0.5);
    }

    /* Sidebar réduite */
    .sidebar--collapsed .logo-middle-btn {
      width: 48px;
      height: 48px;
    }

    .sidebar--collapsed .logo-middle-img {
      width: 32px;
      height: 32px;
    }

    .sidebar--collapsed .alert-row {
      justify-content: center;
      padding: 10px;
      margin-top: 20px;
    }

    .sidebar--collapsed .alert-text {
      display: none;
    }

    .sidebar--collapsed .logout-row {
      justify-content: center;
      padding: 10px;
      margin-top: 8px;
    }

    .sidebar--collapsed .logout-row .nav-label {
      display: none;
    }

    .sidebar--collapsed .nav-label,
    .sidebar--collapsed .group-label {
      display: none;
    }

    .sidebar--collapsed a,
    .sidebar--collapsed .logout-row {
      justify-content: center;
      padding-left: 10px;
      padding-right: 10px;
    }

    /* Contenu principal */
    .content {
      flex: 1;
      overflow-y: auto;
      background: var(--sougui-beige-light);
      transition: margin-left 0.3s ease;
    }

    .content--shifted {
      margin-left: 280px;
    }

    .content--collapsed {
      margin-left: 84px;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .menu-toggle.active {
        left: 1rem;
      }
      .content--shifted {
        margin-left: 0;
      }
      .content--collapsed {
        margin-left: 0;
      }
      .sidebar {
        width: 100%;
        max-width: 280px;
      }
      .sidebar.sidebar--collapsed {
        width: 100%;
        max-width: 280px;
      }
    }
  `]
})
export class AppComponent implements OnInit {
  sidebarVisible = true;
  sidebarCollapsed = false;
  isSending = false;

  constructor(
    private scheduler: KpiSchedulerService,
    public roleService: KeycloakRoleService,
    private keycloak: KeycloakService,
    private kpiAlertService: KpiAlertService,
    public alertStore: AlertStoreService,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      this.kpiAlertService.startPolling();
    } catch (err) {
      console.warn('[AppComponent] Impossible de démarrer le polling KPI', err);
    }
  }

  async onTestWeekly(): Promise<void> {
    this.isSending = true;
    await this.scheduler.testReport('weekly');
    this.isSending = false;
  }

  async onTestMonthly(): Promise<void> {
    this.isSending = true;
    await this.scheduler.testReport('monthly');
    this.isSending = false;
  }

  toggleSidebar(): void {
    this.sidebarVisible = !this.sidebarVisible;
  }

  toggleCollapse(): void {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  onNavigate(): void {
    this.sidebarVisible = false;
  }

  logout(): void {
    this.keycloak.logout();
  }
}