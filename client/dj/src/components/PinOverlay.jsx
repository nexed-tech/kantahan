import { useState, useEffect, useRef } from 'react';
import { isSessionValid, setSession } from '../lib/djFetch';

export default function PinOverlay({ onUnlock }) {
  const [loading, setLoading] = useState(true);
  const [pinRequired, setPinRequired] = useState(false);
  const [digits, setDigits] = useState(['', '', '', '']);
  const [attempts, setAttempts] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);
  const [error, setError] = useState('');
  const inputRefs = [useRef(), useRef(), useRef(), useRef()];

  useEffect(() => {
    if (isSessionValid()) { onUnlock(); return; }
    fetch('/api/settings/dj-pin/status')
      .then((r) => r.json())
      .then((d) => {
        if (!d.set) { onUnlock(); return; }
        setPinRequired(true);
        setLoading(false);
        setTimeout(() => inputRefs[0].current?.focus(), 50);
      })
      .catch(() => { onUnlock(); }); // fail open if server unreachable
  }, []);

  async function submit(pin) {
    if (Date.now() < lockUntil) return;
    const res = await fetch('/api/auth/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const data = await res.json();
    if (data.ok) {
      setSession(data.token);
      onUnlock();
    } else {
      const next = attempts + 1;
      setAttempts(next);
      setDigits(['', '', '', '']);
      setTimeout(() => inputRefs[0].current?.focus(), 20);
      if (next >= 5) {
        setLockUntil(Date.now() + 60000);
        setError('Too many attempts. Wait 60 seconds.');
        setTimeout(() => { setError(''); setAttempts(0); setLockUntil(0); }, 60000);
      } else if (next >= 3) {
        setError(`Wrong PIN. ${5 - next} attempts remaining.`);
        setLockUntil(Date.now() + 3000);
        setTimeout(() => { setError(''); setLockUntil(0); }, 3000);
      } else {
        setError('Wrong PIN.');
        setTimeout(() => setError(''), 2000);
      }
    }
  }

  function onDigitChange(idx, val) {
    const d = val.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[idx] = d;
    setDigits(next);
    if (d && idx < 3) inputRefs[idx + 1].current?.focus();
    if (idx === 3 && next.every(Boolean)) {
      submit(next.join(''));
    }
  }

  function onKeyDown(idx, e) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputRefs[idx - 1].current?.focus();
    }
  }

  if (loading || !pinRequired) return null;

  const locked = Date.now() < lockUntil;

  return (
    <div className="fixed inset-0 bg-brand-bg flex items-center justify-center z-50">
      <div className="w-full max-w-xs mx-auto px-6 space-y-6 text-center">
        <div>
          <p className="text-brand-dim/60 text-xs font-mono uppercase tracking-widest mb-2">DJ Remote</p>
          <h1 className="text-brand-ink text-2xl font-bold">Enter PIN</h1>
        </div>

        <div className="flex justify-center gap-3">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={inputRefs[i]}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => onDigitChange(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              disabled={locked}
              className="w-14 h-14 text-center text-2xl font-mono bg-white/10 border border-white/20 rounded-xl text-brand-ink focus:outline-none focus:ring-2 focus:ring-brand-purple focus:border-brand-purple/50 disabled:opacity-40 transition-colors"
            />
          ))}
        </div>

        {error && (
          <p className="text-brand-pink text-sm font-mono">{error}</p>
        )}
      </div>
    </div>
  );
}
