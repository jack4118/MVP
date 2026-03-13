import { useEffect, useMemo, useRef, useState } from 'react';
import { whatsappApi, WhatsAppConnection, WhatsAppContactSummary, WhatsAppLogItem } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import AuthenticatedHeader from '../components/AuthenticatedHeader';
import { storage } from '../utils/storage';

type WhatsAppView = 'setup' | 'inbox' | 'contacts';
const WHATSAPP_VIEW_KEY = 'whatsapp_active_view';
const WHATSAPP_SEEN_KEY = 'whatsapp_seen_messages';

const WhatsApp = () => {
  const { t } = useLanguage();
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
  const [isConversationAtBottom, setIsConversationAtBottom] = useState(true);
  const [seenMessages, setSeenMessages] = useState<Record<string, string>>(() =>
    storage.getJson<Record<string, string>>(WHATSAPP_SEEN_KEY, {})
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showUnreadBanner, setShowUnreadBanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sending, setSending] = useState(false);
  const [formData, setFormData] = useState({
    businessAccountId: '',
    phoneNumberId: '',
    accessToken: '',
  });
  const [testData, setTestData] = useState({
    toPhone: '',
    content: 'Hi! This is a test message from my CRM WhatsApp integration.',
  });

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    storage.setItem(WHATSAPP_VIEW_KEY, activeView);
  }, [activeView]);

  useEffect(() => {
    storage.setJson(WHATSAPP_SEEN_KEY, seenMessages);
  }, [seenMessages]);

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

  const markConversationSeen = (phone: string, timestamp?: string) => {
    if (!phone || !timestamp) {
      return;
    }

    setSeenMessages((current) => {
      if (current[phone] === timestamp) {
        return current;
      }

      return {
        ...current,
        [phone]: timestamp,
      };
    });
  };

  useEffect(() => {
    if (!selectedByUser || !selectedPhone || conversation.length === 0 || !isConversationAtBottom || activeView !== 'inbox') {
      return;
    }

    const latestAt = conversation[conversation.length - 1]?.createdAt;
    markConversationSeen(selectedPhone, latestAt);
  }, [selectedByUser, selectedPhone, conversation, isConversationAtBottom, activeView]);

  useEffect(() => {
    const node = conversationBodyRef.current;
    if (!node) {
      return;
    }

    const handleScroll = () => {
      const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
      setIsConversationAtBottom(distanceFromBottom < 24);
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
    () =>
      contacts.filter((contact) => {
        if (contact.lastStatus !== 'received') {
          return false;
        }

        const seenAt = seenMessages[contact.phone];
        if (!seenAt) {
          return true;
        }

        return new Date(contact.lastAt).getTime() > new Date(seenAt).getTime();
      }),
    [contacts, seenMessages]
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

  useEffect(() => {
    const baseTitle = 'EzReply';
    if (unreadContacts.length > 0) {
      document.title = `(${unreadContacts.length}) ${baseTitle}`;
      return;
    }

    document.title = baseTitle;
    return () => {
      document.title = baseTitle;
    };
  }, [unreadContacts.length]);

  const tabs = [
    { id: 'setup' as const, label: t.whatsapp.tabSetup },
    { id: 'inbox' as const, label: t.whatsapp.tabInbox, count: unreadContacts.length },
    { id: 'contacts' as const, label: t.whatsapp.tabContacts },
  ];

  const scrollConversationToLatest = () => {
    if (conversationBodyRef.current) {
      conversationBodyRef.current.scrollTo({
        top: conversationBodyRef.current.scrollHeight,
        behavior: 'smooth',
      });
      setIsConversationAtBottom(true);
      const latestAt = conversation[conversation.length - 1]?.createdAt;
      markConversationSeen(selectedPhone, latestAt);
    }
  };

  const openUnreadConversation = () => {
    if (!latestUnreadContact) {
      return;
    }

    setActiveView('inbox');
    setSelectedPhone(latestUnreadContact.phone);
    setSelectedByUser(true);
    setTestData((prev) => ({ ...prev, toPhone: latestUnreadContact.phone }));
    setShowUnreadBanner(false);
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      const [conn, logResp] = await Promise.all([
        whatsappApi.getConnection(),
        whatsappApi.getLogs(30),
      ]);
      if (conn.success) {
        const existingConnection = conn.data || null;
        setConnection(existingConnection);
        setActiveView((current) => {
          if (!existingConnection?.isActive) {
            return 'setup';
          }

          return current === 'setup' ? 'inbox' : current;
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
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
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
          if (selectedPhone && items.some((item) => item.phone === selectedPhone)) {
            return selectedPhone;
          }

          const firstUnread = items.find((item) => {
            if (item.lastStatus !== 'received') {
              return false;
            }
            const seenAt = seenMessages[item.phone];
            return !seenAt || new Date(item.lastAt).getTime() > new Date(seenAt).getTime();
          });

          return firstUnread?.phone || items[0]?.phone || '';
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
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
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
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setVerifying(false);
    }
  };

  const handleSendTest = async () => {
    try {
      setSending(true);
      setError('');
      setSuccess('');
      const response = await whatsappApi.sendText({
        toPhone: testData.toPhone,
        content: testData.content,
      });
      if (!response.success) {
        setError(response.error?.message || t.common.error);
        return;
      }
      setSuccess(t.whatsapp.testSent);
      await loadAll();
      await loadConversation(testData.toPhone);
      setActiveView('inbox');
      setSelectedByUser(true);
    } catch (err) {
      const message =
        (err as any)?.response?.data?.error?.message ||
        (err instanceof Error ? err.message : t.common.error);
      setError(message);
    } finally {
      setSending(false);
    }
  };

  const renderSetupView = () => (
    <div className="whatsapp-section-stack">
      <div className="whatsapp-step-grid">
        <section className="card whatsapp-panel">
          <div className="section-heading">
            <h2>{t.whatsapp.quickStartTitle}</h2>
            <p>{t.whatsapp.quickStartDesc}</p>
          </div>
          <ol className="whatsapp-quickstart-list">
            <li>{t.whatsapp.quickStartStep1}</li>
            <li>{t.whatsapp.quickStartStep2}</li>
            <li>{t.whatsapp.quickStartStep3}</li>
            <li>{t.whatsapp.quickStartStep4}</li>
          </ol>
          <div className="whatsapp-quickstart-actions">
            <a
              className="btn btn-secondary"
              href="https://developers.facebook.com/apps/"
              target="_blank"
              rel="noreferrer"
            >
              {t.whatsapp.openMetaConsole}
            </a>
          </div>
        </section>

        <section className="card whatsapp-panel">
          <div className="section-heading">
            <h2>{t.whatsapp.setupPanelTitle}</h2>
            <p>
              {t.whatsapp.statusLabel}: {connection?.isActive ? t.whatsapp.connected : t.whatsapp.notConnected}
              {connection?.displayPhone ? ` • ${connection.displayPhone}` : ''}
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">{t.whatsapp.businessAccountId}</label>
            <input className="input" value={formData.businessAccountId} onChange={(e) => setFormData({ ...formData, businessAccountId: e.target.value })} />
          </div>

          <div className="form-group">
            <label className="form-label">{t.whatsapp.phoneNumberId}</label>
            <input className="input" value={formData.phoneNumberId} onChange={(e) => setFormData({ ...formData, phoneNumberId: e.target.value })} />
          </div>

          <div className="form-group">
            <label className="form-label">{t.whatsapp.accessToken}</label>
            <input className="input" type="password" value={formData.accessToken} onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })} placeholder={t.whatsapp.tokenPlaceholder} />
          </div>

          <div className="whatsapp-form-actions">
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? t.common.loading : t.whatsapp.save}
            </button>
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
          </div>
        </section>
      </div>

      <div className="whatsapp-step-grid">
        <section className="card whatsapp-panel">
          <div className="section-heading">
            <h2>{t.whatsapp.testPanelTitle}</h2>
            <p>{t.whatsapp.inboxSubtitle}</p>
          </div>
          <div className="form-group">
            <label className="form-label">{t.whatsapp.targetPhone}</label>
            <input className="input" value={testData.toPhone} onChange={(e) => setTestData({ ...testData, toPhone: e.target.value })} placeholder="60123456789" />
          </div>
          <div className="form-group">
            <label className="form-label">{t.whatsapp.testMessage}</label>
            <textarea className="input" rows={5} value={testData.content} onChange={(e) => setTestData({ ...testData, content: e.target.value })} />
          </div>
          <button className="btn btn-success" onClick={handleSendTest} disabled={sending}>
            {sending ? t.common.loading : t.whatsapp.sendTest}
          </button>
        </section>

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

  const renderInboxView = () => (
    <section className="card whatsapp-panel">
      <div className="section-heading">
        <h2>{t.whatsapp.chatView}</h2>
        <p>{t.whatsapp.inboxSubtitle}</p>
      </div>
      <div className="whatsapp-chat-layout">
        <aside className="whatsapp-contact-pane">
          <div className="whatsapp-pane-header">
            <strong>{t.whatsapp.contacts}</strong>
          </div>
          <div className="whatsapp-contact-list">
            {contacts.length === 0 ? (
              <div className="whatsapp-empty-state">{t.whatsapp.noContacts}</div>
            ) : (
              contacts.map((contact) => (
                <button
                  key={`chat-${contact.phone}`}
                  type="button"
                  onClick={() => {
                    setSelectedPhone(contact.phone);
                    setSelectedByUser(true);
                    setTestData((prev) => ({ ...prev, toPhone: contact.phone }));
                  }}
                  className={`whatsapp-contact-button ${selectedPhone === contact.phone ? 'whatsapp-contact-button-active' : ''}`}
                >
                  <div className="whatsapp-contact-title-row">
                    <strong>{contact.lead?.name || contact.phone}</strong>
                    {unreadContacts.some((item) => item.phone === contact.phone) && (
                      <span className="unread-dot" aria-label={t.whatsapp.unreadMessagesLabel}></span>
                    )}
                  </div>
                  <div>
                    <p>{contact.phone}</p>
                  </div>
                  <div className="whatsapp-contact-preview">{contact.lastMessage}</div>
                </button>
              ))
            )}
          </div>
          <div className="whatsapp-pagination">
            <button
              className="btn btn-secondary"
              disabled={loadingContacts || contactsPage <= 1}
              onClick={() => setContactsPage((prev) => Math.max(1, prev - 1))}
            >
              {t.whatsapp.prevPage}
            </button>
            <span>
              {t.whatsapp.pageLabel}: {contactsPage}/{contactsTotalPages}
            </span>
            <button
              className="btn btn-secondary"
              disabled={loadingContacts || contactsPage >= contactsTotalPages}
              onClick={() => setContactsPage((prev) => Math.min(contactsTotalPages, prev + 1))}
            >
              {t.whatsapp.nextPage}
            </button>
          </div>
        </aside>

        <section className="whatsapp-conversation-pane">
          <div className="whatsapp-pane-header">
            <div>
              <strong>{selectedContact?.lead?.name || selectedPhone || t.whatsapp.selectContact}</strong>
              <p>{selectedContact?.phone || t.whatsapp.selectContact}</p>
            </div>
            <button className="btn btn-secondary" onClick={() => loadConversation(selectedPhone)} disabled={!selectedPhone || loadingConversation}>
              {loadingConversation ? t.common.loading : t.whatsapp.refreshChat}
            </button>
          </div>
          <div className="whatsapp-chat-body" ref={conversationBodyRef}>
            {!selectedPhone ? (
              <div className="whatsapp-empty-state">{t.whatsapp.selectContact}</div>
            ) : conversation.length === 0 ? (
              <div className="whatsapp-empty-state">{t.whatsapp.noMessages}</div>
            ) : (
              conversation.map((msg) => {
                const outbound = msg.direction !== 'inbound';
                return (
                  <div
                    key={msg.id}
                    className={`whatsapp-message-bubble ${outbound ? 'whatsapp-message-outbound' : 'whatsapp-message-inbound'}`}
                  >
                    <div className="whatsapp-message-content">{msg.content}</div>
                    <div className="whatsapp-message-meta">
                      {(msg.direction || 'outbound')} • {msg.status} • {new Date(msg.createdAt).toLocaleString()}
                    </div>
                    {msg.error && <div className="whatsapp-message-error">{msg.error}</div>}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </section>
  );

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
          <option value={8}>8 / page</option>
          <option value={12}>12 / page</option>
          <option value={20}>20 / page</option>
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
                      setTestData((prev) => ({ ...prev, toPhone: contact.phone }));
                      setSelectedPhone(contact.phone);
                      setSelectedByUser(true);
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
    <div className="page-container">
      <AuthenticatedHeader
        title={t.whatsapp.title}
        subtitle={connection?.isActive ? t.whatsapp.inboxSubtitle : t.whatsapp.setupPanelTitle}
      />

      {error && <div className="alert alert-error"><span>{error}</span></div>}
      {success && <div className="alert alert-success"><span>{success}</span></div>}

      {showUnreadBanner && latestUnreadContact && (
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
            <span className={`task-pill ${connection?.isActive ? '' : 'task-pill-overdue'}`}>
              {connection?.isActive ? t.whatsapp.connected : t.whatsapp.notConnected}
            </span>
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
            <span className={`task-pill ${unreadContacts.length > 0 ? 'task-pill-overdue' : ''}`}>{unreadContacts.length}</span>
          </div>
        </div>
      </section>

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
        <button type="button" className="whatsapp-scroll-latest whatsapp-scroll-latest-fixed" onClick={scrollConversationToLatest}>
          {t.whatsapp.jumpToLatest}
        </button>
      )}
    </div>
  );
};

export default WhatsApp;
