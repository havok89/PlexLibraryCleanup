import React, { useState, useEffect, useMemo } from 'react';
import Navbar from './components/Navbar';
import StatsBanner from './components/StatsBanner';
import FilterBar from './components/FilterBar';
import MediaCard from './components/MediaCard';
import SettingsModal from './components/SettingsModal';
import LoginScreen from './components/LoginScreen';
import { Film, Tv, Star, AlertCircle, Loader2, Sparkles, Check } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('movie'); // 'movie' | 'show' | 'recommendations'
  const [mediaItems, setMediaItems] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [toast, setToast] = useState(null);

  // Auth state
  const [authState, setAuthState] = useState({ checked: false, auth_enabled: true, authenticated: false, user: null });

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [unwatchedMonths, setUnwatchedMonths] = useState(6);
  const [requestedByOthersOnly, setRequestedByOthersOnly] = useState(false);
  const [includeWhitelisted, setIncludeWhitelisted] = useState(true);
  const [sortBy, setSortBy] = useState('unwatched');

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Check auth state
  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me').then((r) => r.json());
      setAuthState({
        checked: true,
        auth_enabled: res.auth_enabled,
        authenticated: res.authenticated,
        user: res.user
      });
      return res.authenticated;
    } catch (e) {
      console.error('Error checking auth:', e);
      setAuthState({ checked: true, auth_enabled: true, authenticated: false, user: null });
      return false;
    }
  };

  // Fetch stats & settings
  const fetchMetadata = async () => {
    try {
      const [statsRes, settingsRes] = await Promise.all([
        fetch('/api/stats').then((r) => r.json()),
        fetch('/api/settings').then((r) => r.json())
      ]);
      setStats(statsRes);
      setSettings(settingsRes);
      if (settingsRes) {
        if (activeTab === 'movie' && settingsRes.default_unwatched_months_movies) {
          setUnwatchedMonths(settingsRes.default_unwatched_months_movies);
        } else if (activeTab === 'show' && settingsRes.default_unwatched_months_shows) {
          setUnwatchedMonths(settingsRes.default_unwatched_months_shows);
        }
      }
    } catch (e) {
      console.error('Error fetching metadata:', e);
    }
  };

  // Fetch media items for active tab
  const fetchMedia = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'recommendations') {
        const res = await fetch('/api/recommendations').then((r) => r.json());
        setRecommendations(res || []);
      } else {
        const res = await fetch(`/api/media?type=${activeTab}`).then((r) => r.json());
        setMediaItems(res || []);
      }
    } catch (e) {
      console.error('Error fetching media:', e);
      showToast('Could not load media from server', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const isAuthed = await checkAuth();
      if (isAuthed || !authState.auth_enabled) {
        fetchMetadata();
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (authState.authenticated || !authState.auth_enabled) {
      fetchMedia();
    }
  }, [activeTab, authState.authenticated]);

  const handleLoginSuccess = (user) => {
    setAuthState({ checked: true, auth_enabled: true, authenticated: true, user });
    showToast(`Welcome, ${user.username}!`, 'success');
    fetchMetadata();
    fetchMedia();
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout error:', e);
    }
    setAuthState((prev) => ({ ...prev, authenticated: false, user: null }));
    showToast('Signed out of Plex', 'info');
  };

  // Sync Plex
  const handleSync = async () => {
    setIsSyncing(true);
    showToast('Syncing with Plex & Overseerr...', 'info');
    try {
      const res = await fetch('/api/sync', { method: 'POST' }).then((r) => r.json());
      showToast('Sync completed! Collections updated on Plex', 'success');
      await Promise.all([fetchMetadata(), fetchMedia()]);
    } catch (e) {
      showToast('Sync failed: ' + e.message, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Toggle whitelist
  const handleToggleWhitelist = async (item) => {
    try {
      const res = await fetch(`/api/media/${item.rating_key}/whitelist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: item.media_type,
          title: item.title,
          year: item.year
        })
      }).then((r) => r.json());

      setMediaItems((prev) =>
        prev.map((m) =>
          m.rating_key === item.rating_key ? { ...m, is_whitelisted: res.is_whitelisted } : m
        )
      );

      showToast(
        res.is_whitelisted ? `Protected: "${item.title}" kept` : `Protection removed for "${item.title}"`,
        res.is_whitelisted ? 'success' : 'info'
      );
      fetchMetadata();
    } catch (e) {
      showToast('Failed to update whitelist', 'error');
    }
  };

  // Toggle recommend (Admin TV Shelf)
  const handleToggleRecommend = async (item) => {
    try {
      const res = await fetch(`/api/media/${item.rating_key}/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: item.media_type,
          title: item.title,
          year: item.year,
          poster_url: item.thumb || ''
        })
      }).then((r) => r.json());

      setMediaItems((prev) =>
        prev.map((m) =>
          m.rating_key === item.rating_key ? { ...m, is_recommended: res.is_recommended } : m
        )
      );

      if (activeTab === 'recommendations') {
        fetchMedia();
      }

      showToast(
        res.is_recommended
          ? `⭐ Added to top of "${item.media_type === 'movie' ? 'Recommended Movies' : 'Recommended Shows'}" TV shelf!`
          : `Removed "${item.title}" from TV recommendations shelf`,
        res.is_recommended ? 'success' : 'info'
      );
    } catch (e) {
      showToast('Failed to update recommendation', 'error');
    }
  };

  // Delete item
  const handleDelete = async (item) => {
    try {
      const res = await fetch(`/api/media/${item.rating_key}/delete?media_type=${item.media_type}`, {
        method: 'POST'
      }).then((r) => r.json());

      if (res.dry_run) {
        showToast(`[DRY RUN] Would delete "${item.title}" via ${item.media_type === 'movie' ? 'Radarr' : 'Sonarr'}`, 'info');
      } else if (res.success) {
        showToast(`Deleted "${item.title}"`, 'success');
        setMediaItems((prev) => prev.filter((m) => m.rating_key !== item.rating_key));
        fetchMetadata();
      } else {
        showToast(`Failed to delete "${item.title}"`, 'error');
      }
    } catch (e) {
      showToast('Error deleting item: ' + e.message, 'error');
    }
  };

  // Toggle Section Cleanup on/off
  const handleToggleSectionCleanup = async () => {
    if (!settings) return;
    const isMovie = activeTab === 'movie';
    const current = isMovie ? settings.movies_cleanup_enabled : settings.tv_cleanup_enabled;
    const payload = isMovie
      ? { movies_cleanup_enabled: !current }
      : { tv_cleanup_enabled: !current };

    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setSettings((prev) => ({
        ...prev,
        [isMovie ? 'movies_cleanup_enabled' : 'tv_cleanup_enabled']: !current
      }));
      showToast(`${isMovie ? 'Movies' : 'TV'} cleanup ${!current ? 'enabled' : 'paused'}`, 'success');
    } catch (e) {
      showToast('Failed to update toggle', 'error');
    }
  };

  // Update Settings from Modal
  const handleUpdateSettings = async (newSettings) => {
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      showToast('Settings saved successfully', 'success');
      fetchMetadata();
    } catch (e) {
      showToast('Failed to save settings', 'error');
    }
  };

  const handleTestDiscord = async () => {
    const res = await fetch('/api/test-discord', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Discord test failed');
    }
    return res.json();
  };

  // Filter and sort items
  const filteredItems = useMemo(() => {
    if (activeTab === 'recommendations') return [];

    let list = [...mediaItems];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          (m.year && String(m.year).includes(q))
      );
    }

    // Unwatched threshold (months to days)
    if (unwatchedMonths > 0) {
      const minDays = unwatchedMonths * 30;
      list = list.filter((m) => m.days_unwatched >= minDays);
    }

    // Seerr filter: requested by someone else
    if (requestedByOthersOnly) {
      list = list.filter((m) => m.requested_by_other === true);
    }

    // Whitelist filter
    if (!includeWhitelisted) {
      list = list.filter((m) => !m.is_whitelisted);
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'unwatched') {
        return b.days_unwatched - a.days_unwatched;
      } else if (sortBy === 'size') {
        return (b.size_bytes || 0) - (a.size_bytes || 0);
      } else if (sortBy === 'added') {
        return new Date(b.added_at || 0) - new Date(a.added_at || 0);
      } else if (sortBy === 'title') {
        return a.title.localeCompare(b.title);
      }
      return 0;
    });

    return list;
  }, [mediaItems, searchQuery, unwatchedMonths, requestedByOthersOnly, includeWhitelisted, sortBy, activeTab]);

  // Compute reclaimable space of current filtered view
  const currentReclaimableGb = useMemo(() => {
    const bytes = filteredItems
      .filter((it) => !it.is_whitelisted)
      .reduce((acc, it) => acc + (it.size_bytes || 0), 0);
    return (bytes / (1024 ** 3)).toFixed(1);
  }, [filteredItems]);

  const isCleanupActiveForCurrentTab =
    activeTab === 'movie' ? settings?.movies_cleanup_enabled : settings?.tv_cleanup_enabled;

  if (!authState.checked) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#131517] text-gray-100">
        <Loader2 className="w-10 h-10 text-amber-500 animate-spin mb-3" />
        <p className="text-sm text-gray-400">Loading Plex Clean & Curate...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#131517] text-gray-100">
      {/* Plex Auth Login Screen Overlay if unauthenticated */}
      {authState.auth_enabled && !authState.authenticated && (
        <LoginScreen onLoginSuccess={handleLoginSuccess} />
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-[#202429] border border-[#383d43] px-4 py-3 rounded-xl shadow-2xl text-sm font-medium animate-slideUp text-white">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Navbar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        stats={stats}
        isSyncing={isSyncing}
        onSync={handleSync}
        onOpenSettings={() => setIsSettingsOpen(true)}
        recsCount={recommendations.length}
        user={authState.user}
        onLogout={handleLogout}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {activeTab !== 'recommendations' ? (
          <>
            {/* Stats Overview */}
            <StatsBanner
              stats={stats}
              activeTab={activeTab}
              filteredCount={filteredItems.length}
              unwatchedCount={filteredItems.length}
              reclaimableGb={currentReclaimableGb}
              isCleanupEnabled={Boolean(isCleanupActiveForCurrentTab)}
              onToggleCleanup={handleToggleSectionCleanup}
            />

            {/* Filter Bar */}
            <FilterBar
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              unwatchedMonths={unwatchedMonths}
              setUnwatchedMonths={setUnwatchedMonths}
              requestedByOthersOnly={requestedByOthersOnly}
              setRequestedByOthersOnly={setRequestedByOthersOnly}
              includeWhitelisted={includeWhitelisted}
              setIncludeWhitelisted={setIncludeWhitelisted}
              sortBy={sortBy}
              setSortBy={setSortBy}
            />

            {/* Grid Content */}
            {isLoading ? (
              <div className="py-24 flex flex-col items-center justify-center space-y-3">
                <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                <p className="text-sm text-gray-400">Loading {activeTab === 'movie' ? 'movies' : 'shows'} from Plex...</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="py-20 text-center bg-[#181a1d] rounded-2xl border border-[#2c3138] p-8">
                <div className="w-12 h-12 rounded-full bg-gray-800/80 mx-auto flex items-center justify-center text-gray-400 mb-3">
                  {activeTab === 'movie' ? <Film className="w-6 h-6" /> : <Tv className="w-6 h-6" />}
                </div>
                <h3 className="text-base font-semibold text-white">No items found matching criteria</h3>
                <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                  Try decreasing the unwatched cutoff slider, clearing your search, or unticking the Seerr requester filter.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredItems.map((item) => (
                  <MediaCard
                    key={item.rating_key}
                    item={item}
                    thresholdDays={unwatchedMonths * 30}
                    isLeavingSoon={Boolean(isCleanupActiveForCurrentTab && item.days_unwatched >= unwatchedMonths * 30)}
                    onToggleWhitelist={handleToggleWhitelist}
                    onToggleRecommend={handleToggleRecommend}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          /* Curated Admin Recommendations Shelf Tab */
          <div>
            <div className="bg-[#181a1d] border border-[#2c3138] rounded-2xl p-6 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                  Curated TV Home Screen Shelves
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  Items listed here appear directly on your Plex TV app's Home screen under <strong>"Recommended Movies"</strong> and <strong>"Recommended Shows"</strong>.
                  They are sorted with your most recently favorited items appearing first!
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-3 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {recommendations.length} Active Recommendations
                </span>
              </div>
            </div>

            {recommendations.length === 0 ? (
              <div className="py-20 text-center bg-[#181a1d] rounded-2xl border border-[#2c3138] p-8">
                <Star className="w-12 h-12 text-amber-400 mx-auto mb-3 opacity-40" />
                <h3 className="text-base font-semibold text-white">No Curated Recommendations Yet</h3>
                <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
                  Browse the Movies or TV Shows tabs and click the <strong>"⭐ Recommend"</strong> button on any item. It will immediately be pinned to your Plex Home screen shelf!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {recommendations.map((item) => (
                  <div
                    key={item.rating_key}
                    className="bg-[#181a1d] border border-amber-500/40 rounded-2xl overflow-hidden shadow-lg flex flex-col justify-between"
                  >
                    <div className="relative aspect-[2/3] bg-[#131517]">
                      {item.poster_url ? (
                        <img
                          src={item.poster_url}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center p-4 text-center">
                          <span className="text-gray-400 text-xs font-bold line-clamp-3">{item.title}</span>
                        </div>
                      )}
                      <div className="absolute top-2 right-2 bg-amber-500 text-black p-1 rounded-md shadow">
                        <Star className="w-3.5 h-3.5 fill-black" />
                      </div>
                    </div>

                    <div className="p-3">
                      <h4 className="text-xs font-bold text-white line-clamp-1">{item.title}</h4>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Favorited: {new Date(item.favorited_at).toLocaleDateString()}
                      </p>
                      <button
                        onClick={() => handleToggleRecommend(item)}
                        className="w-full mt-2 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold border border-rose-500/30 transition-colors"
                      >
                        Remove from TV Shelf
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onTestDiscord={handleTestDiscord}
      />
    </div>
  );
}
