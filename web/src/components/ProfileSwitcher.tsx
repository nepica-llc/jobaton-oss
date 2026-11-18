import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { api, getActiveProfile, switchProfile } from "@/lib/api";

type Mode = "list" | "new" | "rename" | "reset" | "delete";
type Profile = { id: string; name: string };

const initials = (name: string) => name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";

// Same profile always gets the same colour.
const HUES = ["#028FA2", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#2563eb", "#ca8a04"];
const colorFor = (id: string) => HUES[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];

function Avatar({ p, size = 22 }: { p: Profile; size?: number }) {
  return (
    <span aria-hidden="true" className="inline-flex items-center justify-center rounded-full font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.42, background: colorFor(p.id), color: "#fff" }}>
      {initials(p.name)}
    </span>
  );
}

export default function ProfileSwitcher() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("list");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const active = getActiveProfile();

  useEffect(() => {
    api.getProfiles().then((list) => {
      // The selected profile was deleted (e.g. in another tab): fall back to the default one.
      if (!list.some((p) => p.id === active)) switchProfile("default");
      else setProfiles(list);
    }).catch(() => {});
  }, [active]);

  const close = () => { setOpen(false); setMode("list"); setError(""); triggerRef.current?.focus(); };

  // Close on outside click and Esc (Esc first backs out of a form or confirmation).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) { setOpen(false); setMode("list"); setError(""); } };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { if (mode !== "list") { setMode("list"); setError(""); } else close(); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open, mode]);

  const current = profiles.find((p) => p.id === active);
  if (!current) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try { await fn(); } catch (err: any) { setError(err.message || "Something went wrong"); } finally { setBusy(false); }
  };

  const submitName = () => run(async () => {
    const value = name.trim();
    if (!value) return;
    if (mode === "new") {
      switchProfile((await api.createProfile(value)).id);
    } else if (value !== current.name) {
      await api.renameProfile(current.id, value);
      setProfiles(profiles.map((p) => (p.id === current.id ? { ...p, name: value } : p)));
      close();
    } else close();
  });

  const C = { panel: "#17191e", border: "rgba(255,255,255,0.1)", text: "#f3f4f6", muted: "#8b8f98", hover: "rgba(255,255,255,0.06)", input: "rgba(255,255,255,0.05)" };
  const item = "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left text-[0.8rem] transition-colors";
  const hoverOn = (e: React.SyntheticEvent<HTMLElement>) => { e.currentTarget.style.background = C.hover; };
  const hoverOff = (e: React.SyntheticEvent<HTMLElement>) => { e.currentTarget.style.background = "transparent"; };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch profile"
        className="flex items-center gap-2 rounded-full pl-1 pr-2.5 py-1 text-[0.8rem] font-medium transition-colors"
        style={{ border: `1px solid ${C.border}`, color: C.text, background: open ? C.hover : "transparent" }}
      >
        <Avatar p={current} />
        <span className="max-w-[8.5rem] truncate">{current.name}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: C.muted }} aria-hidden="true" />
      </button>

      {open && (
        <div role="menu" aria-label="Profiles" className="absolute right-0 mt-2 w-72 rounded-xl p-1.5 z-50 animate-fade-in"
          style={{ background: C.panel, border: `1px solid ${C.border}`, color: C.text, boxShadow: "0 12px 32px rgba(0,0,0,0.25)" }}>
          {mode === "list" && (
            <>
              <p className="px-2.5 pt-1.5 pb-1 text-[0.667rem] uppercase tracking-wider font-semibold" style={{ color: C.muted }}>Profiles</p>
              <div className="max-h-64 overflow-y-auto">
                {profiles.map((p) => (
                  <button key={p.id} role="menuitemradio" aria-checked={p.id === active} className={item} style={{ color: C.text }}
                    onMouseEnter={hoverOn} onMouseLeave={hoverOff} onFocus={hoverOn} onBlur={hoverOff}
                    onClick={() => (p.id === active ? close() : switchProfile(p.id))}>
                    <Avatar p={p} size={26} />
                    <span className="flex-1 truncate font-medium">{p.name}</span>
                    {p.id === active && <Check className="h-4 w-4 shrink-0" style={{ color: "#028FA2" }} aria-hidden="true" />}
                  </button>
                ))}
              </div>
              <div className="my-1.5 h-px" style={{ background: C.border }} />
              <button role="menuitem" className={item} style={{ color: C.text }} onMouseEnter={hoverOn} onMouseLeave={hoverOff} onFocus={hoverOn} onBlur={hoverOff}
                onClick={() => { setName(""); setMode("new"); }}>
                <Plus className="h-4 w-4" style={{ color: C.muted }} aria-hidden="true" /> New profile
              </button>
              <button role="menuitem" className={item} style={{ color: C.text }} onMouseEnter={hoverOn} onMouseLeave={hoverOff} onFocus={hoverOn} onBlur={hoverOff}
                onClick={() => { setName(current.name); setMode("rename"); }}>
                <Pencil className="h-4 w-4" style={{ color: C.muted }} aria-hidden="true" /> Rename "{current.name}"
              </button>
              <button role="menuitem" className={item} style={{ color: C.text }} onMouseEnter={hoverOn} onMouseLeave={hoverOff} onFocus={hoverOn} onBlur={hoverOff}
                onClick={() => setMode("reset")}>
                <RotateCcw className="h-4 w-4" style={{ color: C.muted }} aria-hidden="true" /> Reset this profile's data
              </button>
              {active !== "default" && (
                <button role="menuitem" className={item} style={{ color: "#ef4444" }} onMouseEnter={hoverOn} onMouseLeave={hoverOff} onFocus={hoverOn} onBlur={hoverOff}
                  onClick={() => setMode("delete")}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete this profile
                </button>
              )}
            </>
          )}

          {(mode === "new" || mode === "rename") && (
            <form className="p-2 space-y-2.5" onSubmit={(e) => { e.preventDefault(); submitName(); }}>
              <label className="block">
                <span className="text-xs font-semibold">{mode === "new" ? "New profile" : "Rename profile"}</span>
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60}
                  placeholder="For example: IAM roles, AI roles"
                  className="mt-1.5 w-full rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#028FA2]/50"
                  style={{ background: C.input, border: `1px solid ${C.border}`, color: C.text }} />
              </label>
              {mode === "new" && <p className="text-[0.7rem]" style={{ color: C.muted }}>Each profile keeps its own details, resumes, cover letters and jobs.</p>}
              {error && <p className="text-xs" style={{ color: "#ef4444" }}>{error}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setMode("list"); setError(""); }} className="px-3 py-1.5 text-xs rounded-lg" style={{ color: C.muted }}>Back</button>
                <button type="submit" disabled={busy || !name.trim()} className="px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-50" style={{ background: "#028FA2", color: "#fff" }}>
                  {mode === "new" ? "Create and switch" : "Save"}
                </button>
              </div>
            </form>
          )}

          {(mode === "reset" || mode === "delete") && (
            <div className="p-2 space-y-2.5" role="alertdialog" aria-label={mode === "reset" ? "Reset profile" : "Delete profile"}>
              <p className="text-xs font-semibold">{mode === "reset" ? `Reset "${current.name}"?` : `Delete "${current.name}"?`}</p>
              <p className="text-[0.75rem] leading-relaxed" style={{ color: C.muted }}>
                {mode === "reset"
                  ? "This deletes its profile details, resumes, cover letters and jobs, and keeps the empty profile."
                  : "This deletes the profile and all its resumes, cover letters and jobs."} This cannot be undone.
              </p>
              {error && <p className="text-xs" style={{ color: "#ef4444" }}>{error}</p>}
              <div className="flex justify-end gap-2">
                <button autoFocus onClick={() => { setMode("list"); setError(""); }} className="px-3 py-1.5 text-xs rounded-lg" style={{ color: C.muted }}>Cancel</button>
                <button disabled={busy} className="px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-50" style={{ background: "#dc2626", color: "#fff" }}
                  onClick={() => run(async () => {
                    if (mode === "reset") { await api.resetProfile(current.id); switchProfile(current.id); }
                    else { await api.deleteProfile(current.id); switchProfile("default"); }
                  })}>
                  {mode === "reset" ? "Reset data" : "Delete profile"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
