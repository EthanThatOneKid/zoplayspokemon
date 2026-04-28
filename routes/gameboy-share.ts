import { useEffect, useMemo, useState } from "react";

type InputEvent = {
  button: string;
  user: string;
  timestamp: number;
};

const BUTTONS = [
  { label: "UP", code: "2" },
  { label: "LEFT", code: "1" },
  { label: "RIGHT", code: "0" },
  { label: "DOWN", code: "3" },
  { label: "A", code: "4" },
  { label: "B", code: "5" },
  { label: "SELECT", code: "6" },
  { label: "START", code: "7" },
];

function buttonName(code: string): string {
  const map: Record<string, string> = {
    "0": "RIGHT", "1": "LEFT", "2": "UP", "3": "DOWN",
    "4": "A", "5": "B", "6": "SELECT", "7": "START",
  };
  return map[code] || code;
}

export default function GameboySharePage() {
  const [events, setEvents] = useState<InputEvent[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now());
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [tick, setTick] = useState<number>(Date.now());
  const user = useMemo(() => Math.random().toString(36).slice(2, 8), []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const res = await fetch("/api/gameboy-share-state", { headers: { Accept: "application/json" } });
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        setEvents(Array.isArray(data.events) ? data.events : []);
        setUpdatedAt(Number(data.updatedAt || Date.now()));
      } catch {}
    };
    load();
    const poll = setInterval(load, 1200);
    const refresh = setInterval(() => setTick(Date.now()), 1500);
    return () => { active = false; clearInterval(poll); clearInterval(refresh); };
  }, []);

  const press = async (code: string) => {
    if (busyCode) return;
    setError("");
    setBusyCode(code);
    try {
      const res = await fetch("/api/gameboy-share-input", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ button: code, user }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to send input");
      }
    } catch {
      setError("Network issue while sending input");
    } finally {
      setBusyCode(null);
    }
  };

  const imageUrl = `https://toy.cloudreve.org/image?t=${tick}`;

  return (
    <div className="min-h-screen bg-[#08110a] text-zinc-100">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-5">
          <h1 className="text-3xl font-bold tracking-tight">Shared Game Room</h1>
          <p className="text-zinc-400 mt-1">Everyone here controls the same running game session.</p>
          <p className="text-xs text-zinc-500 mt-2">Inspired by the Gameboy.Live style from HFO4 profile interactions.</p>
        </div>
        <div className="grid lg:grid-cols-[1.3fr_1fr] gap-5">
          <div className="bg-black/30 border border-emerald-900/60 rounded-2xl p-3">
            <img src={imageUrl} alt="Shared game screen" className="w-full rounded-xl border border-zinc-800 bg-black" loading="eager" />
            <div className="text-xs text-zinc-500 mt-2">Auto-refreshing screen feed</div>
          </div>
          <div className="space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">Controls</h2>
              <div className="grid grid-cols-2 gap-2 mt-3">
                {BUTTONS.map((b) => (
                  <button key={b.code} onClick={() => press(b.code)} disabled={Boolean(busyCode)}
                    className="px-3 py-2 rounded-lg border border-emerald-600/40 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50">
                    {busyCode === b.code ? "Sending..." : b.label}
                  </button>
                ))}
              </div>
              {error ? <p className="text-xs text-red-400 mt-3">{error}</p> : null}
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">Live Activity</h2>
              <p className="text-xs text-zinc-500 mt-1">Last update: {new Date(updatedAt).toLocaleTimeString()}</p>
              <div className="mt-3 max-h-64 overflow-auto space-y-1">
                {events.length === 0 ? <p className="text-sm text-zinc-500">No recent input yet.</p> :
                  events.map((e, i) => (
                    <div key={`${e.timestamp}-${i}`} className="text-sm text-zinc-300 flex justify-between gap-3 border-b border-white/5 pb-1">
                      <span>{buttonName(e.button)} by {e.user}</span>
                      <span className="text-zinc-500">{new Date(e.timestamp).toLocaleTimeString()}</span>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}