"""
Day 4 - MLOps pour Sougui.tn (Marketing)
CI/CD Pipeline + Tests Automatiques + Déploiement
"""

import mlflow
import mlflow.sklearn
import pandas as pd
import numpy as np
import warnings
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, mean_squared_error, recall_score, precision_score, f1_score, r2_score
from mlflow.tracking import MlflowClient

warnings.filterwarnings("ignore")

mlflow.set_tracking_uri("http://127.0.0.1:5000")
client = MlflowClient()

# Seuils de performance pour la promotion
THRESHOLDS = {
    "classifier": {"accuracy": 0.95, "recall": 0.90, "precision": 0.90, "f1": 0.90},
    "regressor": {"rmse": 50.0, "r2": 0.70}
}

print(f"✅ MLflow tracking URI: {mlflow.get_tracking_uri()}")
print(f"📊 Seuils de performance: {THRESHOLDS}")

# ============================================
# 1. GÉNÉRATION DES DONNÉES AVEC CLASSES ÉQUILIBRÉES
# ============================================
print("\n🔄 Génération des données marketing...")
np.random.seed(42)
n_products = 300

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
df["is_overpriced"] = (df["price_gap_pct"] > np.median(df["price_gap_pct"])).astype(int)  # Classes équilibrées
df["sales_velocity"] = df["sales_qty"] / (df["days_on_sale"] + 1)
df["broad_category_enc"] = df["broad_category"].astype("category").cat.codes

print(f"✅ Données: {len(df)} lignes")
print(f"   Distribution is_overpriced: {df['is_overpriced'].value_counts().to_dict()}")

# ============================================
# 2. CLASSIFICATION - PIPELINE AVEC SEUILS
# ============================================
print("\n" + "="*60)
print("📊 CLASSIFICATION PIPELINE")
print("="*60)

features_clf = ["price_current", "discount_depth", "rating_value", "reviews_count",
                "name_len", "desc_len", "sales_qty", "order_lines", "days_on_sale",
                "sales_velocity", "broad_category_enc"]

X_clf = df[features_clf].fillna(0)
y_clf = df["is_overpriced"]
X_train, X_test, y_train, y_test = train_test_split(X_clf, y_clf, test_size=0.2, random_state=42)

model_clf = RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1)
model_clf.fit(X_train, y_train)
y_pred = model_clf.predict(X_test)

metrics_clf = {
    "accuracy": accuracy_score(y_test, y_pred),
    "precision": precision_score(y_test, y_pred, zero_division=0),
    "recall": recall_score(y_test, y_pred, zero_division=0),
    "f1": f1_score(y_test, y_pred, zero_division=0)
}

print(f"📈 Performance Classifieur:")
for k, v in metrics_clf.items():
    print(f"   {k}: {v:.4f}")

# Test des seuils
tests_reussis = True
for metric, value in metrics_clf.items():
    if metric in THRESHOLDS["classifier"]:
        seuil = THRESHOLDS["classifier"][metric]
        if value < seuil:
            print(f"   ❌ Échec: {metric} = {value:.4f} < seuil {seuil}")
            tests_reussis = False
        else:
            print(f"   ✅ {metric} = {value:.4f} ≥ seuil {seuil}")

# Enregistrement dans MLflow
with mlflow.start_run(run_name="CI_Classifier_RF_V1"):
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
            "SOUGUI_Classifier_Overpriced"
        )
        version = result.version
        client.transition_model_version_stage(
            name="SOUGUI_Classifier_Overpriced",
            version=version,
            stage="Staging"
        )
        print(f"\n✅ Classifieur version {version} → Staging")
        
        if metrics_clf["accuracy"] >= 0.98:
            client.transition_model_version_stage(
                name="SOUGUI_Classifier_Overpriced",
                version=version,
                stage="Production"
            )
            print(f"✅ Classifieur version {version} → Production (performance exceptionnelle)")
    else:
        print(f"\n❌ Classifieur non promu (tests échoués)")

# ============================================
# 3. RÉGRESSION - PIPELINE AVEC SEUILS
# ============================================
print("\n" + "="*60)
print("📊 RÉGRESSION PIPELINE")
print("="*60)

features_reg = ["discount_depth", "rating_value", "reviews_count", "name_len", "desc_len",
                "sales_qty", "order_lines", "days_on_sale", "sales_velocity", "broad_category_enc"]

X_reg = df[features_reg].fillna(0)
y_reg = df["price_current"]
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

with mlflow.start_run(run_name="CI_Regressor_RF_V1"):
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
            "SOUGUI_Regressor_Price"
        )
        version = result.version
        client.transition_model_version_stage(
            name="SOUGUI_Regressor_Price",
            version=version,
            stage="Staging"
        )
        print(f"\n✅ Régresseur version {version} → Staging")
        
        if rmse < 40:
            client.transition_model_version_stage(
                name="SOUGUI_Regressor_Price",
                version=version,
                stage="Production"
            )
            print(f"✅ Régresseur version {version} → Production (performance excellente)")
    else:
        print(f"\n❌ Régresseur non promu (tests échoués)")

# ============================================
# 4. RAPPORT FINAL
# ============================================
print("\n" + "="*60)
print("📈 RAPPORT CI/CD - DAY 4 (Marketing)")
print("="*60)
print(f"\n🔹 Classification:")
print(f"   - Version: Staging")
print(f"   - Accuracy: {metrics_clf['accuracy']:.4f}")
print(f"   - Tests: {'✅ PASSÉS' if tests_reussis else '❌ ÉCHOUÉS'}")
print(f"\n🔹 Régression:")
print(f"   - Version: Staging")
print(f"   - RMSE: {rmse:.2f}")
print(f"   - Tests: {'✅ PASSÉS' if tests_reussis else '❌ ÉCHOUÉS'}")
print(f"\n✅ Pipeline CI/CD terminé")