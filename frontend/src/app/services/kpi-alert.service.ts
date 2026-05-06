import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { interval, Subscription, catchError, throwError } from 'rxjs';
import { KeycloakService } from 'keycloak-angular';
import { KpiAlert, KpiThreshold } from '../models/kpi-alert.model';
import { AlertStoreService } from './alert-store.service';

@Injectable({ providedIn: 'root' })
export class KpiAlertService implements OnDestroy {

  private readonly WORKSPACE_ID = '9d0fbedc-8ecd-4523-9524-62ae4d76f8ff';
  private readonly DATASET_ID   = '60ca01ef-3cca-4aa5-88fa-8fc0c5ed253e';
  private readonly POLL_MS      = 5 * 60 * 1000;
  private pollSub?: Subscription;

  private readonly thresholds: KpiThreshold[] = [
    { role: 'financier',       metric: '[CA Total]',        title: 'CA Total',        unit: 'TND',   criticalBelow: 1_500_000, warningBelow: 2_000_000 },
    { role: 'financier',       metric: '[Marge Nette]',     title: 'Marge nette',     unit: '%',     criticalBelow: 10,        warningBelow: 15        },
    { role: 'general_manager', metric: '[CA Total]',        title: 'CA Consolidé',    unit: 'TND',   criticalBelow: 2_000_000, warningBelow: 2_500_000 },
    { role: 'general_manager', metric: '[Objectif Global]', title: 'Objectif global', unit: '%',     criticalBelow: 80,        warningBelow: 90        },
    { role: 'achat',           metric: '[Stock Critique]',  title: 'Stock critique',  unit: 'art.',  criticalAbove: 50,        warningAbove: 20        },
    { role: 'achat',           metric: '[Délai Livraison]', title: 'Délai livraison', unit: 'j',     criticalAbove: 14,        warningAbove: 10        },
    { role: 'vente_b2b',       metric: '[Commandes B2B]',   title: 'Commandes B2B',   unit: 'cmd',   criticalBelow: 20,        warningBelow: 40        },
    { role: 'vente_b2b',       metric: '[CA B2B]',          title: 'CA B2B',          unit: 'TND',   criticalBelow: 500_000,   warningBelow: 800_000   },
    { role: 'vente_b2c',       metric: '[Taux Conversion]', title: 'Taux conversion', unit: '%',     criticalBelow: 2,         warningBelow: 4         },
    { role: 'vente_b2c',       metric: '[Panier Moyen]',    title: 'Panier moyen',    unit: 'TND',   criticalBelow: 80,        warningBelow: 120       },
    { role: 'marketing',       metric: '[Taux Engagement]', title: 'Taux engagement', unit: '%',     criticalBelow: 1,         warningBelow: 3         },
    { role: 'marketing',       metric: '[Leads Générés]',   title: 'Leads générés',   unit: 'leads', criticalBelow: 50,        warningBelow: 100       },
  ];

  constructor(
    private http: HttpClient,
    private alertStore: AlertStoreService,
    private keycloak: KeycloakService,
  ) {}

  // ── Polling ────────────────────────────────────────────────
  startPolling(): void {
    this.stopPolling();
    this.checkAll();
    this.pollSub = interval(this.POLL_MS).subscribe(() => this.checkAll());
  }

  stopPolling(): void {
    this.pollSub?.unsubscribe();
  }

  // ── Check avec refresh token ───────────────────────────────
  private async checkAll(): Promise<void> {
    try {
      await this.keycloak.updateToken(30);
      const token = await this.keycloak.getToken();
      this.executeQuery(token).subscribe({
        next: data  => this.evaluateThresholds(data),
        error: err  => console.error('[KpiAlertService] Erreur executeQuery', err),
      });
    } catch {
      console.warn('[KpiAlertService] Session expirée — redirection login');
      this.keycloak.login();
    }
  }

  // ── Requête DAX ────────────────────────────────────────────
  private buildDaxQuery(): string {
    const measures = this.thresholds
      .map(t => `"${t.metric}", ${t.metric}`)
      .join(',\n  ');
    return `EVALUATE ROW(\n  ${measures}\n)`;
  }

  // ── Execute Queries API ────────────────────────────────────
  private executeQuery(token: string) {
    const url = `https://api.powerbi.com/v1.0/myorg/groups/${this.WORKSPACE_ID}/datasets/${this.DATASET_ID}/executeQueries`;

    const headers = new HttpHeaders({
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    });

    const body = {
      queries: [{ query: this.buildDaxQuery() }],
      serializerSettings: { includeNulls: true },
    };

    return this.http.post<PowerBiQueryResult>(url, body, { headers }).pipe(
      catchError(err => {
        console.error('[KpiAlertService] Execute Queries API échouée', err);
        return throwError(() => err);
      })
    );
  }

  // ── Parser la réponse ──────────────────────────────────────
  private parseQueryResult(result: PowerBiQueryResult): Record<string, number> {
    try {
      const row = result.results?.[0]?.tables?.[0]?.rows?.[0] ?? {};
      const normalized: Record<string, number> = {};

      for (const [key, value] of Object.entries(row)) {
        // L'API retourne "NomTable[NomMesure]" — on extrait "[NomMesure]"
        const match = key.match(/(\[[^\]]+\])$/);
        const cleanKey = match ? match[1] : key;
        if (value !== null && value !== undefined) {
          normalized[cleanKey] = value as number;
        }
      }
      return normalized;
    } catch (e) {
      console.error('[KpiAlertService] Erreur parsing résultat', e);
      return {};
    }
  }

  // ── Évaluation des seuils ──────────────────────────────────
  private evaluateThresholds(result: PowerBiQueryResult): void {
    const data = this.parseQueryResult(result);

    if (Object.keys(data).length === 0) {
      console.warn('[KpiAlertService] Aucune donnée reçue — évaluation ignorée');
      return;
    }

    const newAlerts: KpiAlert[] = [];

    for (const t of this.thresholds) {
      const value = data[t.metric];
      if (value === undefined || value === null) {
        console.warn(`[KpiAlertService] Mesure introuvable dans la réponse : ${t.metric}`);
        continue;
      }

      let severity: 'critical' | 'warning' | null = null;

      if      (t.criticalBelow !== undefined && value < t.criticalBelow) severity = 'critical';
      else if (t.criticalAbove !== undefined && value > t.criticalAbove) severity = 'critical';
      else if (t.warningBelow  !== undefined && value < t.warningBelow)  severity = 'warning';
      else if (t.warningAbove  !== undefined && value > t.warningAbove)  severity = 'warning';

      if (!severity) continue;

      const threshold = severity === 'critical'
        ? (t.criticalBelow ?? t.criticalAbove ?? 0)
        : (t.warningBelow  ?? t.warningAbove  ?? 0);

      const direction = (t.criticalBelow !== undefined || t.warningBelow !== undefined)
        ? 'en dessous'
        : 'au-dessus';

      newAlerts.push({
        id:        `${t.role}-${t.metric}-${Date.now()}`,
        role:      t.role,
        title:     t.title,
        message:   `${t.title} à ${value}${t.unit} — ${direction} du seuil (${threshold}${t.unit})`,
        severity,
        value,
        threshold,
        unit:      t.unit,
        timestamp: new Date(),
        read:      false,
      });
    }

    this.alertStore.addAlerts(newAlerts);
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }
}

// ── Types ──────────────────────────────────────────────────
interface PowerBiQueryResult {
  results: Array<{
    tables: Array<{
      rows: Array<Record<string, unknown>>;
    }>;
  }>;
}