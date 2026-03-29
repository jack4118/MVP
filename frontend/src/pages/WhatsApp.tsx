import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { aiApi, getApiErrorMessage, QuickActionIntent, remindersApi, whatsappApi, WhatsAppConnection, WhatsAppContactSummary, WhatsAppLogItem, WhatsAppSendPreflight } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import AuthenticatedHeader from '../components/AuthenticatedHeader';
import { useAuth } from '../hooks/useAuth';
import { storage } from '../utils/storage';
import LeadListItem from '../components/whatsapp/LeadListItem';
import MemoryPanel from '../components/whatsapp/MemoryPanel';
import AIPanel from '../components/whatsapp/AIPanel';

type WhatsAppView = 'setup' | 'inbox' | 'contacts';
const WHATSAPP_VIEW_KEY = 'whatsapp_active_view';
const WHATSAPP_WIZARD_STATE_KEY = 'whatsapp_setup_wizard_v1';
type SetupStep = 1 | 2 | 3 | 4;
type SendReadinessUiState =
  | 'READY_TO_SEND'
  | 'BLOCKED_SETUP_REQUIRED'
  | 'BLOCKED_TEMPLATE_REQUIRED'
  | 'BLOCKED_CONNECTION'
  | 'BLOCKED_PROVIDER'
  | 'BLOCKED_PHONE'
  | 'BLOCKED_MESSAGE'
  | 'LOADING_READINESS'
  | 'READINESS_ERROR_RETRYABLE';

const mapSendReadinessState = (
  readiness: WhatsAppSendPreflight | null,
  loading: boolean,
  hasError: boolean
): SendReadinessUiState => {
  if (loading) return 'LOADING_READINESS';
  if (hasError) return 'READINESS_ERROR_RETRYABLE';
  if (!readiness) return 'READINESS_ERROR_RETRYABLE';
  if (readiness.send_ready) return 'READY_TO_SEND';

  switch (readiness.reasonCode) {
    case 'WA_SETUP_REQUIRED':
      return 'BLOCKED_SETUP_REQUIRED';
    case 'WHATSAPP_TEMPLATE_REQUIRED':
      return 'BLOCKED_TEMPLATE_REQUIRED';
    case 'WA_PROVIDER_NOT_READY':
      return 'BLOCKED_PROVIDER';
    case 'WA_PHONE_INVALID':
      return 'BLOCKED_PHONE';
    case 'WA_MESSAGE_INVALID':
      return 'BLOCKED_MESSAGE';
    default:
      return 'BLOCKED_CONNECTION';
  }
};

const quickActionIntentMap: Record<
  QuickActionIntent,
  {
    internalInstruction: string;
    promptStrategyBlock: string;
    defaultToneBias: 'friendly' | 'professional' | 'assertive';
    defaultCtaBias: string;
    purposeHint: 'follow_up' | 'payment';
  }
> = {
  follow_up_softly: {
    internalInstruction: 'Send a gentle low-pressure check-in that feels warm and natural.',
    promptStrategyBlock: 'Use reassurance-first language, reduce urgency pressure, and ask one easy reply question.',
    defaultToneBias: 'friendly',
    defaultCtaBias: 'light yes/no reply',
    purposeHint: 'follow_up',
  },
  push_for_payment: {
    internalInstruction: 'Follow up on payment with clarity and process orientation.',
    promptStrategyBlock: 'Stay polite but direct, confirm payment date/method, and avoid threatening language.',
    defaultToneBias: 'professional',
    defaultCtaBias: 'confirm exact payment time',
    purposeHint: 'payment',
  },
  offer_discount: {
    internalInstruction: 'Use a value-focused discount offer to move the lead toward conversion.',
    promptStrategyBlock: 'Emphasize value and controlled urgency, then ask for a concrete decision.',
    defaultToneBias: 'friendly',
    defaultCtaBias: 'accept offer today',
    purposeHint: 'follow_up',
  },
  close_deal: {
    internalInstruction: 'Assume high intent and guide the lead to final confirmation.',
    promptStrategyBlock: 'Keep momentum, present one clear close path, and ask for booking/payment confirmation.',
    defaultToneBias: 'assertive',
    defaultCtaBias: 'confirm now',
    purposeHint: 'payment',
  },
};

const WhatsApp = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeView, setActiveView] = useState<WhatsAppView>(() => {
    const saved = storage.getItem(WHATSAPP_VIEW_KEY) as WhatsAppView | null;
    return saved === 'inbox' || saved === 'contacts' || saved === 'setup' ? saved : 'setup';
  });
  const [connection, setConnection] = useState<WhatsAppConnection | null>(null);
  const [logs, setLogs] = useState<WhatsAppLogItem[]>([]);
  const [contacts, setContacts] = useState<WhatsAppContactSummary[]>([]);
  const [contactsPage, setContactsPage] = useState(1);
  const [contactsPageSize, setContactsPageSize] = useState(8);
  const [contactsTotalPages, setContactsTotalPages] = useState(1);
  const [contactsTotal, setContactsTotal] = useState(0);
  const [contactQuery, setContactQuery] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [selectedPhone, setSelectedPhone] = useState('');
  const [selectedByUser, setSelectedByUser] = useState(false);
  const [conversation, setConversation] = useState<WhatsAppLogItem[]>([]);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const conversationBodyRef = useRef<HTMLDivElement | null>(null);
  const unreadSignatureRef = useRef('');
  const hasAppliedPreferredViewRef = useRef(false);
  const [isConversationAtBottom, setIsConversationAtBottom] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showUnreadBanner, setShowUnreadBanner] = useState(false);
  const [isConversationNearTop, setIsConversationNearTop] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [aiAccordionOpen, setAiAccordionOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [composerText, setComposerText] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPanelError, setAiPanelError] = useState('');
  const [mediaType, setMediaType] = useState<'image' | 'document'>('image');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [isMediaDragActive, setIsMediaDragActive] = useState(false);
  const [sendingMedia, setSendingMedia] = useState(false);
  const composerTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const [formData, setFormData] = useState({
    businessAccountId: '',
    phoneNumberId: '',
    accessToken: '',
  });
  const [wizardStep, setWizardStep] = useState<SetupStep>(1);
  const [startedConnectStep, setStartedConnectStep] = useState(false);
  const [tokenPasted, setTokenPasted] = useState(false);
  const [testReceivedConfirmed, setTestReceivedConfirmed] = useState(false);
  const [testData, setTestData] = useState({
    toPhone: '',
    content: t.whatsapp.defaultTestMessage,
  });
  const [inboxReadiness, setInboxReadiness] = useState<WhatsAppSendPreflight | null>(null);
  const [inboxReadinessLoading, setInboxReadinessLoading] = useState(false);
  const [inboxReadinessError, setInboxReadinessError] = useState('');
  const [workspaceReadiness, setWorkspaceReadiness] = useState<WhatsAppSendPreflight | null>(null);

  useEffect(() => {
    const saved = storage.getItem(WHATSAPP_WIZARD_STATE_KEY);
    if (!saved) {
      return;
    }

    try {
      const parsed = JSON.parse(saved) as {
        wizardStep?: SetupStep;
        startedConnectStep?: boolean;
        tokenPasted?: boolean;
        testReceivedConfirmed?: boolean;
      };
      if (parsed.wizardStep && [1, 2, 3, 4].includes(parsed.wizardStep)) {
        setWizardStep(parsed.wizardStep);
      }
      setStartedConnectStep(Boolean(parsed.startedConnectStep));
      setTokenPasted(Boolean(parsed.tokenPasted));
      setTestReceivedConfirmed(Boolean(parsed.testReceivedConfirmed));
    } catch (_error) {
      // ignore invalid local wizard state
    }
  }, []);

  useEffect(() => {
    storage.setItem(WHATSAPP_WIZARD_STATE_KEY, JSON.stringify({
      wizardStep,
      startedConnectStep,
      tokenPasted,
      testReceivedConfirmed,
    }));
  }, [wizardStep, startedConnectStep, tokenPasted, testReceivedConfirmed]);

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 767px)');
    const tabletQuery = window.matchMedia('(min-width: 768px) and (max-width: 1023px)');
    const syncMedia = () => {
      setIsMobile(mobileQuery.matches);
      setIsTablet(tabletQuery.matches);
    };
    syncMedia();
    mobileQuery.addEventListener('change', syncMedia);
    tabletQuery.addEventListener('change', syncMedia);
    return () => {
      mobileQuery.removeEventListener('change', syncMedia);
      tabletQuery.removeEventListener('change', syncMedia);
    };
  }, []);

  useEffect(() => {
    if (searchParams.get('view')) {
      return;
    }

    if (
      !hasAppliedPreferredViewRef.current &&
      connection?.isActive &&
      activeView === 'setup' &&
      user?.inboxDefaultView
    ) {
      hasAppliedPreferredViewRef.current = true;
      setActiveView(user.inboxDefaultView);
    }
  }, [user?.inboxDefaultView, connection?.isActive, activeView, searchParams]);

  useEffect(() => {
    const nextView = searchParams.get('view');
    const nextPhone = searchParams.get('phone');

    if (nextView === 'inbox' || nextView === 'contacts' || nextView === 'setup') {
      setActiveView(nextView);
    }

    if (nextPhone) {
      setSelectedPhone(nextPhone);
      setSelectedByUser(true);
      setTestData((prev) => ({ ...prev, toPhone: nextPhone }));
    }
  }, [searchParams]);

  useEffect(() => {
    storage.setItem(WHATSAPP_VIEW_KEY, activeView);
    if (activeView !== 'inbox') setAiDrawerOpen(false);
  }, [activeView]);

  useEffect(() => {
    loadContacts(contactQuery, contactsPage);
  }, [contactQuery, contactsPage, contactsPageSize]);

  useEffect(() => {
    if (!selectedPhone) {
      setConversation([]);
      return;
    }
    loadConversation(selectedPhone);
  }, [selectedPhone]);

  useEffect(() => {
    setAiSuggestion('');
    setAiPanelError('');
  }, [selectedPhone]);

  useEffect(() => {
    if (activeView !== 'inbox' || !selectedPhone) {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setInboxReadinessLoading(true);
        const response = await whatsappApi.getPreflight(selectedPhone, composerText.trim());
        if (response.success && response.data) {
          setInboxReadiness(response.data);
          setInboxReadinessError('');
          return;
        }
        setInboxReadinessError(response.error?.message || t.common.error);
      } catch (err) {
        setInboxReadinessError(getApiErrorMessage(err, t.common.error));
      } finally {
        setInboxReadinessLoading(false);
      }
    }, 180);

    return () => window.clearTimeout(timer);
  }, [activeView, selectedPhone, composerText, t.common.error]);

  useEffect(() => {
    if (activeView !== 'inbox' || !selectedPhone || conversation.length === 0) {
      return;
    }

    requestAnimationFrame(() => {
      if (conversationBodyRef.current) {
        conversationBodyRef.current.scrollTop = conversationBodyRef.current.scrollHeight;
        setIsConversationAtBottom(true);
      }
    });
  }, [activeView, selectedPhone, conversation]);

  useEffect(() => {
    if (!selectedByUser || !selectedPhone || conversation.length === 0 || !isConversationAtBottom || activeView !== 'inbox') {
      return;
    }
    void markConversationRead(selectedPhone);
  }, [selectedByUser, selectedPhone, conversation, isConversationAtBottom, activeView]);

  useEffect(() => {
    const node = conversationBodyRef.current;
    if (!node) {
      return;
    }

    const handleScroll = () => {
      const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
      setIsConversationAtBottom(distanceFromBottom < 24);
      setIsConversationNearTop(node.scrollTop < 24);
    };

    handleScroll();
    node.addEventListener('scroll', handleScroll);
    return () => node.removeEventListener('scroll', handleScroll);
  }, [selectedPhone, conversation, activeView]);

  const selectedContact = useMemo(
    () => contacts.find((contact) => contact.phone === selectedPhone) || null,
    [contacts, selectedPhone]
  );

  const totalMessages = useMemo(
    () => contacts.reduce((sum, contact) => sum + contact.totalMessages, 0),
    [contacts]
  );

  const totalFailedMessages = useMemo(
    () => contacts.reduce((sum, contact) => sum + contact.failedCount, 0),
    [contacts]
  );

  const unreadContacts = useMemo(
    () => contacts.filter((contact) => contact.unreadCount > 0),
    [contacts]
  );

  const prioritizedContacts = useMemo(
    () =>
      [...contacts].sort((a, b) => {
        if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
        if (b.unreadCount > 0 && a.unreadCount === 0) return 1;
        if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
        return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime();
      }),
    [contacts]
  );

  const latestUnreadContact = useMemo(() => {
    if (!unreadContacts.length) {
      return null;
    }

    return [...unreadContacts].sort(
      (a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
    )[0] || null;
  }, [unreadContacts]);

  useEffect(() => {
    if (!latestUnreadContact) {
      unreadSignatureRef.current = '';
      setShowUnreadBanner(false);
      return;
    }

    const signature = `${latestUnreadContact.phone}:${latestUnreadContact.lastAt}:${unreadContacts.length}`;
    if (unreadSignatureRef.current !== signature) {
      unreadSignatureRef.current = signature;
      setShowUnreadBanner(true);
    }
  }, [latestUnreadContact, unreadContacts.length]);

  const totalUnreadMessages = useMemo(
    () => unreadContacts.reduce((sum, contact) => sum + contact.unreadCount, 0),
    [unreadContacts]
  );

  useEffect(() => {
    const baseTitle = 'EzReply';
    if (totalUnreadMessages > 0) {
      document.title = `(${totalUnreadMessages}) ${baseTitle}`;
      return;
    }

    document.title = baseTitle;
    return () => {
      document.title = baseTitle;
    };
  }, [totalUnreadMessages]);

  const markConversationRead = async (phone: string) => {
    if (!phone) {
      return;
    }

    try {
      await whatsappApi.markConversationRead(phone);
      setContacts((current) =>
        current.map((contact) =>
          contact.phone === phone
            ? { ...contact, unreadCount: 0 }
            : contact
        )
      );
    } catch (_error) {
      // ignore transient read-state errors in UI
    }
  };

  const tabs = [
    { id: 'setup' as const, label: t.whatsapp.tabSetup },
    { id: 'inbox' as const, label: t.whatsapp.tabInbox, count: unreadContacts.length },
    { id: 'contacts' as const, label: t.whatsapp.tabContacts },
  ];

  const leadLinked = Boolean(selectedContact?.lead?.id);
  const outside24hWindow = inboxReadiness?.reasonCode === 'WHATSAPP_TEMPLATE_REQUIRED';
  const suggestedTemplateMessage = useMemo(() => {
    const name = selectedContact?.lead?.name || 'there';
    return `Hi ${name}, thanks for your message. This is a quick template check-in from our sales team. Reply here and I will continue right away.`;
  }, [selectedContact?.lead?.name]);

  const aiPanelDisableReason = useMemo(() => {
    if (!selectedPhone) return 'Select a lead conversation to use AI actions.';
    if (!leadLinked) return 'AI suggestions are available after this number is linked to a lead.';
    return '';
  }, [leadLinked, selectedPhone]);

  const aiMemory = useMemo(() => {
    const lastInbound = [...conversation].reverse().find((message) => message.direction === 'inbound');
    const messageIntent = (lastInbound?.content || selectedContact?.lastMessage || '').trim();
    const issues = selectedContact?.failedCount
      ? `${selectedContact.failedCount} failed sends need review.`
      : 'No delivery issues detected.';
    const tone = messageIntent.includes('?')
      ? 'Question-driven'
      : messageIntent.length > 90
        ? 'Detailed'
        : 'Brief';

    return {
      intent: messageIntent || 'Awaiting clear customer intent.',
      status: selectedContact?.lead?.status?.replace(/_/g, ' ') || 'Unknown',
      issues,
      tone,
      nextStep: outside24hWindow
        ? 'Send an approved template to reopen the window.'
        : 'Use AI suggestion to send a concise next-step message.',
    };
  }, [conversation, selectedContact, outside24hWindow]);

  const scrollConversationToLatest = () => {
    if (conversationBodyRef.current) {
      conversationBodyRef.current.scrollTop = conversationBodyRef.current.scrollHeight;
      requestAnimationFrame(() => {
        if (conversationBodyRef.current) {
          conversationBodyRef.current.scrollTop = conversationBodyRef.current.scrollHeight;
        }
      });
      setIsConversationAtBottom(true);
      void markConversationRead(selectedPhone);
    }
  };

  const scrollConversationToTop = () => {
    if (conversationBodyRef.current) {
      conversationBodyRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      setIsConversationNearTop(true);
    }
  };

  const inferMediaTypeForFile = (file: File): 'image' | 'document' => {
    return file.type.toLowerCase().startsWith('image/') ? 'image' : 'document';
  };

  const handleMediaFile = (file: File | null) => {
    if (!file) {
      return;
    }
    setMediaFile(file);
    setMediaType(inferMediaTypeForFile(file));
    setMediaUrl('');
  };

  const handleMediaFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    handleMediaFile(event.target.files?.[0] || null);
  };

  const handleMediaDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsMediaDragActive(false);
    handleMediaFile(event.dataTransfer.files?.[0] || null);
  };

  const handleSelectContact = (phone: string) => {
    setSelectedPhone(phone);
    setSelectedByUser(true);
    setTestData((prev) => ({ ...prev, toPhone: phone }));
    if (isTablet) setAiDrawerOpen(false);
    requestAnimationFrame(() => {
      composerTextareaRef.current?.focus();
    });
  };

  const openUnreadConversation = () => {
    if (!latestUnreadContact) {
      return;
    }

    setActiveView('inbox');
    handleSelectContact(latestUnreadContact.phone);
    setShowUnreadBanner(false);
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      const [conn, logResp, readinessResp] = await Promise.all([
        whatsappApi.getConnection(),
        whatsappApi.getLogs(30),
        whatsappApi.getPreflight(),
      ]);
      if (conn.success) {
        const existingConnection = conn.data || null;
        setConnection(existingConnection);
        setActiveView((current) => {
          if (!existingConnection?.isActive) {
            hasAppliedPreferredViewRef.current = false;
            return 'setup';
          }

          if (current !== 'setup') {
            hasAppliedPreferredViewRef.current = true;
          }
          return current === 'setup' ? (user?.inboxDefaultView || 'inbox') : current;
        });
        if (existingConnection) {
          setFormData((prev) => ({
            ...prev,
            businessAccountId: existingConnection.businessAccountId,
            phoneNumberId: existingConnection.phoneNumberId,
            accessToken: '',
          }));
        }
      }
      if (logResp.success && logResp.data) {
        setLogs(logResp.data);
      }
      if (readinessResp?.success && readinessResp?.data) {
        setWorkspaceReadiness(readinessResp.data);
      }
    } catch (err) {
      setError(getApiErrorMessage(err, t.common.error));
    } finally {
      setLoading(false);
    }
  };

  const loadContacts = async (q: string, page: number) => {
    try {
      setLoadingContacts(true);
      const response = await whatsappApi.getContacts({ q, page, pageSize: contactsPageSize });
      if (response.success && response.data) {
        const payload: any = response.data;

        const pickPreferredPhone = (items: WhatsAppContactSummary[]) => {
          const sorted = [...items].sort((a, b) => {
            if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
            if (b.unreadCount > 0 && a.unreadCount === 0) return 1;
            if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
            return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime();
          });

          if (selectedPhone && items.some((item) => item.phone === selectedPhone)) {
            return selectedPhone;
          }

          const firstUnread = sorted.find((item) => item.unreadCount > 0);

          return firstUnread?.phone || sorted[0]?.phone || '';
        };

        if (Array.isArray(payload)) {
          const query = q.trim().toLowerCase();
          const filtered = query
            ? payload.filter((item: WhatsAppContactSummary) => {
                const haystack = [
                  item.phone,
                  item.lead?.name || '',
                  item.lead?.status || '',
                  item.lastStatus || '',
                  item.lastMessage || '',
                  item.lastError || '',
                ]
                  .join(' ')
                  .toLowerCase();
                return haystack.includes(query);
              })
            : payload;

          const total = filtered.length;
          const totalPages = Math.max(1, Math.ceil(total / contactsPageSize));
          const clampedPage = Math.min(Math.max(1, page), totalPages);
          const start = (clampedPage - 1) * contactsPageSize;
          const items = filtered.slice(start, start + contactsPageSize);

          setContacts(items);
          setContactsTotal(total);
          setContactsTotalPages(totalPages);
          setContactsPage(clampedPage);

          const preferredPhone = pickPreferredPhone(items);
          if (preferredPhone) {
            setSelectedPhone(preferredPhone);
            setTestData((prev) => ({ ...prev, toPhone: preferredPhone }));
          }
          return;
        }

        setContacts(payload.items || []);
        setContactsTotal(payload.total || 0);
        setContactsTotalPages(payload.totalPages || 1);
        setContactsPage(payload.page || 1);

        const preferredPhone = pickPreferredPhone(payload.items || []);
        if (preferredPhone) {
          setSelectedPhone(preferredPhone);
          setTestData((prev) => ({ ...prev, toPhone: preferredPhone }));
        }
      }
    } finally {
      setLoadingContacts(false);
    }
  };

  const loadConversation = async (phone: string) => {
    try {
      if (!phone) {
        setConversation([]);
        return;
      }
      setLoadingConversation(true);
      const response = await whatsappApi.getMessages(phone, 200);
      if (response.success && response.data) {
        setConversation(response.data);
      }
    } finally {
      setLoadingConversation(false);
    }
  };

  useEffect(() => {
    if (activeView !== 'inbox' || !selectedPhone) {
      return;
    }

    const timer = window.setTimeout(() => {
      composerTextareaRef.current?.focus();
    }, 120);

    return () => window.clearTimeout(timer);
  }, [activeView, selectedPhone]);

  useEffect(() => {
    if (activeView !== 'inbox' || selectedByUser || unreadContacts.length === 0) {
      return;
    }

    if (!selectedPhone || !unreadContacts.some((contact) => contact.phone === selectedPhone)) {
      const firstUnreadByPriority = [...unreadContacts].sort((a, b) => {
        if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
        return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime();
      })[0];

      if (firstUnreadByPriority?.phone) {
        setSelectedPhone(firstUnreadByPriority.phone);
        setTestData((prev) => ({ ...prev, toPhone: firstUnreadByPriority.phone }));
      }
    }
  }, [activeView, unreadContacts, selectedByUser, selectedPhone]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      const response = await whatsappApi.saveConnection(formData);
      if (!response.success) {
        setError(response.error?.message || t.common.error);
        return;
      }
      setSuccess(t.whatsapp.saveSuccess);
      setStartedConnectStep(true);
      await loadAll();
    } catch (err) {
      setError(getApiErrorMessage(err, t.common.error));
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async () => {
    try {
      setVerifying(true);
      setError('');
      setSuccess('');
      const hasExistingConnection = !!connection;
      const hasFilledForm =
        formData.businessAccountId.trim() &&
        formData.phoneNumberId.trim() &&
        formData.accessToken.trim();

      if (!hasExistingConnection && !hasFilledForm) {
        setError(t.whatsapp.fillConnectionFirst);
        return;
      }

      if (!hasExistingConnection && hasFilledForm) {
        const saveResp = await whatsappApi.saveConnection(formData);
        if (!saveResp.success) {
          setError(saveResp.error?.message || t.common.error);
          return;
        }
      }

      const response = await whatsappApi.verifyConnection();
      if (!response.success) {
        setError(response.error?.message || t.common.error);
        return;
      }
      setSuccess(`${t.whatsapp.verifySuccess}${response.data?.displayPhone ? ` (${response.data.displayPhone})` : ''}`);
      setWizardStep(4);
      await loadAll();
    } catch (err) {
      setError(getApiErrorMessage(err, t.common.error));
    } finally {
      setVerifying(false);
    }
  };

  const handleSendTest = async () => {
    try {
      setSending(true);
      setError('');
      setSuccess('');
      const preflight = await whatsappApi.getPreflight(testData.toPhone, testData.content);
      if (!preflight.success || !preflight.data || !preflight.data.send_ready) {
        setError(preflight.error?.message || preflight.data?.reasonMessage || t.common.error);
        return;
      }
      const response = await whatsappApi.sendText({
        toPhone: testData.toPhone,
        content: testData.content,
      });
      if (!response.success) {
        setError(response.error?.message || t.common.error);
        return;
      }
      setSuccess(t.whatsapp.testSent);
      setTestReceivedConfirmed(false);
      await loadAll();
      await loadConversation(testData.toPhone);
      await markConversationRead(testData.toPhone);
      setActiveView('inbox');
      setSelectedByUser(true);
    } catch (err) {
      setError(getApiErrorMessage(err, t.common.error));
    } finally {
      setSending(false);
    }
  };

  const handleSendFromInbox = async () => {
    if (!selectedPhone || !composerText.trim()) {
      setError(t.whatsapp.selectContact);
      return;
    }

    try {
      setSending(true);
      setError('');
      const preflight = await whatsappApi.getPreflight(selectedPhone, composerText.trim());
      if (!preflight.success || !preflight.data || !preflight.data.send_ready) {
        if (preflight.data?.reasonCode === 'WHATSAPP_TEMPLATE_REQUIRED') {
          setError('Outside 24h window. Send a template message first.');
        } else {
          setError(preflight.error?.message || preflight.data?.reasonMessage || t.common.error);
        }
        return;
      }
      const clientMessageId = `web-${Date.now()}`;
      const response = await whatsappApi.sendText({
        toPhone: selectedPhone,
        conversationPhone: selectedPhone,
        content: composerText.trim(),
        clientMessageId,
      });
      if (!response.success) {
        setError(response.error?.message || t.common.error);
        return;
      }
      setComposerText('');
      await loadConversation(selectedPhone);
      await loadContacts(contactQuery, contactsPage);
      const linkedReminderId = searchParams.get('reminderId');
      const linkedLeadId = searchParams.get('leadId') || selectedContact?.lead?.id;
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);

      const clearFlowParams = () => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('reminderId');
        nextParams.delete('leadId');
        nextParams.delete('source');
        setSearchParams(nextParams, { replace: true });
      };

      try {
        if (linkedReminderId) {
          const resolved = await remindersApi.markDone(linkedReminderId);
          if (resolved.success) {
            setSuccess(t.whatsapp.replyResolvedReminder.replace('{name}', selectedContact?.lead?.name || selectedPhone));
            clearFlowParams();
          }
        } else if (linkedLeadId) {
          const pendingResp = await remindersApi.getReminders({ view: 'all', status: 'pending', days: 30 });
          if (pendingResp.success && pendingResp.data) {
            const related = pendingResp.data
              .filter((item) => !item.isDone && item.lead.id === linkedLeadId)
              .sort((a, b) => new Date(a.triggerAt).getTime() - new Date(b.triggerAt).getTime())
              .find((item) => new Date(item.triggerAt).getTime() <= endOfToday.getTime());

            if (related) {
              const resolved = await remindersApi.markDone(related.id);
              if (resolved.success) {
                setSuccess(t.whatsapp.replyResolvedReminder.replace('{name}', related.lead.name));
                clearFlowParams();
              }
            }
          }
        }
      } catch (_err) {
        // keep reply success even if reminder auto-resolution fails
      }
    } catch (err) {
      setError(getApiErrorMessage(err, t.common.error));
    } finally {
      setSending(false);
    }
  };

  const handleSendMediaFromInbox = async () => {
    if (!selectedPhone || (!mediaFile && !mediaUrl.trim())) {
      setError(t.whatsapp.selectContact);
      return;
    }

    try {
      setSendingMedia(true);
      setError('');
      const preflight = await whatsappApi.getPreflight(selectedPhone, mediaFile ? mediaFile.name : (mediaUrl.trim() || '[media]'));
      if (!preflight.success || !preflight.data || !preflight.data.send_ready) {
        setError(preflight.error?.message || preflight.data?.reasonMessage || t.common.error);
        return;
      }
      const clientMessageId = `media-${Date.now()}`;
      const response = mediaFile
        ? await whatsappApi.sendMediaUpload({
            toPhone: selectedPhone,
            conversationPhone: selectedPhone,
            mediaType,
            file: mediaFile,
            filename: mediaFile.name,
            clientMessageId,
          })
        : await whatsappApi.sendMedia({
            toPhone: selectedPhone,
            conversationPhone: selectedPhone,
            mediaType,
            mediaUrl: mediaUrl.trim(),
            clientMessageId,
          });
      if (!response.success) {
        setError(response.error?.message || t.common.error);
        return;
      }
      setMediaFile(null);
      setMediaUrl('');
      await loadConversation(selectedPhone);
      await loadContacts(contactQuery, contactsPage);
      scrollConversationToLatest();
    } catch (err) {
      setError(getApiErrorMessage(err, t.common.error));
    } finally {
      setSendingMedia(false);
    }
  };

  const handleGenerateAiSuggestion = async (quickActionIntent?: QuickActionIntent) => {
    if (!selectedContact?.lead?.id) {
      setAiPanelError('Link this conversation to a lead to unlock AI suggestions.');
      return;
    }

    try {
      setAiLoading(true);
      setAiPanelError('');
      const leadName = selectedContact.lead.name || selectedPhone;
      const contextSnippet = conversation
        .slice(-10)
        .map((message) => `${message.direction || 'outbound'}: ${message.content}`)
        .join('\n')
        .slice(0, 2400);
      const intentConfig = quickActionIntent ? quickActionIntentMap[quickActionIntent] : null;
      const goal = intentConfig
        ? `${intentConfig.internalInstruction} ${intentConfig.promptStrategyBlock} CTA bias: ${intentConfig.defaultCtaBias}.`
        : 'Write a concise WhatsApp sales follow-up with one clear next step.';

      const response = (intentConfig?.purposeHint === 'payment')
        ? await aiApi.generatePayment({
            leadId: selectedContact.lead.id,
            leadName,
            goal,
            objective: goal,
            context: contextSnippet || undefined,
            channel: 'whatsapp',
            style: 'standard',
            emojiIntensity: 'medium',
            language: user?.defaultLanguage || 'en',
            tone: intentConfig?.defaultToneBias || 'professional',
            quickActionIntent,
          })
        : await aiApi.generateFollowUp({
            leadId: selectedContact.lead.id,
            leadName,
            goal,
            objective: goal,
            context: contextSnippet || undefined,
            status: selectedContact.lead.status,
            channel: 'whatsapp',
            style: 'standard',
            emojiIntensity: 'medium',
            language: user?.defaultLanguage || 'en',
            tone: intentConfig?.defaultToneBias || 'friendly',
            quickActionIntent,
          });

      if (!response.success || !response.data?.text) {
        setAiPanelError(response.error?.message || 'Failed to generate AI suggestion.');
        return;
      }
      setAiSuggestion(response.data.text);
    } catch (_err) {
      setAiPanelError('Failed to generate AI suggestion.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleSendTemplateMessage = async (continueThread: boolean) => {
    if (!selectedPhone) {
      setError(t.whatsapp.selectContact);
      return;
    }

    try {
      setSending(true);
      setError('');
      const response = await whatsappApi.sendText({
        toPhone: selectedPhone,
        conversationPhone: selectedPhone,
        content: suggestedTemplateMessage,
        clientMessageId: `wa-template-${Date.now()}`,
      });

      if (!response.success) {
        setError('Template send did not complete. Please verify an approved template and try again.');
        return;
      }

      await loadConversation(selectedPhone);
      await loadContacts(contactQuery, contactsPage);
      if (continueThread) {
        setComposerText(aiSuggestion || composerText);
      }
      setSuccess(continueThread ? 'Template sent. You can continue the conversation now.' : 'Template sent.');
    } catch (_err) {
      setError('Template send did not complete. Please verify an approved template and try again.');
    } finally {
      setSending(false);
    }
  };

  const renderSetupView = () => (
    (() => {
      const canPassStep1 = !!formData.businessAccountId.trim() && !!formData.phoneNumberId.trim();
      const tokenLength = formData.accessToken.trim().length;
      const canPassStep2 = tokenLength >= 20;
      const canPassStep3 = Boolean(connection?.isActive);
      const canPassStep4 = Boolean(testReceivedConfirmed);
      const progressPercent = Math.round((wizardStep / 4) * 100);
      const activeStep = wizardStep;

      const goNext = () => {
        if (activeStep === 1 && !canPassStep1) {
          setError(t.whatsapp.fillConnectionFirst);
          return;
        }
        if (activeStep === 2 && !canPassStep2) {
          setError(t.whatsapp.tokenFormatHint);
          return;
        }
        if (activeStep === 3 && !canPassStep3) {
          setError(t.whatsapp.verifyFirstHint);
          return;
        }
        if (activeStep === 4 && !canPassStep4) {
          setError(t.whatsapp.confirmTestReceiptHint);
          return;
        }
        setWizardStep((current) => {
          const next = Math.min(4, current + 1);
          return (next === 1 || next === 2 || next === 3 || next === 4 ? next : 4) as SetupStep;
        });
      };

      const goBack = () => setWizardStep((current) => {
        const next = Math.max(1, current - 1);
        return (next === 1 || next === 2 || next === 3 || next === 4 ? next : 1) as SetupStep;
      });

      return (
    <div className="whatsapp-section-stack">
      <section className="card whatsapp-panel">
        <div className="section-heading">
          <h2>{t.whatsapp.wizardTitle}</h2>
          <p>{t.whatsapp.wizardProgress.replace('{step}', String(activeStep)).replace('{total}', '4')}</p>
        </div>
        <div className="whatsapp-wizard-progress">
          <div className="whatsapp-wizard-progress-bar" style={{ width: `${progressPercent}%` }}></div>
        </div>
        {activeStep === 1 ? (
          <>
            <div className="section-heading">
              <h2>{t.whatsapp.stepConnectLabel}</h2>
              <p>{t.whatsapp.connectStepDescription}</p>
            </div>
            <div className="form-group">
              <label className="form-label">{t.whatsapp.businessAccountId}</label>
              <input className="input" value={formData.businessAccountId} onChange={(e) => setFormData({ ...formData, businessAccountId: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">{t.whatsapp.phoneNumberId}</label>
              <input className="input" value={formData.phoneNumberId} onChange={(e) => setFormData({ ...formData, phoneNumberId: e.target.value })} />
            </div>
            <div className="whatsapp-form-actions">
              <a
                className="btn btn-secondary"
                href="https://developers.facebook.com/apps/"
                target="_blank"
                rel="noreferrer"
                onClick={() => setStartedConnectStep(true)}
              >
                {t.whatsapp.openMetaConsole}
              </a>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !canPassStep1}>
                {saving ? t.common.loading : t.whatsapp.connectAction}
              </button>
            </div>
            <a className="whatsapp-help-link" href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" target="_blank" rel="noreferrer">
              {t.whatsapp.needHelp}
            </a>
          </>
        ) : null}
        {activeStep === 2 ? (
          <>
            <div className="section-heading">
              <h2>{t.whatsapp.stepTokenLabel}</h2>
              <p>{t.whatsapp.tokenStepDescription}</p>
            </div>
            <div className="form-group">
              <label className="form-label">{t.whatsapp.accessToken}</label>
              <input
                className="input"
                type="password"
                value={formData.accessToken}
                onPaste={() => setTokenPasted(true)}
                onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
                placeholder={t.whatsapp.tokenPlaceholder}
              />
            </div>
            <p>
              {tokenPasted ? t.whatsapp.tokenPasteDetected : t.whatsapp.tokenFormatHint}
            </p>
            <a className="whatsapp-help-link" href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" target="_blank" rel="noreferrer">
              {t.whatsapp.needHelp}
            </a>
          </>
        ) : null}
        {activeStep === 3 ? (
          <>
            <div className="section-heading">
              <h2>{t.whatsapp.stepVerifyLabel}</h2>
              <p>
                {t.whatsapp.statusLabel}: {connection?.isActive ? t.whatsapp.connected : t.whatsapp.notConnected}
                {connection?.displayPhone ? ` • ${connection.displayPhone}` : ''}
              </p>
            </div>
            <div className="whatsapp-form-actions">
              <button
                className="btn btn-secondary"
                onClick={handleVerify}
                disabled={
                  verifying ||
                  (!connection &&
                    (!formData.businessAccountId.trim() || !formData.phoneNumberId.trim() || !formData.accessToken.trim()))
                }
              >
                {verifying ? t.common.loading : t.whatsapp.verify}
              </button>
              {!connection?.isActive ? <p>{t.whatsapp.verifyFixHint}</p> : null}
            </div>
            <a className="whatsapp-help-link" href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" target="_blank" rel="noreferrer">
              {t.whatsapp.needHelp}
            </a>
          </>
        ) : null}
        {activeStep === 4 ? (
          <>
            <div className="section-heading">
              <h2>{t.whatsapp.stepTestLabel}</h2>
              <p>{t.whatsapp.inboxSubtitle}</p>
            </div>
            <div className="form-group">
              <label className="form-label">{t.whatsapp.targetPhone}</label>
              <input
                className="input"
                value={testData.toPhone}
                onChange={(e) => setTestData({ ...testData, toPhone: e.target.value })}
                placeholder={t.whatsapp.testPhonePlaceholder}
              />
            </div>
            <div className="form-group">
              <label className="form-label">{t.whatsapp.testMessage}</label>
              <textarea className="input" rows={5} value={testData.content} onChange={(e) => setTestData({ ...testData, content: e.target.value })} />
            </div>
            <div className="whatsapp-form-actions">
              <button className="btn btn-success" onClick={handleSendTest} disabled={sending || !testData.toPhone.trim() || !testData.content.trim()}>
                {sending ? t.common.loading : t.whatsapp.sendTest}
              </button>
            </div>
            <label className="whatsapp-checkline">
              <input type="checkbox" checked={testReceivedConfirmed} onChange={(e) => setTestReceivedConfirmed(e.target.checked)} />
              <span>{t.whatsapp.testReceivedLabel}</span>
            </label>
            {testReceivedConfirmed ? <div className="alert alert-success"><span>{t.whatsapp.wizardSuccess}</span></div> : null}
            <a className="whatsapp-help-link" href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" target="_blank" rel="noreferrer">
              {t.whatsapp.needHelp}
            </a>
          </>
        ) : null}
        <div className="whatsapp-form-actions">
          <button className="btn btn-secondary" onClick={goBack} disabled={activeStep === 1}>
            {t.common.back}
          </button>
          <button className="btn btn-primary" onClick={goNext} disabled={(activeStep === 1 && !canPassStep1) || (activeStep === 2 && !canPassStep2) || (activeStep === 3 && !canPassStep3) || (activeStep === 4 && !canPassStep4)}>
            {activeStep === 4 ? t.whatsapp.finishSetup : t.common.next}
          </button>
        </div>
      </section>

      <div className="whatsapp-step-grid">
        <section className="card whatsapp-panel">
          <div className="section-heading">
            <h2>{t.whatsapp.logs}</h2>
            <p>{t.whatsapp.overviewSubtitle}</p>
          </div>
          <div className="simple-list">
            {logs.length === 0 ? (
              <div className="simple-list-item">
                <div>
                  <strong>{t.whatsapp.noLogs}</strong>
                </div>
              </div>
            ) : (
              logs.slice(0, 5).map((log) => (
                <div key={log.id} className="simple-list-item">
                  <div>
                    <strong>{log.lead?.name || log.toPhone}</strong>
                    <p>{log.content}</p>
                  </div>
                  <span className="task-pill">{log.status}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
      );
    })()
  );

  const renderInboxView = () => {
    const readinessUiState = mapSendReadinessState(inboxReadiness, inboxReadinessLoading, Boolean(inboxReadinessError));
    const sendBlocked = readinessUiState !== 'READY_TO_SEND';
    const selectedContactHasUnread = prioritizedContacts.find((contact) => contact.phone === selectedPhone)?.unreadCount || 0;
    const firstUnreadContact = prioritizedContacts.find((contact) => contact.unreadCount > 0);
    const blockerMessage = outside24hWindow
      ? 'Outside 24h window. Send a template message first.'
      : (inboxReadinessError || inboxReadiness?.reasonMessage || t.common.error);

    return (
      <section className="whatsapp-inbox-view">
        <div className="whatsapp-inbox-grid grid grid-cols-1 gap-4 md:grid-cols-[280px_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)_320px]">
          <aside className="whatsapp-inbox-leads-pane hidden min-w-0 rounded-xl bg-white p-3 shadow-sm md:flex md:flex-col">
            <div className="mb-3">
              <p className="text-sm font-semibold text-slate-900">Leads</p>
              <p className="text-xs text-slate-500">Select a conversation to continue.</p>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {loadingContacts ? (
                <p className="text-sm text-slate-500">{t.whatsapp.loadingContacts}</p>
              ) : prioritizedContacts.length === 0 ? (
                <p className="text-sm text-slate-500">{t.whatsapp.noContacts}</p>
              ) : (
                prioritizedContacts.map((contact) => (
                  <LeadListItem
                    key={`lead-${contact.phone}`}
                    contact={contact}
                    active={selectedPhone === contact.phone}
                    onSelect={handleSelectContact}
                  />
                ))
              )}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <button
                className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                disabled={loadingContacts || contactsPage <= 1}
                onClick={() => setContactsPage((prev) => Math.max(1, prev - 1))}
              >
                {t.whatsapp.prevPage}
              </button>
              <span className="text-xs text-slate-500">{contactsPage}/{contactsTotalPages}</span>
              <button
                className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                disabled={loadingContacts || contactsPage >= contactsTotalPages}
                onClick={() => setContactsPage((prev) => Math.min(contactsTotalPages, prev + 1))}
              >
                {t.whatsapp.nextPage}
              </button>
            </div>
          </aside>

          <section className="whatsapp-inbox-conversation-shell min-w-0 rounded-xl bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{selectedContact?.lead?.name || selectedPhone || 'Conversation'}</p>
                  <p className="text-xs text-slate-500">
                    {selectedPhone
                      ? `${selectedPhone}${selectedContactHasUnread > 0 ? ` • ${selectedContactHasUnread} unread` : ''}`
                      : t.whatsapp.step2Body}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isTablet ? (
                    <button
                      type="button"
                      onClick={() => setAiDrawerOpen((current) => !current)}
                      className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700"
                    >
                      {aiDrawerOpen ? 'Hide AI' : 'Show AI'}
                    </button>
                  ) : null}
                  <button
                    className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                    onClick={() => loadConversation(selectedPhone)}
                    disabled={!selectedPhone || loadingConversation}
                  >
                    {loadingConversation ? t.common.loading : t.whatsapp.refreshChat}
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 md:hidden">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Lead selector</label>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-700"
                value={selectedPhone}
                onChange={(event) => handleSelectContact(event.target.value)}
              >
                {prioritizedContacts.map((contact) => (
                  <option key={`option-${contact.phone}`} value={contact.phone}>
                    {contact.lead?.name || contact.phone}
                  </option>
                ))}
              </select>
            </div>

            {firstUnreadContact && selectedPhone !== firstUnreadContact.phone ? (
              <div className="mx-4 rounded-xl bg-blue-50 p-3 text-sm text-slate-700">
                <p className="mb-2">{t.whatsapp.unreadPriorityHint}</p>
                <button
                  type="button"
                  className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white"
                  onClick={() => handleSelectContact(firstUnreadContact.phone)}
                >
                  {t.whatsapp.openFirstUnread}
                </button>
              </div>
            ) : null}

            <div className="whatsapp-inbox-body">
              <MemoryPanel
                intent={aiMemory.intent}
                status={aiMemory.status}
                issues={aiMemory.issues}
                tone={aiMemory.tone}
                nextStep={aiMemory.nextStep}
              />

              <div ref={conversationBodyRef} className="whatsapp-inbox-conversation-scroll mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3">
                {!selectedPhone ? (
                  <div className="text-sm text-slate-500">{t.whatsapp.selectContact}</div>
                ) : loadingConversation ? (
                  <div className="text-sm text-slate-500">{t.whatsapp.loadingConversation}</div>
                ) : conversation.length === 0 ? (
                  <div className="text-sm text-slate-500">{t.whatsapp.noMessages}</div>
                ) : (
                  conversation.map((msg) => {
                    const outbound = msg.direction !== 'inbound';
                    const voiceTranscribed = msg.messageType === 'audio' && msg.transcriptionStatus === 'success';
                    const voiceUnavailable = msg.messageType === 'audio' && msg.transcriptionStatus === 'failed';
                    return (
                      <div
                        key={msg.id}
                        className={`whatsapp-message-bubble ${outbound ? 'whatsapp-message-outbound' : 'whatsapp-message-inbound'}`}
                      >
                        {(voiceTranscribed || voiceUnavailable) && (
                          <div
                            className={`whatsapp-message-badge ${voiceTranscribed ? 'whatsapp-message-badge-success' : 'whatsapp-message-badge-failed'}`}
                          >
                            {voiceTranscribed ? t.whatsapp.voiceTranscribed : t.whatsapp.voiceUnavailable}
                          </div>
                        )}
                        <div className="whatsapp-message-content">{msg.content}</div>
                        <div className="whatsapp-message-meta">
                          {(msg.direction || 'outbound')} • {msg.status} • {new Date(msg.createdAt).toLocaleString()}
                        </div>
                        {(msg.error || msg.transcriptionError) && (
                          <div className="whatsapp-message-error">{msg.error || msg.transcriptionError}</div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="sticky bottom-0 mt-3 rounded-xl bg-white/95 p-3 shadow-sm">
                <div className="relative">
                  <textarea
                    ref={composerTextareaRef}
                    className="w-full rounded-xl border border-slate-200 bg-white p-3 pr-16 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
                    rows={3}
                    value={composerText}
                    onChange={(e) => setComposerText(e.target.value)}
                    placeholder={t.whatsapp.composerPlaceholder}
                    disabled={!selectedPhone || sending}
                  />
                  <button
                    type="button"
                    className="absolute bottom-2 right-2 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
                    disabled={!leadLinked || aiLoading}
                    onClick={() => handleGenerateAiSuggestion()}
                  >
                    AI
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    onClick={handleSendFromInbox}
                    disabled={!selectedPhone || sending || !composerText.trim() || sendBlocked}
                  >
                    {sending ? t.common.loading : t.whatsapp.replyNow}
                  </button>
                  {aiSuggestion ? (
                    <button
                      className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700"
                      onClick={() => setComposerText(aiSuggestion)}
                    >
                      Use AI Suggestion
                    </button>
                  ) : null}
                </div>

                {sendBlocked ? (
                  <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    {blockerMessage}
                  </div>
                ) : null}

                <details className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-700">{t.whatsapp.secondaryActionsSummary}</summary>
                  <div className="mt-2 grid gap-2">
                    <select
                      className="w-full rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-700"
                      value={mediaType}
                      onChange={(e) => setMediaType(e.target.value as 'image' | 'document')}
                      disabled={!selectedPhone || sendingMedia}
                    >
                      <option value="image">{t.whatsapp.mediaTypeImage}</option>
                      <option value="document">{t.whatsapp.mediaTypeDocument}</option>
                    </select>
                    <input
                      ref={mediaInputRef}
                      type="file"
                      className="hidden-file-input"
                      accept={mediaType === 'image' ? 'image/*' : '.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.ppt,.pptx,application/*'}
                      onChange={handleMediaFileInput}
                    />
                    <div
                      className={`whatsapp-upload-dropzone ${isMediaDragActive ? 'whatsapp-upload-dropzone-active' : ''}`}
                      onDragEnter={(event) => {
                        event.preventDefault();
                        setIsMediaDragActive(true);
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDragLeave={(event) => {
                        event.preventDefault();
                        setIsMediaDragActive(false);
                      }}
                      onDrop={handleMediaDrop}
                      onClick={() => mediaInputRef.current?.click()}
                    >
                      {mediaFile ? `${t.whatsapp.fileSelected}: ${mediaFile.name}` : t.whatsapp.dropOrUpload}
                    </div>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-700"
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                      placeholder={t.whatsapp.mediaUrlPlaceholder}
                      disabled={!selectedPhone || sendingMedia}
                    />
                    <button
                      className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                      onClick={handleSendMediaFromInbox}
                      disabled={!selectedPhone || sendingMedia || (!mediaFile && !mediaUrl.trim())}
                    >
                      {sendingMedia ? t.common.loading : t.whatsapp.sendMedia}
                    </button>
                  </div>
                </details>
              </div>
            </div>
          </section>

          <aside className="whatsapp-inbox-ai-pane hidden min-w-0 lg:block">
            <AIPanel
              suggestion={aiSuggestion}
              loading={aiLoading}
              disabled={!leadLinked}
              disableReason={aiPanelDisableReason || aiPanelError}
              showOutside24h={outside24hWindow}
              templateSuggestion={suggestedTemplateMessage}
              onUse={() => setComposerText(aiSuggestion)}
              onEdit={() => composerTextareaRef.current?.focus()}
              onRegenerate={() => void handleGenerateAiSuggestion()}
              onQuickAction={(intent) => void handleGenerateAiSuggestion(intent)}
              onSendTemplate={() => void handleSendTemplateMessage(false)}
              onSendAndContinue={() => void handleSendTemplateMessage(true)}
            />
          </aside>
        </div>

        {isTablet && aiDrawerOpen ? (
          <div className="fixed inset-0 z-40 bg-slate-900/30" onClick={() => setAiDrawerOpen(false)}>
            <div
              className="absolute right-0 top-0 h-full w-[340px] max-w-[92vw] overflow-y-auto bg-slate-50 p-4"
              onClick={(event) => event.stopPropagation()}
            >
              <AIPanel
                suggestion={aiSuggestion}
                loading={aiLoading}
                disabled={!leadLinked}
                disableReason={aiPanelDisableReason || aiPanelError}
                showOutside24h={outside24hWindow}
                templateSuggestion={suggestedTemplateMessage}
                onUse={() => setComposerText(aiSuggestion)}
                onEdit={() => composerTextareaRef.current?.focus()}
                onRegenerate={() => void handleGenerateAiSuggestion()}
                onQuickAction={(intent) => void handleGenerateAiSuggestion(intent)}
                onSendTemplate={() => void handleSendTemplateMessage(false)}
                onSendAndContinue={() => void handleSendTemplateMessage(true)}
              />
            </div>
          </div>
        ) : null}

        {isMobile ? (
          <details
            open={aiAccordionOpen}
            onToggle={(event) => setAiAccordionOpen((event.currentTarget as HTMLDetailsElement).open)}
            className="rounded-xl bg-slate-50 p-3 shadow-sm"
          >
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">AI panel</summary>
            <div className="mt-3">
              <AIPanel
                suggestion={aiSuggestion}
                loading={aiLoading}
                disabled={!leadLinked}
                disableReason={aiPanelDisableReason || aiPanelError}
                showOutside24h={outside24hWindow}
                templateSuggestion={suggestedTemplateMessage}
                onUse={() => setComposerText(aiSuggestion)}
                onEdit={() => composerTextareaRef.current?.focus()}
                onRegenerate={() => void handleGenerateAiSuggestion()}
                onQuickAction={(intent) => void handleGenerateAiSuggestion(intent)}
                onSendTemplate={() => void handleSendTemplateMessage(false)}
                onSendAndContinue={() => void handleSendTemplateMessage(true)}
              />
            </div>
          </details>
        ) : null}
      </section>
    );
  };

  const renderContactsView = () => (
    <section className="card whatsapp-panel">
      <div className="section-heading">
        <h2>{t.whatsapp.customerInsights}</h2>
        <p>{t.whatsapp.contactsSubtitle}</p>
      </div>

      <div className="whatsapp-insight-toolbar">
        <input
          className="input"
          value={contactQuery}
          onChange={(e) => {
            setContactQuery(e.target.value);
            setContactsPage(1);
          }}
          placeholder={t.whatsapp.searchPlaceholder}
        />
        <select
          className="input whatsapp-page-size"
          value={contactsPageSize}
          onChange={(e) => {
            setContactsPageSize(Number(e.target.value));
            setContactsPage(1);
          }}
        >
          <option value={8}>{t.whatsapp.perPage.replace('{count}', '8')}</option>
          <option value={12}>{t.whatsapp.perPage.replace('{count}', '12')}</option>
          <option value={20}>{t.whatsapp.perPage.replace('{count}', '20')}</option>
        </select>
      </div>

      <div className="page-subtitle whatsapp-insight-meta">
        {t.whatsapp.totalContacts}: {contactsTotal} • {t.whatsapp.currentPageItems}: {contacts.length}/{contactsPageSize}
      </div>

      {loading || loadingContacts ? (
        <p>{t.common.loading}</p>
      ) : contacts.length === 0 ? (
        <p className="page-subtitle">{t.whatsapp.noContacts}</p>
      ) : (
        <div className="whatsapp-insight-list">
          {contacts.map((contact) => {
            const sentRate = contact.totalMessages > 0
              ? Math.round((contact.sentCount / contact.totalMessages) * 100)
              : 0;

            return (
              <article key={contact.phone} className="whatsapp-insight-card">
                <div className="whatsapp-insight-top">
                  <div>
                    <strong>{contact.lead?.name || contact.phone}</strong>
                    <p>
                      {contact.lead
                        ? `${t.whatsapp.linkedLead}: ${contact.lead.name} (${contact.lead.status})`
                        : `${t.whatsapp.phone}: ${contact.phone}`}
                    </p>
                  </div>
                  <span className="task-pill">{contact.lastStatus}</span>
                </div>
                <div className="page-subtitle">
                  {t.whatsapp.successRate}: {sentRate}% • {t.whatsapp.totalMessages}: {contact.totalMessages}
                </div>
                <div className="whatsapp-contact-preview">{contact.lastMessage}</div>
                {contact.lastError && <div className="whatsapp-message-error">{contact.lastError}</div>}
                <div className="whatsapp-form-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      handleSelectContact(contact.phone);
                      setActiveView('inbox');
                    }}
                  >
                    {t.whatsapp.openConversation}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );

  return (
    <div className={`page-container ${activeView === 'inbox' ? 'whatsapp-page-inbox' : ''}`}>
      <AuthenticatedHeader
        title={t.whatsapp.title}
        subtitle={connection?.isActive ? t.whatsapp.inboxSubtitle : t.whatsapp.setupPanelTitle}
        whatsappUnreadCount={unreadContacts.length}
      />

      {error && <div className="alert alert-error"><span>{error}</span></div>}
      {success && <div className="alert alert-success"><span>{success}</span></div>}

      {activeView !== 'inbox' && showUnreadBanner && latestUnreadContact && (
        <section className="card whatsapp-unread-banner">
          <div>
            <strong>{t.whatsapp.unreadMessagesLabel}: {latestUnreadContact.lead?.name || latestUnreadContact.phone}</strong>
            <p>{latestUnreadContact.lastMessage || t.whatsapp.unreadMessagesHint}</p>
          </div>
          <div className="whatsapp-form-actions">
            <button type="button" className="btn btn-primary" onClick={openUnreadConversation}>
              {t.whatsapp.openConversation}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowUnreadBanner(false)}>
              {t.common.close}
            </button>
          </div>
        </section>
      )}

      {activeView !== 'inbox' ? (
        <section className="card whatsapp-overview">
          <div className="section-heading">
            <h2>{t.whatsapp.overviewTitle}</h2>
            <p>{t.whatsapp.overviewSubtitle}</p>
          </div>
          <div className="whatsapp-kpi-grid">
            <div className="simple-list-item">
              <div>
                <strong>{t.whatsapp.statusLabel}</strong>
                <p>{connection?.isActive ? t.whatsapp.connected : t.whatsapp.notConnected}</p>
              </div>
              <div className="whatsapp-status-pill-stack">
                <span className={`task-pill ${workspaceReadiness?.verified ? '' : 'task-pill-overdue'}`}>
                  Verified: {workspaceReadiness?.verified ? 'Yes' : 'No'}
                </span>
                <span className={`task-pill ${workspaceReadiness?.send_ready ? '' : 'task-pill-overdue'}`}>
                  Send-ready: {workspaceReadiness?.send_ready ? 'Yes' : 'Action required'}
                </span>
              </div>
            </div>
            <div className="simple-list-item">
              <div>
                <strong>{t.whatsapp.connectedNumber}</strong>
                <p>{connection?.displayPhone || t.whatsapp.notConnected}</p>
              </div>
              <span className="task-pill">{contactsTotal}</span>
            </div>
            <div className="simple-list-item">
              <div>
                <strong>{t.whatsapp.messageVolume}</strong>
                <p>{t.whatsapp.totalMessages}</p>
              </div>
              <span className="task-pill">{totalMessages}</span>
            </div>
            <div className="simple-list-item">
              <div>
                <strong>{t.whatsapp.failedMessages}</strong>
                <p>
                  {t.whatsapp.lastVerified}: {connection?.lastVerifiedAt ? new Date(connection.lastVerifiedAt).toLocaleString() : t.whatsapp.notVerifiedYet}
                </p>
              </div>
              <span className={`task-pill ${totalFailedMessages > 0 ? 'task-pill-overdue' : ''}`}>{totalFailedMessages}</span>
            </div>
            <div className="simple-list-item">
              <div>
                <strong>{t.whatsapp.unreadMessagesLabel}</strong>
                <p>{t.whatsapp.unreadMessagesHint}</p>
              </div>
              <span className={`task-pill ${unreadContacts.length > 0 ? 'task-pill-overdue' : ''}`}>{totalUnreadMessages}</span>
            </div>
          </div>
        </section>
      ) : null}

      <div className="whatsapp-view-switch">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`whatsapp-view-tab ${activeView === tab.id ? 'whatsapp-view-tab-active' : ''}`}
            onClick={() => setActiveView(tab.id)}
          >
            {tab.label}
            {tab.count ? <span className="whatsapp-tab-badge">{tab.count}</span> : null}
          </button>
        ))}
      </div>

      {activeView === 'setup' && renderSetupView()}
      {activeView === 'inbox' && renderInboxView()}
      {activeView === 'contacts' && renderContactsView()}

      {activeView === 'inbox' && selectedPhone && conversation.length > 0 && !isConversationAtBottom && (
        <button type="button" className="whatsapp-scroll-latest" onClick={scrollConversationToLatest}>
          {t.whatsapp.jumpToLatest}
        </button>
      )}
      {activeView === 'inbox' && selectedPhone && conversation.length > 0 && !isConversationNearTop && (
        <button type="button" className="whatsapp-scroll-top" onClick={scrollConversationToTop}>
          Back to top
        </button>
      )}
    </div>
  );
};

export default WhatsApp;
