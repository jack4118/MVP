import { WhatsAppContactSummary } from '../../services/api';

export interface LeadListItemProps {
  contact: WhatsAppContactSummary;
  active: boolean;
  onSelect: (phone: string) => void;
}

const formatRelativeTime = (value?: string | null) => {
  if (!value) return 'No contact yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No contact yet';

  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
};

const mapUrgency = (status?: string) => {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'follow_up_due') {
    return { icon: '🔥', label: 'high', tone: 'bg-red-50 text-red-600' };
  }
  if (normalized === 'waiting_reply') {
    return { icon: '🟡', label: 'medium', tone: 'bg-amber-50 text-amber-700' };
  }
  return { icon: '⚪', label: 'low', tone: 'bg-slate-100 text-slate-600' };
};

const prettifyStatus = (status?: string) => {
  if (!status) return 'No status';
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const LeadListItem = ({ contact, active, onSelect }: LeadListItemProps) => {
  const urgency = mapUrgency(contact.lead?.status || contact.lastStatus);
  const title = contact.lead?.name || contact.phone;

  return (
    <button
      type="button"
      onClick={() => onSelect(contact.phone)}
      className={`w-full rounded-xl p-3 text-left transition shadow-sm ${
        active
          ? 'bg-blue-50 ring-1 ring-blue-200'
          : 'bg-white hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
          <p className="truncate text-xs text-slate-500">{contact.phone}</p>
        </div>
        {contact.unreadCount > 0 ? (
          <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
            {contact.unreadCount}
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 font-medium ${urgency.tone}`}>
          {urgency.icon} {urgency.label}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
          {prettifyStatus(contact.lead?.status || contact.lastStatus)}
        </span>
      </div>

      <p className="mt-2 truncate text-xs text-slate-600">{contact.lastMessage || 'No recent messages'}</p>
      <p className="mt-1 text-xs text-slate-400">Last contact {formatRelativeTime(contact.lastAt)}</p>
    </button>
  );
};

export default LeadListItem;
