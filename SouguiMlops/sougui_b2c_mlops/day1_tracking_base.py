"""
Day 1 - MLOps pour Sougui.tn (Ventes B2C)
Tracking de base MLflow avec fallback données synthétiques si MySQL indisponible
"""

import mlflow
import mlflow.sklearn
import pandas as pd
import numpy as np
import hashlib
import pickle
import warnings
from sqlalchemy import create_engine, text
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.cluster import KMeans
from sklearn.metrics import accuracy_score, mean_squared_error, silhouette_score
from statsmodels.tsa.arima.model import ARIMA

warnings.filterwarnings("ignore")

mlflow.set_tracking_uri("http://127.0.0.1:5000")
print(f"✅ MLflow tracking URI: {mlflow.get_tracking_uri()}")

# ============================================
# 1. TENTATIVE DE CONNEXION MySQL
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
        result = conn.execute(text("SELECT 1"))
        use_mysql = True
    print("✅ Connecté à MySQL - chargement des données réelles")
except Exception as e:
    print(f"⚠️ MySQL indisponible ({e})")
    print("🔄 Génération de données synthétiques réalistes pour continuer...")
    use_mysql = False

# ============================================
# 2. CHARGEMENT DES DONNÉES (réelles ou synthétiques)
# ============================================
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
    LIMIT 5000
    """
    df = pd.read_sql(query, engine)
    print(f"✅ Données réelles: {len(df)} lignes")
else:
    # Données synthétiques B2C
    np.random.seed(42)
    n = 500
    
    segments = ["Premium", "Standard", "Occasionnel", "Nouveau"]
    methodes = ["CB", "PayPal", "VIREMENT", "ESPECES"]
    
    df = pd.DataFrame({
        "ID_Client": np.random.randint(1, 100, n),
        "Segment_Client": np.random.choice(segments, n),
        "Montant_Total": np.random.exponential(150, n).round(2) + 10,
        "Nb_Produits": np.random.poisson(3, n) + 1,
        "Annee": np.random.choice([2022, 2023, 2024, 2025], n),
        "Mois": np.random.randint(1, 13, n),
        "Est_weekend": np.random.choice([0, 1], n),
        "Methode_Paiement": np.random.choice(methodes, n),
    })
    
    print(f"✅ Données synthétiques générées: {len(df)} lignes")

# ============================================
# 3. FEATURE ENGINEERING
# ============================================
df["Segment_Enc"] = df["Segment_Client"].astype("category").cat.codes
df["Methode_Enc"] = df["Methode_Paiement"].astype("category").cat.codes
df["Log_Montant"] = np.log1p(df["Montant_Total"])
df["Panier_Moyen"] = df["Montant_Total"] / df["Nb_Produits"]
df["Achat_Important"] = (df["Montant_Total"] > 200).astype(int)

print("✅ Feature engineering terminé")

# ============================================
# 4. CLASSIFICATION
# ============================================
features_clf = ["Montant_Total", "Nb_Produits", "Log_Montant", "Panier_Moyen", 
                "Mois", "Annee", "Est_weekend", "Segment_Enc", "Methode_Enc"]
X_clf = df[features_clf].fillna(0)
y_clf = df["Achat_Important"]

model_clf = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
model_clf.fit(X_clf, y_clf)
y_pred_clf = model_clf.predict(X_clf)
acc_clf = accuracy_score(y_clf, y_pred_clf)

print(f"✅ Classification - Accuracy: {acc_clf:.4f}")

# ============================================
# 5. RÉGRESSION
# ============================================
features_reg = ["Nb_Produits", "Mois", "Annee", "Est_weekend", "Segment_Enc", "Methode_Enc"]
X_reg = df[features_reg].fillna(0)
y_reg = df["Montant_Total"]

model_reg = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
model_reg.fit(X_reg, y_reg)
y_pred_reg = model_reg.predict(X_reg)
rmse_reg = np.sqrt(mean_squared_error(y_reg, y_pred_reg))

print(f"✅ Régression - RMSE: {rmse_reg:.2f}")

# ============================================
# 6. CLUSTERING (segmentation clients)
# ============================================
df_client = df.groupby("ID_Client").agg({
    "Montant_Total": ["sum", "mean", "count"],
    "Nb_Produits": "mean"
}).round(2)
df_client.columns = ["Montant_Total", "Montant_Moyen", "Nb_Achats", "Nb_Produits_Moyen"]
df_client = df_client.fillna(0)

X_clust = df_client[["Montant_Total", "Nb_Achats", "Nb_Produits_Moyen"]].values

model_clust = KMeans(n_clusters=3, random_state=42, n_init=10)
labels_clust = model_clust.fit_predict(X_clust)
silhouette = silhouette_score(X_clust, labels_clust)

print(f"✅ Clustering - Silhouette: {silhouette:.4f}")

# ============================================
# 7. FORECAST (série mensuelle)
# ============================================
df_ts = df.groupby(["Annee", "Mois"])["Montant_Total"].sum().reset_index()
df_ts["Date"] = pd.to_datetime(df_ts["Annee"].astype(str) + "-" + df_ts["Mois"].astype(str) + "-01")
df_ts = df_ts.sort_values("Date").set_index("Date")

series = df_ts["Montant_Total"]

if len(series) >= 4:
    model_arima = ARIMA(series, order=(1, 1, 1))
    model_fit = model_arima.fit()
    forecast = model_fit.forecast(steps=3)
    print(f"✅ Forecast - Modèle ARIMA entraîné sur {len(series)} mois")
else:
    model_fit = None
    forecast = None
    print(f"⚠️ Forecast - Pas assez de données ({len(series)} mois)")

# ============================================
# 8. HASH DATASET
# ============================================
data_hash = hashlib.sha256(pd.util.hash_pandas_object(df, index=True).values).hexdigest()

# ============================================
# 9. MLFLOW TRACKING
# ============================================
mlflow.set_experiment("SOUGUI_Sales_B2C_Day1")

# Classification
with mlflow.start_run(run_name="Classification_RF"):
    mlflow.log_param("model_type", "RandomForestClassifier")
    mlflow.log_param("n_estimators", 100)
    mlflow.log_param("dataset_hash", data_hash)
    mlflow.log_param("data_source", "MySQL" if use_mysql else "synthetic")
    mlflow.log_metric("accuracy", acc_clf)
    
    signature = mlflow.models.infer_signature(X_clf, y_pred_clf)
    mlflow.sklearn.log_model(model_clf, "model", signature=signature, input_example=X_clf.iloc[:2])
    
    with open("preds_clf.pkl", "wb") as f:
        pickle.dump(y_pred_clf, f)
    mlflow.log_artifact("preds_clf.pkl")
    print("  📊 Classification logged")

# Régression
with mlflow.start_run(run_name="Regression_RF"):
    mlflow.log_param("model_type", "RandomForestRegressor")
    mlflow.log_param("n_estimators", 100)
    mlflow.log_param("dataset_hash", data_hash)
    mlflow.log_param("data_source", "MySQL" if use_mysql else "synthetic")
    mlflow.log_metric("rmse", rmse_reg)
    
    signature = mlflow.models.infer_signature(X_reg, y_pred_reg)
    mlflow.sklearn.log_model(model_reg, "model", signature=signature, input_example=X_reg.iloc[:2])
    
    with open("preds_reg.pkl", "wb") as f:
        pickle.dump(y_pred_reg, f)
    mlflow.log_artifact("preds_reg.pkl")
    print("  📊 Regression logged")

# Clustering
with mlflow.start_run(run_name="Clustering_KMeans"):
    mlflow.log_param("model_type", "KMeans")
    mlflow.log_param("n_clusters", 3)
    mlflow.log_param("dataset_hash", data_hash)
    mlflow.log_param("data_source", "MySQL" if use_mysql else "synthetic")
    mlflow.log_metric("silhouette_score", silhouette)
    
    with open("clust_labels.pkl", "wb") as f:
        pickle.dump(labels_clust, f)
    mlflow.log_artifact("clust_labels.pkl")
    print("  📊 Clustering logged")

# Forecast
if model_fit:
    with mlflow.start_run(run_name="Forecast_ARIMA"):
        mlflow.log_param("model_type", "ARIMA")
        mlflow.log_param("order", "(1,1,1)")
        mlflow.log_param("dataset_hash", data_hash)
        mlflow.log_param("data_source", "MySQL" if use_mysql else "synthetic")
        
        with open("forecast.pkl", "wb") as f:
            pickle.dump(forecast, f)
        mlflow.log_artifact("forecast.pkl")
        print("  📊 Forecast logged")

# ============================================
# 10. RÉSUMÉ FINAL
# ============================================
print("\n" + "="*50)
print("📈 RÉSUMÉ DAY 1 - SOUGUI.TN VENTES B2C")
print("="*50)
print(f"🔹 Source données: {'MySQL (réel)' if use_mysql else 'Synthétique (fallback)'}")
print(f"🔹 Classification - Accuracy: {acc_clf:.4f}")
print(f"🔹 Régression     - RMSE: {rmse_reg:.2f}")
print(f"🔹 Clustering     - Silhouette: {silhouette:.4f}")
if model_fit:
    print(f"🔹 Forecast       - Modèle: ARIMA(1,1,1) sur {len(series)} mois")
else:
    print(f"🔹 Forecast       - Non entraîné (données insuffisantes)")
print("\n✅ 4 runs enregistrés dans MLflow")
print("🌐 Interface MLflow: http://127.0.0.1:5000")