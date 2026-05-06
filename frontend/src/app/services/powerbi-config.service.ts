import { Injectable } from '@angular/core';

export interface ReportConfig {
  embedUrl: string;
  reportId: string;
}

@Injectable({ providedIn: 'root' })
export class PowerbiConfigService {

  private readonly BASE_URL = 'https://app.powerbi.com/reportEmbed';
  private readonly REPORT_ID = '84068065-f618-44eb-b89f-4676655167c8';
  private readonly CTID = '604f1a96-cbe8-43f8-abbf-f8eaf5d85730';
  private readonly PARAMS = '&autoAuth=true&filterPaneEnabled=false&navContentPaneEnabled=false';

  private buildUrl(pageName?: string): string {
    let url = `${this.BASE_URL}?reportId=${this.REPORT_ID}&ctid=${this.CTID}${this.PARAMS}`;
    if (pageName) {
      url += `&pageName=${pageName}`;
    }
    return url;
  }

  private readonly reportMap: Record<string, ReportConfig> = {
    achat: {
      reportId: this.REPORT_ID,
      embedUrl: this.buildUrl('3243d4fa598488b71357')   // ← nom de la page Purchases dans Power BI
    },
    vente_b2c: {
      reportId: this.REPORT_ID,
      embedUrl: this.buildUrl('e64b98605510b435b172')         // ← nom de la page B2C
    },
    marketing: {
      reportId: this.REPORT_ID,
      embedUrl: this.buildUrl('99fab7a9e3026af1f33d')   // ← nom de la page Marketing
    },
    general_manager: {
      reportId: this.REPORT_ID,
      embedUrl: this.buildUrl('29b7f8e1f3676ae21f39')                           // ← nom de la page GM 
    },
    vente_b2b: {
      reportId: this.REPORT_ID,
      embedUrl: this.buildUrl('360bcb7900c3578cb10c')         // ← nom de la page B2B
    },
    financier: {
      reportId: this.REPORT_ID,
      embedUrl: this.buildUrl('84b470dd2f1f8604cac9')     // ← nom de la page Finance
    }
  };

  getConfig(reportKey: string): ReportConfig | null {
    return this.reportMap[reportKey] ?? null;
  }
}