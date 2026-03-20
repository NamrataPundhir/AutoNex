# safety_model.py — Random Forest predictor for crime_dataset_india
# Loads the model trained by train_model.py and predicts safe/unsafe
# for any GPS location + hour combination.

import os
import joblib
import numpy as np
import pandas as pd
from datetime import datetime

BASE         = os.path.dirname(__file__)
MODEL_PATH   = os.path.join(BASE, "safety_rf_model.pkl")
SCALER_PATH  = os.path.join(BASE, "safety_scaler.pkl")
FEATURES_PATH= os.path.join(BASE, "feature_names.pkl")
CSV_PATH = os.path.join(BASE, "Dataset", "crime_dataset_india.csv")
RADIUS = 0.008   # ~800 metres in degrees


# ══════════════════════════════════════════════════════════════════════
# Load crime CSV into memory at startup (fast lookup later)
# ══════════════════════════════════════════════════════════════════════

def _load_csv():
    if not os.path.exists(CSV_PATH):
        print(f"[SafetyModel] {CSV_PATH} not found — using synthetic fallback")
        return _synthetic_df()

    df = pd.read_csv(CSV_PATH)
    df.columns = df.columns.str.strip().str.lower().str.replace(" ", "_")

    # Rename to internal names
    rename_map = {
        "date_of_occurrence": "date_occ",
        "time_of_occurrence": "time_occ",
        "crime_description":  "crime_type",
        "weapon_used":        "weapon",
        "crime_domain":       "crime_domain",
        "victim_age":         "victim_age",
        "victim_gender":      "victim_gender",
        "city":               "city",
    }
    df.rename(columns=rename_map, inplace=True)

    # Parse hour
    def parse_hour(val):
        try:
            s = str(val).strip()
            if ":" in s:
                parts = s.replace("AM","").replace("PM","").strip().split(":")
                h = int(parts[0])
                if "PM" in str(val).upper() and h != 12: h += 12
                elif "AM" in str(val).upper() and h == 12: h = 0
                return h % 24
            else:
                n = int(float(s))
                return (n // 100) % 24 if n > 100 else n % 24
        except Exception:
            return 12

    df["hour"] = df["time_occ"].apply(parse_hour)

    # Parse date
    df["date_occ_parsed"] = pd.to_datetime(df["date_occ"], errors="coerce", dayfirst=True)
    df["day_of_week"]     = df["date_occ_parsed"].dt.dayofweek.fillna(0).astype(int)
    df["month"]           = df["date_occ_parsed"].dt.month.fillna(6).astype(int)

    # Weapon severity
    WSEV = {
        "firearm":4,"gun":4,"pistol":4,"rifle":4,
        "knife":3,"blade":3,"sword":3,"explosives":4,"bomb":4,
        "blunt":2,"rod":2,"stick":2,"poison":3,
        "other":1,"none":0,
    }
    def wscore(w):
        w = str(w).lower()
        for k, v in WSEV.items():
            if k in w: return v
        return 1
    df["weapon_severity"] = df["weapon"].apply(wscore)

    # Crime severity
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

    # Domain severity
    def dscore(d):
        d = str(d).lower()
        if "violent" in d: return 3
        if "fire" in d:    return 2
        return 1
    df["domain_severity"] = df["crime_domain"].apply(dscore)

    df["is_female_victim"] = (df["victim_gender"].str.strip().str.upper() == "F").astype(int)
    df["victim_age"]       = pd.to_numeric(df["victim_age"], errors="coerce").fillna(30)

    # City crime density
    city_counts = df["city"].value_counts().to_dict()
    df["city_crime_count"] = df["city"].map(city_counts).fillna(0)

    print(f"[SafetyModel] Loaded {len(df):,} crime records from {CSV_PATH}")
    return df

def _synthetic_df():
    """Fallback when no CSV — small synthetic dataset."""
    np.random.seed(42)
    n = 3000
    cities = ["Mumbai","Delhi","Bangalore","Chennai","Hyderabad","Pune","Kolkata"]
    crimes = ["ASSAULT","ROBBERY","THEFT","VANDALISM","FRAUD","KIDNAPPING","HOMICIDE"]
    return pd.DataFrame({
        "hour":          np.random.randint(0,24,n),
        "day_of_week":   np.random.randint(0,7,n),
        "month":         np.random.randint(1,13,n),
        "weapon_severity":np.random.randint(0,5,n),
        "crime_severity": np.random.randint(1,4,n),
        "domain_severity":np.random.randint(1,4,n),
        "is_female_victim":np.random.randint(0,2,n),
        "victim_age":    np.random.randint(10,80,n),
        "city":          np.random.choice(cities,n),
        "city_crime_count":np.random.randint(100,2000,n),
        "crime_type":    np.random.choice(crimes,n),
    })


crime_df = _load_csv()


# ══════════════════════════════════════════════════════════════════════
# Load ML model artifacts
# ══════════════════════════════════════════════════════════════════════

def _load(path):
    try:
        return joblib.load(path)
    except FileNotFoundError:
        print(f"[SafetyModel] {path} not found — run train_model.py first")
        return None

rf_model      = _load(MODEL_PATH)
scaler        = _load(SCALER_PATH)
feature_names = _load(FEATURES_PATH)

if rf_model is None:
    print("[SafetyModel] WARNING: No model found — using rule-based fallback")


# ══════════════════════════════════════════════════════════════════════
# Extract features from nearby crimes for a given GPS point
# ══════════════════════════════════════════════════════════════════════

def _nearby_crimes(lat: float, lng: float) -> pd.DataFrame:
    """Filter crime_df to records within ~800m of lat/lng."""
    if crime_df is None or len(crime_df) == 0:
        return pd.DataFrame()
    # Use city column as proxy if no lat/lng in CSV
    # In production: add lat/lng columns to your CSV for precise matching
    # For now: return a sample weighted by city crime density
    if "latitude" in crime_df.columns and "longitude" in crime_df.columns:
        mask = (
            (crime_df["latitude"]  - lat).abs() < RADIUS) & \
            ((crime_df["longitude"]- lng).abs() < RADIUS
        )
        return crime_df[mask]
    else:
        # Fallback: return a random sample (replace with real geo matching)
        return crime_df.sample(min(50, len(crime_df)), random_state=int(abs(lat*100+lng*100)) % 1000)


def _build_feature_vector(lat: float, lng: float, hour: int) -> np.ndarray:
    """Build the 12-feature vector the model expects."""
    now        = datetime.now()
    nearby     = _nearby_crimes(lat, lng)
    total      = len(nearby)

    if total > 0:
        weapon_sev  = float(nearby["weapon_severity"].mean())
        crime_sev   = float(nearby["crime_severity"].mean())
        domain_sev  = float(nearby["domain_severity"].mean())
        female_ratio= float(nearby["is_female_victim"].mean())
        avg_age     = float(nearby["victim_age"].mean())
        city_density= float(nearby["city_crime_count"].mean())
    else:
        weapon_sev = crime_sev = domain_sev = 0.0
        female_ratio = 0.0
        avg_age = 30.0
        city_density = 0.0

    is_night      = int(hour < 6 or hour > 22)
    is_late_night = int(hour >= 23 or hour <= 3)
    is_weekend    = int(now.weekday() in [5, 6])
    day_of_week   = now.weekday()
    month         = now.month

    # Must match FEATURE_COLS order from train_model.py exactly:
    # ["hour","day_of_week","month","is_night","is_late_night","is_weekend",
    #  "is_female_victim","weapon_severity","crime_severity","domain_severity",
    #  "city_crime_count","victim_age"]
    return np.array([[
        hour, day_of_week, month,
        is_night, is_late_night, is_weekend,
        female_ratio, weapon_sev, crime_sev, domain_sev,
        city_density, avg_age,
    ]])


# ══════════════════════════════════════════════════════════════════════
# Public API — called by main.py
# ══════════════════════════════════════════════════════════════════════

def predict_risk(lat: float, lng: float, hour: int) -> dict:
    """
    Returns:
        status     : "SAFE" | "UNSAFE"
        score      : 0–100 (higher = safer)
        confidence : 0.0–1.0
        reasons    : list of human-readable strings
        features   : raw feature dict for the UI breakdown
    """
    feat_vec = _build_feature_vector(lat, lng, hour)

    if rf_model is not None and scaler is not None:
        feat_s      = scaler.transform(feat_vec)
        prob_unsafe = float(rf_model.predict_proba(feat_s)[0][1])
        score       = int((1 - prob_unsafe) * 100)
        model_used  = "random_forest"
    else:
        # Rule-based fallback
        f = feat_vec[0]
        risk = f[7]*4 + f[8]*3 + f[3]*3 + f[4]*4 + f[5]*1
        prob_unsafe = min(1.0, risk / 20)
        score       = int((1 - prob_unsafe) * 100)
        model_used  = "rule_based_fallback"

    status = "UNSAFE" if score < 50 else "SAFE"

    # Build human-readable reasons from feature values
    f = feat_vec[0]
    reasons = []
    hour_val       = int(f[0])
    is_night       = int(f[3])
    is_late_night  = int(f[4])
    is_weekend     = int(f[5])
    weapon_sev     = float(f[7])
    crime_sev      = float(f[8])
    domain_sev     = float(f[9])
    city_density   = float(f[10])

    if is_late_night:
        reasons.append(f"Late night hours ({hour_val}:00) — highest risk window")
    elif is_night:
        reasons.append(f"Night time ({hour_val}:00) — reduced visibility")
    if crime_sev >= 2.5:
        reasons.append("High-severity crime types recorded in this area")
    if weapon_sev >= 3:
        reasons.append("Firearm or knife crimes reported nearby")
    elif weapon_sev >= 2:
        reasons.append("Weapon-related crimes reported in this area")
    if domain_sev >= 3:
        reasons.append("Violent crime domain dominates this area's records")
    if city_density > 1000:
        reasons.append(f"High crime density city — {int(city_density)} incidents recorded")
    if is_weekend and is_night:
        reasons.append("Weekend night — historically higher risk period")
    if not reasons and status == "SAFE":
        reasons.append("Low crime activity detected — area appears safe")
    if not reasons and status == "UNSAFE":
        reasons.append("Combined risk factors exceed safety threshold")

    return {
        "status":     status,
        "score":      score,
        "confidence": round(1 - abs(prob_unsafe - 0.5) * 2, 2),
        "reasons":    reasons,
        "model":      model_used,
        "features": {
            "hour":            hour_val,
            "is_night":        is_night,
            "is_late_night":   is_late_night,
            "is_weekend":      is_weekend,
            "weapon_severity": round(weapon_sev, 1),
            "crime_severity":  round(crime_sev, 1),
            "domain_severity": round(domain_sev, 1),
            "city_density":    int(city_density),
        },
    }


def retrain() -> dict:
    """Retrain model with updated CSV — callable from /retrain-safety endpoint."""
    global crime_df, rf_model, scaler, feature_names
    import subprocess, sys
    result = subprocess.run(
        [sys.executable, os.path.join(BASE, "train_model.py"), "--csv", CSV_PATH],
        capture_output=True, text=True
    )
    if result.returncode == 0:
        rf_model      = _load(MODEL_PATH)
        scaler        = _load(SCALER_PATH)
        feature_names = _load(FEATURES_PATH)
        crime_df      = _load_csv()
        return {"status": "retrained", "records": len(crime_df)}
    else:
        return {"status": "failed", "error": result.stderr[-500:]}