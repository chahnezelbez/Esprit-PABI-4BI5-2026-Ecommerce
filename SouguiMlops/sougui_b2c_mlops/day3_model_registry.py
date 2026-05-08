"""
Day 3 - MLOps pour Sougui.tn (Ventes B2C)
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
# GÉNÉRATION DES DONNÉES
# ============================================
print("\n🔄 Génération des données...")
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

df["Segment_Enc"] = df["Segment_Client"].astype("category").cat.codes
df["Methode_Enc"] = df["Methode_Paiement"].astype("category").cat.codes
df["Log_Montant"] = np.log1p(df["Montant_Total"])
df["Panier_Moyen"] = df["Montant_Total"] / df["Nb_Produits"]
df["Achat_Important"] = (df["Montant_Total"] > 200).astype(int)
print(f"✅ Données: {len(df)} lignes")

# ============================================
# CLASSIFICATION
# ============================================
print("\n" + "="*50)
print("📊 CLASSIFICATION - Model Registry")
print("="*50)

features_clf = ["Montant_Total", "Nb_Produits", "Log_Montant", "Panier_Moyen", 
                "Mois", "Annee", "Est_weekend", "Segment_Enc", "Methode_Enc"]
X_clf = df[features_clf].fillna(0)
y_clf = df["Achat_Important"]
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
        registered_model_name="SOUGUI_Sales_Classifier_RF"
    )
    print(f"   ✅ Modèle enregistré: SOUGUI_Sales_Classifier_RF (version 1)")

# ============================================
# RÉGRESSION
# ============================================
print("\n" + "="*50)
print("📊 RÉGRESSION - Model Registry")
print("="*50)

features_reg = ["Nb_Produits", "Mois", "Annee", "Est_weekend", "Segment_Enc", "Methode_Enc"]
X_reg = df[features_reg].fillna(0)
y_reg = df["Montant_Total"]
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
        registered_model_name="SOUGUI_Sales_Regressor_RF"
    )
    print(f"   ✅ Modèle enregistré: SOUGUI_Sales_Regressor_RF (version 1)")

# ============================================
# CLUSTERING
# ============================================
print("\n" + "="*50)
print("📊 CLUSTERING - Model Registry")
print("="*50)

df_client = df.groupby("ID_Client").agg({
    "Montant_Total": ["sum", "mean", "count"],
    "Nb_Produits": "mean"
})
df_client.columns = ["Montant_Total", "Montant_Moyen", "Nb_Achats", "Nb_Produits_Moyen"]
df_client = df_client.fillna(0)

scaler = StandardScaler()
X_clust = scaler.fit_transform(df_client[["Montant_Total", "Nb_Achats", "Nb_Produits_Moyen"]])

model_clust = KMeans(n_clusters=3, random_state=42, n_init=10)
labels = model_clust.fit_predict(X_clust)
silhouette = silhouette_score(X_clust, labels)

print(f"✅ KMeans(k=3) - Silhouette: {silhouette:.4f}")

with open("clust_model_sales.pkl", "wb") as f:
    pickle.dump({"model": model_clust, "scaler": scaler}, f)

with mlflow.start_run(run_name="Clustering_KMeans_Best"):
    mlflow.log_params({
        "model_type": "KMeans",
        "n_clusters": 3,
        "scaled": True
    })
    mlflow.log_metric("silhouette_score", silhouette)
    mlflow.log_artifact("clust_model_sales.pkl")
    print(f"   ✅ Modèle sauvegardé (artefact)")

# ============================================
# TRANSITION STAGING → PRODUCTION
# ============================================
print("\n" + "="*50)
print("📊 TRANSITION DES MODÈLES")
print("="*50)

# Pour le classifieur
try:
    latest_version = client.get_latest_versions("SOUGUI_Sales_Classifier_RF", stages=["None"])[0].version
    client.transition_model_version_stage(
        name="SOUGUI_Sales_Classifier_RF",
        version=latest_version,
        stage="Staging"
    )
    print(f"   ✅ SOUGUI_Sales_Classifier_RF version {latest_version} → Staging")
    
    if acc >= 0.85:
        client.transition_model_version_stage(
            name="SOUGUI_Sales_Classifier_RF",
            version=latest_version,
            stage="Production"
        )
        print(f"   ✅ SOUGUI_Sales_Classifier_RF version {latest_version} → Production")
except Exception as e:
    print(f"   ⚠️ Transition classifieur: {e}")

# Pour le régresseur
try:
    latest_version = client.get_latest_versions("SOUGUI_Sales_Regressor_RF", stages=["None"])[0].version
    client.transition_model_version_stage(
        name="SOUGUI_Sales_Regressor_RF",
        version=latest_version,
        stage="Staging"
    )
    print(f"   ✅ SOUGUI_Sales_Regressor_RF version {latest_version} → Staging")
    
    if rmse <= 150:
        client.transition_model_version_stage(
            name="SOUGUI_Sales_Regressor_RF",
            version=latest_version,
            stage="Production"
        )
        print(f"   ✅ SOUGUI_Sales_Regressor_RF version {latest_version} → Production")
except Exception as e:
    print(f"   ⚠️ Transition régresseur: {e}")

# ============================================
# TEST DE CHARGEMENT DEPUIS LE REGISTRY
# ============================================
print("\n" + "="*50)
print("📊 TEST - Chargement depuis Registry")
print("="*50)

model_uri = "models:/SOUGUI_Sales_Classifier_RF/Staging"
try:
    loaded_model = mlflow.sklearn.load_model(model_uri)
    test_pred = loaded_model.predict(X_test[:5])
    print(f"   ✅ Classifieur chargé depuis Staging - Prédictions: {test_pred}")
except Exception as e:
    print(f"   ⚠️ Impossible de charger le classifieur: {e}")

# ============================================
# RÉSUMÉ FINAL
# ============================================
print("\n" + "="*60)
print("📈 RÉSUMÉ DAY 3 - MODEL REGISTRY")
print("="*60)
print(f"🔹 Modèles enregistrés:")
print(f"   - SOUGUI_Sales_Classifier_RF (accuracy={acc:.4f})")
print(f"   - SOUGUI_Sales_Regressor_RF (rmse={rmse:.2f})")
print(f"   - Clustering KMeans (k=3, silhouette={silhouette:.4f})")
print("\n🌐 Interface MLflow: http://127.0.0.1:5000")
print("   → Onglet 'Models' pour voir les modèles enregistrés")