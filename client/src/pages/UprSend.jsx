import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, downloadPdf } from '../api.js';
import { useAuth } from '../AuthContext.jsx';
import Layout, { StatusBadge, ErrorNote, Note, btn } from '../components/Layout.jsx';

export default function UprSend() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [upr, setUpr] = useState(null);
  const [target, setTarget] = useState(null); // { name, email } — the fixed Purchase Head recipient
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api(`/upr/${id}`).then(setUpr).catch((e) => setError(e.message));
    api('/upr/send-target').then(setTarget).catch(() => setTarget({ name: null, email: null }));
  }, [id]);

  async function send() {
    if (!window.confirm(`Send this UPR to ${target?.email}?`)) return;
    setBusy(true);
    setError('');
    try {
      const r = await api(`/upr/${id}/send`, { method: 'POST', body: {} });
      setResult(r);
      setUpr((u) => ({ ...u, status: 'sent', sentToEmail: r.sentTo, sentAt: new Date().toISOString() }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!upr) {
    return (
      <Layout title="Send UPR">
        <ErrorNote error={error} />
        <div className="text-ink-faint">Loading…</div>
      </Layout>
    );
  }

  const totalItems = upr.lines.length;
  const totalQty = upr.lines.reduce((s, l) => s + (Number(l.requiredQty) || 0), 0);

  return (
    <Layout
      title={`Send UPR — ${upr.unit?.name}`}
      subtitle={upr.cycleDate}
      actions={<StatusBadge status={upr.status} lg />}
    >
      <ErrorNote error={error} />
      {result && (
        <Note tone="ok">
          Sent to {result.sentTo}.
          {result.devMode && ' (Dev mode: SMTP not configured — the email was logged on the server, not delivered.)'}
        </Note>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-5">
          <h2 className="font-display text-base font-semibold mb-4">Requisition summary</h2>
          <dl className="text-sm space-y-2.5">
            <div className="flex justify-between gap-4"><dt className="text-ink-soft">Unit</dt><dd className="font-medium">{upr.unit?.name}{upr.unit?.city ? `, ${upr.unit.city}` : ''}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink-soft">Requisition date</dt><dd className="font-mono text-[13px]">{upr.cycleDate}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink-soft">Items</dt><dd className="font-mono text-[13px]">{totalItems}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink-soft">Total required qty</dt><dd className="font-mono text-[13px]">{totalQty}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-ink-soft">Verified by</dt><dd>{upr.verifiedSignName} {upr.verifiedAt && <span className="text-ink-faint">· {new Date(upr.verifiedAt).toLocaleString()}</span>}</dd></div>
            {upr.status === 'sent' && (
              <div className="flex justify-between gap-4"><dt className="text-ink-soft">Sent</dt><dd>{upr.sentToEmail} {upr.sentAt && <span className="text-ink-faint">· {new Date(upr.sentAt).toLocaleString()}</span>}</dd></div>
            )}
          </dl>
          <button
            className={btn('subtle') + ' mt-5'}
            onClick={() => downloadPdf(upr._id, `UPR-${upr.unit?.name}-${upr.cycleDate}.pdf`).catch((e) => setError(e.message))}
          >
            Download PDF
          </button>
        </div>

        <div className="card p-5">
          <h2 className="font-display text-base font-semibold mb-4">Send to Purchase Head</h2>
          {upr.status === 'verified' ? (
            <>
              <p className="text-sm text-ink-soft mb-1">Recipient (fixed for all UPRs)</p>
              {target?.email ? (
                <div className="rounded-lg border border-line bg-paper px-3.5 py-2.5">
                  {target.name && <div className="text-sm font-medium">{target.name}</div>}
                  <div className="text-sm text-ink-soft font-mono">{target.email}</div>
                </div>
              ) : (
                <Note tone="warn">
                  No Purchase Head email configured — ask the Admin to set the Purchase Head user's email.
                </Note>
              )}
              <p className="text-xs text-ink-faint mt-2 font-mono">
                Subject: UPR — {upr.unit?.name} — {upr.cycleDate} · PDF attached
              </p>
              <button className={btn('green') + ' mt-5 w-full py-2.5'} onClick={send} disabled={busy || !target?.email}>
                {busy ? 'Sending…' : 'Send email with PDF'}
              </button>
            </>
          ) : upr.status === 'sent' ? (
            <p className="text-sm text-ink-soft">
              This UPR was sent and is locked. Corrections go into the next cycle's DPRs.
            </p>
          ) : (
            <p className="text-sm text-ink-soft">Verify the UPR first to enable sending.</p>
          )}
          <button className={btn('subtle') + ' mt-5'} onClick={() => navigate('/unit')}>Back to dashboard</button>
        </div>
      </div>
    </Layout>
  );
}
