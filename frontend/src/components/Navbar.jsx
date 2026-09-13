import React from 'react';
import { Film, Tv, Star, Settings as SettingsIcon, RefreshCw, ShieldAlert, Sparkles, Layers } from 'lucide-react';

export default function Navbar({
  activeTab,
  setActiveTab,
  stats,
  isSyncing,
  onSync,
  onOpenSettings,
  onOpenShelves,
  recsCount,
  user,
  onLogout
}) {
  return (
    <header className="bg-[#181a1d] border-b border-[#2c3138] sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2.5 md:py-0 md:h-16 flex flex-col md:flex-row md:items-center justify-between gap-2.5 md:gap-0">
        {/* Top row on mobile / Left Brand on desktop */}
        <div className="flex items-center justify-between w-full md:w-auto">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-br from-[#E5A00D] to-[#b37c06] flex items-center justify-center shadow-lg shadow-amber-900/30 shrink-0">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-black" />
            </div>
            {stats?.dry_run && (
              <span className="text-[11px] font-bold tracking-wider px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30 whitespace-nowrap">
                DRY RUN
              </span>
            )}
          </div>

          {/* Right Actions on Mobile (Visible only on < md) */}
          <div className="flex items-center space-x-1.5 md:hidden">
            <button
              onClick={onSync}
              disabled={isSyncing}
              title="Sync Plex"
              className="p-2 rounded-lg bg-[#282c31] hover:bg-[#343a42] text-gray-200 border border-[#383d43] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 text-amber-400 ${isSyncing ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={onOpenShelves}
              title="Plex Shelf Manager"
              className="p-2 rounded-lg bg-[#282c31] hover:bg-[#343a42] text-gray-300 hover:text-white border border-[#383d43] transition-colors"
            >
              <Layers className="w-4 h-4 text-amber-400" />
            </button>

            <button
              onClick={onOpenSettings}
              title="Settings"
              className="p-2 rounded-lg bg-[#282c31] hover:bg-[#343a42] text-gray-300 hover:text-white border border-[#383d43] transition-colors"
            >
              <SettingsIcon className="w-4 h-4" />
            </button>

            {user && (
              <div className="flex items-center pl-1">
                {user.thumb ? (
                  <img
                    src={user.thumb}
                    alt={user.username}
                    className="w-7 h-7 rounded-full border border-amber-500/50"
                    title={user.username}
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold border border-amber-500/40">
                    {user.username?.charAt(0)?.toUpperCase()}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center Tabs (Horizontal on mobile, centered on desktop) */}
        <nav className="flex items-center justify-center sm:justify-start space-x-1 bg-[#131517] p-1 rounded-xl border border-[#2c3138] overflow-x-auto w-full md:w-auto">
          <button
            onClick={() => setActiveTab('movie')}
            className={`flex-1 md:flex-none flex items-center justify-center space-x-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all shrink-0 ${
              activeTab === 'movie'
                ? 'bg-[#E5A00D] text-black shadow-md font-semibold'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Film className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>Movies</span>
            {stats && (
              <span className={`text-[10px] sm:text-xs px-1.5 py-0.2 rounded-full ${
                activeTab === 'movie' ? 'bg-black/20 text-black' : 'bg-[#282c31] text-gray-300'
              }`}>
                {stats.total_movies}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('show')}
            className={`flex-1 md:flex-none flex items-center justify-center space-x-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all shrink-0 ${
              activeTab === 'show'
                ? 'bg-[#E5A00D] text-black shadow-md font-semibold'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Tv className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>TV Shows</span>
            {stats && (
              <span className={`text-[10px] sm:text-xs px-1.5 py-0.2 rounded-full ${
                activeTab === 'show' ? 'bg-black/20 text-black' : 'bg-[#282c31] text-gray-300'
              }`}>
                {stats.total_shows}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('recommendations')}
            className={`flex-1 md:flex-none flex items-center justify-center space-x-1.5 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all shrink-0 ${
              activeTab === 'recommendations'
                ? 'bg-[#E5A00D] text-black shadow-md font-semibold'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-300 shrink-0" />
            <span>Recommended</span>
            {recsCount > 0 && (
              <span className={`text-[10px] sm:text-xs px-1.5 py-0.2 rounded-full ${
                activeTab === 'recommendations' ? 'bg-black/20 text-black' : 'bg-amber-500/20 text-amber-300'
              }`}>
                {recsCount}
              </span>
            )}
          </button>
        </nav>

        {/* Right Actions on Desktop */}
        <div className="hidden md:flex items-center space-x-3">
          <button
            onClick={onSync}
            disabled={isSyncing}
            title="Trigger full sync & Plex collections update"
            className="flex items-center space-x-2 bg-[#282c31] hover:bg-[#343a42] text-gray-200 px-3.5 py-2 rounded-lg text-sm font-medium border border-[#383d43] transition-colors disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 text-amber-400 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Plex'}</span>
          </button>

          <button
            onClick={onOpenShelves}
            title="Plex Shelf Manager"
            className="flex items-center space-x-1.5 bg-[#282c31] hover:bg-[#343a42] text-gray-200 px-3.5 py-2 rounded-lg text-sm font-medium border border-[#383d43] transition-colors shadow-sm"
          >
            <Layers className="w-4 h-4 text-amber-400" />
            <span>Shelves</span>
          </button>

          <button
            onClick={onOpenSettings}
            title="Settings & Integrations"
            className="p-2 rounded-lg bg-[#282c31] hover:bg-[#343a42] text-gray-300 hover:text-white border border-[#383d43] transition-colors"
          >
            <SettingsIcon className="w-5 h-5" />
          </button>

          {/* User profile / Logout */}
          {user && (
            <div className="flex items-center space-x-2 pl-2 border-l border-[#2c3138]">
              {user.thumb ? (
                <img
                  src={user.thumb}
                  alt={user.username}
                  className="w-7 h-7 rounded-full border border-amber-500/50"
                  title={`Logged in as ${user.username}`}
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold border border-amber-500/40">
                  {user.username?.charAt(0)?.toUpperCase()}
                </div>
              )}
              {onLogout && (
                <button
                  onClick={onLogout}
                  title="Sign out of Plex"
                  className="text-xs text-gray-400 hover:text-rose-400 transition-colors"
                >
                  Sign Out
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
