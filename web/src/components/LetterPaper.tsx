// A finished letter shown as a printed page: black text on white in both themes.
// Inline colours on purpose: the dark theme remaps classes like bg-white and text-gray-700.
export default function LetterPaper({ text }: { text: string }) {
  return (
    <div className="rounded-lg overflow-y-auto max-h-[640px] shadow-sm" style={{ background: "#ffffff", border: "1px solid rgba(0,0,0,0.12)" }}>
      <div
        className="max-w-[46rem] mx-auto px-8 sm:px-12 py-10 whitespace-pre-wrap text-[0.9rem] leading-relaxed"
        style={{ color: "#1a1a1a", fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif" }}
      >
        {text}
      </div>
    </div>
  );
}
