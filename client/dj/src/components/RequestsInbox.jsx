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
    <div className="bg-gray-800 rounded-lg px-4 py-3 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-white text-sm font-medium truncate">{request.song.title}</p>
          {request.song.artist && (
            <p className="text-gray-400 text-xs truncate">{request.song.artist}</p>
          )}
        </div>
        <span className="text-gray-600 text-xs shrink-0">
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
              className="flex-1 bg-gray-700 text-white text-sm rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              onClick={saveName}
              className="text-xs bg-purple-700 hover:bg-purple-600 text-white px-2 py-1 rounded"
            >
              OK
            </button>
            <button
              onClick={() => {
                setName(request.singer);
                setEditing(false);
              }}
              className="text-xs bg-gray-600 hover:bg-gray-500 text-white px-2 py-1 rounded"
            >
              ✕
            </button>
          </>
        ) : (
          <>
            <span className="text-gray-300 text-sm flex-1">{name}</span>
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-gray-500 hover:text-gray-300 px-1"
            >
              ✎
            </button>
          </>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onApprove(request.id)}
          className="flex-1 bg-green-700 hover:bg-green-600 text-white text-xs py-1.5 rounded font-medium transition-colors"
        >
          Approve
        </button>
        <button
          onClick={() => onReject(request.id)}
          className="flex-1 bg-red-800 hover:bg-red-700 text-white text-xs py-1.5 rounded transition-colors"
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
      <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
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
