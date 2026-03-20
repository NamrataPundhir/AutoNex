# safety_routes.py — Women Safety Backend Routes
# Uses FREE Gmail email via smtplib — zero API keys needed
# Just a Gmail address + App Password (see setup below)

import os
import httpx
import asyncio
import math
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import APIRouter
from pydantic import BaseModel
from datetime import datetime
from safety_model import predict_risk, retrain

router = APIRouter()

# ── Email config — add these 3 lines to Backend/.env ─────────────────
#
# ALERT_EMAIL_FROM = youremail@gmail.com
# ALERT_EMAIL_PASS = xxxx xxxx xxxx xxxx   ← Gmail App Password (16 chars)
# ALERT_EMAIL_TO   = family1@gmail.com,family2@gmail.com
#
# How to get Gmail App Password (one time, 2 minutes, completely free):
#   1. Go to → myaccount.google.com/security
#   2. Turn on 2-Step Verification
#   3. Go to → myaccount.google.com/apppasswords
#   4. Click "Create app password" → name it "AutoNex"
#   5. Copy the 16-character password shown
#   6. Paste it as ALERT_EMAIL_PASS in your .env
#
# That's it. No API key, no payment, no signup. Completely free.
# Gmail allows ~500 emails/day on free accounts.
# ─────────────────────────────────────────────────────────────────────

EMAIL_FROM   = os.getenv("ALERT_EMAIL_FROM", "")
EMAIL_PASS   = os.getenv("ALERT_EMAIL_PASS", "")
EMAIL_TO     = [e.strip() for e in os.getenv("ALERT_EMAIL_TO", "").split(",") if e.strip()]
GOOGLE_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")

checkin_log = []


# ── Pydantic models ───────────────────────────────────────────────────
class SafetyRequest(BaseModel):
    latitude:  float
    longitude: float

class CheckinRequest(BaseModel):
    lat:     float
    lng:     float
    status:  str
    score:   int
    address: str = ""
    time:    str = ""


# ══════════════════════════════════════════════════════════════════════
# EMAIL ENGINE — pure Python stdlib, zero dependencies, zero API cost
# ══════════════════════════════════════════════════════════════════════

def _send_email_sync(subject: str, plain: str, html: str):
    """Blocking email send — runs in thread executor so FastAPI stays async."""
    if not EMAIL_FROM or not EMAIL_PASS:
        print("[Email] Not configured. Add ALERT_EMAIL_FROM and ALERT_EMAIL_PASS to .env")
        return
    if not EMAIL_TO:
        print("[Email] No recipients. Add ALERT_EMAIL_TO to .env")
        return
    try:
        msg            = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = f"AutoNex Safety <{EMAIL_FROM}>"
        msg["To"]      = ", ".join(EMAIL_TO)
        msg.attach(MIMEText(plain, "plain", "utf-8"))
        msg.attach(MIMEText(html,  "html",  "utf-8"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
            smtp.login(EMAIL_FROM, EMAIL_PASS)
            smtp.sendmail(EMAIL_FROM, EMAIL_TO, msg.as_string())

        print(f"[Email] ✓ Sent '{subject}' → {EMAIL_TO}")

    except smtplib.SMTPAuthenticationError:
        print("[Email] ✗ Authentication failed.")
        print("[Email]   → Use a Gmail App Password, not your regular Gmail password.")
        print("[Email]   → Get one at: myaccount.google.com/apppasswords")
    except Exception as e:
        print(f"[Email] ✗ Error: {e}")


async def _send_email(subject: str, plain: str, html: str):
    """Async wrapper — offloads blocking SMTP to thread pool."""
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _send_email_sync, subject, plain, html)


# ── SOS email — sent when UNSAFE ─────────────────────────────────────
async def _send_sos_email(lat: float, lng: float, reasons: list, address: str = ""):
    maps_link  = f"https://www.google.com/maps?q={lat},{lng}"
    time_str   = datetime.now().strftime("%d %b %Y, %I:%M %p")
    loc_str    = address or f"{lat:.5f}, {lng:.5f}"
    reasons_ul = "".join(f"<li style='margin:6px 0'>{r}</li>" for r in reasons[:5])
    reasons_tx = "\n".join(f"  • {r}" for r in reasons[:5])

    plain = f"""
🚨 SAFETY ALERT 🚨  —  {time_str}

Someone may be in DANGER!

Location : {loc_str}
Maps link: {maps_link}

Risk factors:
{reasons_tx}

Please call police (100) immediately.

— AutoNex Women Safety System
"""

    html = f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:20px;font-family:Arial,sans-serif;background:#f3f4f6;">
<div style="max-width:580px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">

  <div style="background:#dc2626;padding:24px;text-align:center;">
    <div style="font-size:40px;">🚨</div>
    <h1 style="color:#fff;margin:8px 0 4px;font-size:24px;">SAFETY ALERT</h1>
    <p style="color:#fecaca;margin:0;font-size:14px;">{time_str}</p>
  </div>

  <div style="padding:24px;">

    <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:16px;border-radius:6px;margin-bottom:20px;">
      <strong style="color:#dc2626;font-size:16px;">Someone may be in DANGER!</strong>
      <p style="color:#6b7280;margin:6px 0 0;font-size:14px;">Please act immediately.</p>
    </div>

    <div style="margin-bottom:20px;">
      <h3 style="color:#111827;margin:0 0 8px;font-size:15px;">📍 Location</h3>
      <p style="color:#374151;margin:0 0 12px;font-size:14px;">{loc_str}</p>
      <a href="{maps_link}"
         style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">
        Open on Google Maps →
      </a>
    </div>

    <div style="background:#fffbeb;border:1px solid #fcd34d;padding:16px;border-radius:8px;margin-bottom:20px;">
      <h3 style="color:#92400e;margin:0 0 10px;font-size:15px;">⚠️ Risk factors detected</h3>
      <ul style="color:#374151;padding-left:20px;margin:0;font-size:14px;">{reasons_ul}</ul>
    </div>

    <div style="background:#dc2626;color:#fff;padding:16px;border-radius:8px;text-align:center;">
      <strong style="font-size:18px;">Call Police: 100 &nbsp;|&nbsp; Emergency: 112</strong>
    </div>

  </div>

  <div style="background:#f9fafb;padding:14px;text-align:center;border-top:1px solid #e5e7eb;">
    <p style="color:#9ca3af;font-size:12px;margin:0;">Sent automatically by AutoNex Women Safety System</p>
  </div>

</div>
</body>
</html>"""

    await _send_email("🚨 SAFETY ALERT — Someone may be in danger!", plain, html)


# ── Safe check-in email — sent when SAFE ─────────────────────────────
async def _send_safe_email(lat: float, lng: float, score: int, address: str = ""):
    maps_link = f"https://www.google.com/maps?q={lat},{lng}"
    time_str  = datetime.now().strftime("%d %b %Y, %I:%M %p")
    loc_str   = address or f"{lat:.5f}, {lng:.5f}"

    # Score color
    color = "#10b981" if score >= 70 else "#f59e0b" if score >= 50 else "#ef4444"

    plain = f"""
✅ Safe Check-in  —  {time_str}

All is well — Safety score: {score}/100

Location : {loc_str}
Maps link: {maps_link}

— AutoNex Women Safety System
"""

    html = f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:20px;font-family:Arial,sans-serif;background:#f3f4f6;">
<div style="max-width:580px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">

  <div style="background:#059669;padding:24px;text-align:center;">
    <div style="font-size:40px;">✅</div>
    <h1 style="color:#fff;margin:8px 0 4px;font-size:24px;">Safe Check-in</h1>
    <p style="color:#a7f3d0;margin:0;font-size:14px;">{time_str}</p>
  </div>

  <div style="padding:24px;">

    <div style="background:#f0fdf4;border-left:4px solid #10b981;padding:16px;border-radius:6px;margin-bottom:20px;display:flex;align-items:center;gap:16px;">
      <div style="font-size:48px;font-weight:bold;color:{color};">{score}</div>
      <div>
        <div style="color:#065f46;font-weight:bold;font-size:16px;">Safety Score</div>
        <div style="color:#6b7280;font-size:13px;">out of 100 — area is safe</div>
      </div>
    </div>

    <div style="margin-bottom:20px;">
      <h3 style="color:#111827;margin:0 0 8px;font-size:15px;">📍 Location</h3>
      <p style="color:#374151;margin:0 0 12px;font-size:14px;">{loc_str}</p>
      <a href="{maps_link}"
         style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">
        Open on Google Maps →
      </a>
    </div>

  </div>

  <div style="background:#f9fafb;padding:14px;text-align:center;border-top:1px solid #e5e7eb;">
    <p style="color:#9ca3af;font-size:12px;margin:0;">Sent automatically by AutoNex Women Safety System</p>
  </div>

</div>
</body>
</html>"""

    await _send_email(f"✅ Safe check-in — Score {score}/100", plain, html)


# ══════════════════════════════════════════════════════════════════════
# ROUTES — all unchanged from before
# ══════════════════════════════════════════════════════════════════════

@router.post("/check-safety")
async def check_safety(req: SafetyRequest):
    hour   = datetime.now().hour
    result = predict_risk(req.latitude, req.longitude, hour)

    if result["status"] == "UNSAFE":
        asyncio.create_task(
            _send_sos_email(req.latitude, req.longitude, result["reasons"])
        )

    return {
        "status":     result["status"],
        "score":      result["score"],
        "confidence": result["confidence"],
        "reasons":    result["reasons"],
        "features":   result["features"],
        "latitude":   req.latitude,
        "longitude":  req.longitude,
    }


@router.post("/log-checkin")
async def log_checkin(req: CheckinRequest):
    entry = {
        "lat":     req.lat,
        "lng":     req.lng,
        "status":  req.status,
        "score":   req.score,
        "address": req.address,
        "time":    req.time or datetime.now().isoformat(),
    }
    checkin_log.insert(0, entry)
    if len(checkin_log) > 100:
        checkin_log.pop()

    if req.status == "SAFE":
        asyncio.create_task(
            _send_safe_email(req.lat, req.lng, req.score, req.address)
        )

    return {"logged": True, "entry": entry}


@router.get("/checkin-history")
async def checkin_history():
    return {"history": checkin_log[:20]}


@router.post("/nearby-places")
async def nearby_places(req: SafetyRequest):
    if not GOOGLE_API_KEY:
        return {"places": [
            {"name": "City Hospital",  "type": "hospital", "distance": "—", "duration": "—", "open_now": True,  "lat": req.latitude, "lng": req.longitude},
            {"name": "Police Station", "type": "police",   "distance": "—", "duration": "—", "open_now": True,  "lat": req.latitude, "lng": req.longitude},
            {"name": "Metro Station",  "type": "metro",    "distance": "—", "duration": "—", "open_now": False, "lat": req.latitude, "lng": req.longitude},
        ]}
    targets = [
        ("hospital",       "hospital"),
        ("police",         "police"),
        ("subway_station", "metro"),
        ("shopping_mall",  "market"),
    ]
    places = []
    async with httpx.AsyncClient() as client:
        resps = await asyncio.gather(*[
            client.get(
                "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
                f"?location={req.latitude},{req.longitude}"
                f"&radius=3000&type={pt}&rankby=prominence&key={GOOGLE_API_KEY}",
                timeout=6,
            ) for pt, _ in targets
        ], return_exceptions=True)
    for (_, cat), resp in zip(targets, resps):
        if isinstance(resp, Exception):
            continue
        for p in resp.json().get("results", [])[:2]:
            geo  = p.get("geometry", {}).get("location", {})
            plat = geo.get("lat", req.latitude)
            plng = geo.get("lng", req.longitude)
            d    = _haversine(req.latitude, req.longitude, plat, plng)
            mins = max(1, int(d / 80))
            places.append({
                "name":     p.get("name", "Unknown"),
                "type":     cat,
                "distance": f"{int(d)} m" if d < 1000 else f"{d/1000:.1f} km",
                "duration": f"{mins} min",
                "open_now": p.get("opening_hours", {}).get("open_now", True),
                "lat": plat, "lng": plng,
            })
    places.sort(key=lambda x: float(x["distance"].split()[0]) *
                (1 if "m" in x["distance"] and "km" not in x["distance"] else 1000))
    return {"places": places[:6]}


@router.post("/safety/address")
async def get_address(req: SafetyRequest):
    if not GOOGLE_API_KEY:
        return {"address": f"{req.latitude:.4f}, {req.longitude:.4f}"}
    async with httpx.AsyncClient() as c:
        try:
            r   = await c.get(
                f"https://maps.googleapis.com/maps/api/geocode/json"
                f"?latlng={req.latitude},{req.longitude}&key={GOOGLE_API_KEY}",
                timeout=5,
            )
            res = r.json().get("results", [])
            return {"address": res[0]["formatted_address"] if res else f"{req.latitude:.4f}, {req.longitude:.4f}"}
        except Exception:
            return {"address": f"{req.latitude:.4f}, {req.longitude:.4f}"}


@router.post("/retrain")
async def retrain_model():
    return retrain()


def _haversine(a, b, c, d):
    R = 6371000
    p1, p2 = math.radians(a), math.radians(c)
    dp, dl = math.radians(c - a), math.radians(d - b)
    x = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return R * 2 * math.atan2(math.sqrt(x), math.sqrt(1 - x))