"""
Day 6 - MLOps pour Sougui.tn (Ventes B2C)
Déploiement et Monitoring avec SQLite + Détection de dérive
"""

import mlflow
import mlflow.sklearn
import pandas as pd
import numpy as np
import sqlite3
import json
import time
import pickle
import warnings
from datetime import datetime
from sklearn.metrics import accuracy_score, mean_squared_error, r2_score, silhouette_score
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from scipy import stats
from mlflow.tracking import MlflowClient

warnings.filterwarnings("ignore")

mlflow.set_tracking_uri("http://127.0.0.1:5000")
client = MlflowClient()

MONITORING_DB = "monitoring_sales.db"
MLFLOW_MODELS_URI = "http://127.0.0.1:5001"

PRODUCTION_THRESHOLDS = {
    "classifier": {"accuracy": 0.85, "latency_ms": 100},
    "regressor": {"rmse": 150.0, "r2": 0.60, "latency_ms": 100},
    "clustering": {"silhouette": 0.40}
}

print(f"✅ MLflow tracking URI: {mlflow.get_tracking_uri()}")
print(f"📊 Seuils production: {PRODUCTION_THRESHOLDS}")

# ============================================
# INITIALISATION DE LA BASE SQLITE
# ============================================
def init_monitoring_db():
    conn = sqlite3.connect(MONITORING_DB)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS monitoring (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            model_type TEXT,
            metric_name TEXT,
            metric_value REAL,
            threshold REAL,
            status TEXT,
            latency_ms REAL,
            details TEXT
        )
    """)
    conn.commit()
    conn.close()
    print("✅ Base SQLite initialisée")

init_monitoring_db()

def save_metric_to_db(model_type, metric_name, metric_value, threshold, status, latency_ms=None, details=None):
    conn = sqlite3.connect(MONITORING_DB)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO monitoring (timestamp, model_type, metric_name, metric_value, threshold, status, latency_ms, details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (datetime.now().isoformat(), model_type, metric_name, metric_value, threshold, status, latency_ms, details))
    conn.commit()
    conn.close()

# ============================================
# RÉCUPÉRATION DES MODÈLES PRODUCTION
# ============================================
print("\n" + "="*60)
print("📊 RÉCUPÉRATION DES MODÈLES PRODUCTION")
print("="*60)

def get_production_model(model_name):
    try:
        latest_version = client.get_latest_versions(model_name, stages=["Production"])[0]
        model_uri = f"models:/{model_name}/Production"
        model = mlflow.sklearn.load_model(model_uri)
        print(f"   ✅ {model_name} - version {latest_version.version} chargé")
        return model, latest_version.version
    except Exception as e:
        print(f"   ⚠️ {model_name} non trouvé en Production: {e}")
        return None, None

model_clf, version_clf = get_production_model("SOUGUI_Sales_Classifier_Optuna")
model_reg, version_reg = get_production_model("SOUGUI_Sales_Regressor_Optuna")

try:
    with open("clust_model_sales_optuna.pkl", "rb") as f:
        clust_data = pickle.load(f)
    model_clust = clust_data["model"]
    scaler = clust_data["scaler"]
    print(f"   ✅ Clustering modèle chargé")
except Exception as e:
    print(f"   ⚠️ Clustering non trouvé: {e}")
    model_clust = None

# ============================================
# SIMULATION DE DONNÉES PRODUCTION
# ============================================
print("\n" + "="*60)
print("📊 SIMULATION DE DONNÉES PRODUCTION")
print("="*60)

np.random.seed(999)
n_test = 500

segments = ["Premium", "Standard", "Occasionnel", "Nouveau"]
methodes = ["CB", "PayPal", "VIREMENT", "ESPECES"]

df_test = pd.DataFrame({
    "ID_Client": np.random.randint(1, 500, n_test),
    "Segment_Client": np.random.choice(segments, n_test),
    "Montant_Total": np.random.exponential(150, n_test).round(2) + 10,
    "Nb_Produits": np.random.poisson(3, n_test) + 1,
    "Annee": np.random.choice([2025, 2026], n_test),
    "Mois": np.random.randint(1, 13, n_test),
    "Est_weekend": np.random.choice([0, 1], n_test),
    "Methode_Paiement": np.random.choice(methodes, n_test),
})

df_test["Segment_Enc"] = df_test["Segment_Client"].astype("category").cat.codes
df_test["Methode_Enc"] = df_test["Methode_Paiement"].astype("category").cat.codes
df_test["Log_Montant"] = np.log1p(df_test["Montant_Total"])
df_test["Panier_Moyen"] = df_test["Montant_Total"] / df_test["Nb_Produits"]
df_test["Achat_Important"] = (df_test["Montant_Total"] > 200).astype(int)

print(f"✅ Données test: {len(df_test)} lignes")

# ============================================
# INFERENCE ET MONITORING
# ============================================
print("\n" + "="*60)
print("📊 INFERENCE ET MONITORING")
print("="*60)

# Classification
if model_clf:
    features_clf = ["Montant_Total", "Nb_Produits", "Log_Montant", "Panier_Moyen", 
                    "Mois", "Annee", "Est_weekend", "Segment_Enc", "Methode_Enc"]
    X_test_clf = df_test[features_clf].fillna(0)
    y_true_clf = df_test["Achat_Important"]
    
    start_time = time.time()
    y_pred_clf = model_clf.predict(X_test_clf)
    latency_clf = (time.time() - start_time) * 1000
    
    accuracy = accuracy_score(y_true_clf, y_pred_clf)
    
    status = "OK" if accuracy >= PRODUCTION_THRESHOLDS["classifier"]["accuracy"] else "ALERTE"
    
    save_metric_to_db(
        model_type="classifier",
        metric_name="accuracy",
        metric_value=accuracy,
        threshold=PRODUCTION_THRESHOLDS["classifier"]["accuracy"],
        status=status,
        latency_ms=latency_clf,
        details=f"version_{version_clf}"
    )
    
    print(f"\n📈 Classification:")
    print(f"   Accuracy: {accuracy:.4f} (seuil: {PRODUCTION_THRESHOLDS['classifier']['accuracy']})")
    print(f"   Latence: {latency_clf:.2f} ms")
    print(f"   Statut: {'✅ OK' if status == 'OK' else '❌ ALERTE'}")

# Régression
if model_reg:
    features_reg = ["Nb_Produits", "Mois", "Annee", "Est_weekend", "Segment_Enc", "Methode_Enc"]
    X_test_reg = df_test[features_reg].fillna(0)
    y_true_reg = df_test["Montant_Total"]
    
    start_time = time.time()
    y_pred_reg = model_reg.predict(X_test_reg)
    latency_reg = (time.time() - start_time) * 1000
    
    rmse = np.sqrt(mean_squared_error(y_true_reg, y_pred_reg))
    r2 = r2_score(y_true_reg, y_pred_reg)
    
    status = "OK" if (rmse <= PRODUCTION_THRESHOLDS["regressor"]["rmse"] and 
                     r2 >= PRODUCTION_THRESHOLDS["regressor"]["r2"]) else "ALERTE"
    
    save_metric_to_db(
        model_type="regressor",
        metric_name="rmse",
        metric_value=rmse,
        threshold=PRODUCTION_THRESHOLDS["regressor"]["rmse"],
        status=status,
        latency_ms=latency_reg,
        details=f"version_{version_reg}, r2={r2:.4f}"
    )
    
    print(f"\n📈 Régression:")
    print(f"   RMSE: {rmse:.2f} (seuil: {PRODUCTION_THRESHOLDS['regressor']['rmse']})")
    print(f"   R²: {r2:.4f} (seuil: {PRODUCTION_THRESHOLDS['regressor']['r2']})")
    print(f"   Latence: {latency_reg:.2f} ms")
    print(f"   Statut: {'✅ OK' if status == 'OK' else '❌ ALERTE'}")

# Clustering
if model_clust:
    df_client_test = df_test.groupby("ID_Client").agg({
        "Montant_Total": ["sum", "mean", "count"],
        "Nb_Produits": "mean"
    })
    df_client_test.columns = ["Montant_Total", "Montant_Moyen", "Nb_Achats", "Nb_Produits_Moyen"]
    df_client_test = df_client_test.fillna(0)
    
    X_clust_test = scaler.transform(df_client_test[["Montant_Total", "Nb_Achats", "Nb_Produits_Moyen"]])
    labels_test = model_clust.predict(X_clust_test)
    
    silhouette = silhouette_score(X_clust_test, labels_test) if len(set(labels_test)) > 1 else 0
    
    status = "OK" if silhouette >= PRODUCTION_THRESHOLDS["clustering"]["silhouette"] else "ALERTE"
    
    save_metric_to_db(
        model_type="clustering",
        metric_name="silhouette",
        metric_value=silhouette,
        threshold=PRODUCTION_THRESHOLDS["clustering"]["silhouette"],
        status=status,
        details=f"n_clusters={len(set(labels_test))}"
    )
    
    print(f"\n📈 Clustering:")
    print(f"   Silhouette: {silhouette:.4f} (seuil: {PRODUCTION_THRESHOLDS['clustering']['silhouette']})")
    print(f"   Statut: {'✅ OK' if status == 'OK' else '❌ ALERTE'}")

# ============================================
# DÉTECTION DE DÉRIVE
# ============================================
print("\n" + "="*60)
print("📊 DÉTECTION DE DÉRIVE (Data Drift)")
print("="*60)

np.random.seed(42)
n_train = 2000
df_train_ref = pd.DataFrame({
    "Montant_Total": np.random.exponential(150, n_train) + 10,
    "Nb_Produits": np.random.poisson(3, n_train) + 1
})

drift_detected = False
for col in ["Montant_Total", "Nb_Produits"]:
    ks_stat, p_value = stats.ks_2samp(df_train_ref[col], df_test[col])
    if p_value < 0.05:
        print(f"   ⚠️ Dérive détectée sur {col}: p-value={p_value:.4f}")
        drift_detected = True
    else:
        print(f"   ✅ {col}: distribution stable (p-value={p_value:.4f})")

if drift_detected:
    save_metric_to_db(
        model_type="system",
        metric_name="data_drift",
        metric_value=1,
        threshold=0,
        status="ALERTE",
        details="distribution_changed"
    )

# ============================================
# CONSULTATION DE L'HISTORIQUE
# ============================================
print("\n" + "="*60)
print("📊 HISTORIQUE DES MONITORING (SQLite)")
print("="*60)

conn = sqlite3.connect(MONITORING_DB)
cursor = conn.cursor()
cursor.execute("SELECT * FROM monitoring ORDER BY id DESC LIMIT 10")
rows = cursor.fetchall()
conn.close()

print("\nDernières entrées dans la base:")
print("-" * 80)
for row in rows:
    print(f"   {row[1]} | {row[2]} | {row[3]}={row[4]:.4f} | {row[6]}")

# ============================================
# RAPPORT FINAL
# ============================================
print("\n" + "="*60)
print("📈 RAPPORT DAY 6 - MONITORING COMPLET")
print("="*60)
print(f"\n🔹 Base SQLite: {MONITORING_DB}")
print(f"🔹 Data Drift: {'⚠️ Détecté' if drift_detected else '✅ Aucun'}")
print(f"\n✅ Monitoring actif - Les métriques sont sauvegardées dans SQLite")
print("\n🌐 Interface MLflow: http://127.0.0.1:5000")