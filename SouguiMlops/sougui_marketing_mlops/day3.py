"""
Day 3 - MLOps pour Sougui.tn (Marketing)
Model Registry + Staging → Production
"""

import mlflow
import mlflow.sklearn
import pandas as pd
import numpy as np
import pickle
import warnings
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, mean_squared_error, silhouette_score
from mlflow.tracking import MlflowClient

warnings.filterwarnings("ignore")

mlflow.set_tracking_uri("http://127.0.0.1:5000")
client = MlflowClient()
print(f"✅ MLflow tracking URI: {mlflow.get_tracking_uri()}")

# ============================================
# 1. GÉNÉRATION DES DONNÉES
# ============================================
print("\n🔄 Génération des données marketing...")
np.random.seed(42)
n_products = 200

df = pd.DataFrame({
    "broad_category": np.random.choice(["VERRES", "CERAMIQUES", "COUFFINS & FOUTAS", "DECO", "LUMINAIRES"], n_products),
    "price_current": np.random.uniform(20, 400, n_products).round(2),
    "discount_depth": np.random.uniform(0, 30, n_products).round(2),
    "rating_value": np.random.choice([0, 3.5, 4.0, 4.5, 5.0], n_products),
    "reviews_count": np.random.exponential(10, n_products).astype(int),
    "name_len": np.random.randint(10, 100, n_products),
    "desc_len": np.random.randint(50, 500, n_products),
    "sales_qty": np.random.exponential(20, n_products).astype(int),
    "order_lines": np.random.poisson(3, n_products),
    "days_on_sale": np.random.randint(1, 365, n_products),
})

market_ref = df.groupby("broad_category")["price_current"].transform("median")
df["market_price_median"] = market_ref
df["price_gap_pct"] = (df["price_current"] - df["market_price_median"]) / df["market_price_median"]
df["is_overpriced"] = (df["price_gap_pct"] > 0.10).astype(int)
df["sales_velocity"] = df["sales_qty"] / (df["days_on_sale"] + 1)
df["broad_category_enc"] = df["broad_category"].astype("category").cat.codes

print(f"✅ Données: {len(df)} lignes")

# ============================================
# 2. CLASSIFICATION - Meilleur modèle (RandomForest)
# ============================================
print("\n" + "="*50)
print("📊 CLASSIFICATION - Model Registry")
print("="*50)

features_clf = ["price_current", "discount_depth", "rating_value", "reviews_count",
                "name_len", "desc_len", "sales_qty", "order_lines", "days_on_sale",
                "sales_velocity", "broad_category_enc"]

X_clf = df[features_clf].fillna(0)
y_clf = df["is_overpriced"]
X_train, X_test, y_train, y_test = train_test_split(X_clf, y_clf, test_size=0.2, random_state=42)

model_clf = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
model_clf.fit(X_train, y_train)
y_pred = model_clf.predict(X_test)
acc = accuracy_score(y_test, y_pred)

print(f"✅ RandomForest - Accuracy: {acc:.4f}")

with mlflow.start_run(run_name="Classification_RF_Best") as run:
    mlflow.log_params({
        "model_type": "RandomForestClassifier",
        "n_estimators": 100,
        "purpose": "production_candidate"
    })
    mlflow.log_metric("accuracy", acc)
    
    signature = mlflow.models.infer_signature(X_train, model_clf.predict(X_train))
    mlflow.sklearn.log_model(
        model_clf, 
        "model", 
        signature=signature,
        registered_model_name="SOUGUI_Classifier_Overpriced"
    )
    print(f"   ✅ Modèle enregistré: SOUGUI_Classifier_Overpriced (version 1)")

# ============================================
# 3. RÉGRESSION - Meilleur modèle (RandomForest)
# ============================================
print("\n" + "="*50)
print("📊 RÉGRESSION - Model Registry")
print("="*50)

features_reg = ["discount_depth", "rating_value", "reviews_count", "name_len", "desc_len",
                "sales_qty", "order_lines", "days_on_sale", "sales_velocity", "broad_category_enc"]

X_reg = df[features_reg].fillna(0)
y_reg = df["price_current"]
X_train_r, X_test_r, y_train_r, y_test_r = train_test_split(X_reg, y_reg, test_size=0.2, random_state=42)

model_reg = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
model_reg.fit(X_train_r, y_train_r)
y_pred_r = model_reg.predict(X_test_r)
rmse = np.sqrt(mean_squared_error(y_test_r, y_pred_r))

print(f"✅ RandomForest - RMSE: {rmse:.2f}")

with mlflow.start_run(run_name="Regression_RF_Best") as run:
    mlflow.log_params({
        "model_type": "RandomForestRegressor",
        "n_estimators": 100,
        "purpose": "production_candidate"
    })
    mlflow.log_metric("rmse", rmse)
    
    signature = mlflow.models.infer_signature(X_train_r, model_reg.predict(X_train_r))
    mlflow.sklearn.log_model(
        model_reg, 
        "model", 
        signature=signature,
        registered_model_name="SOUGUI_Regressor_Price"
    )
    print(f"   ✅ Modèle enregistré: SOUGUI_Regressor_Price (version 1)")

# ============================================
# 4. CLUSTERING - Segmentation produits
# ============================================
print("\n" + "="*50)
print("📊 CLUSTERING - Segmentation catalogue")
print("="*50)

cluster_features = ["price_current", "discount_depth", "sales_qty", "sales_velocity", "reviews_count"]
X_clust = df[cluster_features].fillna(0)

scaler = StandardScaler()
X_clust_scaled = scaler.fit_transform(X_clust)

model_clust = KMeans(n_clusters=3, random_state=42, n_init=10)
labels = model_clust.fit_predict(X_clust_scaled)
silhouette = silhouette_score(X_clust_scaled, labels)

print(f"✅ KMeans(k=3) - Silhouette: {silhouette:.4f}")

with open("clust_model.pkl", "wb") as f:
    pickle.dump({"model": model_clust, "scaler": scaler}, f)

with mlflow.start_run(run_name="Clustering_KMeans_Best"):
    mlflow.log_params({
        "model_type": "KMeans",
        "n_clusters": 3,
        "scaled": True
    })
    mlflow.log_metric("silhouette_score", silhouette)
    mlflow.log_artifact("clust_model.pkl")
    print(f"   ✅ Modèle sauvegardé (artefact)")

# ============================================
# 5. TRANSITION STAGING → PRODUCTION
# ============================================
print("\n" + "="*50)
print("📊 TRANSITION DES MODÈLES")
print("="*50)

# Pour le classifieur
try:
    latest_version = client.get_latest_versions("SOUGUI_Classifier_Overpriced", stages=["None"])[0].version
    client.transition_model_version_stage(
        name="SOUGUI_Classifier_Overpriced",
        version=latest_version,
        stage="Staging"
    )
    print(f"   ✅ SOUGUI_Classifier_Overpriced version {latest_version} → Staging")
except Exception as e:
    print(f"   ⚠️ Transition classifieur: {e}")

# Pour le régresseur
try:
    latest_version = client.get_latest_versions("SOUGUI_Regressor_Price", stages=["None"])[0].version
    client.transition_model_version_stage(
        name="SOUGUI_Regressor_Price",
        version=latest_version,
        stage="Staging"
    )
    print(f"   ✅ SOUGUI_Regressor_Price version {latest_version} → Staging")
except Exception as e:
    print(f"   ⚠️ Transition régresseur: {e}")

# ============================================
# 6. CHARGEMENT D'UN MODÈLE DEPUIS LE REGISTRY
# ============================================
print("\n" + "="*50)
print("📊 TEST - Chargement depuis Registry")
print("="*50)

# Charger le classifieur depuis Staging
model_uri = "models:/SOUGUI_Classifier_Overpriced/Staging"
try:
    loaded_model = mlflow.sklearn.load_model(model_uri)
    test_pred = loaded_model.predict(X_test[:5])
    print(f"   ✅ Classifieur chargé depuis Staging - Prédictions: {test_pred}")
except Exception as e:
    print(f"   ⚠️ Impossible de charger le classifieur: {e}")

# ============================================
# 7. RÉSUMÉ FINAL
# ============================================
print("\n" + "="*60)
print("📈 RÉSUMÉ DAY 3 - MODEL REGISTRY (Marketing)")
print("="*60)
print(f"🔹 Modèles enregistrés:")
print(f"   - SOUGUI_Classifier_Overpriced (accuracy={acc:.4f})")
print(f"   - SOUGUI_Regressor_Price (rmse={rmse:.2f})")
print(f"   - Clustering KMeans (k=3, silhouette={silhouette:.4f})")
print(f"\n🔹 Statut des modèles:")
print(f"   - Classifieur: Staging")
print(f"   - Régresseur: Staging")
print("\n🌐 Interface MLflow: http://127.0.0.1:5000")
print("   → Onglet 'Models' pour voir les modèles enregistrés")