import { useState, useEffect } from "react";
import { Key, Save, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI",
    keyField: "openai_key",
    placeholder: "sk-...",
    prefix: "sk-",
    docsUrl: "https://platform.openai.com/api-keys",
    docsLabel: "platform.openai.com",
    description: "GPT-4o, GPT-4o-mini, and other OpenAI models.",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    keyField: "anthropic_key",
    placeholder: "sk-ant-...",
    prefix: "sk-ant",
    docsUrl: "https://console.anthropic.com/settings/keys",
    docsLabel: "console.anthropic.com",
    description: "Claude Sonnet, Claude Opus, and other Anthropic models.",
  },
  {
    id: "google",
    name: "Google AI",
    keyField: "google_key",
    placeholder: "AIza...",
    prefix: "",
    docsUrl: "https://aistudio.google.com/app/apikey",
    docsLabel: "aistudio.google.com",
    description: "Gemini 2.0 Flash, Gemini Pro, and other Google AI models.",
  },
  {
    id: "mistral",
    name: "Mistral",
    keyField: "mistral_key",
    placeholder: "...",
    prefix: "",
    docsUrl: "https://console.mistral.ai/api-keys",
    docsLabel: "console.mistral.ai",
    description: "Mistral Large, Medium, and other Mistral AI models.",
  },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("openai");
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [maskedKeys, setMaskedKeys] = useState<Record<string, string>>({});
  const [activeProvider, setActiveProvider] = useState("openai");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSettings().then((s: any) => {
      const masked: Record<string, string> = {};
      for (const p of PROVIDERS) {
        const mk = s[`${p.keyField}_masked`];
        if (mk) masked[p.id] = mk;
      }
      setMaskedKeys(masked);
      setActiveProvider(s.active_provider || "openai");
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSaveKey = async () => {
    const provider = PROVIDERS.find((p) => p.id === activeTab)!;
    const key = keys[activeTab] || "";
    if (!key.trim()) {
      toast.error("Please enter an API key.");
      return;
    }
    if (provider.prefix && !key.startsWith(provider.prefix)) {
      toast.error(`Invalid key format. Should start with ${provider.prefix}`);
      return;
    }
    setSaving(true);
    try {
      await api.saveSettings({ [provider.keyField]: key });
      setMaskedKeys((prev) => ({ ...prev, [activeTab]: key.slice(0, 7) + "..." + key.slice(-4) }));
      setKeys((prev) => ({ ...prev, [activeTab]: "" }));
      toast.success(`${provider.name} key saved!`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSetActive = async (providerId: string) => {
    if (!maskedKeys[providerId]) {
      toast.error("Add a key for this provider first.");
      return;
    }
    try {
      await api.saveSettings({ active_provider: providerId });
      setActiveProvider(providerId);
      toast.success(`${PROVIDERS.find((p) => p.id === providerId)?.name} set as active provider.`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-[#028FA2]" />
      </div>
    );
  }

  const currentProvider = PROVIDERS.find((p) => p.id === activeTab)!;
  const hasKey = !!maskedKeys[activeTab];

  return (
    <div className="animate-fade-in max-w-2xl">
      <h1 className="text-lg font-semibold text-white mb-1">Settings</h1>
      <p className="text-sm text-[#666] mb-6">Configure your AI provider. You can add keys for multiple providers and switch between them.</p>

      {/* Active provider indicator */}
      <div className="flex items-center gap-2 mb-5 px-4 py-2.5 glass-card rounded-lg text-sm">
        <CheckCircle className="h-4 w-4 text-[#2dd4bf]" />
        <span className="text-[#888]">Active provider:</span>
        <span className="font-medium text-white">{PROVIDERS.find((p) => p.id === activeProvider)?.name || "OpenAI"}</span>
      </div>

      {/* Provider tabs */}
      <div className="flex border-b border-white/[0.06] mb-0 overflow-x-auto">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            onClick={() => setActiveTab(p.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === p.id
                ? "border-[#028FA2] text-[#028FA2]"
                : "border-transparent text-[#888] hover:text-white hover:border-gray-300"
            }`}
          >
            {p.name}
            {maskedKeys[p.id] && <span className="ml-1.5 w-2 h-2 inline-block rounded-full bg-green-400" />}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="glass-card rounded-b-lg rounded-tr-lg border-t-0 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-[#028FA2]" />
            <h2 className="text-lg font-semibold text-white">{currentProvider.name}</h2>
          </div>
          {hasKey && activeProvider !== activeTab && (
            <button
              onClick={() => handleSetActive(activeTab)}
              className="glass-btn-primary text-xs font-medium px-3 py-1.5 rounded-md"
            >
              Set as Active
            </button>
          )}
          {activeProvider === activeTab && hasKey && (
            <span className="text-xs font-medium px-3 py-1.5 text-[#2dd4bf] bg-[#2dd4bf]/10 border border-[#2dd4bf]/20 rounded-md">Active</span>
          )}
        </div>

        <p className="text-xs text-[#888] mb-4">{currentProvider.description}</p>

        {hasKey && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-green-500/8 border border-green-500/20 rounded-lg text-sm text-green-400">
            <CheckCircle className="h-4 w-4" />
            Key configured: <span className="font-mono text-[#888]">{maskedKeys[activeTab]}</span>
          </div>
        )}

        {!hasKey && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-amber-500/8 border border-amber-500/20 rounded-lg text-sm text-amber-400">
            <AlertCircle className="h-4 w-4" />
            No key set for {currentProvider.name}. Add one to use this provider.
          </div>
        )}

        <label className="block text-xs font-medium text-[#888] mb-1.5">
          {hasKey ? `Update ${currentProvider.name} API Key` : `Enter your ${currentProvider.name} API Key`}
        </label>
        <div className="flex gap-2">
          <input
            type="password"
            value={keys[activeTab] || ""}
            onChange={(e) => setKeys((prev) => ({ ...prev, [activeTab]: e.target.value }))}
            placeholder={currentProvider.placeholder}
            className="glass-input flex-1 px-3 py-2 rounded-lg text-sm"
          />
          <button
            onClick={handleSaveKey}
            disabled={!(keys[activeTab] || "").trim() || saving}
            className="glass-btn-primary flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
        <p className="mt-2 text-xs text-[#555]">
          Get your key from{" "}
          <a href={currentProvider.docsUrl} target="_blank" rel="noopener noreferrer" className="text-[#028FA2] hover:underline">
            {currentProvider.docsLabel}
          </a>
          . Keys are stored locally on the server and never sent to third parties.
        </p>
      </div>
    </div>
  );
}
