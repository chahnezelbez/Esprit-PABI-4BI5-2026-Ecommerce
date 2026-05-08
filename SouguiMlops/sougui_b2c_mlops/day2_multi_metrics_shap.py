"""
Day 2 - MLOps pour Sougui.tn (Ventes B2C)
Multi-métriques + Comparaison de modèles + Artefacts visuels + SHAP
"""

import mlflow
import mlflow.sklearn
import mlflow.xgboost
import pandas as pd
import numpy as np
import hashlib
import pickle
import warnings
import matplotlib.pyplot as plt
import seaborn as sns
import shap
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, roc_curve, confusion_matrix,
    mean_squared_error, mean_absolute_error, r2_score,
    silhouette_score, davies_bouldin_score
)
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier, XGBRegressor
from sklearn.decomposition import PCA
from sqlalchemy import create_engine, text
import os

warnings.filterwarnings("ignore")

mlflow.set_tracking_uri("http://127.0.0.1:5000")
print(f"✅ MLflow tracking URI: {mlflow.get_tracking_uri()}")

# ============================================
# CHARGEMENT DES DONNÉES
# ============================================
DB_USER = "root"
DB_PASSWORD = ""
DB_HOST = "127.0.0.1"
DB_PORT = 3306
DB_NAME = "dwh_sougui"

use_mysql = False
df = None

try:
    engine = create_engine(f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}")
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    use_mysql = True
    print("✅ Connecté à MySQL - chargement des données réelles")
except Exception as e:
    print(f"⚠️ MySQL indisponible ({e})")
    print("🔄 Génération de données synthétiques réalistes...")
    use_mysql = False

if use_mysql:
    query = """
    SELECT 
        fc.ID_Client,
        c.Segment_Client,
        fc.Montant_Total,
        fc.Nb_Produits,
        d.Annee,
        d.Mois,
        d.Est_weekend,
        mp.Methode_Paiement
    FROM f_commandes fc
    LEFT JOIN client c ON fc.ID_Client = c.ID_Client
    LEFT JOIN d_date d ON fc.ID_Date = d.Date_PK
    LEFT JOIN d_methode_paiement mp ON fc.ID_Methode = mp.ID_Methode
    WHERE fc.Montant_Total > 0 AND fc.Montant_Total IS NOT NULL
    LIMIT 10000
    """
    df = pd.read_sql(query, engine)
    print(f"✅ Données réelles: {len(df)} lignes")
else:
    np.random.seed(42)
    n = 2000
    segments = ["Premium", "Standard", "Occasionnel", "Nouveau"]
    methodes = ["CB", "PayPal", "VIREMENT", "ESPECES"]
    
    df = pd.DataFrame({
        "ID_Client": np.random.randint(1, 500, n),
        "Segment_Client": np.random.choice(segments, n),
        "Montant_Total": np.random.exponential(150, n).round(2) + 10,
        "Nb_Produits": np.random.poisson(3, n) + 1,
        "Annee": np.random.choice([2022, 2023, 2024, 2025], n),
        "Mois": np.random.randint(1, 13, n),
        "Est_weekend": np.random.choice([0, 1], n),
        "Methode_Paiement": np.random.choice(methodes, n),
    })
    print(f"✅ Données synthétiques B2C: {len(df)} lignes")

# ============================================
# FEATURE ENGINEERING
# ============================================
df["Segment_Enc"] = df["Segment_Client"].astype("category").cat.codes
df["Methode_Enc"] = df["Methode_Paiement"].astype("category").cat.codes
df["Log_Montant"] = np.log1p(df["Montant_Total"])
df["Panier_Moyen"] = df["Montant_Total"] / df["Nb_Produits"]
df["Achat_Important"] = (df["Montant_Total"] > 200).astype(int)

data_source = "MySQL" if use_mysql else "synthetic"
data_hash = hashlib.sha256(pd.util.hash_pandas_object(df, index=True).values).hexdigest()

mlflow.set_experiment("SOUGUI_Sales_B2C_Day2")
os.makedirs("reports", exist_ok=True)

# ============================================
# CLASSIFICATION
# ============================================
print("\n" + "="*60)
print("📊 CLASSIFICATION - Prédiction des achats importants (>200 TND)")
print("="*60)

features_clf = ["Montant_Total", "Nb_Produits", "Log_Montant", "Panier_Moyen", 
                "Mois", "Annee", "Est_weekend", "Segment_Enc", "Methode_Enc"]
X_clf = df[features_clf].fillna(0)
y_clf = df["Achat_Important"]
X_train, X_test, y_train, y_test = train_test_split(X_clf, y_clf, test_size=0.2, random_state=42)

models_clf = {
    "RandomForest": RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1),
    "XGBoost": XGBClassifier(n_estimators=100, random_state=42, eval_metric="logloss", verbosity=0)
}

best_clf = None
best_clf_score = 0

for name, model in models_clf.items():
    with mlflow.start_run(run_name=f"Classification_{name}"):
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)
        y_proba = model.predict_proba(X_test)[:, 1]
        
        metrics = {
            "accuracy": accuracy_score(y_test, y_pred),
            "precision": precision_score(y_test, y_pred, zero_division=0),
            "recall": recall_score(y_test, y_pred, zero_division=0),
            "f1": f1_score(y_test, y_pred, zero_division=0),
            "roc_auc": roc_auc_score(y_test, y_proba)
        }
        
        mlflow.log_params({
            "model_type": name,
            "dataset_hash": data_hash,
            "data_source": data_source,
            "test_size": 0.2
        })
        for k, v in metrics.items():
            mlflow.log_metric(k, v)
        
        # Matrice de confusion
        cm = confusion_matrix(y_test, y_pred)
        fig, ax = plt.subplots(figsize=(6,5))
        sns.heatmap(cm, annot=True, fmt="d", cmap="Blues", ax=ax)
        ax.set_title(f"Confusion Matrix - {name}")
        plt.tight_layout()
        plt.savefig("cm.png")
        mlflow.log_artifact("cm.png")
        plt.close()
        
        # Courbe ROC
        fpr, tpr, _ = roc_curve(y_test, y_proba)
        fig, ax = plt.subplots(figsize=(8,6))
        ax.plot(fpr, tpr, label=f"ROC (AUC={metrics['roc_auc']:.3f})")
        ax.plot([0,1], [0,1], "k--")
        ax.set_xlabel("False Positive Rate")
        ax.set_ylabel("True Positive Rate")
        ax.set_title(f"ROC Curve - {name}")
        ax.legend()
        plt.tight_layout()
        plt.savefig("roc.png")
        mlflow.log_artifact("roc.png")
        plt.close()
        
        # SHAP - Explicabilité Globale
        if name == "RandomForest":
            try:
                X_sample = X_test.sample(min(100, len(X_test)), random_state=42)
                explainer = shap.TreeExplainer(model)
                shap_values = explainer.shap_values(X_sample)
                
                shap.summary_plot(shap_values[1], X_sample, feature_names=features_clf, show=False)
                plt.tight_layout()
                plt.savefig("reports/shap_summary.png", dpi=150, bbox_inches="tight")
                mlflow.log_artifact("reports/shap_summary.png")
                plt.close()
                
                shap.summary_plot(shap_values[1], X_sample, feature_names=features_clf, plot_type="bar", show=False)
                plt.tight_layout()
                plt.savefig("reports/shap_bar.png", dpi=150, bbox_inches="tight")
                mlflow.log_artifact("reports/shap_bar.png")
                plt.close()
            except Exception as e:
                print(f"   ⚠️ SHAP non disponible: {e}")
        
        signature = mlflow.models.infer_signature(X_train, model.predict(X_train))
        mlflow.sklearn.log_model(model, "model", signature=signature, input_example=X_train.iloc[:2])
        
        print(f"  ✅ {name} - Accuracy={metrics['accuracy']:.4f}, F1={metrics['f1']:.4f}, AUC={metrics['roc_auc']:.4f}")
        
        if metrics["accuracy"] > best_clf_score:
            best_clf_score = metrics["accuracy"]
            best_clf = model

# ============================================
# RÉGRESSION
# ============================================
print("\n" + "="*60)
print("📊 RÉGRESSION - Prédiction du montant total")
print("="*60)

features_reg = ["Nb_Produits", "Mois", "Annee", "Est_weekend", "Segment_Enc", "Methode_Enc"]
X_reg = df[features_reg].fillna(0)
y_reg = df["Montant_Total"]
X_train_r, X_test_r, y_train_r, y_test_r = train_test_split(X_reg, y_reg, test_size=0.2, random_state=42)

models_reg = {
    "LinearRegression": LinearRegression(),
    "RandomForest": RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1),
    "XGBoost": XGBRegressor(n_estimators=100, random_state=42, verbosity=0)
}

best_reg = None
best_reg_score = float('inf')

for name, model in models_reg.items():
    with mlflow.start_run(run_name=f"Regression_{name}"):
        model.fit(X_train_r, y_train_r)
        y_pred = model.predict(X_test_r)
        
        metrics = {
            "rmse": np.sqrt(mean_squared_error(y_test_r, y_pred)),
            "mae": mean_absolute_error(y_test_r, y_pred),
            "r2": r2_score(y_test_r, y_pred)
        }
        
        mlflow.log_params({
            "model_type": name,
            "dataset_hash": data_hash,
            "data_source": data_source,
            "test_size": 0.2
        })
        for k, v in metrics.items():
            mlflow.log_metric(k, v)
        
        # Graphique résidus
        residuals = y_test_r - y_pred
        fig, axes = plt.subplots(1, 2, figsize=(12,4))
        axes[0].scatter(y_pred, residuals, alpha=0.5)
        axes[0].axhline(0, color="red", linestyle="--")
        axes[0].set_title(f"Residuals - {name}")
        axes[0].set_xlabel("Predicted")
        axes[0].set_ylabel("Residuals")
        
        axes[1].hist(residuals, bins=30, edgecolor="black")
        axes[1].set_title(f"Residuals Distribution - {name}")
        axes[1].set_xlabel("Residuals")
        plt.tight_layout()
        plt.savefig("residuals.png")
        mlflow.log_artifact("residuals.png")
        plt.close()
        
        signature = mlflow.models.infer_signature(X_train_r, model.predict(X_train_r))
        mlflow.sklearn.log_model(model, "model", signature=signature, input_example=X_train_r.iloc[:2])
        
        print(f"  ✅ {name} - RMSE={metrics['rmse']:.2f}, R2={metrics['r2']:.4f}")
        
        if metrics["rmse"] < best_reg_score:
            best_reg_score = metrics["rmse"]
            best_reg = model

# ============================================
# CLUSTERING
# ============================================
print("\n" + "="*60)
print("📊 CLUSTERING - Segmentation clients")
print("="*60)

df_client = df.groupby("ID_Client").agg({
    "Montant_Total": ["sum", "mean", "count"],
    "Nb_Produits": "mean"
}).round(2)
df_client.columns = ["Montant_Total", "Montant_Moyen", "Nb_Achats", "Nb_Produits_Moyen"]
df_client = df_client.fillna(0)

scaler = StandardScaler()
X_clust = scaler.fit_transform(df_client[["Montant_Total", "Nb_Achats", "Nb_Produits_Moyen"]])

best_silhouette = -1
best_k = 0

for k in [2, 3, 4, 5]:
    with mlflow.start_run(run_name=f"Clustering_KMeans_k{k}"):
        model = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = model.fit_predict(X_clust)
        
        metrics = {
            "silhouette": silhouette_score(X_clust, labels) if len(set(labels)) > 1 else 0,
            "davies_bouldin": davies_bouldin_score(X_clust, labels) if len(set(labels)) > 1 else 0,
            "inertia": model.inertia_
        }
        
        mlflow.log_params({
            "n_clusters": k,
            "dataset_hash": data_hash,
            "data_source": data_source,
            "scaled": True
        })
        for k_metric, v in metrics.items():
            mlflow.log_metric(k_metric, v)
        
        # Visualisation PCA
        pca = PCA(n_components=2)
        X_pca = pca.fit_transform(X_clust)
        fig, ax = plt.subplots(figsize=(8,6))
        scatter = ax.scatter(X_pca[:,0], X_pca[:,1], c=labels, cmap="viridis", s=50)
        ax.set_title(f"Clusters (PCA) - k={k}")
        ax.set_xlabel("PC1")
        ax.set_ylabel("PC2")
        plt.colorbar(scatter)
        plt.tight_layout()
        plt.savefig(f"clusters_k{k}.png")
        mlflow.log_artifact(f"clusters_k{k}.png")
        plt.close()
        
        with open(f"clust_labels_k{k}.pkl", "wb") as f:
            pickle.dump(labels, f)
        mlflow.log_artifact(f"clust_labels_k{k}.pkl")
        
        print(f"  ✅ k={k} - Silhouette={metrics['silhouette']:.4f}")
        
        if metrics["silhouette"] > best_silhouette:
            best_silhouette = metrics["silhouette"]
            best_k = k

# ============================================
# RÉSUMÉ FINAL
# ============================================
print("\n" + "="*60)
print("📈 RÉSUMÉ DAY 2 - SOUGUI.TN VENTES B2C")
print("="*60)
print(f"🔹 Source données: {data_source}")
print(f"🔹 Meilleur classifieur: RandomForest (Accuracy={best_clf_score:.4f})")
print(f"🔹 Meilleur régresseur: RMSE={best_reg_score:.2f}")
print(f"🔹 Meilleur clustering: k={best_k}, Silhouette={best_silhouette:.4f}")
print(f"🔹 Total runs: {len(models_clf) + len(models_reg) + 4}")
print("\n🌐 Interface MLflow: http://127.0.0.1:5000")