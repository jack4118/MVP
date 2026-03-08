import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { whatsappApi, WhatsAppConnection, WhatsAppContactSummary, WhatsAppLogItem } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import ThemeToggle from '../components/ThemeToggle';
import LanguageToggle from '../components/LanguageToggle';

const WhatsApp = () => {
  const { t } = useLanguage();
  const [connection, setConnection] = useState<WhatsAppConnection | null>(null);
  const [logs, setLogs] = useState<WhatsAppLogItem[]>([]);
  const [contacts, setContacts] = useState<WhatsAppContactSummary[]>([]);
  const [selectedPhone, setSelectedPhone] = useState('');
  const [conversation, setConversation] = useState<WhatsAppLogItem[]>([]);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
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
    if (!selectedPhone) {
      setConversation([]);
      return;
    }
    loadConversation(selectedPhone);
  }, [selectedPhone]);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [conn, logResp, contactResp] = await Promise.all([
        whatsappApi.getConnection(),
        whatsappApi.getLogs(30),
        whatsappApi.getContacts(50),
      ]);
      if (conn.success) {
        const existingConnection = conn.data || null;
        setConnection(existingConnection);
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
      if (contactResp.success && contactResp.data) {
        setContacts(contactResp.data);
        if (!selectedPhone && contactResp.data.length > 0) {
          const first = contactResp.data[0]?.phone || '';
          setSelectedPhone(first);
          if (first) {
            setTestData((prev) => ({ ...prev, toPhone: first }));
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.common.error);
    } finally {
      setLoading(false);
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
    } catch (err) {
      const message =
        (err as any)?.response?.data?.error?.message ||
        (err instanceof Error ? err.message : t.common.error);
      setError(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <div className="header-left">
          <Link to="/dashboard" className="home-link">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
          </Link>
          <h1 className="page-title">{t.whatsapp.title}</h1>
        </div>
        <div className="header-actions">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </header>

      {error && <div className="alert alert-error"><span>{error}</span></div>}
      {success && <div className="alert alert-success"><span>{success}</span></div>}

      <div className="card" style={{ marginBottom: '16px', background: 'linear-gradient(135deg, rgba(55,180,90,0.12), rgba(35,115,200,0.08))' }}>
        <h2 style={{ marginTop: 0 }}>{t.whatsapp.setup}</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          {t.whatsapp.statusLabel}: {connection?.isActive ? t.whatsapp.connected : t.whatsapp.notConnected}
          {connection?.displayPhone ? ` • ${connection.displayPhone}` : ''}
        </p>

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

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? t.common.loading : t.whatsapp.save}</button>
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
      </div>

      <div className="card" style={{ marginBottom: '16px' }}>
        <h2 style={{ marginTop: 0 }}>{t.whatsapp.sendTest}</h2>
        <div className="form-group">
          <label className="form-label">{t.whatsapp.targetPhone}</label>
          <input className="input" value={testData.toPhone} onChange={(e) => setTestData({ ...testData, toPhone: e.target.value })} placeholder="60123456789" />
        </div>
        <div className="form-group">
          <label className="form-label">{t.whatsapp.testMessage}</label>
          <textarea className="input" rows={4} value={testData.content} onChange={(e) => setTestData({ ...testData, content: e.target.value })} />
        </div>
        <button className="btn btn-success" onClick={handleSendTest} disabled={sending}>{sending ? t.common.loading : t.whatsapp.sendTest}</button>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t.whatsapp.chatView}</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden', flex: '1 1 280px', minWidth: '260px' }}>
            <div style={{ padding: '10px', borderBottom: '1px solid var(--border-color)', fontSize: '13px', color: 'var(--text-secondary)' }}>
              {t.whatsapp.contacts}
            </div>
            <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
              {contacts.length === 0 ? (
                <div style={{ padding: '10px', color: 'var(--text-secondary)' }}>{t.whatsapp.noContacts}</div>
              ) : (
                contacts.map((contact) => (
                  <button
                    key={`chat-${contact.phone}`}
                    type="button"
                    onClick={() => {
                      setSelectedPhone(contact.phone);
                      setTestData((prev) => ({ ...prev, toPhone: contact.phone }));
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      borderBottom: '1px solid var(--border-color)',
                      background: selectedPhone === contact.phone ? 'rgba(80,160,255,0.12)' : 'transparent',
                      color: 'var(--text-primary)',
                      padding: '10px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{contact.lead?.name || contact.phone}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{contact.phone}</div>
                    <div style={{ marginTop: '4px', fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {contact.lastMessage}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', minHeight: '420px', display: 'flex', flexDirection: 'column', flex: '2 1 420px', minWidth: '300px' }}>
            <div style={{ padding: '10px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <strong>{selectedPhone || t.whatsapp.selectContact}</strong>
              <button className="btn btn-secondary" onClick={() => loadConversation(selectedPhone)} disabled={!selectedPhone || loadingConversation}>
                {loadingConversation ? t.common.loading : t.whatsapp.refreshChat}
              </button>
            </div>
            <div style={{ padding: '12px', display: 'grid', gap: '10px', overflowY: 'auto', maxHeight: '420px' }}>
              {!selectedPhone ? (
                <div style={{ color: 'var(--text-secondary)' }}>{t.whatsapp.selectContact}</div>
              ) : conversation.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)' }}>{t.whatsapp.noMessages}</div>
              ) : (
                conversation.map((msg) => {
                  const outbound = msg.direction !== 'inbound';
                  return (
                    <div
                      key={msg.id}
                      style={{
                        justifySelf: outbound ? 'end' : 'start',
                        maxWidth: '85%',
                        borderRadius: '10px',
                        padding: '10px',
                        background: outbound ? 'rgba(80,180,255,0.18)' : 'rgba(120,120,120,0.18)',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                      <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {(msg.direction || 'outbound')} • {msg.status} • {new Date(msg.createdAt).toLocaleString()}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t.whatsapp.customerInsights}</h2>
        {loading ? (
          <p>{t.common.loading}</p>
        ) : contacts.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>{t.whatsapp.noContacts}</p>
        ) : (
          <div style={{ display: 'grid', gap: '10px', marginBottom: '16px' }}>
            {contacts.map((contact) => {
              const sentRate = contact.totalMessages > 0
                ? Math.round((contact.sentCount / contact.totalMessages) * 100)
                : 0;
              return (
                <div key={contact.phone} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <div>
                      <strong>{contact.lead?.name || contact.phone}</strong>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {contact.lead ? `${t.whatsapp.linkedLead}: ${contact.lead.name} (${contact.lead.status})` : `${t.whatsapp.phone}: ${contact.phone}`}
                      </div>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {new Date(contact.lastAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ marginTop: '6px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {t.whatsapp.successRate}: {sentRate}% • {t.whatsapp.totalMessages}: {contact.totalMessages} • {t.whatsapp.lastStatus}: {contact.lastStatus}
                  </div>
                  <div style={{ marginTop: '6px', whiteSpace: 'pre-wrap' }}>{contact.lastMessage}</div>
                  {contact.lastError && <div style={{ marginTop: '6px', color: 'var(--error)' }}>{contact.lastError}</div>}
                  <div style={{ marginTop: '8px' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => {
                        setTestData((prev) => ({ ...prev, toPhone: contact.phone }));
                        setSelectedPhone(contact.phone);
                      }}
                    >
                      {t.whatsapp.useThisNumber}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <h2 style={{ marginTop: 0 }}>{t.whatsapp.logs}</h2>
        {loading ? (
          <p>{t.common.loading}</p>
        ) : logs.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)' }}>{t.whatsapp.noLogs}</p>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {logs.map((log) => (
              <div key={log.id} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                  <strong>{log.lead?.name || log.toPhone}</strong>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{new Date(log.createdAt).toLocaleString()}</span>
                </div>
                <div style={{ margin: '4px 0', fontSize: '12px', color: 'var(--text-secondary)' }}>status: {log.status} • to: {log.toPhone}</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{log.content}</div>
                {log.error && <div style={{ marginTop: '6px', color: 'var(--error)' }}>{log.error}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default WhatsApp;
