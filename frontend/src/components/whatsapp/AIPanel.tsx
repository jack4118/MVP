import { QuickActionIntent } from '../../services/api';

export interface AIPanelProps {
  suggestion: string;
  loading: boolean;
  disabled: boolean;
  disableReason?: string;
  showOutside24h: boolean;
  templateSuggestion: string;
  onUse: () => void;
  onEdit: () => void;
  onRegenerate: () => void;
  onQuickAction: (intent: QuickActionIntent) => void;
  onSendTemplate: () => void;
  onSendAndContinue: () => void;
}

const quickActions: Array<{ id: QuickActionIntent; label: string }> = [
  { id: 'follow_up_softly', label: 'Follow up softly' },
  { id: 'push_for_payment', label: 'Push for payment' },
  { id: 'offer_discount', label: 'Offer discount' },
  { id: 'close_deal', label: 'Close deal' },
];

const AIPanel = ({
  suggestion,
  loading,
  disabled,
  disableReason,
  showOutside24h,
  templateSuggestion,
  onUse,
  onEdit,
  onRegenerate,
  onQuickAction,
  onSendTemplate,
  onSendAndContinue,
}: AIPanelProps) => {
  return (
    <div className="grid gap-4">
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Suggested Reply</h3>
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap min-h-[120px]">
          {loading ? 'Generating AI suggestion...' : suggestion || 'No suggestion yet. Tap Regenerate.'}
        </div>

        {disableReason ? <p className="mt-2 text-xs text-amber-700">{disableReason}</p> : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onUse}
            disabled={disabled || !suggestion}
          >
            Use
          </button>
          <button
            type="button"
            className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onEdit}
            disabled={disabled || !suggestion}
          >
            Edit
          </button>
          <button
            type="button"
            className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onRegenerate}
            disabled={disabled || loading}
          >
            Regenerate
          </button>
        </div>
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Quick Actions</h3>
        <div className="mt-3 grid gap-2">
          {quickActions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="rounded-lg bg-slate-100 px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => onQuickAction(action.id)}
              disabled={disabled || loading}
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>

      {showOutside24h ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-amber-900">⚠️ Outside 24h window</h3>
          <p className="mt-2 text-xs text-amber-800">Use a template message first to reopen the conversation safely.</p>
          <div className="mt-3 rounded-lg bg-white p-3 text-sm text-slate-700 whitespace-pre-wrap">{templateSuggestion}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white"
              onClick={onSendTemplate}
            >
              Send Template
            </button>
            <button
              type="button"
              className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700"
              onClick={onSendAndContinue}
            >
              Send & Continue
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default AIPanel;
