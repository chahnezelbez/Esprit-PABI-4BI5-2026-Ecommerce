"""
Day 2 - MLOps pour Sougui.tn (Marketing)
Multi-métriques + Comparaison de modèles + Artefacts visuels
"""

import mlflow
import mlflow.sklearn
import pandas as pd
import numpy as np
import hashlib
import pickle
import warnings
import matplotlib.pyplot as plt
import seaborn as sns
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score, roc_auc_score, roc_curve,
    mean_squared_error, mean_absolute_error, r2_score,
    silhouette_score, davies_bouldin_score
)
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier, XGBRegressor
from statsmodels.tsa.arima.model import ARIMA

warnings.filterwarnings("ignore")

mlflow.set_tracking_uri("http://127.0.0.1:5000")
print(f"✅ MLflow tracking URI: {mlflow.get_tracking_uri()}")

# ============================================
# 1. GÉNÉRATION DES DONNÉES SYNTHÉTIQUES
# ============================================
print("\n🔄 Génération des données marketing...")
np.random.seed(42)
n_products = 200

df = pd.DataFrame({
    "sku": [f"SKU_{i}" for i in range(n_products)],
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

# Calcul prix de référence marché
market_ref = df.groupby("broad_category")["price_current"].transform("median")
df["market_price_median"] = market_ref
df["price_gap_tnd"] = df["price_current"] - df["market_price_median"]
df["price_gap_pct"] = df["price_gap_tnd"] / df["market_price_median"]
df["is_overpriced"] = (df["price_gap_pct"] > 0.10).astype(int)
df["sales_velocity"] = df["sales_qty"] / (df["days_on_sale"] + 1)
df["broad_category_enc"] = df["broad_category"].astype("category").cat.codes

data_hash = hashlib.sha256(pd.util.hash_pandas_object(df, index=True).values).hexdigest()
mlflow.set_experiment("SOUGUI_Marketing_Day2")

# ============================================
# 2. CLASSIFICATION - Multi-modèles
# ============================================
print("\n" + "="*50)
print("📊 CLASSIFICATION - Détection produits surévalués")
print("="*50)

features_clf = ["price_current", "discount_depth", "rating_value", "reviews_count",
                "name_len", "desc_len", "sales_qty", "order_lines", "days_on_sale",
                "sales_velocity", "broad_category_enc"]

X_clf = df[features_clf].fillna(0)
y_clf = df["is_overpriced"]
X_train, X_test, y_train, y_test = train_test_split(X_clf, y_clf, test_size=0.2, random_state=42)

models_clf = {
    "LogisticRegression": LogisticRegression(max_iter=1000, random_state=42),
    "RandomForest": RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1),
    "XGBoost": XGBClassifier(n_estimators=100, random_state=42, eval_metric="logloss", verbosity=0)
}

for name, model in models_clf.items():
    with mlflow.start_run(run_name=f"Classification_{name}"):
        model.fit(X_train, y_train)
        y_pred = model.predict(X_test)
        y_proba = model.predict_proba(X_test)[:, 1] if hasattr(model, "predict_proba") else y_pred
        
        metrics = {
            "accuracy": accuracy_score(y_test, y_pred),
            "precision": precision_score(y_test, y_pred, zero_division=0),
            "recall": recall_score(y_test, y_pred, zero_division=0),
            "f1": f1_score(y_test, y_pred, zero_division=0),
            "roc_auc": roc_auc_score(y_test, y_proba) if len(np.unique(y_pred)) > 1 else 0.5
        }
        
        mlflow.log_params({
            "model_type": name,
            "dataset_hash": data_hash,
            "test_size": 0.2
        })
        for k, v in metrics.items():
            mlflow.log_metric(k, v)
        
        # Matrice de confusion
        from sklearn.metrics import confusion_matrix
        cm = confusion_matrix(y_test, y_pred)
        fig, ax = plt.subplots(figsize=(6,5))
        sns.heatmap(cm, annot=True, fmt="d", cmap="Blues", ax=ax)
        ax.set_title(f"Confusion Matrix - {name}")
        ax.set_xlabel("Predicted")
        ax.set_ylabel("Actual")
        plt.tight_layout()
        plt.savefig("cm.png")
        mlflow.log_artifact("cm.png")
        plt.close()
        
        # Courbe ROC (si disponible)
        if hasattr(model, "predict_proba") and len(np.unique(y_test)) > 1:
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
        
        signature = mlflow.models.infer_signature(X_train, model.predict(X_train))
        mlflow.sklearn.log_model(model, "model", signature=signature, input_example=X_train.iloc[:2])
        
        print(f"  ✅ {name} - Accuracy={metrics['accuracy']:.4f}, F1={metrics['f1']:.4f}, AUC={metrics['roc_auc']:.4f}")

# ============================================
# 3. RÉGRESSION - Prédiction prix
# ============================================
print("\n" + "="*50)
print("📊 RÉGRESSION - Prédiction prix Sougui")
print("="*50)

features_reg = ["discount_depth", "rating_value", "reviews_count", "name_len", "desc_len",
                "sales_qty", "sales_revenue", "order_lines", "days_on_sale",
                "sales_velocity", "broad_category_enc"]

X_reg = df[features_reg].fillna(0)
y_reg = df["price_current"]
X_train_r, X_test_r, y_train_r, y_test_r = train_test_split(X_reg, y_reg, test_size=0.2, random_state=42)

models_reg = {
    "Ridge": Ridge(alpha=1.0),
    "RandomForest": RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1),
    "XGBoost": XGBRegressor(n_estimators=100, random_state=42, verbosity=0)
}

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

for k in [2, 3, 4]:
    with mlflow.start_run(run_name=f"Clustering_KMeans_k{k}"):
        model = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = model.fit_predict(X_clust_scaled)
        
        metrics = {
            "silhouette": silhouette_score(X_clust_scaled, labels) if len(set(labels)) > 1 else 0,
            "davies_bouldin": davies_bouldin_score(X_clust_scaled, labels) if len(set(labels)) > 1 else 0,
            "inertia": model.inertia_
        }
        
        mlflow.log_params({
            "n_clusters": k,
            "dataset_hash": data_hash,
            "scaled": True
        })
        for k_metric, v in metrics.items():
            mlflow.log_metric(k_metric, v)
        
        # Visualisation PCA
        from sklearn.decomposition import PCA
        pca = PCA(n_components=2)
        X_pca = pca.fit_transform(X_clust_scaled)
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
        
        print(f"  ✅ k={k} - Silhouette={metrics['silhouette']:.4f}, DB={metrics['davies_bouldin']:.4f}")

# ============================================
# 5. FORECAST - Revenu mensuel
# ============================================
print("\n" + "="*50)
print("📊 FORECAST - Prévision revenu mensuel")
print("="*50)

np.random.seed(42)
dates = pd.date_range("2023-01-01", periods=24, freq="ME")
monthly_revenue = np.random.exponential(5000, 24) + 1000
ts_series = pd.Series(monthly_revenue, index=dates)

if len(ts_series) >= 6:
    train = ts_series[:-3] if len(ts_series) > 3 else ts_series
    test = ts_series[-3:] if len(ts_series) > 3 else ts_series
    
    with mlflow.start_run(run_name="Forecast_ARIMA"):
        model = ARIMA(train, order=(1, 1, 1))
        fit = model.fit()
        forecast = fit.forecast(steps=len(test))
        
        rmse = np.sqrt(mean_squared_error(test, forecast)) if len(test) > 0 else np.nan
        mae = mean_absolute_error(test, forecast) if len(test) > 0 else np.nan
        mape = np.mean(np.abs((test.values - forecast) / (test.values + 1e-6))) * 100 if len(test) > 0 else np.nan
        
        mlflow.log_params({
            "model_type": "ARIMA",
            "order": "(1,1,1)",
            "dataset_hash": data_hash,
            "train_months": len(train),
            "test_months": len(test)
        })
        mlflow.log_metrics({"rmse": rmse, "mae": mae, "mape": mape})
        
        # Graphique
        fig, ax = plt.subplots(figsize=(12,5))
        ax.plot(train.index, train, label="Train", linewidth=2)
        ax.plot(test.index, test, label="Actual", marker="o", linewidth=2)
        ax.plot(test.index, forecast, label="Forecast", marker="x", linestyle="--", linewidth=2)
        ax.legend()
        ax.set_title(f"ARIMA Forecast - RMSE={rmse:.2f}, MAPE={mape:.2f}%")
        ax.set_xlabel("Date")
        ax.set_ylabel("Revenue (TND)")
        plt.xticks(rotation=45)
        plt.tight_layout()
        plt.savefig("forecast.png")
        mlflow.log_artifact("forecast.png")
        plt.close()
        
        with open("forecast.pkl", "wb") as f:
            pickle.dump(forecast, f)
        mlflow.log_artifact("forecast.pkl")
        
        print(f"  ✅ ARIMA(1,1,1) - RMSE={rmse:.2f}, MAPE={mape:.2f}%")
else:
    print(f"⚠️ Forecast ignoré: {len(ts_series)} mois (minimum 6 requis)")

# ============================================
# 6. RÉSUMÉ FINAL
# ============================================
print("\n" + "="*60)
print("📈 RÉSUMÉ DAY 2 - SOUGUI.TN MARKETING")
print("="*60)
print(f"🔹 Source données: Synthétique")
print(f"🔹 Runs créés: Classification(3), Régression(3), Clustering(3), Forecast(1)")
print(f"🔹 Total: 10 runs enregistrés dans MLflow")
print("\n📊 Comparaison des modèles disponible dans MLflow UI")
print("🌐 Interface: http://127.0.0.1:5000")