import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { api, getActiveProfile, switchProfile } from "@/lib/api";

const NEW = "__new", RENAME = "__rename", RESET = "__reset", DELETE = "__delete";

export default function ProfileSwitcher({ isDark }: { isDark: boolean }) {
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([]);
  const active = getActiveProfile();

  useEffect(() => {
    api.getProfiles().then((list) => {
      // The selected profile was deleted (e.g. in another tab): fall back to the default one.
      if (!list.some((p) => p.id === active)) switchProfile("default");
      else setProfiles(list);
    }).catch(() => {});
  }, [active]);

  const current = profiles.find((p) => p.id === active);

  async function onChange(value: string) {
    try {
      if (value === NEW) {
        const name = window.prompt("Name for the new profile (for example: IAM roles, AI roles)")?.trim();
        if (name) switchProfile((await api.createProfile(name)).id);
      } else if (value === RENAME && current) {
        const name = window.prompt("Rename profile", current.name)?.trim();
        if (name && name !== current.name) {
          await api.renameProfile(current.id, name);
          setProfiles(profiles.map((p) => (p.id === current.id ? { ...p, name } : p)));
        }
      } else if (value === RESET && current) {
        if (window.confirm(`Reset "${current.name}"? This deletes its profile details, resumes, cover letters and jobs, and keeps the empty profile. This cannot be undone.`)) {
          await api.resetProfile(current.id);
          switchProfile(current.id);
        }
      } else if (value === DELETE && current && current.id !== "default") {
        if (window.confirm(`Delete the profile "${current.name}" and all its resumes, cover letters and jobs? This cannot be undone.`)) {
          await api.deleteProfile(current.id);
          switchProfile("default");
        }
      } else if (value !== active && profiles.some((p) => p.id === value)) {
        switchProfile(value);
      }
    } catch (err: any) {
      window.alert(err.message);
    }
  }

  if (!current) return null;

  return (
    <label className={`flex items-center gap-1.5 shrink-0 text-[0.867rem] ${isDark ? "text-[#888]" : "text-[#8898aa]"}`} title="Switch profile">
      <Users className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">Profile</span>
      <select
        value={active}
        onChange={(e) => onChange(e.target.value)}
        className={`glass-input rounded-md px-2 py-1 max-w-[10rem] font-medium cursor-pointer ${isDark ? "text-white" : "text-[#0a2540]"}`}
      >
        {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        <option disabled>──────────</option>
        <option value={NEW}>New profile…</option>
        <option value={RENAME}>Rename this profile…</option>
        <option value={RESET}>Reset this profile's data…</option>
        {active !== "default" && <option value={DELETE}>Delete this profile…</option>}
      </select>
    </label>
  );
}
