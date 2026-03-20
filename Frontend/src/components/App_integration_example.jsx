// App.jsx — Example showing how to integrate ChatAgent into your existing AutoNex frontend
// This shows TWO options — pick whichever fits your current layout

// ═══════════════════════════════════════════════════════════════════
// OPTION A: Sidebar panel (ChatAgent lives in a right side panel)
// ═══════════════════════════════════════════════════════════════════

import { useState } from "react";
import Navbar       from "./components/Navbar";
import Sidebar      from "./components/Sidebar";
import BrowserView  from "./components/BrowserView";
import MemoryPanel  from "./components/MemoryPanel";
import ChatAgent    from "./components/ChatAgent";   // ← NEW
import "./App.css";

function App() {
  const [activePanel, setActivePanel] = useState("browser"); // "browser" | "memory" | "chat"

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: "#0a0c10" }}>

      {/* Left Sidebar — add a Chat button to your existing Sidebar component */}
      <Sidebar activePanel={activePanel} onPanelChange={setActivePanel} />

      {/* Main content area */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Browser view — always mounted so automation runs in background */}
        <div style={{
          flex:    activePanel === "browser" ? 1 : 0,
          overflow: "hidden",
          display: activePanel === "browser" ? "flex" : "none",
        }}>
          <BrowserView />
        </div>

        {/* Memory panel */}
        {activePanel === "memory" && (
          <div style={{ flex: 1, overflow: "hidden" }}>
            <MemoryPanel />
          </div>
        )}

        {/* ── NEW: Chat Agent panel ── */}
        {activePanel === "chat" && (
          <div style={{ flex: 1, overflow: "hidden" }}>
            <ChatAgent sessionId="main" />
          </div>
        )}

      </div>
    </div>
  );
}

export default App;


// ═══════════════════════════════════════════════════════════════════
// OPTION B: Split view — Browser on left, Chat on right
// ═══════════════════════════════════════════════════════════════════
/*
import BrowserView from "./components/BrowserView";
import ChatAgent   from "./components/ChatAgent";

function App() {
  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <div style={{ flex: 1 }}>
        <BrowserView />
      </div>
      <div style={{ width: "380px", borderLeft: "1px solid #1e2633" }}>
        <ChatAgent sessionId="main" />
      </div>
    </div>
  );
}
*/


// ═══════════════════════════════════════════════════════════════════
// SIDEBAR.JSX — Add a Chat nav item to your existing Sidebar
// Add this button alongside your existing nav items:
// ═══════════════════════════════════════════════════════════════════
/*
  <button
    onClick={() => onPanelChange("chat")}
    style={{
      background:   activePanel === "chat" ? "rgba(0,229,160,0.1)" : "transparent",
      border:       "none",
      borderRadius: "10px",
      padding:      "10px",
      color:        activePanel === "chat" ? "#00e5a0" : "#5a6478",
      cursor:       "pointer",
      display:      "flex",
      flexDirection:"column",
      alignItems:   "center",
      gap:          "4px",
      fontSize:     "10px",
      width:        "100%",
    }}
    title="AI Chat Agent"
  >
    🤖
    <span>Chat</span>
  </button>
*/