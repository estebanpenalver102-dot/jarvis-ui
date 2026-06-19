"use client";
import { useRef, useEffect, useState, useCallback } from "react";

// ✅ FIXED: Pointing to the correct JARVIS backend
const API_URL = "https://jarvis-api-fufo.onrender.com";

const MODES = ["JARVIS", "Research", "Voice", "Browser", "Code"];

function NeuralOrb({ size = 420, active = false }: { size?: number; active?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const cx = size / 2, cy = size / 2, r = 0.38 * size;
    const pts = Array.from({ length: 80 }, () => {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      return {
        x: r * Math.sin(phi) * Math.cos(theta),
        y: r * Math.sin(phi) * Math.sin(theta),
        z: r * Math.cos(phi),
        vx: (Math.random() - 0.5) * 0.003,
        vy: (Math.random() - 0.5) * 0.003,
        vz: (Math.random() - 0.5) * 0.003,
      };
    });
    let angle = 0, frame = 0, raf: number;
    const draw = () => {
      frame++;
      angle += active ? 0.006 : 0.003;
      canvas.width = size; canvas.height = size;
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.5);
      bg.addColorStop(0, "rgba(255,140,20,0.08)");
      bg.addColorStop(0.5, "rgba(180,80,10,0.03)");
      bg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const proj = pts.map(p => {
        const nx = p.x * cos - p.z * sin, nz = p.x * sin + p.z * cos;
        const scale = 400 / (400 + nz);
        return [cx + nx * scale, cy + p.y * scale, scale] as [number, number, number];
      });
      for (let i = 0; i < 80; i++) {
        for (let j = i + 1; j < 80; j++) {
          const [x1, y1, s1] = proj[i], [x2, y2, s2] = proj[j];
          const dist = Math.hypot(x1 - x2, y1 - y2);
          if (dist < 0.55 * r) {
            const avg = (s1 + s2) / 2;
            const alpha = (1 - dist / (0.55 * r)) * avg * 0.55;
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
            ctx.strokeStyle = `rgba(255,${130 + Math.floor(60 * avg)},${Math.floor(30 * avg)},${alpha})`;
            ctx.lineWidth = 0.6 * avg; ctx.stroke();
          }
        }
      }
      proj.forEach(([px, py, ps]) => {
        const glow = ctx.createRadialGradient(px, py, 0, px, py, 3 * 2.5 * ps);
        glow.addColorStop(0, `rgba(255,200,80,${0.9 * ps})`);
        glow.addColorStop(1, "rgba(255,120,20,0)");
        ctx.beginPath(); ctx.arc(px, py, 3 * 2.5 * ps, 0, Math.PI * 2);
        ctx.fillStyle = glow; ctx.fill();
        ctx.beginPath(); ctx.arc(px, py, 2.5 * ps, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,220,120,${ps})`; ctx.fill();
      });
      const pulse = 0.85 + 0.15 * Math.sin(0.04 * frame);
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, 0.35 * r * pulse);
      core.addColorStop(0, `rgba(255,200,80,${active ? 0.5 : 0.3})`);
      core.addColorStop(0.4, `rgba(255,120,30,${active ? 0.15 : 0.08})`);
      core.addColorStop(1, "rgba(255,80,0,0)");
      ctx.beginPath(); ctx.arc(cx, cy, 0.35 * r * pulse, 0, Math.PI * 2);
      ctx.fillStyle = core; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, 1.02 * r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,140,40,${0.06 + 0.02 * Math.sin(0.03 * frame)})`;
      ctx.lineWidth = 1; ctx.stroke();
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [size, active]);
  return <canvas ref={canvasRef} width={size} height={size} style={{ display: "block" }} />;
}

type Msg = { role: "user" | "assistant"; content: string; agent?: string; ts: number };

export default function JarvisUI() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const [mode, setMode] = useState("JARVIS");
  const [status, setStatus] = useState("Idle");
  const [recording, setRecording] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const historyRef = useRef<{ role: string; content: string }[]>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, thinking]);

  const send = useCallback(async (text: string) => {
    const msg = text.trim();
    if (!msg || thinking) return;
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    const userMsg: Msg = { role: "user", content: msg, ts: Date.now() };
    setMsgs(m => [...m, userMsg]);
    historyRef.current = [...historyRef.current, { role: "user", content: msg }];
    setThinking(true); setPulsing(true); setStatus("Processing…");
    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          conversation_history: historyRef.current.slice(-12),
          agent_preference: mode.toLowerCase(),
        }),
      });
      const data = await res.json();
      const reply = data.response || data.message || "…";
      const botMsg: Msg = { role: "assistant", content: reply, agent: data.agent_used || "JARVIS", ts: Date.now() };
      setMsgs(m => [...m, botMsg]);
      historyRef.current = [...historyRef.current, { role: "assistant", content: reply }];
      setStatus(data.agent_used ? `${data.agent_used} responded` : "Ready");
    } catch {
      setMsgs(m => [...m, { role: "assistant", content: "Connection error — is the API online?", ts: Date.now() }]);
      setStatus("Error");
    }
    setThinking(false); setPulsing(false);
  }, [thinking, mode]);

  const autoResize = () => {
    const el = textareaRef.current;
    if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 140) + "px"; }
  };

  const startRecord = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = e => chunksRef.current.push(e.data);
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const b64 = await new Promise<string>(r => {
          const fr = new FileReader();
          fr.onloadend = () => r((fr.result as string).split(",")[1]);
          fr.readAsDataURL(blob);
        });
        try {
          const res = await fetch(`${API_URL}/voice/transcribe`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ audio_b64: b64, mime_type: "audio/webm" }),
          });
          const data = await res.json();
          if (data.transcript) send(data.transcript);
        } catch {}
        stream.getTracks().forEach(t => t.stop());
      };
      rec.start(); mediaRef.current = rec; setRecording(true);
    } catch {}
  };

  const stopRecord = () => { mediaRef.current?.stop(); setRecording(false); };

  const [orbSize, setOrbSize] = useState(420);
  useEffect(() => {
    setOrbSize(Math.min(window.innerWidth * 0.55, 520));
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }
        .dot { animation: bounce 1.2s infinite; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .msg { animation: fadeUp 0.2s ease; }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(255,140,40,0.2);border-radius:2px}
      `}</style>

      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(180,80,10,0.07) 0%, transparent 70%)", pointerEvents: "none" }} />

      {(["tl","tr","bl","br"] as const).map(c => (
        <div key={c} style={{ position: "absolute", top: c[0]==="t"?16:undefined, bottom: c[0]==="b"?16:undefined, left: c[1]==="l"?16:undefined, right: c[1]==="r"?16:undefined, width: 32, height: 32, borderTop: c[0]==="t"?"1px solid rgba(255,140,40,0.3)":"none", borderBottom: c[0]==="b"?"1px solid rgba(255,140,40,0.3)":"none", borderLeft: c[1]==="l"?"1px solid rgba(255,140,40,0.3)":"none", borderRight: c[1]==="r"?"1px solid rgba(255,140,40,0.3)":"none", pointerEvents: "none" }} />
      ))}

      <div style={{ position: "relative", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ff9500", boxShadow: "0 0 8px #ff9500" }} />
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 3, color: "rgba(255,200,80,0.9)", textTransform: "uppercase" }}>JARVIS</span>
          <span style={{ fontSize: 10, color: "rgba(255,140,40,0.5)", letterSpacing: 1 }}>v2.0 · ONLINE</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {MODES.map(m => (
            <button key={m} onClick={() => setMode(m)} style={{ padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 500, cursor: "pointer", border: mode===m?"1px solid rgba(255,140,40,0.6)":"1px solid rgba(255,255,255,0.06)", background: mode===m?"rgba(255,120,20,0.12)":"transparent", color: mode===m?"rgba(255,180,60,0.95)":"rgba(255,255,255,0.35)", transition: "all 0.15s" }}>{m}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: 0.5 }}>{status}</span>
          <button onClick={() => setShowChat(v => !v)} style={{ padding: "4px 10px", borderRadius: 8, fontSize: 11, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>{showChat ? "Hide Chat" : "Show Chat"}</button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
          <div style={{ position: "relative" }}>
            <NeuralOrb size={orbSize} active={pulsing || recording} />
            <div style={{ position: "absolute", bottom: "18%", left: "50%", transform: "translateX(-50%)", textAlign: "center", pointerEvents: "none" }}>
              {thinking ? (
                <div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
                  {[0,1,2].map(i => <div key={i} className="dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,160,50,0.8)", animationDelay: `${0.2*i}s` }} />)}
                </div>
              ) : (
                <span style={{ fontSize: 11, color: "rgba(255,160,50,0.4)", letterSpacing: 2, textTransform: "uppercase" }}>{mode}</span>
              )}
            </div>
          </div>
        </div>

        {showChat && (
          <div style={{ width: 380, borderLeft: "1px solid rgba(255,140,40,0.08)", background: "rgba(8,5,0,0.85)", backdropFilter: "blur(16px)", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,140,40,0.08)", fontSize: 11, fontWeight: 600, color: "rgba(255,160,60,0.6)", letterSpacing: 2, textTransform: "uppercase" }}>Chat · {mode}</div>

            <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
              {msgs.length === 0 && (
                <div style={{ textAlign: "center", marginTop: 40 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>⬡</div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", lineHeight: 1.6 }}>JARVIS is ready.<br/>Type or speak to begin.</div>
                  <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 6 }}>
                    {["What can you do?", "Search the web for me", "Run a coding task"].map(p => (
                      <button key={p} onClick={() => send(p)} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(255,140,40,0.15)", background: "rgba(255,100,20,0.05)", color: "rgba(255,200,100,0.6)", fontSize: 12, cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor="rgba(255,140,40,0.4)")}
                        onMouseLeave={e => (e.currentTarget.style.borderColor="rgba(255,140,40,0.15)")}>{p}</button>
                    ))}
                  </div>
                </div>
              )}
              {msgs.map((m, i) => (
                <div key={i} className="msg" style={{ display: "flex", flexDirection: "column", alignItems: m.role==="user"?"flex-end":"flex-start" }}>
                  {m.role==="assistant" && m.agent && <span style={{ fontSize: 10, color: "rgba(255,140,40,0.5)", marginBottom: 3, letterSpacing: 1, textTransform: "uppercase" }}>{m.agent}</span>}
                  <div style={{ maxWidth: "88%", padding: "10px 14px", borderRadius: m.role==="user"?"14px 14px 4px 14px":"14px 14px 14px 4px", background: m.role==="user"?"rgba(255,120,20,0.2)":"rgba(255,255,255,0.04)", border: m.role==="user"?"1px solid rgba(255,120,20,0.35)":"1px solid rgba(255,255,255,0.07)", fontSize: 13, lineHeight: 1.65, color: m.role==="user"?"rgba(255,210,130,0.95)":"rgba(240,240,248,0.85)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.content}</div>
                </div>
              ))}
              {thinking && (
                <div className="msg" style={{ display: "flex", gap: 5, padding: "10px 14px" }}>
                  {[0,1,2].map(i => <div key={i} className="dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,140,50,0.7)", animationDelay: `${0.2*i}s` }} />)}
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div style={{ padding: 12, borderTop: "1px solid rgba(255,140,40,0.08)" }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, background: "rgba(255,100,20,0.05)", border: "1px solid rgba(255,140,40,0.15)", borderRadius: 14, padding: "8px 10px" }}>
                <textarea ref={textareaRef} value={input} onChange={e => { setInput(e.target.value); autoResize(); }}
                  onKeyDown={e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
                  placeholder={thinking ? "JARVIS is thinking…" : "Ask JARVIS anything…"}
                  disabled={thinking} rows={1}
                  style={{ flex: 1, background: "none", border: "none", outline: "none", resize: "none", color: "rgba(255,220,140,0.9)", fontSize: 13, lineHeight: 1.6, maxHeight: 140, fontFamily: "inherit", paddingTop: 2, caretColor: "#ff9500" }} />
                <button onMouseDown={startRecord} onMouseUp={stopRecord} onTouchStart={startRecord} onTouchEnd={stopRecord} disabled={thinking}
                  style={{ width: 36, height: 36, borderRadius: "50%", border: "none", cursor: "pointer", flexShrink: 0, background: recording?"rgba(255,80,80,0.3)":"rgba(255,100,20,0.08)", color: recording?"#ff6060":"rgba(255,160,60,0.6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, boxShadow: recording?"0 0 12px rgba(255,80,80,0.4)":"none", transition: "all 0.15s" }} title="Hold to talk">🎤</button>
                <button onClick={() => send(input)} disabled={!input.trim() || thinking}
                  style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(255,120,20,0.2)", cursor: input.trim()&&!thinking?"pointer":"default", flexShrink: 0, background: input.trim()&&!thinking?"rgba(255,120,20,0.3)":"rgba(255,255,255,0.04)", color: input.trim()&&!thinking?"rgba(255,200,80,0.9)":"rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, transition: "all 0.15s" }}>↑</button>
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.15)", textAlign: "center", marginTop: 6, letterSpacing: 0.5 }}>JARVIS · {API_URL.replace("https://","")}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
