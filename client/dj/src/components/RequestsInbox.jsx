import { useState } from 'react';

function RequestCard({ request, onApprove, onReject, onEditName }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(request.singer);

  async function saveName() {
    if (name.trim() && name.trim() !== request.singer) {
      await onEditName(request.id, name.trim());
    }
    setEditing(false);
  }

  return (
    <div className="bg-white/5 rounded-lg px-4 py-3 space-y-2 border border-white/5 hover:border-brand-purple/20 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-brand-ink text-sm font-medium truncate">{request.song.title}</p>
          {request.song.artist && (
            <p className="text-brand-dim/60 text-xs truncate">{request.song.artist}</p>
          )}
        </div>
        <span className="text-brand-dim/40 text-xs shrink-0 font-mono">
          {new Date(request.submitted_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {editing ? (
          <>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveName()}
              className="flex-1 bg-white/10 text-brand-ink text-sm rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-purple border border-white/10"
            />
            <button
              onClick={saveName}
              className="text-xs bg-brand-purple/80 hover:bg-brand-purple text-white px-2 py-1 rounded"
            >
              OK
            </button>
            <button
              onClick={() => { setName(request.singer); setEditing(false); }}
              className="text-xs bg-white/10 hover:bg-white/15 text-brand-dim px-2 py-1 rounded"
            >
              ✕
            </button>
          </>
        ) : (
          <>
            <span className="text-brand-dim text-sm flex-1">{name}</span>
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-brand-dim/40 hover:text-brand-dim px-1 transition-colors"
            >
              ✎
            </button>
          </>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onApprove(request.id)}
          className="flex-1 bg-green-700/80 hover:bg-green-600 text-white text-xs py-1.5 rounded font-medium transition-colors"
        >
          Approve
        </button>
        <button
          onClick={() => onReject(request.id)}
          className="flex-1 bg-brand-pink/20 hover:bg-brand-pink/30 text-brand-pink text-xs py-1.5 rounded transition-colors"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

export default function RequestsInbox({ requests, onApprove, onReject, onEditName }) {
  if (requests.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-brand-dim/50 text-sm font-mono">
        No pending requests
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {requests.map((req) => (
        <li key={req.id}>
          <RequestCard
            request={req}
            onApprove={onApprove}
            onReject={onReject}
            onEditName={onEditName}
          />
        </li>
      ))}
    </ul>
  );
}
