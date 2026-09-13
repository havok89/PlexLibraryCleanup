import React, { useState, useEffect } from 'react';
import {
  X,
  Layers,
  ArrowUp,
  ArrowDown,
  Home,
  Users,
  Star,
  Sparkles,
  RefreshCw,
  Film,
  Tv,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export default function ShelfManagerModal({ isOpen, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeLibIndex, setActiveLibIndex] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const fetchShelves = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/shelves');
      if (!res.ok) throw new Error('Failed to load shelves');
      const json = await res.json();
      setData(json);
    } catch (e) {
      setFeedback({ type: 'error', message: e.message || 'Error fetching shelves' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchShelves();
    } else {
      setFeedback(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentLibrary = data?.libraries?.[activeLibIndex];

  const handleToggleVisibility = async (libraryName, shelf, field) => {
    setActionLoading(true);
    setFeedback(null);

    const newHome = field === 'home' ? !shelf.home : shelf.home;
    const newShared = field === 'shared' ? !shelf.shared : shelf.shared;
    const newRecommended = field === 'recommended' ? !shelf.recommended : shelf.recommended;

    // Optimistically update local state
    setData((prev) => {
      if (!prev) return prev;
      const updatedLibs = prev.libraries.map((lib) => {
        if (lib.library_name !== libraryName) return lib;
        return {
          ...lib,
          shelves: lib.shelves.map((s) => {
            if (s.identifier !== shelf.identifier) return s;
            return {
              ...s,
              home: newHome,
              shared: newShared,
              recommended: newRecommended,
            };
          }),
        };
      });
      return { ...prev, libraries: updatedLibs };
    });

    try {
      const res = await fetch('/api/shelves/visibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          library_name: libraryName,
          identifier: shelf.identifier,
          home: newHome,
          shared: newShared,
          recommended: newRecommended,
        }),
      });
      if (!res.ok) throw new Error('Failed to update visibility');
      // Silently refresh home_hubs
      const fresh = await (await fetch('/api/shelves')).json();
      setData(fresh);
    } catch (e) {
      setFeedback({ type: 'error', message: e.message || 'Failed to update visibility' });
      fetchShelves();
    } finally {
      setActionLoading(false);
    }
  };

  const handleMove = async (libraryName, index, direction) => {
    if (!currentLibrary) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= currentLibrary.shelves.length) return;

    setActionLoading(true);
    setFeedback(null);

    const newShelves = [...currentLibrary.shelves];
    const temp = newShelves[index];
    newShelves[index] = newShelves[newIndex];
    newShelves[newIndex] = temp;

    // Optimistically update UI
    setData((prev) => {
      if (!prev) return prev;
      const updatedLibs = prev.libraries.map((lib) => {
        if (lib.library_name !== libraryName) return lib;
        return { ...lib, shelves: newShelves };
      });
      return { ...prev, libraries: updatedLibs };
    });

    try {
      const identifiers = newShelves.map((s) => s.identifier);
      const res = await fetch('/api/shelves/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          library_name: libraryName,
          identifiers,
        }),
      });
      if (!res.ok) throw new Error('Failed to reorder shelves');
      const fresh = await (await fetch('/api/shelves')).json();
      setData(fresh);
      setFeedback({ type: 'success', message: 'Shelf order saved to Plex!' });
      setTimeout(() => setFeedback(null), 2500);
    } catch (e) {
      setFeedback({ type: 'error', message: e.message || 'Failed to reorder shelves' });
      fetchShelves();
    } finally {
      setActionLoading(false);
    }
  };

  const handleAutoOptimize = async () => {
    setActionLoading(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/shelves/auto-optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ library_name: 'all' }),
      });
      if (!res.ok) throw new Error('Failed to auto-optimize shelves');
      await fetchShelves();
      setFeedback({
        type: 'success',
        message: 'Shelves successfully optimized (Leaving Soon → Recommended → Recently Added)!',
      });
      setTimeout(() => setFeedback(null), 3500);
    } catch (e) {
      setFeedback({ type: 'error', message: e.message || 'Auto-optimize failed' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#181a1d] border border-[#2c3138] rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2c3138] flex items-center justify-between bg-[#131517]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Plex Shelf Manager
              </h2>
              <p className="text-xs text-gray-400">
                Manage and reorder your collections & shelves on Plex Home and TV apps
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[#282c31] hover:bg-[#343a42] text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`px-4 py-2.5 text-xs font-medium flex items-center gap-2 border-b ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {/* Active Home Screen Shelves */}
          {data?.home_hubs && data.home_hubs.length > 0 && (
            <div className="bg-[#131517] border border-[#2c3138] rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                  <Home className="w-3.5 h-3.5 text-amber-400" />
                  Active Promoted Shelves
                </span>
                <span className="text-[11px] text-gray-500">
                  {data.home_hubs.filter(h => h.identifier !== 'home.ondeck' && h.identifier !== 'home.playlists').length} shelves
                </span>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
                {data.home_hubs
                  .filter(h => h.identifier !== 'home.ondeck' && h.identifier !== 'home.playlists')
                  .map((hub, i) => (
                    <div
                      key={hub.identifier || i}
                      className="flex items-center gap-1.5 bg-[#202429] border border-[#2d3238] rounded-lg px-2.5 py-1 text-xs text-gray-200 shrink-0"
                    >
                      <span className="text-[10px] font-bold text-amber-400">
                        #{i + 1}
                      </span>
                      <span className="font-medium truncate max-w-[140px] sm:max-w-[180px]">
                        {hub.title}
                      </span>
                    </div>
                ))}
              </div>
              <div className="text-[11px] text-gray-400 bg-[#181a1d] px-3 py-2 rounded-lg border border-[#262a30] flex items-start gap-2">
                <span className="text-amber-400 text-xs shrink-0">💡</span>
                <span>
                  <strong>Sidebar Priority:</strong> Plex TV & Web apps group shelves by the order of your pinned sidebar libraries. If TV Shows is above Films in your sidebar, TV shelves appear first. Drag <strong>Films</strong> above <strong>TV shows</strong> in your Plex left sidebar to place <em>Leaving at the end of the month</em> at the very top!
                </span>
              </div>
            </div>
          )}

          {/* Action Bar & Library Tabs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            {/* Library Tabs */}
            <div className="flex items-center space-x-1.5 bg-[#131517] p-1 rounded-xl border border-[#2c3138] self-start">
              {data?.libraries?.map((lib, i) => (
                <button
                  key={lib.library_name}
                  onClick={() => setActiveLibIndex(i)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeLibIndex === i
                      ? 'bg-amber-500 text-black shadow-md'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {lib.type === 'movie' ? (
                    <Film className="w-3.5 h-3.5" />
                  ) : (
                    <Tv className="w-3.5 h-3.5" />
                  )}
                  <span>{lib.library_name}</span>
                </button>
              ))}
            </div>

            {/* Quick Actions */}
            <div className="flex items-center space-x-2">
              <button
                onClick={handleAutoOptimize}
                disabled={actionLoading || loading}
                title="Automatically sort: Leaving at end of month -> Recommended -> Recently Added"
                className="flex items-center space-x-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Auto-Optimize Order</span>
              </button>

              <button
                onClick={fetchShelves}
                disabled={actionLoading || loading}
                title="Refresh shelves from Plex"
                className="p-2 rounded-lg bg-[#282c31] hover:bg-[#343a42] text-gray-300 hover:text-white border border-[#383d43] transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Shelf Items List */}
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-gray-400 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
              <p className="text-xs">Fetching shelves from Plex Media Server...</p>
            </div>
          ) : currentLibrary ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-semibold text-gray-400 px-3 py-1">
                <span>SHELF / COLLECTION</span>
                <span className="text-right">VISIBILITY TOGGLES</span>
              </div>

              {currentLibrary.shelves.map((shelf, idx) => {
                const isSpecial =
                  shelf.title.includes('Leaving') || shelf.title.includes('Recommended');

                return (
                  <div
                    key={shelf.identifier}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      isSpecial
                        ? 'bg-[#1b1f24] border-amber-500/30 shadow-sm'
                        : 'bg-[#141619] border-[#272b31] hover:border-[#383e46]'
                    }`}
                  >
                    {/* Left: Position + Move Buttons + Title */}
                    <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                      {/* Reorder Up/Down */}
                      <div className="flex flex-col space-y-1">
                        <button
                          onClick={() => handleMove(currentLibrary.library_name, idx, 'up')}
                          disabled={idx === 0 || actionLoading}
                          title="Move up"
                          className="p-1 rounded bg-[#25292e] hover:bg-amber-500/20 text-gray-400 hover:text-amber-400 disabled:opacity-25 transition-colors"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleMove(currentLibrary.library_name, idx, 'down')}
                          disabled={idx === currentLibrary.shelves.length - 1 || actionLoading}
                          title="Move down"
                          className="p-1 rounded bg-[#25292e] hover:bg-amber-500/20 text-gray-400 hover:text-amber-400 disabled:opacity-25 transition-colors"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Rank badge */}
                      <span className="text-xs font-bold text-gray-500 w-5 text-center shrink-0">
                        #{idx + 1}
                      </span>

                      {/* Title */}
                      <div className="min-w-0">
                        <h4 className="text-xs sm:text-sm font-semibold text-white truncate flex items-center gap-1.5">
                          {shelf.title}
                          {isSpecial && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              App Curated
                            </span>
                          )}
                        </h4>
                        <span className="text-[10px] text-gray-500">
                          {shelf.home ? 'Active on Home' : 'Hidden from Home'}
                        </span>
                      </div>
                    </div>

                    {/* Right: Visibility Toggles */}
                    <div className="flex items-center space-x-1.5 shrink-0">
                      {/* Home Screen Toggle */}
                      <button
                        onClick={() =>
                          handleToggleVisibility(currentLibrary.library_name, shelf, 'home')
                        }
                        disabled={actionLoading}
                        title={`Home Screen: ${shelf.home ? 'Visible' : 'Hidden'}`}
                        className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                          shelf.home
                            ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                            : 'bg-[#1d2024] border-[#2c3138] text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        <Home className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Home</span>
                      </button>

                      {/* Friends' Home Toggle */}
                      <button
                        onClick={() =>
                          handleToggleVisibility(currentLibrary.library_name, shelf, 'shared')
                        }
                        disabled={actionLoading}
                        title={`Friends' Home: ${shelf.shared ? 'Visible' : 'Hidden'}`}
                        className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                          shelf.shared
                            ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                            : 'bg-[#1d2024] border-[#2c3138] text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Friends</span>
                      </button>

                      {/* Recommended Tab Toggle */}
                      <button
                        onClick={() =>
                          handleToggleVisibility(currentLibrary.library_name, shelf, 'recommended')
                        }
                        disabled={actionLoading}
                        title={`Library Recommended: ${shelf.recommended ? 'Visible' : 'Hidden'}`}
                        className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                          shelf.recommended
                            ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                            : 'bg-[#1d2024] border-[#2c3138] text-gray-500 hover:text-gray-300'
                        }`}
                      >
                        <Star className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Recs</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-10 text-center text-xs text-gray-500">
              No libraries found.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#2c3138] flex items-center justify-between bg-[#131517] text-xs text-gray-400">
          <span>Changes are synced directly to Plex Media Server in real-time.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#282c31] hover:bg-[#343a42] text-white font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
