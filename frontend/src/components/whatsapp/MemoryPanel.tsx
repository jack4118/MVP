export interface MemoryPanelProps {
  intent: string;
  status: string;
  issues: string;
  tone: string;
  nextStep: string;
}

const MemoryPanel = ({ intent, status, issues, tone, nextStep }: MemoryPanelProps) => {
  return (
    <section className="rounded-xl bg-gray-50 p-4 text-sm shadow-sm">
      <h3 className="mb-3 font-semibold text-slate-900">🧠 AI Insight</h3>
      <div className="grid gap-2 text-slate-700">
        <p><span className="font-medium text-slate-900">Intent:</span> {intent}</p>
        <p><span className="font-medium text-slate-900">Status:</span> {status}</p>
        <p><span className="font-medium text-slate-900">Issues:</span> {issues}</p>
        <p><span className="font-medium text-slate-900">Tone:</span> {tone}</p>
        <p><span className="font-medium text-slate-900">Next step:</span> {nextStep}</p>
      </div>
    </section>
  );
};

export default MemoryPanel;
