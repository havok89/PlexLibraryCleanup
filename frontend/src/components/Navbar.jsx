import React from 'react';
import { Film, Tv, Star, Settings as SettingsIcon, RefreshCw, ShieldAlert, Sparkles } from 'lucide-react';

export default function Navbar({
  activeTab,
  setActiveTab,
  stats,
  isSyncing,
  onSync,
  onOpenSettings,
  recsCount,
  user,
  onLogout
}) {
  return (
    <header className="bg-[#181a1d] border-b border-[#2c3138] sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#E5A00D] to-[#b37c06] flex items-center justify-center shadow-lg shadow-amber-900/30">
            <Sparkles className="w-6 h-6 text-black" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              Plex Clean & Curate
              {stats?.dry_run && (
                <span className="text-[11px] font-semibold tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  DRY RUN
                </span>
              )}
            </h1>
            <p className="text-xs text-gray-400">Automated library cleanup & TV home curation</p>
          </div>
        </div>

        {/* Center Tabs */}
        <nav className="flex items-center space-x-1 bg-[#131517] p-1 rounded-xl border border-[#2c3138]">
          <button
            onClick={() => setActiveTab('movie')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'movie'
                ? 'bg-[#E5A00D] text-black shadow-md font-semibold'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Film className="w-4 h-4" />
            <span>Movies</span>
            {stats && (
              <span className={`text-xs px-1.5 py-0.2 rounded-full ${
                activeTab === 'movie' ? 'bg-black/20 text-black' : 'bg-[#282c31] text-gray-300'
              }`}>
                {stats.total_movies}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('show')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'show'
                ? 'bg-[#E5A00D] text-black shadow-md font-semibold'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Tv className="w-4 h-4" />
            <span>TV Shows</span>
            {stats && (
              <span className={`text-xs px-1.5 py-0.2 rounded-full ${
                activeTab === 'show' ? 'bg-black/20 text-black' : 'bg-[#282c31] text-gray-300'
              }`}>
                {stats.total_shows}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('recommendations')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'recommendations'
                ? 'bg-[#E5A00D] text-black shadow-md font-semibold'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Star className="w-4 h-4 text-amber-300" />
            <span>TV Home Shelf</span>
            {recsCount > 0 && (
              <span className={`text-xs px-1.5 py-0.2 rounded-full ${
                activeTab === 'recommendations' ? 'bg-black/20 text-black' : 'bg-amber-500/20 text-amber-300'
              }`}>
                {recsCount}
              </span>
            )}
          </button>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center space-x-3">
          <button
            onClick={onSync}
            disabled={isSyncing}
            title="Trigger full sync & Plex collections update"
            className="flex items-center space-x-2 bg-[#282c31] hover:bg-[#343a42] text-gray-200 px-3.5 py-2 rounded-lg text-sm font-medium border border-[#383d43] transition-colors disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 text-amber-400 ${isSyncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync Plex'}</span>
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
                  className="text-xs text-gray-400 hover:text-rose-400 transition-colors hidden md:inline"
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
