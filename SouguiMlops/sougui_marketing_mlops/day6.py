"""
Day 6 - MLOps pour Sougui.tn (Marketing)
Déploiement et Monitoring avec SQLite + Détection de dérive

Objectifs:
- Déployer les modèles optimisés via MLflow Models (API REST)
- Monitorer les performances en production
- Sauvegarder les métriques dans SQLite
- Détecter la dérive des données (data drift)
- Alerter le décideur marketing sur les dégradations
"""

import mlflow
import mlflow.sklearn
import pandas as pd
import numpy as np
import sqlite3
import json
import time
import requests
import pickle
import warnings
from datetime import datetime
from sklearn.metrics import accuracy_score, mean_squared_error, r2_score, silhouette_score, precision_score, recall_score, f1_score
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from scipy import stats
from mlflow.tracking import MlflowClient

warnings.filterwarnings("ignore")

# ============================================
# CONFIGURATION
# ============================================
mlflow.set_tracking_uri("http://127.0.0.1:5000")
client = MlflowClient()

# Base SQLite pour le monitoring
MONITORING_DB = "monitoring_marketing.db"

# Configuration du serveur MLflow Models
MLFLOW_MODELS_URI = "http://127.0.0.1:5001"

# Seuils de performance en production
PRODUCTION_THRESHOLDS = {
    "classifier": {"accuracy": 0.95, "precision": 0.90, "recall": 0.90, "f1": 0.90, "latency_ms": 100},
    "regressor": {"rmse": 50.0, "r2": 0.70, "latency_ms": 100},
    "clustering": {"silhouette": 0.40}
}

# Seuils de dérive (p-value < 0.05 = dérive détectée)
DRIFT_THRESHOLD = 0.05

print(f"✅ MLflow tracking URI: {mlflow.get_tracking_uri()}")
print(f"📊 Seuils production: {PRODUCTION_THRESHOLDS}")
print(f"📊 Seuil dérive (p-value): {DRIFT_THRESHOLD}")

# ============================================
# 1. INITIALISATION DE LA BASE SQLITE
# ============================================
def init_monitoring_db():
    """Crée la table de monitoring si elle n'existe pas"""
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
    # Table pour l'historique des dérives
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS drift_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            feature_name TEXT,
            p_value REAL,
            drift_detected INTEGER,
            details TEXT
        )
    """)
    conn.commit()
    conn.close()
    print("✅ Base SQLite initialisée")

init_monitoring_db()

def save_metric_to_db(model_type, metric_name, metric_value, threshold, status, latency_ms=None, details=None):
    """Sauvegarde une métrique dans SQLite"""
    conn = sqlite3.connect(MONITORING_DB)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO monitoring (timestamp, model_type, metric_name, metric_value, threshold, status, latency_ms, details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (datetime.now().isoformat(), model_type, metric_name, metric_value, threshold, status, latency_ms, details))
    conn.commit()
    conn.close()

def save_drift_to_db(feature_name, p_value, drift_detected, details=None):
    """Sauvegarde une détection de dérive dans SQLite"""
    conn = sqlite3.connect(MONITORING_DB)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO drift_log (timestamp, feature_name, p_value, drift_detected, details)
        VALUES (?, ?, ?, ?, ?)
    """, (datetime.now().isoformat(), feature_name, p_value, 1 if drift_detected else 0, details))
    conn.commit()
    conn.close()

# ============================================
# 2. RÉCUPÉRATION DES MODÈLES PRODUCTION
# ============================================
print("\n" + "="*60)
print("📊 RÉCUPÉRATION DES MODÈLES PRODUCTION")
print("="*60)

def get_production_model(model_name):
    """Récupère la dernière version en Production d'un modèle"""
    try:
        latest_version = client.get_latest_versions(model_name, stages=["Production"])[0]
        model_uri = f"models:/{model_name}/Production"
        model = mlflow.sklearn.load_model(model_uri)
        print(f"   ✅ {model_name} - version {latest_version.version} chargé")
        return model, latest_version.version
    except Exception as e:
        print(f"   ⚠️ {model_name} non trouvé en Production: {e}")
        return None, None

# Récupération des modèles
model_clf, version_clf = get_production_model("SOUGUI_Classifier_Overpriced")
model_reg, version_reg = get_production_model("SOUGUI_Regressor_Price")

# Pour le clustering (pas de registry standard)
try:
    with open("clust_model_optuna.pkl", "rb") as f:
        clust_data = pickle.load(f)
    model_clust = clust_data["model"]
    scaler = clust_data["scaler"]
    print(f"   ✅ Clustering modèle chargé")
except Exception as e:
    print(f"   ⚠️ Clustering non trouvé: {e}")
    model_clust = None

# ============================================
# 3. TEST DES MODÈLES VIA API (si serveur actif)
# ============================================
print("\n" + "="*60)
print("📊 TEST DES MODÈLES VIA API REST")
print("="*60)

def test_api_model(model_name, endpoint, input_data):
    """Teste un modèle déployé via l'API MLflow Models"""
    try:
        response = requests.post(
            f"{MLFLOW_MODELS_URI}/{endpoint}",
            headers={"Content-Type": "application/json"},
            json={"dataframe_split": input_data.to_dict(orient="split")}
        )
        if response.status_code == 200:
            return response.json()
        else:
            print(f"   ⚠️ API {model_name} erreur: {response.status_code}")
            return None
    except requests.exceptions.ConnectionError:
        print(f"   ⚠️ Serveur MLflow Models non démarré sur port 5001")
        return None

# Génération d'un petit échantillon pour le test
sample_data = pd.DataFrame({
    "price_current": [50, 100, 150],
    "discount_depth": [10, 5, 0],
    "rating_value": [4.5, 4.0, 3.5],
    "reviews_count": [10, 5, 2],
    "name_len": [30, 40, 25],
    "desc_len": [200, 150, 100],
    "sales_qty": [10, 5, 2],
    "order_lines": [3, 2, 1],
    "days_on_sale": [30, 60, 90],
    "sales_velocity": [0.33, 0.08, 0.02],
    "revenue_per_orderline": [500, 300, 150],
    "review_signal": [4.5*2.3, 4.0*1.8, 3.5*1.1],
    "broad_category_enc": [0, 1, 2],
})

print("🔍 Test des API...")
if model_clf is not None:
    api_result = test_api_model("SOUGUI_Classifier_Overpriced", "invocations", sample_data)
    if api_result:
        print(f"   ✅ API Classification OK - Prédictions: {api_result}")
    else:
        print("   ⚠️ Démarrez le serveur MLflow Models pour tester l'API")

# ============================================
# 4. SIMULATION DE DONNÉES PRODUCTION (évolution du marché)
# ============================================
print("\n" + "="*60)
print("📊 SIMULATION DE DONNÉES PRODUCTION")
print("="*60)

np.random.seed(999)  # seed différent pour simuler des données réelles
n_test = 100

df_test = pd.DataFrame({
    "broad_category": np.random.choice(["VERRES", "CERAMIQUES", "COUFFINS & FOUTAS", "DECO", "LUMINAIRES"], n_test),
    "price_current": np.random.uniform(20, 400, n_test).round(2),
    "discount_depth": np.random.uniform(0, 30, n_test).round(2),
    "rating_value": np.random.choice([0, 3.5, 4.0, 4.5, 5.0], n_test),
    "reviews_count": np.random.exponential(10, n_test).astype(int),
    "name_len": np.random.randint(10, 100, n_test),
    "desc_len": np.random.randint(50, 500, n_test),
    "sales_qty": np.random.exponential(20, n_test).astype(int),
    "sales_revenue": np.random.exponential(1000, n_test).round(2),
    "order_lines": np.random.poisson(3, n_test),
    "days_on_sale": np.random.randint(1, 365, n_test),
})

# Calcul des features
market_ref = df_test.groupby("broad_category")["price_current"].transform("median")
df_test["market_price_median"] = market_ref
df_test["price_gap_pct"] = (df_test["price_current"] - df_test["market_price_median"]) / df_test["market_price_median"]
df_test["is_overpriced"] = (df_test["price_gap_pct"] > 0.10).astype(int)
df_test["sales_velocity"] = df_test["sales_qty"] / (df_test["days_on_sale"] + 1)
df_test["revenue_per_orderline"] = df_test["sales_revenue"] / (df_test["order_lines"] + 1)
df_test["review_signal"] = df_test["rating_value"] * np.log1p(df_test["reviews_count"])
df_test["broad_category_enc"] = df_test["broad_category"].astype("category").cat.codes

print(f"✅ Données test: {len(df_test)} lignes")
print(f"   Distribution is_overpriced: {df_test['is_overpriced'].value_counts().to_dict()}")

# ============================================
# 5. INFERENCE ET MONITORING
# ============================================
print("\n" + "="*60)
print("📊 INFERENCE ET MONITORING")
print("="*60)

# Classification
if model_clf:
    features_clf = ["price_current", "discount_depth", "rating_value", "reviews_count",
                    "name_len", "desc_len", "sales_qty", "order_lines", "days_on_sale",
                    "sales_velocity", "revenue_per_orderline", "review_signal", "broad_category_enc"]
    X_test_clf = df_test[features_clf].fillna(0)
    y_true_clf = df_test["is_overpriced"]
    
    start_time = time.time()
    y_pred_clf = model_clf.predict(X_test_clf)
    latency_clf = (time.time() - start_time) * 1000
    
    accuracy = accuracy_score(y_true_clf, y_pred_clf)
    precision = precision_score(y_true_clf, y_pred_clf, zero_division=0)
    recall = recall_score(y_true_clf, y_pred_clf, zero_division=0)
    f1 = f1_score(y_true_clf, y_pred_clf, zero_division=0)
    
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
    
    print(f"\n📈 Classification (Détection produits surévalués):")
    print(f"   Accuracy: {accuracy:.4f} (seuil: {PRODUCTION_THRESHOLDS['classifier']['accuracy']})")
    print(f"   Precision: {precision:.4f}")
    print(f"   Recall: {recall:.4f}")
    print(f"   F1: {f1:.4f}")
    print(f"   Latence: {latency_clf:.2f} ms")
    print(f"   Statut: {'✅ OK' if status == 'OK' else '❌ ALERTE'}")

# Régression
if model_reg:
    features_reg = ["discount_depth", "rating_value", "reviews_count", "name_len", "desc_len",
                    "sales_qty", "order_lines", "days_on_sale", "sales_velocity",
                    "revenue_per_orderline", "review_signal", "broad_category_enc"]
    X_test_reg = df_test[features_reg].fillna(0)
    y_true_reg = df_test["price_current"]
    
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
    
    save_metric_to_db(
        model_type="regressor",
        metric_name="r2",
        metric_value=r2,
        threshold=PRODUCTION_THRESHOLDS["regressor"]["r2"],
        status=status,
        latency_ms=latency_reg,
        details=f"version_{version_reg}, rmse={rmse:.2f}"
    )
    
    print(f"\n📈 Régression (Prédiction prix de référence):")
    print(f"   RMSE: {rmse:.2f} TND (seuil: {PRODUCTION_THRESHOLDS['regressor']['rmse']})")
    print(f"   R²: {r2:.4f} (seuil: {PRODUCTION_THRESHOLDS['regressor']['r2']})")
    print(f"   Latence: {latency_reg:.2f} ms")
    print(f"   Statut: {'✅ OK' if status == 'OK' else '❌ ALERTE'}")

# Clustering
if model_clust:
    cluster_features = ["price_current", "discount_depth", "sales_qty", "sales_velocity", 
                        "revenue_per_orderline", "review_signal", "rating_value", "reviews_count"]
    X_clust_test = df_test[cluster_features].fillna(0)
    X_clust_test_scaled = scaler.transform(X_clust_test)
    labels_test = model_clust.predict(X_clust_test_scaled)
    
    silhouette = silhouette_score(X_clust_test_scaled, labels_test) if len(set(labels_test)) > 1 else 0
    
    status = "OK" if silhouette >= PRODUCTION_THRESHOLDS["clustering"]["silhouette"] else "ALERTE"
    
    save_metric_to_db(
        model_type="clustering",
        metric_name="silhouette",
        metric_value=silhouette,
        threshold=PRODUCTION_THRESHOLDS["clustering"]["silhouette"],
        status=status,
        details=f"n_clusters={len(set(labels_test))}"
    )
    
    print(f"\n📈 Clustering (Segmentation catalogue):")
    print(f"   Silhouette: {silhouette:.4f} (seuil: {PRODUCTION_THRESHOLDS['clustering']['silhouette']})")
    print(f"   Nb clusters: {len(set(labels_test))}")
    print(f"   Statut: {'✅ OK' if status == 'OK' else '❌ ALERTE'}")

# ============================================
# 6. DÉTECTION DE DÉRIVE (Data Drift)
# ============================================
print("\n" + "="*60)
print("📊 DÉTECTION DE DÉRIVE (Data Drift)")
print("="*60)

# Données de référence (entraînement)
np.random.seed(42)
n_ref = 500
df_ref = pd.DataFrame({
    "price_current": np.random.uniform(20, 400, n_ref),
    "discount_depth": np.random.uniform(0, 30, n_ref),
    "sales_velocity": np.random.uniform(0, 10, n_ref),
    "review_signal": np.random.uniform(0, 20, n_ref),
})

drift_detected = False
drift_summary = []

for col in df_ref.columns:
    ks_stat, p_value = stats.ks_2samp(df_ref[col], df_test[col])
    drift = p_value < DRIFT_THRESHOLD
    
    drift_summary.append({
        "feature": col,
        "p_value": p_value,
        "drift": drift
    })
    
    if drift:
        print(f"   ⚠️ Dérive détectée sur {col}: p-value={p_value:.6f}")
        drift_detected = True
        save_drift_to_db(col, p_value, True, f"Distribution changée, KS_stat={ks_stat:.4f}")
    else:
        print(f"   ✅ {col}: distribution stable (p-value={p_value:.4f})")
        save_drift_to_db(col, p_value, False, "Distribution stable")

if drift_detected:
    save_metric_to_db(
        model_type="system",
        metric_name="data_drift_detected",
        metric_value=1.0,
        threshold=0,
        status="ALERTE",
        details=f"features_drifted={[d['feature'] for d in drift_summary if d['drift']]}"
    )
    print("\n⚠️ ALERTE: Dérive des données détectée! Réentraînement recommandé.")
else:
    print("\n✅ Aucune dérive détectée - Modèles toujours valides")

# ============================================
# 7. CONSULTATION DE L'HISTORIQUE SQLite
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
# 8. RAPPORT POUR LE DÉCIDEUR MARKETING
# ============================================
print("\n" + "="*60)
print("📊 RAPPORT POUR LE DÉCIDEUR MARKETING")
print("="*60)

print("\n🎯 Classification - Produits surévalués:")
if 'accuracy' in locals():
    if accuracy >= PRODUCTION_THRESHOLDS["classifier"]["accuracy"]:
        print(f"   ✅ Le modèle détecte correctement les produits surévalués (accuracy={accuracy:.4f})")
        print(f"   → Action recommandée: Prioriser ces produits dans les campagnes prix")
    else:
        print(f"   ⚠️ Performance du modèle à surveiller (accuracy={accuracy:.4f})")

print("\n💰 Régression - Prix de référence:")
if 'rmse' in locals():
    if rmse <= PRODUCTION_THRESHOLDS["regressor"]["rmse"]:
        print(f"   ✅ Précision prix: erreur moyenne de {rmse:.0f} TND")
        print(f"   → Action recommandée: Utiliser les prédictions comme benchmark prix")
    else:
        print(f"   ⚠️ Précision prix à améliorer (RMSE={rmse:.2f})")

print("\n📦 Clustering - Segmentation:")
if 'silhouette' in locals():
    if silhouette >= PRODUCTION_THRESHOLDS["clustering"]["silhouette"]:
        print(f"   ✅ Segmentation pertinente (silhouette={silhouette:.3f})")
        print(f"   → Action recommandée: Adapter la stratégie marketing par segment")
    else:
        print(f"   ⚠️ Segmentation à réviser (silhouette={silhouette:.3f})")

print("\n🔄 Détection de dérive:")
if drift_detected:
    print(f"   ⚠️ Dérive détectée - Réentraînement conseillé")
else:
    print(f"   ✅ Aucune dérive - Modèles stables")

# ============================================
# 9. RAPPORT FINAL
# ============================================
print("\n" + "="*60)
print("📈 RAPPORT DAY 6 - MONITORING COMPLET (Marketing)")
print("="*60)
print(f"\n🔹 Base SQLite: {MONITORING_DB}")
print(f"🔹 Modèles en Production: {'✅ OK' if model_clf and model_reg else '⚠️ Certains absents'}")
print(f"🔹 Data Drift: {'⚠️ Détecté' if drift_detected else '✅ Aucun'}")
print(f"\n✅ Monitoring actif - Les métriques sont sauvegardées dans SQLite")
print("\n🌐 Interface MLflow: http://127.0.0.1:5000")
print("🔧 Pour tester l'API, démarrez le serveur:")
print("   mlflow models serve --model-uri models:/SOUGUI_Classifier_Overpriced/Production --host 127.0.0.1 --port 5001")
print("\n📊 Pour consulter l'historique SQLite:")
print("   sqlite3 monitoring_marketing.db 'SELECT * FROM monitoring ORDER BY id DESC LIMIT 20;'")