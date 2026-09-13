import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, ExternalLink, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';

export default function LoginScreen({ onLoginSuccess }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pinData, setPinData] = useState(null);
  const pollTimerRef = useRef(null);

  const startPlexLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/pin', { method: 'POST' });
      if (!res.ok) {
        throw new Error('Could not initiate Plex login');
      }
      const data = await res.json();
      setPinData(data);

      // Open Plex OAuth in a popup window
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      window.open(
        data.auth_url,
        'PlexAuthPopup',
        `width=${width},height=${height},top=${top},left=${left},status=no,resizable=yes`
      );

      // Start polling PIN status
      pollPinStatus(data.id);
    } catch (e) {
      setError(e.message || 'Login failed to initiate');
      setIsLoading(false);
    }
  };

  const pollPinStatus = (pinId) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/auth/pin/${pinId}`);
        if (!res.ok) return;

        const data = await res.json();
        if (data.status === 'authenticated') {
          clearInterval(pollTimerRef.current);
          setIsLoading(false);
          onLoginSuccess(data.user);
        } else if (data.status === 'unauthorized') {
          clearInterval(pollTimerRef.current);
          setIsLoading(false);
          setError(data.message || 'Access denied: only the server owner is permitted.');
        }
      } catch (e) {
        console.error('Error polling PIN:', e);
      }
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="bg-[#181a1d] border border-[#2c3138] rounded-3xl p-8 max-w-md w-full text-center shadow-2xl space-y-6">
        {/* Brand Icon */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#E5A00D] to-[#b37c06] mx-auto flex items-center justify-center shadow-xl shadow-amber-900/40">
          <Sparkles className="w-9 h-9 text-black" />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Plex Clean & Curate</h2>
          <p className="text-sm text-gray-400 mt-2">
            Secure dashboard access for managing automated library cleanup and TV home screen shelves.
          </p>
        </div>

        {error && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2 text-left">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="pt-2">
          <button
            onClick={startPlexLogin}
            disabled={isLoading}
            className="w-full py-3.5 px-6 rounded-xl font-bold text-sm bg-[#E5A00D] hover:bg-[#CC8A0A] text-black shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Waiting for Plex authorization...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-5 h-5" />
                <span>Sign in with Plex</span>
                <ExternalLink className="w-4 h-4 ml-1 opacity-70" />
              </>
            )}
          </button>
        </div>

        <div className="text-xs text-gray-500 border-t border-[#262a2f] pt-4">
          Protected by Plex OAuth. Only the server administrator has permission to access.
        </div>
      </div>
    </div>
  );
}
