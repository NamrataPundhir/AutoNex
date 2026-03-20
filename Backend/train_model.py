"""
train_model.py — Train Random Forest on crime_dataset_india.csv
Backend/train_model.py

Run once from Backend/ folder:
    python train_model.py

Output — 3 files saved in Backend/:
    safety_rf_model.pkl
    safety_scaler.pkl
    feature_names.pkl

pip install scikit-learn pandas numpy joblib
"""

import argparse
import os
import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, accuracy_score, confusion_matrix

BASE = os.path.dirname(__file__)

parser = argparse.ArgumentParser()
parser.add_argument(
    "--csv",
    default=os.path.join(BASE, "Dataset", "crime_dataset_india.csv"),  # ← correct path
    help="Path to crime CSV"
)
args = parser.parse_args()


# ══════════════════════════════════════════════════════════════════════
# STEP 1 — Load CSV
# ══════════════════════════════════════════════════════════════════════

print(f"\nLoading: {args.csv}")
df = pd.read_csv(args.csv)
print(f"Shape: {df.shape}")
print(f"Columns: {list(df.columns)}\n")

# Normalise column names
df.columns = df.columns.str.strip().str.lower().str.replace(" ", "_")

# Rename your exact columns
df.rename(columns={
    "date_of_occurrence": "date_occ",
    "time_of_occurrence": "time_occ",
    "crime_description":  "crime_type",
    "weapon_used":        "weapon",
    "crime_domain":       "crime_domain",
    "victim_age":         "victim_age",
    "victim_gender":      "victim_gender",
    "city":               "city",
}, inplace=True)


# ── Parse Time of Occurrence → hour ───────────────────────────────────
def parse_hour(val):
    try:
        s = str(val).strip()
        if ":" in s:
            parts = s.replace("AM", "").replace("PM", "").strip().split(":")
            h = int(parts[0])
            if "PM" in str(val).upper() and h != 12: h += 12
            elif "AM" in str(val).upper() and h == 12: h = 0
            return h % 24
        else:
            n = int(float(s))
            return (n // 100) % 24 if n > 100 else n % 24
    except Exception:
        return 12

df["hour"]        = df["time_occ"].apply(parse_hour)
df["date_parsed"] = pd.to_datetime(df["date_occ"], errors="coerce", dayfirst=True)
df["day_of_week"] = df["date_parsed"].dt.dayofweek.fillna(0).astype(int)
df["month"]       = df["date_parsed"].dt.month.fillna(6).astype(int)


# ── Weapon severity ────────────────────────────────────────────────────
WSEV = {
    "firearm": 4, "gun": 4, "pistol": 4, "rifle": 4,
    "knife": 3, "blade": 3, "explosives": 4, "bomb": 4,
    "blunt": 2, "rod": 2, "poison": 3, "other": 1, "none": 0,
}
def wscore(w):
    w = str(w).lower()
    for k, v in WSEV.items():
        if k in w: return v
    return 1

df["weapon_severity"] = df["weapon"].apply(wscore)


# ── Crime severity ─────────────────────────────────────────────────────
HIGH = ["assault","murder","homicide","rape","kidnapping","sexual","robbery","arson","extortion","counter"]
MED  = ["burglary","drug","trafficking","fraud","vandalism"]
def cscore(c):
    c = str(c).lower()
    for h in HIGH:
        if h in c: return 3
    for m in MED:
        if m in c: return 2
    return 1

df["crime_severity"] = df["crime_type"].apply(cscore)


# ── Domain severity ────────────────────────────────────────────────────
def dscore(d):
    d = str(d).lower()
    if "violent" in d: return 3
    if "fire" in d:    return 2
    return 1

df["domain_severity"] = df["crime_domain"].apply(dscore)


# ── Derived features ───────────────────────────────────────────────────
df["is_night"]       = ((df["hour"] < 6) | (df["hour"] > 22)).astype(int)
df["is_late_night"]  = ((df["hour"] >= 23) | (df["hour"] <= 3)).astype(int)
df["is_weekend"]     = df["day_of_week"].isin([5, 6]).astype(int)
df["is_female_victim"] = (df["victim_gender"].str.strip().str.upper() == "F").astype(int)
df["victim_age"]     = pd.to_numeric(df["victim_age"], errors="coerce").fillna(30)

city_counts            = df["city"].value_counts().to_dict()
df["city_crime_count"] = df["city"].map(city_counts).fillna(0)


# ══════════════════════════════════════════════════════════════════════
# STEP 2 — Label: UNSAFE = 1, SAFE = 0
# ══════════════════════════════════════════════════════════════════════

def label_unsafe(row):
    score  = row["crime_severity"]  * 2
    score += row["weapon_severity"]
    score += row["domain_severity"]
    score += row["is_night"]        * 2
    score += row["is_late_night"]   * 2
    score += row["is_female_victim"]
    return int(score >= 8)

df["is_unsafe"] = df.apply(label_unsafe, axis=1)
print(f"Unsafe: {df['is_unsafe'].sum():,} ({df['is_unsafe'].mean()*100:.1f}%)")
print(f"Safe:   {(1-df['is_unsafe']).sum():,} ({(1-df['is_unsafe'].mean())*100:.1f}%)\n")


# ══════════════════════════════════════════════════════════════════════
# STEP 3 — Features
# ══════════════════════════════════════════════════════════════════════

FEATURE_COLS = [
    "hour", "day_of_week", "month",
    "is_night", "is_late_night", "is_weekend",
    "is_female_victim", "weapon_severity", "crime_severity",
    "domain_severity", "city_crime_count", "victim_age",
]

X = df[FEATURE_COLS].fillna(0)
y = df["is_unsafe"]
print(f"Feature matrix: {X.shape}")


# ══════════════════════════════════════════════════════════════════════
# STEP 4 — Train
# ══════════════════════════════════════════════════════════════════════

scaler  = StandardScaler()
X_s     = scaler.fit_transform(X)

X_train, X_test, y_train, y_test = train_test_split(
    X_s, y, test_size=0.2, random_state=42, stratify=y
)

print("Training Random Forest (300 trees)...")
model = RandomForestClassifier(
    n_estimators=300,
    max_depth=12,
    min_samples_split=5,
    min_samples_leaf=2,
    max_features="sqrt",
    class_weight="balanced",
    random_state=42,
    n_jobs=-1,
)
model.fit(X_train, y_train)


# ══════════════════════════════════════════════════════════════════════
# STEP 5 — Evaluate
# ══════════════════════════════════════════════════════════════════════

y_pred = model.predict(X_test)
print(f"\nAccuracy : {accuracy_score(y_test, y_pred)*100:.1f}%")

cv = cross_val_score(model, X_s, y, cv=5, scoring="f1")
print(f"CV F1    : {cv.mean():.3f} ± {cv.std():.3f}")

print("\nClassification Report:")
print(classification_report(y_test, y_pred, target_names=["Safe", "Unsafe"]))

print("Confusion Matrix:")
print(confusion_matrix(y_test, y_pred))

imps = sorted(zip(FEATURE_COLS, model.feature_importances_), key=lambda x: -x[1])
print("\nFeature importances:")
for feat, imp in imps:
    bar = "█" * int(imp * 60)
    print(f"  {feat:<22} {bar} {imp:.3f}")


# ══════════════════════════════════════════════════════════════════════
# STEP 6 — Save
# ══════════════════════════════════════════════════════════════════════

joblib.dump(model,        os.path.join(BASE, "safety_rf_model.pkl"))
joblib.dump(scaler,       os.path.join(BASE, "safety_scaler.pkl"))
joblib.dump(FEATURE_COLS, os.path.join(BASE, "feature_names.pkl"))

print("\n✓ safety_rf_model.pkl saved")
print("✓ safety_scaler.pkl saved")
print("✓ feature_names.pkl saved")
print("\nRestart main.py — model will load automatically.")
