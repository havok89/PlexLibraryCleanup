import React, { useState, useEffect, useMemo, useRef } from 'react';
import Navbar from './components/Navbar';
import StatsBanner from './components/StatsBanner';
import FilterBar from './components/FilterBar';
import MediaCard from './components/MediaCard';
import SettingsModal from './components/SettingsModal';
import BulkWhitelistModal from './components/BulkWhitelistModal';
import ShelfManagerModal from './components/ShelfManagerModal';
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
  const [isBulkWhitelistOpen, setIsBulkWhitelistOpen] = useState(false);
  const [isShelfManagerOpen, setIsShelfManagerOpen] = useState(false);
  const [toast, setToast] = useState(null);

  // Auth state
  const [authState, setAuthState] = useState({ checked: false, auth_enabled: true, authenticated: false, user: null });

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [unwatchedMonths, setUnwatchedMonths] = useState(6);
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all' | 'mine' | 'others'
  const [includeWhitelisted, setIncludeWhitelisted] = useState(true);
  const [leavingSoonOnly, setLeavingSoonOnly] = useState(false);
  const [sortBy, setSortBy] = useState('unwatched');

  // Counts
  const stagedCount = useMemo(() => mediaItems.filter((m) => m.is_staged).length, [mediaItems]);
  const myCount = useMemo(() => mediaItems.filter((m) => m.requester_name === null || m.is_admin_request).length, [mediaItems]);
  const othersCount = useMemo(() => mediaItems.filter((m) => m.requested_by_other === true).length, [mediaItems]);

  // Unkept items added by user (direct additions + admin requests)
  const unkeptUserCount = useMemo(() => {
    return mediaItems.filter(
      (m) => !m.is_whitelisted && (m.requester_name === null || m.is_admin_request)
    ).length;
  }, [mediaItems]);

  // Lazy loading / Pagination (20 per batch)
  const [visibleCount, setVisibleCount] = useState(20);
  const sentinelRef = useRef(null);

  // Active tab & abort controller refs to prevent tab switching race conditions
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const abortControllerRef = useRef(null);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Authenticated fetch wrapper (attaches Bearer token fallback if present)
  const authFetch = (url, options = {}) => {
    const token = localStorage.getItem('plex_session_token');
    const headers = {
      ...(options.headers || {}),
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
    return fetch(url, { ...options, headers });
  };

  // Check auth state
  const checkAuth = async () => {
    try {
      const res = await authFetch('/api/auth/me').then((r) => r.json());
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
        authFetch('/api/stats').then((r) => r.json()),
        authFetch('/api/settings').then((r) => r.json())
      ]);
      setStats(statsRes);
      setSettings(settingsRes);
      if (settingsRes) {
        if (activeTabRef.current === 'movie' && settingsRes.default_unwatched_months_movies) {
          setUnwatchedMonths(settingsRes.default_unwatched_months_movies);
        } else if (activeTabRef.current === 'show' && settingsRes.default_unwatched_months_shows) {
          setUnwatchedMonths(settingsRes.default_unwatched_months_shows);
        }
      }
    } catch (e) {
      console.error('Error fetching metadata:', e);
    }
  };

  // Fetch media items for active tab (with race condition prevention)
  const fetchMedia = async (tabOrRefresh = false, forceRefreshParam = false) => {
    let reqTab = activeTabRef.current;
    let forceRefresh = false;

    if (typeof tabOrRefresh === 'string') {
      reqTab = tabOrRefresh;
      forceRefresh = Boolean(forceRefreshParam);
    } else if (typeof tabOrRefresh === 'boolean') {
      forceRefresh = tabOrRefresh;
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    // Immediately clear previous tab's items so stale media is not visible while loading
    setMediaItems([]);

    try {
      if (reqTab === 'recommendations') {
        const res = await authFetch('/api/recommendations', { signal: abortController.signal }).then((r) => r.json());
        if (activeTabRef.current === reqTab) {
          setRecommendations(res || []);
        }
      } else {
        const url = `/api/media?type=${reqTab}${forceRefresh ? '&refresh=true' : ''}`;
        const res = await authFetch(url, { signal: abortController.signal }).then((r) => r.json());
        if (activeTabRef.current === reqTab) {
          setMediaItems(res || []);
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        return; // Request was aborted due to rapid tab switch, safely ignore
      }
      console.error('Error fetching media:', e);
      if (activeTabRef.current === reqTab) {
        showToast('Could not load media from server', 'error');
      }
    } finally {
      if (activeTabRef.current === reqTab) {
        setIsLoading(false);
      }
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
    activeTabRef.current = activeTab;
    if (authState.authenticated || !authState.auth_enabled) {
      fetchMetadata();
      fetchMedia(activeTab, false);
    }
  }, [activeTab, authState.authenticated]);

  const handleLoginSuccess = (user, token) => {
    if (token) {
      localStorage.setItem('plex_session_token', token);
    }
    setAuthState({ checked: true, auth_enabled: true, authenticated: true, user });
    showToast(`Welcome, ${user.username}!`, 'success');
    fetchMetadata();
    fetchMedia();
  };

  const handleLogout = async () => {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      console.error('Logout error:', e);
    }
    localStorage.removeItem('plex_session_token');
    setAuthState((prev) => ({ ...prev, authenticated: false, user: null }));
    showToast('Signed out of Plex', 'info');
  };

  // Sync Plex
  const handleSync = async () => {
    setIsSyncing(true);
    showToast('Syncing with Plex & Overseerr...', 'info');
    try {
      const res = await authFetch('/api/sync', { method: 'POST' }).then((r) => r.json());
      showToast('Sync completed! Collections updated on Plex', 'success');
      await Promise.all([fetchMetadata(), fetchMedia(true)]);
    } catch (e) {
      showToast('Sync failed: ' + e.message, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Toggle whitelist
  const handleToggleWhitelist = async (item) => {
    try {
      const res = await authFetch(`/api/media/${item.rating_key}/whitelist`, {
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

  // Toggle stage for deletion (Add to / Remove from Delete List)
  const handleToggleStage = async (item) => {
    try {
      const res = await authFetch(`/api/media/${item.rating_key}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: item.media_type,
          title: item.title,
          year: item.year,
          size_bytes: item.size_bytes || 0,
          requester_name: item.requester_name,
          requester_avatar: item.requester_avatar
        })
      }).then((r) => r.json());

      setMediaItems((prev) =>
        prev.map((m) =>
          m.rating_key === item.rating_key
            ? { ...m, is_staged: res.is_staged, is_whitelisted: res.is_whitelisted }
            : m
        )
      );

      showToast(
        res.is_staged
          ? `Added "${item.title}" to Delete List (leaves at month end)`
          : `Removed "${item.title}" from Delete List`,
        res.is_staged ? 'info' : 'success'
      );
      fetchMetadata();
    } catch (e) {
      showToast('Failed to update stage status: ' + e.message, 'error');
    }
  };

  // Toggle recommend (Admin TV Shelf)
  const handleToggleRecommend = async (item) => {
    try {
      const res = await authFetch(`/api/media/${item.rating_key}/recommend`, {
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
          ? `⭐ Added "${item.title}" to Recommended!`
          : `Removed "${item.title}" from Recommended`,
        res.is_recommended ? 'success' : 'info'
      );
    } catch (e) {
      showToast('Failed to update recommendation', 'error');
    }
  };

  // Delete item
  const handleDelete = async (item) => {
    try {
      const res = await authFetch(`/api/media/${item.rating_key}/delete?media_type=${item.media_type}`, {
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

  // Bulk Keep items added by user
  const handleBulkWhitelistConfirm = async ({ media_type, scope }) => {
    try {
      const res = await authFetch('/api/media/bulk-whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ media_type, scope })
      }).then((r) => r.json());

      if (res.success) {
        showToast(
          `Protected ${res.whitelisted_count} ${media_type === 'movie' ? 'movies' : 'shows'}! Removed from Leaving Soon.`,
          'success'
        );
        await Promise.all([fetchMetadata(), fetchMedia(true)]);
      } else {
        showToast('Bulk keep action failed', 'error');
      }
    } catch (e) {
      showToast('Error protecting items: ' + e.message, 'error');
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
      await authFetch('/api/settings', {
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
      await authFetch('/api/settings', {
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
    const res = await authFetch('/api/test-discord', { method: 'POST' });
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
    const isSearching = Boolean(searchQuery.trim());
    if (isSearching) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          (m.year && String(m.year).includes(q))
      );
    }

    // Unwatched threshold (months to days)
    // Default to All (bypass threshold) when searching so items watched today or recently can be found immediately
    if (!isSearching && unwatchedMonths > 0) {
      const minDays = unwatchedMonths * 30;
      list = list.filter((m) => m.days_unwatched >= minDays);
    }

    // Source filter: All vs Added by Me vs Overseerr Requests
    if (sourceFilter === 'mine') {
      list = list.filter((m) => m.requester_name === null || m.is_admin_request);
    } else if (sourceFilter === 'others') {
      list = list.filter((m) => m.requested_by_other === true);
    }

    // Whitelist filter (bypass during search so protected/kept items can be found)
    if (!isSearching && !includeWhitelisted) {
      list = list.filter((m) => !m.is_whitelisted);
    }

    // Marked for Deletion / Leaving Soon filter
    if (leavingSoonOnly) {
      list = list.filter((m) => m.is_staged);
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
  }, [mediaItems, searchQuery, unwatchedMonths, sourceFilter, includeWhitelisted, leavingSoonOnly, sortBy, activeTab]);

  // Compute reclaimable space of current filtered view
  const currentReclaimableGb = useMemo(() => {
    const bytes = filteredItems
      .filter((it) => !it.is_whitelisted)
      .reduce((acc, it) => acc + (it.size_bytes || 0), 0);
    return (bytes / (1024 ** 3)).toFixed(1);
  }, [filteredItems]);

  // Reset visibleCount to 20 when filters, sort, or activeTab changes
  useEffect(() => {
    setVisibleCount(20);
  }, [activeTab, searchQuery, unwatchedMonths, sourceFilter, includeWhitelisted, leavingSoonOnly, sortBy]);

  // Sliced items for lazy rendering (20 initial, expanding on scroll)
  const visibleItems = useMemo(() => {
    return filteredItems.slice(0, visibleCount);
  }, [filteredItems, visibleCount]);

  // IntersectionObserver to auto-load next 20 items on scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + 20, filteredItems.length));
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredItems.length]);

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
        onOpenShelves={() => setIsShelfManagerOpen(true)}
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
              stagedCount={stagedCount}
              isLeavingFilterActive={leavingSoonOnly}
              onToggleLeavingFilter={() => setLeavingSoonOnly(!leavingSoonOnly)}
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
              sourceFilter={sourceFilter}
              setSourceFilter={setSourceFilter}
              includeWhitelisted={includeWhitelisted}
              setIncludeWhitelisted={setIncludeWhitelisted}
              leavingSoonOnly={leavingSoonOnly}
              setLeavingSoonOnly={setLeavingSoonOnly}
              totalCount={mediaItems.length}
              myCount={myCount}
              othersCount={othersCount}
              stagedCount={stagedCount}
              unkeptUserCount={unkeptUserCount}
              onOpenBulkWhitelist={() => setIsBulkWhitelistOpen(true)}
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
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {visibleItems.map((item) => (
                    <MediaCard
                      key={item.rating_key}
                      item={item}
                      thresholdDays={unwatchedMonths * 30}
                      isLeavingSoon={Boolean(item.is_staged)}
                      onToggleWhitelist={handleToggleWhitelist}
                      onToggleRecommend={handleToggleRecommend}
                      onToggleStage={handleToggleStage}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>

                {/* Infinite Scroll Sentinel & Load More Indicator */}
                <div ref={sentinelRef} className="py-8 flex flex-col items-center justify-center space-y-2">
                  {visibleCount < filteredItems.length ? (
                    <button
                      onClick={() => setVisibleCount((prev) => Math.min(prev + 20, filteredItems.length))}
                      className="px-5 py-2.5 bg-[#1e2227] hover:bg-[#282d34] border border-[#343a42] text-gray-300 text-xs font-semibold rounded-xl transition-colors shadow"
                    >
                      Showing {visibleItems.length} of {filteredItems.length} items &bull; Load More
                    </button>
                  ) : filteredItems.length > 20 ? (
                    <span className="text-xs text-gray-500">
                      All {filteredItems.length} {activeTab === 'movie' ? 'movies' : 'shows'} loaded
                    </span>
                  ) : null}
                </div>
              </>
            )}
          </>
        ) : (
          /* Curated Admin Recommendations Tab */
          <div>
            <div className="bg-[#181a1d] border border-[#2c3138] rounded-2xl p-4 sm:p-6 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                  Recommended
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  Curated favorites synced directly to your Plex TV home screen collections ("Recommended Movies" &amp; "Recommended Shows").
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  {recommendations.filter((r) => r.media_type === 'movie').length} Movies
                </span>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  {recommendations.filter((r) => r.media_type === 'show').length} Shows
                </span>
              </div>
            </div>

            {recommendations.length === 0 ? (
              <div className="py-16 text-center bg-[#181a1d] rounded-2xl border border-[#2c3138] p-8">
                <Star className="w-12 h-12 text-amber-400 mx-auto mb-3 opacity-40" />
                <h3 className="text-base font-semibold text-white">No Recommendations Yet</h3>
                <p className="text-xs text-gray-400 mt-1.5 max-w-md mx-auto">
                  Browse the Movies or TV Shows tabs and tap the star button on any item to feature it on your Plex TV home shelf!
                </p>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Recommended Movies Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Film className="w-4 h-4 text-amber-400" />
                      Recommended Movies
                      <span className="text-xs font-normal text-gray-400">
                        ({recommendations.filter((r) => r.media_type === 'movie').length})
                      </span>
                    </h3>
                    <span className="text-[11px] text-gray-500">Plex collection: 'Recommended Movies'</span>
                  </div>

                  {recommendations.filter((r) => r.media_type === 'movie').length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-4">
                      {recommendations
                        .filter((r) => r.media_type === 'movie')
                        .map((item) => (
                          <div
                            key={item.rating_key}
                            className="bg-[#181a1d] border border-amber-500/30 rounded-2xl overflow-hidden shadow-lg flex flex-col justify-between transition-all hover:border-amber-500/60"
                          >
                            <div className="relative aspect-[2/3] bg-[#131517]">
                              {item.poster_url ? (
                                <img
                                  src={item.poster_url}
                                  alt={item.title}
                                  loading="lazy"
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                  }}
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
                              <h4 className="text-xs font-bold text-white line-clamp-1" title={item.title}>
                                {item.title}
                              </h4>
                              <div className="flex items-center justify-between text-[11px] text-gray-400 mt-1">
                                {item.year && <span>{item.year}</span>}
                                <span>{new Date(item.favorited_at).toLocaleDateString()}</span>
                              </div>
                              <button
                                onClick={() => handleToggleRecommend(item)}
                                className="w-full mt-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 text-xs font-semibold border border-rose-500/30 transition-colors"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="p-6 bg-[#181a1d] rounded-2xl border border-[#2c3138] text-center text-xs text-gray-500">
                      No movies currently recommended. Star movies to pin them to your TV shelf.
                    </div>
                  )}
                </div>

                {/* Recommended Shows Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Tv className="w-4 h-4 text-amber-400" />
                      Recommended Shows
                      <span className="text-xs font-normal text-gray-400">
                        ({recommendations.filter((r) => r.media_type === 'show').length})
                      </span>
                    </h3>
                    <span className="text-[11px] text-gray-500">Plex collection: 'Recommended Shows'</span>
                  </div>

                  {recommendations.filter((r) => r.media_type === 'show').length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 sm:gap-4">
                      {recommendations
                        .filter((r) => r.media_type === 'show')
                        .map((item) => (
                          <div
                            key={item.rating_key}
                            className="bg-[#181a1d] border border-amber-500/30 rounded-2xl overflow-hidden shadow-lg flex flex-col justify-between transition-all hover:border-amber-500/60"
                          >
                            <div className="relative aspect-[2/3] bg-[#131517]">
                              {item.poster_url ? (
                                <img
                                  src={item.poster_url}
                                  alt={item.title}
                                  loading="lazy"
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                  }}
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
                              <h4 className="text-xs font-bold text-white line-clamp-1" title={item.title}>
                                {item.title}
                              </h4>
                              <div className="flex items-center justify-between text-[11px] text-gray-400 mt-1">
                                {item.year && <span>{item.year}</span>}
                                <span>{new Date(item.favorited_at).toLocaleDateString()}</span>
                              </div>
                              <button
                                onClick={() => handleToggleRecommend(item)}
                                className="w-full mt-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 text-xs font-semibold border border-rose-500/30 transition-colors"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="p-6 bg-[#181a1d] rounded-2xl border border-[#2c3138] text-center text-xs text-gray-500">
                      No TV shows currently recommended. Star TV shows to pin them to your TV shelf.
                    </div>
                  )}
                </div>
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
        onOpenBulkWhitelist={() => setIsBulkWhitelistOpen(true)}
      />

      {/* Bulk Keep Modal */}
      <BulkWhitelistModal
        isOpen={isBulkWhitelistOpen}
        onClose={() => setIsBulkWhitelistOpen(false)}
        mediaType={activeTab}
        items={mediaItems}
        onConfirm={handleBulkWhitelistConfirm}
      />

      {/* Plex Shelf Manager Modal */}
      <ShelfManagerModal
        isOpen={isShelfManagerOpen}
        onClose={() => setIsShelfManagerOpen(false)}
      />
    </div>
  );
}
