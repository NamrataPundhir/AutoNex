// Frontend/src/components/WomenSafety.jsx
// Complete Women Safety Component — with Emergency Contact Manager

import { useState, useRef, useEffect } from "react";

const API          = "http://localhost:8000";
const CONTACTS_KEY = "autonex_emergency_contacts";

const PLACE_ICONS  = { hospital: "🏥", police: "🚔", metro: "🚇", market: "🏪" };
const PLACE_COLORS = {
  hospital: "rgba(99,102,241,.15)", police: "rgba(16,185,129,.15)",
  metro:    "rgba(245,158,11,.15)", market: "rgba(239,68,68,.15)",
};

// ── Contact helpers ───────────────────────────────────────────────────
function loadContacts() {
  try { return JSON.parse(localStorage.getItem(CONTACTS_KEY) || "[]"); }
  catch { return []; }
}
function saveContacts(list) {
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(list));
}
function isValidPhone(p) {
  return /^[+]?[\d\s\-]{7,15}$/.test(p.trim());
}
function normalizePhone(p) {
  const digits = p.replace(/[\s\-]/g, "");
  if (/^\d{10}$/.test(digits)) return `+91${digits}`;   // Indian 10-digit
  return digits.startsWith("+") ? digits : `+${digits}`;
}

export default function WomenSafety() {
  const [screen,      setScreen]      = useState("home");
  const [score,       setScore]       = useState(null);
  const [reasons,     setReasons]     = useState([]);
  const [features,    setFeatures]    = useState(null);
  const [places,      setPlaces]      = useState([]);
  const [actions,     setActions]     = useState([false, false, false]);
  const [safeActions, setSafeActions] = useState([false, false, false]);
  const [loc,         setLoc]         = useState(null);
  const [address,     setAddress]     = useState("");
  const [error,       setError]       = useState("");
  const [countdown,   setCd]          = useState(120);
  const [deadline,    setDeadline]    = useState("");
  const [showDl,      setShowDl]      = useState(false);
  const [dlAlert,     setDlAlert]     = useState(false);
  const [fakeCall,    setFakeCall]    = useState(false);
  const [callSecs,    setCallSecs]    = useState(0);
  const [checkins,    setCheckins]    = useState([]);
  const [shareLink,   setShareLink]   = useState("");

  // ── Contact state ─────────────────────────────────────────────────
  const [contacts,     setContacts]     = useState(loadContacts);
  const [showContacts, setShowContacts] = useState(false);
  const [newName,      setNewName]      = useState("");
  const [newPhone,     setNewPhone]     = useState("");
  const [phoneErr,     setPhoneErr]     = useState("");
  const [saved,        setSaved]        = useState(false);

  const iRef = useRef(null);
  const tRef = useRef(null);
  const dRef = useRef(null);
  const cRef = useRef(null);

  useEffect(() => () => {
    clearInterval(iRef.current);
    clearInterval(tRef.current);
    clearInterval(dRef.current);
    clearInterval(cRef.current);
  }, []);

  // ── Contact CRUD ──────────────────────────────────────────────────
  const addContact = () => {
    setPhoneErr("");
    if (!newName.trim())        { setPhoneErr("Enter a name"); return; }
    if (!isValidPhone(newPhone)){ setPhoneErr("Enter a valid phone number (7–15 digits)"); return; }
    const c = { id: Date.now(), name: newName.trim(), phone: normalizePhone(newPhone) };
    const updated = [...contacts, c];
    setContacts(updated);
    saveContacts(updated);
    setNewName(""); setNewPhone("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const removeContact = (id) => {
    const updated = contacts.filter(c => c.id !== id);
    setContacts(updated); saveContacts(updated);
  };

  // ── WhatsApp sender — uses saved contacts ─────────────────────────
  const sendWhatsApp = (message) => {
    const encoded = encodeURIComponent(message);
    if (contacts.length === 0) {
      window.open(`https://wa.me/?text=${encoded}`, "_blank");
    } else {
      contacts.forEach((c, i) =>
        setTimeout(() =>
          window.open(`https://wa.me/${c.phone.replace(/[^\d+]/g, "")}?text=${encoded}`, "_blank"),
          i * 400
        )
      );
    }
  };

  // ── Contact Manager panel ─────────────────────────────────────────
  const ContactPanel = () => (
    <div>
      {/* Saved list */}
      {contacts.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", textAlign: "center", padding: "10px 0 12px" }}>
          No contacts yet — add one below.
        </p>
      ) : (
        <div style={{ marginBottom: 12 }}>
          {contacts.map(c => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, marginBottom: 6 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(99,102,241,.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>👤</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>{c.phone}</div>
              </div>
              <button onClick={() => removeContact(c.id)}
                style={{ padding: "3px 9px", borderRadius: 7, border: "0.5px solid rgba(239,68,68,.3)", background: "rgba(239,68,68,.06)", color: "#ef4444", fontSize: 11, cursor: "pointer" }}>
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      <div style={{ background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "12px 12px 10px" }}>
        <p style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".1em", color: "var(--color-text-tertiary)", margin: "0 0 10px" }}>Add contact</p>

        <input type="text" placeholder="Name  (e.g. Mom)" value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addContact()}
          style={{ display: "block", width: "100%", padding: "8px 11px", borderRadius: 8, border: `0.5px solid ${phoneErr && !newName ? "rgba(239,68,68,.5)" : "var(--color-border-secondary)"}`, background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 13, outline: "none", marginBottom: 8, boxSizing: "border-box" }} />

        <div style={{ display: "flex", gap: 8 }}>
          <input type="tel" placeholder="+91XXXXXXXXXX" value={newPhone}
            onChange={e => { setNewPhone(e.target.value); setPhoneErr(""); }}
            onKeyDown={e => e.key === "Enter" && addContact()}
            style={{ flex: 1, padding: "8px 11px", borderRadius: 8, border: `0.5px solid ${phoneErr ? "rgba(239,68,68,.5)" : "var(--color-border-secondary)"}`, background: "var(--color-background-primary)", color: "var(--color-text-primary)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          <button onClick={addContact}
            style={{ padding: "8px 16px", borderRadius: 8, background: saved ? "#10b981" : "#6366f1", color: "#fff", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "background .3s", flexShrink: 0 }}>
            {saved ? "✓" : "+ Add"}
          </button>
        </div>

        {phoneErr && <p style={{ fontSize: 11, color: "#ef4444", margin: "6px 0 0" }}>⚠ {phoneErr}</p>}
        <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "8px 0 0", lineHeight: 1.5 }}>
          WhatsApp SOS & safe check-ins will be sent to all saved contacts automatically.
        </p>
      </div>
    </div>
  );

  // ── Contact toggle button (reused on all screens) ─────────────────
  const ContactToggle = ({ danger = false }) => (
    <div style={{ marginBottom: 10 }}>
      <button onClick={() => setShowContacts(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 13px", borderRadius: 10, border: `0.5px solid ${danger ? "rgba(239,68,68,.3)" : "var(--color-border-secondary)"}`, background: danger && contacts.length === 0 ? "rgba(239,68,68,.04)" : "var(--color-background-secondary)", cursor: "pointer", fontSize: 13, color: "var(--color-text-primary)" }}>
        <span>👥</span>
        <span style={{ flex: 1, textAlign: "left", fontSize: 13 }}>
          {contacts.length === 0
            ? (danger ? "⚠ No contacts saved — add one now" : "Add emergency contacts")
            : `Emergency contacts (${contacts.length})`}
        </span>
        {contacts.length > 0 && (
          <span style={{ padding: "1px 7px", borderRadius: 99, background: "#6366f1", color: "#fff", fontSize: 10, fontWeight: 700 }}>{contacts.length}</span>
        )}
        <span style={{ color: "var(--color-text-tertiary)", fontSize: 11, transform: showContacts ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▾</span>
      </button>
      {showContacts && <div style={{ paddingTop: 10 }}><ContactPanel /></div>}
    </div>
  );

  const startTick = (secs = 120) => {
    clearInterval(tRef.current); setCd(secs);
    tRef.current = setInterval(() => setCd(c => c <= 1 ? secs : c - 1), 1000);
  };

  const getGPS = () => new Promise((res, rej) =>
    navigator.geolocation
      ? navigator.geolocation.getCurrentPosition(
          p => res({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => rej("Location permission denied")
        )
      : rej("Geolocation not supported")
  );

  const post = (path, body) =>
    fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(r => r.json());

  const handleEmergency = async () => {
    setScreen("checking"); setError("");
    try {
      const coords = await getGPS();
      setLoc(coords);
      const [safetyData, addrData, placesData] = await Promise.all([
        post("/check-safety",   { latitude: coords.lat, longitude: coords.lng }),
        post("/safety/address", { latitude: coords.lat, longitude: coords.lng }),
        post("/nearby-places",  { latitude: coords.lat, longitude: coords.lng }),
      ]);
      setScore(safetyData.score);
      setReasons(safetyData.reasons || []);
      setFeatures(safetyData.features || null);
      setAddress(addrData.address || "");
      setPlaces(placesData.places || []);
      setShareLink(`https://maps.google.com/?q=${coords.lat},${coords.lng}`);

      if (safetyData.status === "UNSAFE") {
        setScreen("unsafe"); setActions([false, false, false]);
        triggerUnsafeAutomation(coords.lat, coords.lng);
        setTimeout(() => setActions([true, false, false]), 800);
        setTimeout(() => setActions([true, true,  false]), 1600);
        setTimeout(() => setActions([true, true,  true]),  2400);
      } else {
        setScreen("safe"); setSafeActions([false, false, false]);
        triggerSafeAutomation(coords.lat, coords.lng, safetyData.score);
        setTimeout(() => setSafeActions([true, false, false]), 600);
        setTimeout(() => setSafeActions([true, true,  false]), 1200);
        setTimeout(() => setSafeActions([true, true,  true]),  1800);
        logCheckin(coords.lat, coords.lng, safetyData.score, addrData.address);
      }
      iRef.current = setInterval(() => recheck(coords), 120000);
      startTick(120);
    } catch (e) { setError(String(e)); setScreen("home"); }
  };

  const triggerSafeAutomation = (lat, lng, safeScore) => {
    const mapsLink = `https://maps.google.com/?q=${lat},${lng}`;
    sendWhatsApp(`✅ I am safe!\nLocation: ${mapsLink}\nSafety score: ${safeScore}/100`);
    navigator.clipboard?.writeText(mapsLink).catch(() => {});
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine"; osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
    } catch (_) {}
  };

  const logCheckin = async (lat, lng, safeScore, addr) => {
    const entry = { lat, lng, status: "SAFE", score: safeScore, address: addr, time: new Date().toISOString() };
    try { await post("/log-checkin", entry); } catch (_) {}
    setCheckins(prev => [entry, ...prev].slice(0, 10));
  };

  const startDeadlineWatch = (dl) => {
    clearInterval(dRef.current);
    dRef.current = setInterval(() => {
      const now = new Date(); const [h, m] = dl.split(":").map(Number);
      const target = new Date(); target.setHours(h, m, 0, 0);
      if (now >= target) { clearInterval(dRef.current); setDlAlert(true); if (loc) triggerUnsafeAutomation(loc.lat, loc.lng); }
    }, 30000);
  };

  const triggerUnsafeAutomation = (lat, lng) => {
    const mapsLink = `https://maps.google.com/?q=${lat},${lng}`;
    sendWhatsApp(`🚨 I AM IN DANGER!\nLocation: ${mapsLink}\nPlease call police (100) immediately!`);
    window.open(`https://www.google.com/maps/search/police+station/@${lat},${lng},15z`, "_blank");
    triggerAlarm();
  };

  const triggerAlarm = () => {
    const audio = new Audio("/alarm.mp3"); audio.volume = 1.0;
    audio.play().catch(() => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        for (let i = 0; i < 6; i++) {
          const osc = ctx.createOscillator(); const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination); osc.type = "sawtooth";
          osc.frequency.setValueAtTime(i % 2 === 0 ? 880 : 1100, ctx.currentTime + i * 0.45);
          gain.gain.setValueAtTime(0.8, ctx.currentTime + i * 0.45);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.45 + 0.4);
          osc.start(ctx.currentTime + i * 0.45); osc.stop(ctx.currentTime + i * 0.45 + 0.4);
        }
      } catch (_) {}
    });
  };

  const startFakeCall = () => { setFakeCall(true); setCallSecs(0); cRef.current = setInterval(() => setCallSecs(s => s + 1), 1000); };
  const endFakeCall   = () => { setFakeCall(false); clearInterval(cRef.current); };
  const fmtTime = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const recheck = async (coords) => {
    try {
      const data = await post("/check-safety", { latitude: coords.lat, longitude: coords.lng });
      setScore(data.score); setReasons(data.reasons || []);
      if (data.status === "UNSAFE") {
        setScreen("unsafe"); setActions([false, false, false]);
        triggerUnsafeAutomation(coords.lat, coords.lng);
        setTimeout(() => setActions([true, false, false]), 800);
        setTimeout(() => setActions([true, true,  false]), 1600);
        setTimeout(() => setActions([true, true,  true]),  2400);
      } else { setScreen("safe"); logCheckin(coords.lat, coords.lng, data.score, address); }
      startTick(120);
    } catch (_) {}
  };

  const stopAll = () => {
    clearInterval(iRef.current); clearInterval(tRef.current);
    clearInterval(dRef.current); clearInterval(cRef.current);
    setScreen("home"); setActions([false, false, false]);
    setSafeActions([false, false, false]); setFakeCall(false); setDlAlert(false);
  };

  const openMaps = (place) => {
    if (!loc) return;
    window.open(`https://www.google.com/maps/dir/${loc.lat},${loc.lng}/${place.lat},${place.lng}`, "_blank");
  };

  const scoreColor = s => s >= 70 ? "#10b981" : s >= 50 ? "#f59e0b" : "#ef4444";

  const card = (extra = {}) => ({
    background: "var(--color-background-primary)",
    border: "0.5px solid var(--color-border-tertiary)",
    borderRadius: 12, padding: "12px 16px", marginBottom: 10, ...extra,
  });
  const btnMain = (bg, shadow) => ({
    display: "block", width: "100%", padding: 14, borderRadius: 12,
    fontSize: 15, fontWeight: 600, border: "none", cursor: "pointer",
    color: "#fff", background: bg, boxShadow: shadow,
    transition: "opacity .15s, transform .1s", marginBottom: 10,
  });
  const sectionLabel = {
    fontSize: 10, fontWeight: 600, letterSpacing: ".12em",
    textTransform: "uppercase", color: "var(--color-text-tertiary)",
    marginBottom: 10, marginTop: 20,
  };

  const SAFE_ACTIONS = [
    { icon: "📱", label: '"I am safe" WhatsApp sent',   done: contacts.length > 0 ? `Sent to ${contacts.length} contact${contacts.length > 1 ? "s" : ""}` : "WhatsApp share opened", pending: "Opening WhatsApp…" },
    { icon: "📡", label: "Live location link generated", done: "Link copied to clipboard",   pending: "Generating link…"  },
    { icon: "📋", label: "Check-in logged",              done: "Saved to your history",       pending: "Logging check-in…" },
  ];
  const UNSAFE_ACTIONS = [
    { icon: "📱", label: "WhatsApp SOS sent",     done: contacts.length > 0 ? `SOS sent to ${contacts.length} contact${contacts.length > 1 ? "s" : ""}` : "SOS delivered", pending: "Opening WhatsApp…"       },
    { icon: "🚔", label: "Nearest police opened", done: "Google Maps opened",               pending: "Finding police station…" },
    { icon: "🔔", label: "Alarm triggered",       done: "Audio alarm activated",            pending: "Activating alarm…"       },
  ];
  const FEAT_META = {
    is_night:        { label: "Night time",      warn: v => v === 1 },
    is_late_night:   { label: "Late night",      warn: v => v === 1 },
    is_weekend:      { label: "Weekend",         warn: v => v === 1 },
    weapon_severity: { label: "Weapon severity", warn: v => v >= 3  },
    crime_severity:  { label: "Crime severity",  warn: v => v >= 2.5},
    domain_severity: { label: "Domain severity", warn: v => v >= 3  },
    city_density:    { label: "City density",    warn: v => v > 1000},
  };

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "28px 24px 56px", fontFamily: "'DM Sans',system-ui,sans-serif" }}>

      {/* ══ HOME ════════════════════════════════════════════════════ */}
      {screen === "home" && (
        <div style={{ animation: "raUp .2s ease" }}>
          <div style={{ textAlign: "center", padding: "1.5rem 0 2rem" }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(239,68,68,.1)", border: "0.5px solid rgba(239,68,68,.25)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30, margin: "0 auto 1.25rem" }}>🛡️</div>
            <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Women Safety Guard</h2>
            <p style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.7, maxWidth: 320, margin: "0 auto" }}>
              ML-powered area check using your crime dataset. Automates help whether you are safe or in danger.
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginBottom: 24 }}>
            {["🤖 Random Forest", "📱 WhatsApp alerts", "🔔 Alarm", "📡 Live location", "⏰ Arrival deadline"].map(f => (
              <span key={f} style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", fontSize: 11, fontWeight: 500, borderRadius: 99, background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", color: "var(--color-text-secondary)" }}>{f}</span>
            ))}
          </div>

          {error && <div style={{ background: "rgba(239,68,68,.08)", border: "0.5px solid rgba(239,68,68,.3)", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "var(--color-text-danger)" }}>⚠ {error}</div>}

          <button onClick={handleEmergency} style={btnMain("linear-gradient(135deg,#ef4444,#be123c)", "0 2px 20px rgba(239,68,68,.4)")}>
            🚨 Check my safety now
          </button>
          <button
            onClick={() => { setScreen("safe"); setScore(85); setSafeActions([false,false,false]); triggerSafeAutomation(0, 0, 85); setTimeout(()=>setSafeActions([true,false,false]),600); setTimeout(()=>setSafeActions([true,true,false]),1200); setTimeout(()=>setSafeActions([true,true,true]),1800); startTick(120); }}
            style={{ display: "block", width: "100%", padding: 12, borderRadius: 12, background: "transparent", border: "0.5px solid var(--color-border-secondary)", color: "var(--color-text-secondary)", fontSize: 14, cursor: "pointer", marginBottom: 10 }}>
            ✅ I am safe — start background tracking
          </button>

          {/* ── EMERGENCY CONTACTS ──────────────────────────────── */}
          <ContactToggle />

          {checkins.length > 0 && (
            <>
              <p style={{ ...sectionLabel, marginTop: 24 }}>Recent check-ins</p>
              <div style={card()}>
                {checkins.slice(0, 5).map((c, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: i < 4 ? "0.5px solid var(--color-border-tertiary)" : "none", color: "var(--color-text-secondary)" }}>
                    <span>✅ Safe — score {c.score}</span>
                    <span style={{ color: "var(--color-text-tertiary)", fontSize: 11 }}>{new Date(c.time).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ background: "rgba(99,102,241,.06)", border: "0.5px solid rgba(99,102,241,.2)", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "var(--color-text-secondary)", lineHeight: 1.65, fontStyle: "italic", marginTop: 20 }}>
            🤖 Powered by Random Forest trained on crime_dataset_india.csv. Location is never stored on our servers.
          </div>
        </div>
      )}

      {/* ══ CHECKING ════════════════════════════════════════════════ */}
      {screen === "checking" && (
        <div style={{ textAlign: "center", padding: "3rem 0", animation: "raUp .2s ease" }}>
          <div style={{ width: 52, height: 52, border: "3px solid var(--color-border-tertiary)", borderTopColor: "#ef4444", borderRadius: "50%", margin: "0 auto 1.5rem", animation: "raSpin .7s linear infinite" }} />
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>Analysing your area…</h3>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Random Forest model running</p>
        </div>
      )}

      {/* ══ SAFE ════════════════════════════════════════════════════ */}
      {screen === "safe" && (
        <div style={{ animation: "raUp .2s ease" }}>
          <div style={{ background: "rgba(16,185,129,.06)", border: "0.5px solid rgba(16,185,129,.3)", borderRadius: 12, padding: "14px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 28 }}>🟢</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: "#085041" }}>Area is safe</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>{address || "Your current location"}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: scoreColor(score || 85), lineHeight: 1 }}>{score || 85}</div>
              <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>/100</div>
            </div>
          </div>

          <p style={sectionLabel}>Automated actions taken</p>
          {SAFE_ACTIONS.map((a, i) => (
            <div key={i} style={{ ...card({ background: safeActions[i] ? "rgba(16,185,129,.05)" : "var(--color-background-secondary)", borderColor: safeActions[i] ? "rgba(16,185,129,.35)" : "var(--color-border-tertiary)" }), display: "flex", alignItems: "center", gap: 12, transition: "all 0.4s ease" }}>
              <span style={{ fontSize: 22 }}>{a.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{a.label}</div>
                <div style={{ fontSize: 12, marginTop: 2, color: safeActions[i] ? "#10b981" : "var(--color-text-tertiary)", fontWeight: safeActions[i] ? 500 : 400 }}>{safeActions[i] ? a.done : a.pending}</div>
              </div>
              {safeActions[i] ? <span style={{ color: "#10b981", fontSize: 16 }}>✓</span> : <div style={{ width: 14, height: 14, border: "2px solid var(--color-border-tertiary)", borderTopColor: "#6366f1", borderRadius: "50%", animation: "raSpin .7s linear infinite" }} />}
            </div>
          ))}

          {/* Contacts toggle */}
          <ContactToggle />

          {shareLink && (
            <div style={{ ...card(), display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>📡</span>
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 2 }}>Live location link</div>
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shareLink}</div>
              </div>
              <button onClick={() => navigator.clipboard?.writeText(shareLink)}
                style={{ fontSize: 11, padding: "5px 10px", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", cursor: "pointer" }}>Copy</button>
            </div>
          )}

          <p style={sectionLabel}>Arrival deadline</p>
          {!showDl ? (
            <button onClick={() => setShowDl(true)} style={{ display: "block", width: "100%", padding: "10px", borderRadius: 10, border: "0.5px dashed var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", fontSize: 13, cursor: "pointer" }}>
              ⏰ Set expected arrival time — auto-SOS if missed
            </button>
          ) : (
            <div style={{ ...card(), display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 20 }}>⏰</span>
              <input type="time" value={deadline} onChange={e => setDeadline(e.target.value)}
                style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: 13, outline: "none" }} />
              <button onClick={() => { if (deadline) { startDeadlineWatch(deadline); setShowDl(false); } }}
                style={{ padding: "8px 14px", borderRadius: 8, background: "#6366f1", color: "#fff", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>Set</button>
              <button onClick={() => setShowDl(false)}
                style={{ padding: "8px", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", fontSize: 13, cursor: "pointer" }}>✕</button>
            </div>
          )}
          {dlAlert && <div style={{ background: "rgba(239,68,68,.08)", border: "0.5px solid rgba(239,68,68,.35)", borderRadius: 10, padding: "12px 16px", marginTop: 10, fontSize: 13, color: "var(--color-text-danger)" }}>⚠ Arrival deadline passed — SOS sent to your contacts!</div>}

          {places.length > 0 && (
            <>
              <p style={sectionLabel}>Nearby safe places</p>
              {places.slice(0, 3).map((p, i) => (
                <div key={i} onClick={() => openMaps(p)} style={{ ...card(), display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "var(--color-border-secondary)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border-tertiary)"}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: PLACE_COLORS[p.type] || "var(--color-background-secondary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{PLACE_ICONS[p.type] || "📍"}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 2 }}>{p.distance} · {p.duration} walk</div>
                  </div>
                  <span style={{ color: "var(--color-text-tertiary)" }}>→</span>
                </div>
              ))}
            </>
          )}

          <div style={{ textAlign: "center", marginTop: 24 }}>
            <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>Re-checking area in {countdown}s</p>
            <div style={{ height: 2, background: "var(--color-border-tertiary)", borderRadius: 2, overflow: "hidden", maxWidth: 240, margin: "0 auto" }}>
              <div style={{ height: "100%", background: "#10b981", borderRadius: 2, width: `${((120 - countdown) / 120) * 100}%`, transition: "width 1s linear" }} />
            </div>
          </div>
          <button onClick={stopAll} style={{ display: "block", width: "100%", padding: 12, borderRadius: 12, background: "transparent", border: "0.5px solid var(--color-border-secondary)", color: "var(--color-text-secondary)", fontSize: 14, cursor: "pointer", marginTop: 20 }}>Stop tracking</button>
        </div>
      )}

      {/* ══ UNSAFE ══════════════════════════════════════════════════ */}
      {screen === "unsafe" && (
        <div style={{ animation: "raUp .2s ease" }}>
          <div style={{ background: "linear-gradient(90deg,rgba(239,68,68,.1),rgba(239,68,68,.04))", border: "0.5px solid rgba(239,68,68,.3)", borderRadius: 12, padding: "14px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 24 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: "var(--color-text-danger)" }}>Unsafe area detected</div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 3 }}>{address || "Your current location"}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#ef4444", lineHeight: 1 }}>{score}</div>
              <div style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>/100</div>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", fontSize: 11, fontWeight: 500, borderRadius: 99, background: "rgba(239,68,68,.15)", color: "var(--color-text-danger)", animation: "raPulse 1.4s ease-in-out infinite" }}>LIVE</span>
          </div>

          {reasons.length > 0 && (
            <>
              <p style={sectionLabel}>Why the model flagged this</p>
              <div style={card()}>
                {reasons.map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: "var(--color-text-secondary)", padding: "5px 0", borderBottom: i < reasons.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none" }}>
                    <span style={{ color: "#ef4444", flexShrink: 0 }}>▸</span>{r}
                  </div>
                ))}
              </div>
            </>
          )}

          {features && (
            <>
              <p style={sectionLabel}>Crime feature breakdown</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                {Object.entries(FEAT_META).map(([key, meta]) => {
                  const val = features[key]; if (val === undefined) return null;
                  const bad = meta.warn(val);
                  return (
                    <div key={key} style={{ background: bad ? "rgba(239,68,68,.05)" : "var(--color-background-secondary)", border: `0.5px solid ${bad ? "rgba(239,68,68,.3)" : "var(--color-border-tertiary)"}`, borderRadius: 10, padding: "10px 14px" }}>
                      <div style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 4 }}>{meta.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 600, color: bad ? "#ef4444" : "var(--color-text-primary)" }}>
                        {key.startsWith("is_") ? (val ? "Yes" : "No") : val}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <p style={sectionLabel}>Automated actions taken</p>
          {UNSAFE_ACTIONS.map((a, i) => (
            <div key={i} style={{ ...card({ background: actions[i] ? "rgba(16,185,129,.05)" : "var(--color-background-secondary)", borderColor: actions[i] ? "rgba(16,185,129,.35)" : "var(--color-border-tertiary)" }), display: "flex", alignItems: "center", gap: 12, transition: "all 0.4s ease" }}>
              <span style={{ fontSize: 22 }}>{a.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{a.label}</div>
                <div style={{ fontSize: 12, marginTop: 2, color: actions[i] ? "#10b981" : "var(--color-text-tertiary)", fontWeight: actions[i] ? 500 : 400 }}>{actions[i] ? a.done : a.pending}</div>
              </div>
              {actions[i] ? <span style={{ color: "#10b981", fontSize: 16 }}>✓</span> : <div style={{ width: 14, height: 14, border: "2px solid var(--color-border-tertiary)", borderTopColor: "#ef4444", borderRadius: "50%", animation: "raSpin .7s linear infinite" }} />}
            </div>
          ))}

          {/* Contacts — show as warning if empty during UNSAFE */}
          <ContactToggle danger />

          <p style={sectionLabel}>Extra safety tools</p>
          <button onClick={startFakeCall} style={{ ...card(), display: "flex", alignItems: "center", gap: 10, width: "100%", cursor: "pointer", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)" }}>
            <span style={{ fontSize: 22 }}>📞</span>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>Fake incoming call</div>
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 1 }}>Simulates a call — pretend to be talking</div>
            </div>
          </button>
          <button onClick={triggerAlarm} style={{ ...card({ background: "rgba(239,68,68,.05)", borderColor: "rgba(239,68,68,.3)" }), display: "flex", alignItems: "center", gap: 10, width: "100%", cursor: "pointer" }}>
            <span style={{ fontSize: 22 }}>🔔</span>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-danger)" }}>Sound alarm again</div>
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 1 }}>Re-trigger loud alarm sound</div>
            </div>
          </button>

          {places.length > 0 && (
            <>
              <p style={sectionLabel}>Nearest safe places</p>
              {places.map((p, i) => (
                <div key={i} onClick={() => openMaps(p)} style={{ ...card(), display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "var(--color-border-secondary)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "var(--color-border-tertiary)"}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: PLACE_COLORS[p.type] || "var(--color-background-secondary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{PLACE_ICONS[p.type] || "📍"}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 2 }}>{p.distance} · {p.duration} walk</div>
                  </div>
                  {p.open_now && <span style={{ display: "inline-flex", padding: "3px 10px", fontSize: 10, fontWeight: 500, borderRadius: 99, background: "rgba(16,185,129,.1)", color: "#10b981" }}>Open</span>}
                  <span style={{ color: "var(--color-text-tertiary)" }}>→</span>
                </div>
              ))}
            </>
          )}

          <div style={{ textAlign: "center", marginTop: 16 }}>
            <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", marginBottom: 6 }}>Re-checking in {countdown}s</p>
            <div style={{ height: 2, background: "var(--color-border-tertiary)", borderRadius: 2, overflow: "hidden", maxWidth: 240, margin: "0 auto" }}>
              <div style={{ height: "100%", background: "#ef4444", borderRadius: 2, width: `${((120 - countdown) / 120) * 100}%`, transition: "width 1s linear" }} />
            </div>
          </div>
          <button onClick={stopAll} style={{ ...btnMain("linear-gradient(135deg,#10b981,#059669)", "0 2px 16px rgba(16,185,129,.3)"), marginTop: 20 }}>
            ✓ I am safe now — stop all alerts
          </button>
        </div>
      )}

      {/* ══ FAKE CALL OVERLAY ════════════════════════════════════════ */}
      {fakeCall && (
        <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", animation: "raFadeIn .2s ease" }}>
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(99,102,241,.2)", border: "2px solid rgba(99,102,241,.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, marginBottom: 16, animation: "raPulse 1.4s ease-in-out infinite" }}>👤</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: "#fff", marginBottom: 6 }}>Mom</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,.5)", marginBottom: 4 }}>Incoming call…</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.4)", marginBottom: 40, fontFamily: "monospace" }}>{fmtTime(callSecs)}</div>
          <div style={{ display: "flex", gap: 40 }}>
            <button onClick={endFakeCall} style={{ width: 64, height: 64, borderRadius: "50%", background: "#ef4444", border: "none", cursor: "pointer", fontSize: 26 }}>📵</button>
            <button onClick={() => setCallSecs(0)} style={{ width: 64, height: 64, borderRadius: "50%", background: "#10b981", border: "none", cursor: "pointer", fontSize: 26 }}>📞</button>
          </div>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,.3)", marginTop: 32 }}>Simulated call for your safety</p>
        </div>
      )}

    </div>
  );
}