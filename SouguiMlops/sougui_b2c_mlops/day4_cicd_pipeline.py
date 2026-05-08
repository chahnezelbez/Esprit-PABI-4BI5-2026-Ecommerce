"""
Day 4 - MLOps pour Sougui.tn (Ventes B2C)
CI/CD Pipeline + Tests Automatiques + Déploiement
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
from sklearn.metrics import accuracy_score, mean_squared_error, silhouette_score, precision_score, recall_score, f1_score, roc_auc_score, r2_score
from mlflow.tracking import MlflowClient

warnings.filterwarnings("ignore")

mlflow.set_tracking_uri("http://127.0.0.1:5000")
client = MlflowClient()

THRESHOLDS = {
    "classifier": {"accuracy": 0.85, "precision": 0.80, "recall": 0.80, "f1": 0.80, "roc_auc": 0.85},
    "regressor": {"rmse": 150.0, "r2": 0.60},
    "clustering": {"silhouette": 0.40}
}

print(f"✅ MLflow tracking URI: {mlflow.get_tracking_uri()}")
print(f"📊 Seuils de performance: {THRESHOLDS}")

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
# CLASSIFICATION - PIPELINE
# ============================================
print("\n" + "="*60)
print("📊 CLASSIFICATION PIPELINE")
print("="*60)

features_clf = ["Montant_Total", "Nb_Produits", "Log_Montant", "Panier_Moyen", 
                "Mois", "Annee", "Est_weekend", "Segment_Enc", "Methode_Enc"]
X_clf = df[features_clf].fillna(0)
y_clf = df["Achat_Important"]
X_train, X_test, y_train, y_test = train_test_split(X_clf, y_clf, test_size=0.2, random_state=42)

model_clf = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
model_clf.fit(X_train, y_train)

y_pred = model_clf.predict(X_test)
y_proba = model_clf.predict_proba(X_test)[:, 1]

metrics_clf = {
    "accuracy": accuracy_score(y_test, y_pred),
    "precision": precision_score(y_test, y_pred, zero_division=0),
    "recall": recall_score(y_test, y_pred, zero_division=0),
    "f1": f1_score(y_test, y_pred, zero_division=0),
    "roc_auc": roc_auc_score(y_test, y_proba)
}

print(f"📈 Performance Classifieur:")
for k, v in metrics_clf.items():
    print(f"   {k}: {v:.4f}")

tests_reussis = True
for metric, value in metrics_clf.items():
    if metric in THRESHOLDS["classifier"]:
        seuil = THRESHOLDS["classifier"][metric]
        if value < seuil:
            print(f"   ❌ Échec: {metric} = {value:.4f} < seuil {seuil}")
            tests_reussis = False
        else:
            print(f"   ✅ {metric} = {value:.4f} ≥ seuil {seuil}")

with mlflow.start_run(run_name="CI_Classifier_RF"):
    mlflow.log_params({
        "model_type": "RandomForestClassifier",
        "n_estimators": 100,
        "pipeline_stage": "CI_test"
    })
    for k, v in metrics_clf.items():
        mlflow.log_metric(k, v)
    
    signature = mlflow.models.infer_signature(X_train, model_clf.predict(X_train))
    mlflow.sklearn.log_model(model_clf, "model", signature=signature)
    
    if tests_reussis:
        result = mlflow.register_model(
            f"runs:/{mlflow.active_run().info.run_id}/model",
            "SOUGUI_Sales_Classifier_RF"
        )
        version = result.version
        client.transition_model_version_stage(
            name="SOUGUI_Sales_Classifier_RF",
            version=version,
            stage="Staging"
        )
        print(f"\n✅ Classifieur version {version} → Staging")
    else:
        print(f"\n❌ Classifieur non promu (tests échoués)")

# ============================================
# RÉGRESSION - PIPELINE
# ============================================
print("\n" + "="*60)
print("📊 RÉGRESSION PIPELINE")
print("="*60)

features_reg = ["Nb_Produits", "Mois", "Annee", "Est_weekend", "Segment_Enc", "Methode_Enc"]
X_reg = df[features_reg].fillna(0)
y_reg = df["Montant_Total"]
X_train_r, X_test_r, y_train_r, y_test_r = train_test_split(X_reg, y_reg, test_size=0.2, random_state=42)

model_reg = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
model_reg.fit(X_train_r, y_train_r)
y_pred_r = model_reg.predict(X_test_r)

rmse = np.sqrt(mean_squared_error(y_test_r, y_pred_r))
r2 = r2_score(y_test_r, y_pred_r)

print(f"📈 Performance Régresseur:")
print(f"   RMSE: {rmse:.2f}")
print(f"   R²: {r2:.4f}")

tests_reussis = True
if rmse > THRESHOLDS["regressor"]["rmse"]:
    print(f"   ❌ RMSE = {rmse:.2f} > seuil {THRESHOLDS['regressor']['rmse']}")
    tests_reussis = False
else:
    print(f"   ✅ RMSE = {rmse:.2f} ≤ seuil {THRESHOLDS['regressor']['rmse']}")

if r2 < THRESHOLDS["regressor"]["r2"]:
    print(f"   ❌ R² = {r2:.4f} < seuil {THRESHOLDS['regressor']['r2']}")
    tests_reussis = False
else:
    print(f"   ✅ R² = {r2:.4f} ≥ seuil {THRESHOLDS['regressor']['r2']}")

with mlflow.start_run(run_name="CI_Regressor_RF"):
    mlflow.log_params({
        "model_type": "RandomForestRegressor",
        "n_estimators": 100,
        "pipeline_stage": "CI_test"
    })
    mlflow.log_metrics({"rmse": rmse, "r2": r2})
    
    signature = mlflow.models.infer_signature(X_train_r, model_reg.predict(X_train_r))
    mlflow.sklearn.log_model(model_reg, "model", signature=signature)
    
    if tests_reussis:
        result = mlflow.register_model(
            f"runs:/{mlflow.active_run().info.run_id}/model",
            "SOUGUI_Sales_Regressor_RF"
        )
        version = result.version
        client.transition_model_version_stage(
            name="SOUGUI_Sales_Regressor_RF",
            version=version,
            stage="Staging"
        )
        print(f"\n✅ Régresseur version {version} → Staging")
    else:
        print(f"\n❌ Régresseur non promu (tests échoués)")

# ============================================
# RAPPORT FINAL
# ============================================
print("\n" + "="*60)
print("📈 RAPPORT CI/CD - DAY 4")
print("="*60)
print(f"\n🔹 Classification:")
print(f"   - Accuracy: {metrics_clf['accuracy']:.4f}")
print(f"   - Tests: {'✅ PASSÉS' if tests_reussis else '❌ ÉCHOUÉS'}")
print(f"\n🔹 Régression:")
print(f"   - RMSE: {rmse:.2f}, R²: {r2:.4f}")
print(f"   - Tests: {'✅ PASSÉS' if tests_reussis else '❌ ÉCHOUÉS'}")
print("\n🌐 Interface MLflow: http://127.0.0.1:5000")