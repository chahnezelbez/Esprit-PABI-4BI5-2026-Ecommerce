import { Routes } from '@angular/router';
import { roleGuard } from './gards/role.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
  {
  path: 'events',
  loadComponent: () =>
    import('./components/events-popup/events-popup.component')
      .then(m => m.EventsPopupComponent),
       canActivate: [roleGuard(['general_manager', 'financier', 'achat', 'vente_b2c', 'vente_b2b', 'marketing'])],
},
  // ── Routes existantes ──────────────────────────
  {
    path: 'purchase',
    loadComponent: () =>
      import('./components/purchase/purchase.component').then(m => m.PurchaseComponent),
    canActivate: [roleGuard(['achat'])],
  },
  {
    path: 'commercial',
    loadComponent: () =>
      import('./components/commercial/commercial.component').then(m => m.CommercialComponent),
    canActivate: [roleGuard(['vente_b2c'])],
  },
  {
    path: 'marketing',
    loadComponent: () =>
      import('./components/marketing/marketing.component').then(m => m.MarketingComponent),
    canActivate: [roleGuard(['marketing'])],
  },
  {
    path: 'gm',
    loadComponent: () =>
      import('./components/gm/gm.component').then(m => m.GmComponent),
    canActivate: [roleGuard(['general_manager'])],
  },
  {
    path: 'b2b',
    loadComponent: () =>
      import('./components/b2b/b2b.component').then(m => m.B2bComponent),
    canActivate: [roleGuard(['vente_b2b'])],
  },
  {
    path: 'financier',
    loadComponent: () =>
      import('./components/financier/financier.component').then(m => m.FinancierComponent),
    canActivate: [roleGuard(['financier'])],
  },

  // ── Routes Power BI ────────────────────────────
  {
    path: 'report/achat',
    loadComponent: () =>
      import('./components/report/report.component').then(m => m.ReportComponent),
    canActivate: [roleGuard(['achat'])],
    data: { reportKey: 'achat' }
  },
  {
    path: 'report/commercial',
    loadComponent: () =>
      import('./components/report/report.component').then(m => m.ReportComponent),
    canActivate: [roleGuard(['vente_b2c'])],
    data: { reportKey: 'vente_b2c' }
  },
  {
    path: 'report/marketing',
    loadComponent: () =>
      import('./components/report/report.component').then(m => m.ReportComponent),
    canActivate: [roleGuard(['marketing'])],
    data: { reportKey: 'marketing' }
  },
  {
  path: 'home',
  loadComponent: () =>
    import('./components/home/home.component').then(m => m.HomeComponent),
  // pas de guard — accessible à tous les rôles authentifiés
},
  {
    path: 'report/gm',
    loadComponent: () =>
      import('./components/report/report.component').then(m => m.ReportComponent),
    canActivate: [roleGuard(['general_manager'])],
    data: { reportKey: 'general_manager' }
  },
  {
    path: 'report/b2b',
    loadComponent: () =>
      import('./components/report/report.component').then(m => m.ReportComponent),
    canActivate: [roleGuard(['vente_b2b'])],
    data: { reportKey: 'vente_b2b' }
  },
  {
    path: 'report/financier',
    loadComponent: () =>
      import('./components/report/report.component').then(m => m.ReportComponent),
    canActivate: [roleGuard(['financier'])],
    data: { reportKey: 'financier' }
  },
   {
    path: 'report-builder',
    loadComponent: () =>
      import('./components/report-builder/report-builder.component').then(m => m.ReportBuilderComponent),
    canActivate: [roleGuard(['general_manager', 'financier'])], // Accessible à la DG et Finance
  },
  {
  path: 'calendar',
  loadComponent: () =>
    import('./components/calendar/calendar.component')
      .then(m => m.CalendarComponent),
       canActivate: [roleGuard(['general_manager', 'financier', 'achat', 'vente_b2c', 'vente_b2b', 'marketing'])],
},

];