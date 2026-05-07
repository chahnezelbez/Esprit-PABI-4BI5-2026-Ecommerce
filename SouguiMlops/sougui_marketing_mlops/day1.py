"""
Day 1 - MLOps pour Sougui.tn (Marketing)
Tracking de base MLflow avec données synthétiques (fallback si MySQL indisponible)

Objectifs :
- Classification → Détecter produits surévalués (is_overpriced)
- Régression → Prédire le prix Sougui
- Clustering → Segmenter le catalogue produits
- Forecast → Prévoir revenu mensuel
"""

import mlflow
import mlflow.sklearn
import pandas as pd
import numpy as np
import hashlib
import pickle
import warnings
warnings.filterwarnings("ignore")

from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.cluster import KMeans
from sklearn.metrics import accuracy_score, mean_squared_error, silhouette_score
from statsmodels.tsa.arima.model import ARIMA
import mlflow

mlflow.set_tracking_uri("http://127.0.0.1:5000")
print(f"✅ MLflow tracking URI: {mlflow.get_tracking_uri()}")

# ============================================
# 1. GÉNÉRATION DES DONNÉES SYNTHÉTIQUES MARKETING
# ============================================
print("\n🔄 Génération des données marketing...")
np.random.seed(42)
n_products = 200

df = pd.DataFrame({
    "sku": [f"SKU_{i}" for i in range(n_products)],
    "product_name": [f"Produit_{i}" for i in range(n_products)],
    "broad_category": np.random.choice(["VERRES", "CERAMIQUES", "COUFFINS & FOUTAS", "DECO", "LUMINAIRES"], n_products),
    "price_current": np.random.uniform(20, 400, n_products).round(2),
    "discount_depth": np.random.uniform(0, 30, n_products).round(2),
    "rating_value": np.random.choice([0, 3.5, 4.0, 4.5, 5.0], n_products),
    "reviews_count": np.random.exponential(10, n_products).astype(int),
    "name_len": np.random.randint(10, 100, n_products),
    "desc_len": np.random.randint(50, 500, n_products),
    "sales_qty": np.random.exponential(20, n_products).astype(int),
    "sales_revenue": np.random.exponential(1000, n_products).round(2),
    "order_lines": np.random.poisson(3, n_products),
    "days_on_sale": np.random.randint(1, 365, n_products),
})

# Calcul du prix de référence marché (par catégorie)
market_ref = df.groupby("broad_category")["price_current"].transform("median")
df["market_price_median"] = market_ref
df["price_gap_tnd"] = df["price_current"] - df["market_price_median"]
df["price_gap_pct"] = df["price_gap_tnd"] / df["market_price_median"]

# Cible classification : produit surévalué (>10% au-dessus du marché)
df["is_overpriced"] = (df["price_gap_pct"] > 0.10).astype(int)
df["sales_velocity"] = df["sales_qty"] / (df["days_on_sale"] + 1)

print(f"✅ Données marketing générées: {len(df)} lignes")
print(f"   Classes is_overpriced: {df['is_overpriced'].value_counts().to_dict()}")

# Hash du dataset
data_hash = hashlib.sha256(pd.util.hash_pandas_object(df, index=True).values).hexdigest()

# ============================================
# 2. FEATURE ENGINEERING
# ============================================
df["broad_category_enc"] = df["broad_category"].astype("category").cat.codes

mlflow.set_experiment("SOUGUI_Marketing_Day1")

# ============================================
# 3. CLASSIFICATION - Produits surévalués
# ============================================
print("\n" + "="*50)
print("📊 CLASSIFICATION - Produits surévalués")
print("="*50)

features_clf = ["price_current", "discount_depth", "rating_value", "reviews_count",
                "name_len", "desc_len", "sales_qty", "order_lines", "days_on_sale",
                "sales_velocity", "broad_category_enc"]

X_clf = df[features_clf].fillna(0)
y_clf = df["is_overpriced"]

model_clf = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
model_clf.fit(X_clf, y_clf)
y_pred_clf = model_clf.predict(X_clf)
acc_clf = accuracy_score(y_clf, y_pred_clf)

print(f"✅ Classification - Accuracy: {acc_clf:.4f}")

with mlflow.start_run(run_name="Classification_RF_Overpriced"):
    mlflow.log_params({
        "model_type": "RandomForestClassifier",
        "n_estimators": 100,
        "random_state": 42,
        "dataset_hash": data_hash,
        "n_samples": len(df),
        "n_features": len(features_clf)
    })
    mlflow.log_metric("accuracy", acc_clf)
    
    signature = mlflow.models.infer_signature(X_clf, y_pred_clf)
    mlflow.sklearn.log_model(model_clf, "model", signature=signature, input_example=X_clf.iloc[:2])
    
    with open("preds_clf.pkl", "wb") as f:
        pickle.dump(y_pred_clf, f)
    mlflow.log_artifact("preds_clf.pkl")
    print("  📊 Classification logged")

# ============================================
# 4. RÉGRESSION - Prix Sougui
# ============================================
print("\n" + "="*50)
print("📊 RÉGRESSION - Prédiction prix Sougui")
print("="*50)

features_reg = ["discount_depth", "rating_value", "reviews_count", "name_len", "desc_len",
                "sales_qty", "sales_revenue", "order_lines", "days_on_sale",
                "sales_velocity", "broad_category_enc"]

X_reg = df[features_reg].fillna(0)
y_reg = df["price_current"]

model_reg = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
model_reg.fit(X_reg, y_reg)
y_pred_reg = model_reg.predict(X_reg)
rmse_reg = np.sqrt(mean_squared_error(y_reg, y_pred_reg))

print(f"✅ Régression - RMSE: {rmse_reg:.2f}")

with mlflow.start_run(run_name="Regression_RF_Price"):
    mlflow.log_params({
        "model_type": "RandomForestRegressor",
        "n_estimators": 100,
        "random_state": 42,
        "dataset_hash": data_hash,
        "n_samples": len(df),
        "n_features": len(features_reg)
    })
    mlflow.log_metric("rmse", rmse_reg)
    
    signature = mlflow.models.infer_signature(X_reg, y_pred_reg)
    mlflow.sklearn.log_model(model_reg, "model", signature=signature, input_example=X_reg.iloc[:2])
    
    with open("preds_reg.pkl", "wb") as f:
        pickle.dump(y_pred_reg, f)
    mlflow.log_artifact("preds_reg.pkl")
    print("  📊 Regression logged")

# ============================================
# 5. CLUSTERING - Segmentation produits
# ============================================
print("\n" + "="*50)
print("📊 CLUSTERING - Segmentation produits")
print("="*50)

cluster_features = ["price_current", "discount_depth", "sales_qty", "sales_velocity", "reviews_count"]
X_clust = df[cluster_features].fillna(0)

from sklearn.preprocessing import StandardScaler
scaler = StandardScaler()
X_clust_scaled = scaler.fit_transform(X_clust)

model_clust = KMeans(n_clusters=3, random_state=42, n_init=10)
labels = model_clust.fit_predict(X_clust_scaled)
silhouette = silhouette_score(X_clust_scaled, labels)

print(f"✅ Clustering - Silhouette: {silhouette:.4f}")

with mlflow.start_run(run_name="Clustering_KMeans_Products"):
    mlflow.log_params({
        "model_type": "KMeans",
        "n_clusters": 3,
        "random_state": 42,
        "dataset_hash": data_hash,
        "scaled": True
    })
    mlflow.log_metric("silhouette_score", silhouette)
    
    with open("clust_model.pkl", "wb") as f:
        pickle.dump({"model": model_clust, "scaler": scaler}, f)
    mlflow.log_artifact("clust_model.pkl")
    print("  📊 Clustering logged")

# ============================================
# 6. FORECAST - Revenu mensuel
# ============================================
print("\n" + "="*50)
print("📊 FORECAST - Revenu mensuel")
print("="*50)

# Création d'une série temporelle mensuelle
np.random.seed(42)
dates = pd.date_range("2023-01-01", periods=24, freq="ME")
monthly_revenue = np.random.exponential(5000, 24) + 1000
ts_series = pd.Series(monthly_revenue, index=dates)

if len(ts_series) >= 12:
    train = ts_series[:-3]
    test = ts_series[-3:]
    
    model_arima = ARIMA(train, order=(1, 1, 1))
    model_fit = model_arima.fit()
    forecast = model_fit.forecast(steps=len(test))
    
    rmse_ts = np.sqrt(mean_squared_error(test, forecast)) if len(test) > 0 else np.nan
    print(f"✅ Forecast - RMSE: {rmse_ts:.2f}")
    
    with mlflow.start_run(run_name="Forecast_ARIMA_Revenue"):
        mlflow.log_params({
            "model_type": "ARIMA",
            "order": "(1,1,1)",
            "dataset_hash": data_hash,
            "train_months": len(train),
            "test_months": len(test)
        })
        mlflow.log_metric("rmse", rmse_ts)
        
        with open("forecast.pkl", "wb") as f:
            pickle.dump(forecast, f)
        mlflow.log_artifact("forecast.pkl")
        print("  📊 Forecast logged")
else:
    print(f"⚠️ Forecast ignoré: {len(ts_series)} mois (minimum 12 requis)")

# ============================================
# 7. RÉSUMÉ FINAL
# ============================================
print("\n" + "="*60)
print("📈 RÉSUMÉ DAY 1 - SOUGUI.TN MARKETING")
print("="*60)
print(f"🔹 Source données: Synthétique (fallback)")
print(f"🔹 Classification - Accuracy: {acc_clf:.4f}")
print(f"🔹 Régression     - RMSE: {rmse_reg:.2f}")
print(f"🔹 Clustering     - Silhouette: {silhouette:.4f}")
print(f"🔹 Forecast       - RMSE: {rmse_ts:.2f}" if len(ts_series) >= 12 else "🔹 Forecast       - Non entraîné")
print("\n✅ 4 runs enregistrés dans MLflow")
print("🌐 Interface MLflow: http://127.0.0.1:5000")