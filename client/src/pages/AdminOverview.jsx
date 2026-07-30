import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Layout, { StatusBadge, ErrorNote, EmptyState, Stat } from '../components/Layout.jsx';

export default function AdminOverview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/reports/overview').then(setData).catch((e) => setError(e.message));
  }, []);

  const sentCount = data?.units.filter((u) => u.uprStatus === 'sent').length || 0;
  const inProgress = data?.units.filter((u) => ['draft', 'verified'].includes(u.uprStatus)).length || 0;
  const notStarted = (data?.units.length || 0) - sentCount - inProgress;

  return (
    <Layout title="Cross-unit overview" subtitle={`Today's requisition status · ${data?.cycleDate || ''}`}>
      <ErrorNote error={error} />
      {data && data.units.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Stat label="Active units" value={data.units.length} sub="across the group" />
          <Stat label="UPRs sent today" value={sentCount} sub="delivered to Purchase Head" />
          <Stat label="In progress" value={inProgress} sub="consolidated or verified" />
          <Stat label="Not started" value={notStarted} sub="no UPR yet" />
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        {data?.units.map((u) => (
          <div key={u.id} className="card p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="font-display text-base font-semibold">{u.name}</div>
                <div className="text-xs text-ink-faint">{u.city}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-ink-faint mb-1">UPR</div>
                <StatusBadge status={u.uprStatus} />
              </div>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {u.departments.map((d) => (
                  <tr key={d.name} className="border-t border-line-soft">
                    <td className="py-2">{d.name}</td>
                    <td className="py-2 text-right"><StatusBadge status={d.dprStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {u.uprSentAt && (
              <div className="mt-3 text-xs text-ink-faint font-mono">UPR sent {new Date(u.uprSentAt).toLocaleString()}</div>
            )}
          </div>
        ))}
      </div>
      {data && !data.units.length && (
        <EmptyState title="No units yet" hint="Add your first cafe or property under Units — departments and categories are set up automatically." />
      )}
    </Layout>
  );
}
