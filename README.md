# Esprit-PABI-4BI5-2026-Ecommerce
Developed at Esprit School of Engineering – Tunisia | Academic Year 2025–2026 | Talend, Python, Power BI, n8n 
# Sougui Ecommerce — Business Intelligence Dashboard
 
> **Esprit School of Engineering · Classe 4BI5 · PABI 2026**
> Branche active : `bi-innovateurs`
 
---
 
## Présentation du projet
 
Pipeline BI complet pour **Sougui**, distributeur tunisien FMCG,
couvrant l'analyse des ventes B2C et B2B, la veille concurrentielle
sur les prix, et la planification des actions produit.
 
**Stack technique :** Talend Open Studio · Power BI Desktop · Modèle en constellation · DAX · HTML Visuals
 
---
 
## Structure du dépôt
 
```
├── ETL/
│   ├── talend_jobs/          Jobs Talend exportés (.zip)
│   └── README_ETL.md         Sources, mappings, fréquence
│
├── DataModel/
│   ├── artisanat_db.sql      DDL base source (e-commerce artisanat)
│   └── dwh_sougui.sql        DDL Data Warehouse étoile (DWH Sougui)
│
├── DAX/
│   ├── mesures_b2c.dax       18 mesures fact_venteredo (B2C)
│   ├── mesures_b2b.dax       11 mesures fact_venteb2b (B2B)
│   ├── mesures_achats.dax     9 mesures f_achats (Achats)
│   └── mesures_benchmark.dax 16 mesures fqctbenchmqrk (Pricing)
│
├── PowerBI/
│   └── versions/
│       └── DashbordsSougui-2 (1).pbix   Version initiale dashboard
│
├── Documentation/
│   ├── rapport_technique.md
│   ├── guide_utilisation.md
│   └── screenshots/          PNG des 9 pages du dashboard
│
├── .gitignore
└── README.md
```
 
---
 
## Modèle de données 
 
### Tables de faits
 
| Table | Rôle | Pages dashboard |
|-------|------|-----------------|
| `fact_venteredo` | Ventes B2C détail | Dash B2C · Page 2 · Page 3 |
| `fact_venteb2b` | Ventes B2B entreprises | Dash B2B · Finance · GM |
| `f_achats` | Achats fournisseurs | Dash Purchase · Finance |
| `fqctbenchmqrk` | Benchmark prix concurrents | Dash Marketing · GM |
 
### Tables de dimensions
 
| Table | Clé | Description |
|-------|-----|-------------|
| `d_geo` | Gouvernorat | 24 gouvernorats tunisiens |
| `d_date` | Date | Calendrier (Date · Lib_Mois · Annee) |
| `dim_produits` | Nom_produit | Catalogue produits Sougui |
| `dim_canal` | Nom_Canal | Canal de vente (B2C / B2B) |
| `dim_categoires` | CtaKey | Catégories produits |
| `dim_client_societe` | Nom_Client | Portefeuille clients B2B |
| `dim_concurrent` | Nom_Concurrent | Concurrents benchmarkés |
| `fournisseur` | Nom_Fournisseur | Fournisseurs actifs |
| `d_methode_paiement` | Type_Paiement | Modes de paiement B2C |
 
---
 
## Pages du dashboard Power BI
 
| Page | Contenu principal | Mesures clés |
|------|-------------------|--------------|
| Home | Navigation | Boutons vers toutes les pages |
| Dash Purchase | KPIs achats fournisseurs | Total Achats TTC · YY% · Type Fournisseur |
| Dash Finance | Vue financière consolidée | CA_Total · Marge Brute · Part B2C/B2B |
| Dash GM | Vue direction générale | CA Total · Marge · Part Marché · Map |
| Dash Marketing | Benchmark prix | Prix Sougui vs Marché · Statut Compétitif |
| **Dash B2C** | Ventes retail | CA · Commandes · Donut · Barres · Aire |
| **Page 2** | B2C approfondi | Carte Tunisie · KPI HTML · Alertes · Scroller |
| **Page 3** | Plan d'action | Tableau Action Suggérée (top 20 produits) |
| Dash B2B | Ventes entreprises | CA TTC · YTD · Clients · Panier moyen |
| Temp | Prototypes HTML | Visuels 3D pricing (développement) |
 
---
 
## Mesures DAX — Vue d'ensemble
 
### fact_venteredo (B2C) — 18 mesures
 
| Mesure | Type | Page |
|--------|------|------|
| CA | KPI card | Dash B2C · Finance · GM |
| Marge Brute · Taux Marge % | KPI card | Finance · B2C |
| Nb Commandes Client | KPI card | Dash B2C · GM |
| Nb Produits · Quantité Vendue | KPI card | Dash B2C |
| Part B2C · TVA_Totale | KPI card | Finance · GM |
| Rentabilité Produit | Label SWITCH | Dash B2C donut |
| B2C_KPI_Cards_HTML | HTML visual | Page 2 |
| B2C_Gouvernorats_HTML | HTML map | Page 2 |
| B2C_Alertes_HTML | HTML alerts | Page 2 |
| B2C_Scroller_HTML | HTML ranking | Page 2 |
| B2C_Action_Suggeree | HTML table | Page 3 |
| B2C_Status_Final_Clean · Top_Product_Creative_Card · B2C_SDG_HTML | HTML | Dash B2C |
 
### fact_venteb2b (B2B) — 11 mesures
 
| Mesure | Type | Page |
|--------|------|------|
| B2B \| CA TTC · YTD · YTD N-1 | KPI + area chart | Dash B2B |
| B2B \| Nbre Factures · Clients Actifs | KPI card | Dash B2B |
| B2B \| Panier Moyen TTC · Montant TVA | KPI card | Dash B2B |
| CA_B2B · CA_Total | Cross-page | Finance · GM |
| Client Type B2B · Part B2B | Segmentation | Dash B2B · GM |
 
### f_achats (Achats) — 9 mesures
 
| Mesure | Type | Page |
|--------|------|------|
| Total Achats TTC · HT · AP | KPI card | Dash Purchase · Finance |
| Total TVA payée | KPI card | Dash Purchase · Finance |
| Nombre de Factures · Fournisseur | KPI card | Dash Purchase |
| Panier moyen · YY % | KPI card | Dash Purchase |
| Type Fournisseur | Segmentation | Dash Purchase pivot |
 
### fqctbenchmqrk (Benchmark) — 16 mesures
 
| Mesure | Type | Page |
|--------|------|------|
| BM \| Prix Moyen Sougui · Marché · par Concurrent | Prix | Marketing · GM |
| BM \| % Position Prix Sougui vs Marché | Écart % | Marketing cards |
| BM \| Statut Compétitif | Label SWITCH | Marketing card + pivot |
| BM \| Jauge Min / Max / Cible | Gauge bounds | Marketing gauge |
| Nb_Produits_Votre · Concurrents | Comptage | Marketing cards |
| Part_Marché_Estimée | Part marché | Dash GM card |
| PriceGap_HTML_3D · Prix_HTML_SansCadre · Prix_Moyen_Concurrent_HTML | HTML | Page Temp |
 
---
 
## Visuels personnalisés installés
 
| Visual | Usage |
|--------|-------|
| HTML Content | Mesures HTML (alertes, cartes KPI, carte Tunisie) |
| Para HTML Viewer | Visuels 3D pricing (Page Temp) |
| KPI Viz | Indicateurs avec tendance |
| Advanced Pie Donut | Donut chart amélioré |
| Synoptic Panel Lite | Carte géographique SVG personnalisée |
| Deneb (Vega-Lite) | Visualisations déclaratives avancées |
| EasyTerritory | Carte territoriale interactive |
 
---
