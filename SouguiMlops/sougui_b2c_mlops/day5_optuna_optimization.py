"""
Day 5 - MLOps pour Sougui.tn (Ventes B2C)
Optimisation des hyperparamètres avec Optuna
"""

import mlflow
import mlflow.sklearn
import pandas as pd
import numpy as np
import pickle
import warnings
import optuna
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import accuracy_score, mean_squared_error, silhouette_score, r2_score
from mlflow.tracking import MlflowClient

warnings.filterwarnings("ignore")

mlflow.set_tracking_uri("http://127.0.0.1:5000")
client = MlflowClient()

THRESHOLDS = {
    "classifier": {"accuracy": 0.85, "precision": 0.80, "recall": 0.80, "f1": 0.80},
    "regressor": {"rmse": 150.0, "r2": 0.60},
    "clustering": {"silhouette": 0.40}
}

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
# OPTUNA - CLASSIFICATION
# ============================================
print("\n" + "="*60)
print("📊 OPTUNA - OPTIMISATION CLASSIFICATION")
print("="*60)

features_clf = ["Montant_Total", "Nb_Produits", "Log_Montant", "Panier_Moyen", 
                "Mois", "Annee", "Est_weekend", "Segment_Enc", "Methode_Enc"]
X_clf = df[features_clf].fillna(0)
y_clf = df["Achat_Important"]
X_train, X_test, y_train, y_test = train_test_split(X_clf, y_clf, test_size=0.2, random_state=42)

def objective_clf(trial):
    params = {
        "n_estimators": trial.suggest_int("n_estimators", 50, 300),
        "max_depth": trial.suggest_int("max_depth", 5, 30),
        "min_samples_split": trial.suggest_int("min_samples_split", 2, 20),
        "min_samples_leaf": trial.suggest_int("min_samples_leaf", 1, 10),
        "max_features": trial.suggest_categorical("max_features", ["sqrt", "log2", None])
    }
    
    model = RandomForestClassifier(**params, random_state=42, n_jobs=-1)
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    return accuracy_score(y_test, y_pred)

print("🔍 Recherche des meilleurs paramètres...")
study_clf = optuna.create_study(direction="maximize")
study_clf.optimize(objective_clf, n_trials=30, show_progress_bar=True)

best_params_clf = study_clf.best_params
best_accuracy = study_clf.best_value

print(f"\n✅ Meilleurs paramètres trouvés:")
for k, v in best_params_clf.items():
    print(f"   {k}: {v}")
print(f"📈 Meilleure accuracy: {best_accuracy:.4f}")

best_model_clf = RandomForestClassifier(**best_params_clf, random_state=42, n_jobs=-1)
best_model_clf.fit(X_train, y_train)
y_pred = best_model_clf.predict(X_test)

from sklearn.metrics import precision_score, recall_score, f1_score
metrics_clf = {
    "accuracy": accuracy_score(y_test, y_pred),
    "precision": precision_score(y_test, y_pred, zero_division=0),
    "recall": recall_score(y_test, y_pred, zero_division=0),
    "f1": f1_score(y_test, y_pred, zero_division=0)
}

with mlflow.start_run(run_name="Optuna_Classifier_Best"):
    mlflow.log_params(best_params_clf)
    mlflow.log_metrics(metrics_clf)
    mlflow.log_param("optimizer", "Optuna")
    mlflow.log_param("n_trials", 30)
    
    signature = mlflow.models.infer_signature(X_train, best_model_clf.predict(X_train))
    mlflow.sklearn.log_model(best_model_clf, "model", signature=signature)
    
    if metrics_clf["accuracy"] >= THRESHOLDS["classifier"]["accuracy"]:
        result = mlflow.register_model(
            f"runs:/{mlflow.active_run().info.run_id}/model",
            "SOUGUI_Sales_Classifier_Optuna"
        )
        client.transition_model_version_stage(
            name="SOUGUI_Sales_Classifier_Optuna",
            version=result.version,
            stage="Production"
        )
        print(f"\n✅ Classifieur optimisé → Production (accuracy={metrics_clf['accuracy']:.4f})")
    else:
        print(f"\n⚠️ Classifieur non promu (accuracy={metrics_clf['accuracy']:.4f} < seuil)")

# ============================================
# OPTUNA - RÉGRESSION
# ============================================
print("\n" + "="*60)
print("📊 OPTUNA - OPTIMISATION RÉGRESSION")
print("="*60)

features_reg = ["Nb_Produits", "Mois", "Annee", "Est_weekend", "Segment_Enc", "Methode_Enc"]
X_reg = df[features_reg].fillna(0)
y_reg = df["Montant_Total"]
X_train_r, X_test_r, y_train_r, y_test_r = train_test_split(X_reg, y_reg, test_size=0.2, random_state=42)

def objective_reg(trial):
    params = {
        "n_estimators": trial.suggest_int("n_estimators", 50, 300),
        "max_depth": trial.suggest_int("max_depth", 5, 30),
        "min_samples_split": trial.suggest_int("min_samples_split", 2, 20),
        "min_samples_leaf": trial.suggest_int("min_samples_leaf", 1, 10),
        "max_features": trial.suggest_categorical("max_features", ["sqrt", "log2", None])
    }
    
    model = RandomForestRegressor(**params, random_state=42, n_jobs=-1)
    model.fit(X_train_r, y_train_r)
    y_pred = model.predict(X_test_r)
    rmse = np.sqrt(mean_squared_error(y_test_r, y_pred))
    return -rmse

print("🔍 Recherche des meilleurs paramètres...")
study_reg = optuna.create_study(direction="maximize")
study_reg.optimize(objective_reg, n_trials=30, show_progress_bar=True)

best_params_reg = study_reg.best_params
best_rmse = -study_reg.best_value

print(f"\n✅ Meilleurs paramètres trouvés:")
for k, v in best_params_reg.items():
    print(f"   {k}: {v}")
print(f"📈 Meilleur RMSE: {best_rmse:.2f}")

best_model_reg = RandomForestRegressor(**best_params_reg, random_state=42, n_jobs=-1)
best_model_reg.fit(X_train_r, y_train_r)
y_pred_r = best_model_reg.predict(X_test_r)

rmse = np.sqrt(mean_squared_error(y_test_r, y_pred_r))
r2 = r2_score(y_test_r, y_pred_r)

print(f"📈 Performance finale:")
print(f"   RMSE: {rmse:.2f}")
print(f"   R²: {r2:.4f}")

with mlflow.start_run(run_name="Optuna_Regressor_Best"):
    mlflow.log_params(best_params_reg)
    mlflow.log_metrics({"rmse": rmse, "r2": r2})
    mlflow.log_param("optimizer", "Optuna")
    mlflow.log_param("n_trials", 30)
    
    signature = mlflow.models.infer_signature(X_train_r, best_model_reg.predict(X_train_r))
    mlflow.sklearn.log_model(best_model_reg, "model", signature=signature)
    
    if rmse <= THRESHOLDS["regressor"]["rmse"] and r2 >= THRESHOLDS["regressor"]["r2"]:
        result = mlflow.register_model(
            f"runs:/{mlflow.active_run().info.run_id}/model",
            "SOUGUI_Sales_Regressor_Optuna"
        )
        client.transition_model_version_stage(
            name="SOUGUI_Sales_Regressor_Optuna",
            version=result.version,
            stage="Production"
        )
        print(f"\n✅ Régresseur optimisé → Production (RMSE={rmse:.2f}, R²={r2:.4f})")
    else:
        print(f"\n⚠️ Régresseur non promu (RMSE={rmse:.2f}, R²={r2:.4f})")

# ============================================
# OPTUNA - CLUSTERING
# ============================================
print("\n" + "="*60)
print("📊 OPTUNA - OPTIMISATION CLUSTERING")
print("="*60)

df_client = df.groupby("ID_Client").agg({
    "Montant_Total": ["sum", "mean", "count"],
    "Nb_Produits": "mean"
})
df_client.columns = ["Montant_Total", "Montant_Moyen", "Nb_Achats", "Nb_Produits_Moyen"]
df_client = df_client.fillna(0)

scaler = StandardScaler()
X_clust = scaler.fit_transform(df_client[["Montant_Total", "Nb_Achats", "Nb_Produits_Moyen"]])

def objective_clust(trial):
    k = trial.suggest_int("n_clusters", 2, 8)
    model = KMeans(n_clusters=k, random_state=42, n_init=10)
    labels = model.fit_predict(X_clust)
    
    if len(set(labels)) > 1:
        return silhouette_score(X_clust, labels)
    else:
        return -1.0

print("🔍 Recherche du nombre optimal de clusters...")
study_clust = optuna.create_study(direction="maximize")
study_clust.optimize(objective_clust, n_trials=20, show_progress_bar=True)

best_k = study_clust.best_params["n_clusters"]
best_silhouette = study_clust.best_value

print(f"\n✅ Meilleur k: {best_k}")
print(f"📈 Meilleure silhouette: {best_silhouette:.4f}")

best_model_clust = KMeans(n_clusters=best_k, random_state=42, n_init=10)
labels = best_model_clust.fit_predict(X_clust)

with mlflow.start_run(run_name="Optuna_Clustering_Best"):
    mlflow.log_params({"n_clusters": best_k, "optimizer": "Optuna", "n_trials": 20})
    mlflow.log_metric("silhouette_score", best_silhouette)
    
    with open("clust_model_sales_optuna.pkl", "wb") as f:
        pickle.dump({"model": best_model_clust, "scaler": scaler}, f)
    mlflow.log_artifact("clust_model_sales_optuna.pkl")
    
    print(f"\n✅ Clustering optimisé - k={best_k}, Silhouette={best_silhouette:.4f}")

# ============================================
# RAPPORT FINAL
# ============================================
print("\n" + "="*60)
print("📈 RÉSUMÉ DAY 5 - OPTUNA OPTIMIZATION")
print("="*60)
print(f"\n🔹 Classification - Accuracy: {metrics_clf['accuracy']:.4f}")
print(f"🔹 Régression - RMSE: {rmse:.2f}, R²: {r2:.4f}")
print(f"🔹 Clustering - k={best_k}, Silhouette: {best_silhouette:.4f}")
print("\n🌐 Interface MLflow: http://127.0.0.1:5000")