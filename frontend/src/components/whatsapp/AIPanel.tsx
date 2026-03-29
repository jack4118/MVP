import { QuickActionIntent } from '../../services/api';
import { useLanguage } from '../../contexts/LanguageContext';

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
  const { t } = useLanguage();
  const quickActions = [
    { id: 'follow_up_softly', label: t.whatsapp.quickActionFollowUpSoftly },
    { id: 'push_for_payment', label: t.whatsapp.quickActionPushPayment },
    { id: 'offer_discount', label: t.whatsapp.quickActionOfferDiscount },
    { id: 'close_deal', label: t.whatsapp.quickActionCloseDeal },
  ] as const;

  return (
    <div className="grid gap-4">
      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">{t.whatsapp.aiSuggestedReplyTitle}</h3>
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap min-h-[120px]">
          {loading ? t.whatsapp.aiGenerating : suggestion || t.whatsapp.aiNoSuggestion}
        </div>

        {disableReason ? <p className="mt-2 text-xs text-amber-700">{disableReason}</p> : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onUse}
            disabled={disabled || !suggestion}
          >
            {t.whatsapp.aiUse}
          </button>
          <button
            type="button"
            className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onEdit}
            disabled={disabled || !suggestion}
          >
            {t.whatsapp.aiEdit}
          </button>
          <button
            type="button"
            className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onRegenerate}
            disabled={disabled || loading}
          >
            {t.whatsapp.aiRegenerate}
          </button>
        </div>
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">{t.whatsapp.aiQuickActionsTitle}</h3>
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
          <h3 className="text-sm font-semibold text-amber-900">{t.whatsapp.outside24hTitle}</h3>
          <p className="mt-2 text-xs text-amber-800">{t.whatsapp.outside24hBody}</p>
          <div className="mt-3 rounded-lg bg-white p-3 text-sm text-slate-700 whitespace-pre-wrap">{templateSuggestion}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white"
              onClick={onSendTemplate}
            >
              {t.whatsapp.sendTemplate}
            </button>
            <button
              type="button"
              className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700"
              onClick={onSendAndContinue}
            >
              {t.whatsapp.sendAndContinue}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default AIPanel;
