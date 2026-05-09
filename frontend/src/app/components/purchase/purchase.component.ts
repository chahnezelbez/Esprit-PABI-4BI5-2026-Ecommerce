import { Component, Inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import {
  PurchaseClassificationRequest,
  PurchaseRegressionRequest,
  PurchaseClusteringRequest,
  PurchaseClassificationResponse,
  PurchaseRegressionResponse,
  PurchaseClusteringResponse,
} from '../../models/api.models';

type ActiveTask = 'classification' | 'regression' | 'clustering';
type PaymentMethodOption = { label: string; value: string };

// ─── Résultats métier ─────────────────────────────────────────
const CLASSIF_LABELS: Record<number, { label: string; desc: string; icon: string }> = {
  0: {
    label: 'Achat à TVA réduite ou exonéré',
    desc: 'Ce produit bénéficie d’un taux de TVA avantageux (0%, 7% ou 13%). Vérifiez l’éligibilité auprès de votre expert‑comptable.',
    icon: '🌿',
  },
  1: {
    label: 'Achat à TVA normale (19%)',
    desc: 'TVA standard applicable. Le montant TTC final inclut la TVA au taux normal.',
    icon: '📄',
  },
};

const CLUSTER_LABELS: Record<number, { label: string; desc: string; icon: string }> = {
  0: {
    label: 'Fournisseur occasionnel',
    desc: 'Peu de factures, montants modestes. Relation à développer.',
    icon: '🌱',
  },
  1: {
    label: 'Fournisseur régulier',
    desc: 'Volume et fréquence modérés. Partenaire fiable.',
    icon: '🤝',
  },
  2: {
    label: 'Fournisseur stratégique',
    desc: 'Fort volume et valeurs élevées. Partenaire clé pour l’entreprise.',
    icon: '⭐',
  },
};

@Component({
  selector: 'app-purchase',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './purchase.component.html',
  styleUrls: ['./purchase.component.scss'],
})
export class PurchaseComponent {
  activeTask = signal<ActiveTask>('classification');
  loading = signal(false);
  errorMsg = signal<string | null>(null);

  classifResult = signal<PurchaseClassificationResponse | null>(null);
  regrResult    = signal<PurchaseRegressionResponse | null>(null);
  clustResult   = signal<PurchaseClusteringResponse | null>(null);

  // Listes pour les menus déroulants
  moisList = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  anneeList = [2023, 2024, 2025, 2026];
  semaineList = Array.from({ length: 53 }, (_, i) => i + 1);
  
  // Valeurs envoyées au backend (encodeur_methode) + labels affichés UI
  methodesPaiement: PaymentMethodOption[] = [
    { label: 'Inconnu', value: 'Inconnu' },
  ];

  readonly fournisseurs = [
    'ASCOM','STEG','SONEDE','ORANGE','Tunisie Telecom',
    'KERAMOS','HAMILA CERAMIQUE','ENNAIM Céramique','Zouba Ceramic',
    'Zitoun Artisanat','Yassin Calligraphie','Fabripierre',
    'DJELASSI','KAMTRADE','KACO SA','PROSCOM','SMPA',
    'Quincaillerie Générale','Quincaillerie Zormani',
    'La Quincaillerie du Sahel','Delta Distribution',
    'META (FACEBOOK)','Elementor Ltd.','Oxahost',
    'Vivo Energy','NATBAG','TRANSAF','Transport Fehri',
    'My Print Tunisia','SNAPRINT',
    'INCONNU'
  ];
  readonly categories = ['MATERIAUX', 'SERVICE'];

  // --- Formulaires ---
  classifForm: PurchaseClassificationRequest = {
    Montant_HT: 1500,
    Taux_TVA: 0.19,
    Marge_TVA: 0.10,
    Mois: 5,
    Annee: 2025,
    Semaine: 20,
    Est_weekend: 0,
    fournisseur: 'ASCOM',
    categorie: 'MATERIAUX',
  };

  regrForm: PurchaseRegressionRequest = {
    Mois: 6,
    Annee: 2025,
    Semaine: 24,
    Est_weekend: 0,
    fournisseur: 'STEG',
    categorie: 'SERVICE',
    methode: 'Inconnu',
    Taux_TVA: 0.19,
  };

  clustForm: PurchaseClusteringRequest = {
    Nb_Factures: 20,
    Montant_Total: 12500,
    Montant_Moyen: 1041.67,
    Montant_Max: 3500,
    TVA_Moy: 0.19,
  };

  // Gestion des erreurs par champ
  errors: Record<string, string> = {};

  constructor(@Inject(ApiService) private api: ApiService) {}

  // Méthode pour changer d'onglet
  setTask(task: ActiveTask): void {
    this.activeTask.set(task);
    this.errorMsg.set(null);
    this.classifResult.set(null);
    this.regrResult.set(null);
    this.clustResult.set(null);
  }

  // --- Validations ---
  validateField(fieldName: string, value: any, rules: { required?: boolean; min?: number; max?: number }) {
    if (rules.required && (value === null || value === undefined || value === '')) {
      this.errors[fieldName] = 'Ce champ est requis.';
      return false;
    }
    if (rules.min !== undefined && value < rules.min) {
      this.errors[fieldName] = `La valeur minimale est ${rules.min}.`;
      return false;
    }
    if (rules.max !== undefined && value > rules.max) {
      this.errors[fieldName] = `La valeur maximale est ${rules.max}.`;
      return false;
    }
    delete this.errors[fieldName];
    return true;
  }

  clearError(fieldName: string) {
    delete this.errors[fieldName];
  }

  private normalizePaymentMethod(raw: string): string {
    // L'encodeur backend actuel n'accepte qu'une seule classe: "Inconnu".
    // On force cette valeur pour éviter les erreurs 400.
    return 'Inconnu';
  }

  clearErrorMsg() {
    this.errorMsg.set(null);
  }

  // Vérification avant soumission
  private validateClassification(): boolean {
    let ok = true;
    if (!this.validateField('Montant_HT', this.classifForm.Montant_HT, { required: true, min: 0 })) ok = false;
    if (!this.validateField('Taux_TVA', this.classifForm.Taux_TVA, { required: true })) ok = false;
    if (!this.validateField('Marge_TVA', this.classifForm.Marge_TVA, { required: true })) ok = false;
    if (!this.validateField('Mois', this.classifForm.Mois, { required: true, min: 1, max: 12 })) ok = false;
    if (!this.validateField('Annee', this.classifForm.Annee, { required: true })) ok = false;
    if (!this.validateField('Semaine', this.classifForm.Semaine, { required: true, min: 1, max: 53 })) ok = false;
    if (!this.validateField('Est_weekend', this.classifForm.Est_weekend, { required: true, min: 0, max: 1 })) ok = false;
    if (!this.validateField('fournisseur', this.classifForm.fournisseur, { required: true })) ok = false;
    if (!this.validateField('categorie', this.classifForm.categorie, { required: true })) ok = false;
    if (!ok) this.errorMsg.set('Veuillez corriger les champs en erreur avant de continuer.');
    return ok;
  }

  private validateRegression(): boolean {
    let ok = true;
    if (!this.validateField('rMois', this.regrForm.Mois, { required: true, min: 1, max: 12 })) ok = false;
    if (!this.validateField('rAnnee', this.regrForm.Annee, { required: true })) ok = false;
    if (!this.validateField('rSemaine', this.regrForm.Semaine, { required: true, min: 1, max: 53 })) ok = false;
    if (!this.validateField('rEst_weekend', this.regrForm.Est_weekend, { required: true, min: 0, max: 1 })) ok = false;
    if (!this.validateField('rFournisseur', this.regrForm.fournisseur, { required: true })) ok = false;
    if (!this.validateField('rCategorie', this.regrForm.categorie, { required: true })) ok = false;
    if (!this.validateField('rMethode', this.regrForm.methode, { required: true })) ok = false;
    if (!this.validateField('rTaux_TVA', this.regrForm.Taux_TVA, { required: true, min: 0, max: 0.19 })) ok = false;
    if (!ok) this.errorMsg.set('Veuillez corriger les champs en erreur.');
    return ok;
  }

  private validateClustering(): boolean {
    let ok = true;
    if (!this.validateField('Nb_Factures', this.clustForm.Nb_Factures, { required: true, min: 1 })) ok = false;
    if (!this.validateField('Montant_Total', this.clustForm.Montant_Total, { required: true, min: 0 })) ok = false;
    if (!this.validateField('Montant_Moyen', this.clustForm.Montant_Moyen, { required: true, min: 0 })) ok = false;
    if (!this.validateField('Montant_Max', this.clustForm.Montant_Max, { required: true, min: 0 })) ok = false;
    if (!this.validateField('TVA_Moy', this.clustForm.TVA_Moy, { required: true, min: 0, max: 0.19 })) ok = false;
    if (!ok) this.errorMsg.set('Veuillez renseigner correctement l’historique du fournisseur.');
    return ok;
  }

  // --- Soumissions ---
  submitClassification(): void {
    if (!this.validateClassification()) return;
    this.loading.set(true);
    this.errorMsg.set(null);
    this.classifResult.set(null);
    this.api.purchaseClassify(this.classifForm).subscribe({
      next: (res) => { 
        this.classifResult.set(res); 
        this.loading.set(false); 
      },
      error: (err: Error) => { 
        this.errorMsg.set(err.message); 
        this.loading.set(false); 
      },
    });
  }

  submitRegression(): void {
    if (!this.validateRegression()) return;

    // Garantit une valeur reconnue par l'encodeur backend.
    this.regrForm.methode = this.normalizePaymentMethod(this.regrForm.methode);
    if (!this.methodesPaiement.some(m => m.value === this.regrForm.methode)) {
      this.errorMsg.set('Méthode de paiement non reconnue. Choisissez une valeur de la liste.');
      return;
    }

    console.log('Données envoyées pour régression:', this.regrForm);
    
    this.loading.set(true);
    this.errorMsg.set(null);
    this.regrResult.set(null);
    
    this.api.purchaseRegress(this.regrForm).subscribe({
      next: (res) => { 
        console.log('Résultat régression reçu:', res);
        this.regrResult.set(res); 
        this.loading.set(false); 
      },
      error: (err: any) => { 
        console.error('Erreur régression:', err);
        const message = err.error?.detail || err.message || 'Erreur lors de la prédiction';
        this.errorMsg.set(message); 
        this.loading.set(false); 
      },
    });
  }

  submitClustering(): void {
    if (!this.validateClustering()) return;
    this.loading.set(true);
    this.errorMsg.set(null);
    this.clustResult.set(null);
    this.api.purchaseCluster(this.clustForm).subscribe({
      next: (res) => { 
        this.clustResult.set(res); 
        this.loading.set(false); 
      },
      error: (err: Error) => { 
        this.errorMsg.set(err.message); 
        this.loading.set(false); 
      },
    });
  }

  // --- Utilitaires UI ---
  probPercent(val: number): string {
    return (val * 100).toFixed(1) + '%';
  }

  getClassifMeta(pred: number) {
    return CLASSIF_LABELS[pred] ?? {
      label: `Classe ${pred}`,
      desc: 'Résultat non documenté. Contactez votre administrateur.',
      icon: '❓',
    };
  }

  getClusterMeta(cluster: number) {
    return CLUSTER_LABELS[cluster] ?? {
      label: `Segment ${cluster}`,
      desc: 'Segment non documenté.',
      icon: '📦',
    };
  }

  getTabOffset(): string {
    const active = this.activeTask();
    if (active === 'classification') return '0%';
    if (active === 'regression') return '33%';
    return '66%';
  }
}