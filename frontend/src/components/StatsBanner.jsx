import React from 'react';
import { HardDrive, AlertTriangle, EyeOff, CheckCircle2, ShieldCheck, Power } from 'lucide-react';

export default function StatsBanner({
  stats,
  activeTab,
  filteredCount,
  unwatchedCount,
  stagedCount = 0,
  reclaimableGb,
  isCleanupEnabled,
  onToggleCleanup,
  isLeavingFilterActive = false,
  onToggleLeavingFilter
}) {
  const isMediaTab = activeTab === 'movie' || activeTab === 'show';
  const label = activeTab === 'movie' ? 'Movies' : 'TV Shows';

  return (
    <div className="bg-[#181a1d] border border-[#2c3138] rounded-2xl p-4 sm:p-6 mb-6 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        {/* Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 flex-1">
          {/* Reclaimable Disk Space */}
          <div className="bg-[#131517] p-4 rounded-xl border border-[#262a2f]">
            <div className="flex items-center space-x-2 text-gray-400 text-xs font-medium uppercase tracking-wider mb-1">
              <HardDrive className="w-4 h-4 text-amber-400" />
              <span>Space Reclaimable</span>
            </div>
            <div className="text-2xl font-bold text-white tracking-tight">
              {reclaimableGb} <span className="text-sm font-normal text-gray-400">GB</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">From unkept & unwatched media</p>
          </div>

          {/* Unwatched Count */}
          <div className="bg-[#131517] p-4 rounded-xl border border-[#262a2f]">
            <div className="flex items-center space-x-2 text-gray-400 text-xs font-medium uppercase tracking-wider mb-1">
              <EyeOff className="w-4 h-4 text-orange-400" />
              <span>Unwatched Filter</span>
            </div>
            <div className="text-2xl font-bold text-white tracking-tight">
              {unwatchedCount} <span className="text-sm font-normal text-gray-400">items</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Showing {filteredCount} matching cards</p>
          </div>

          {/* Scheduled Leaving */}
          <div
            onClick={() => onToggleLeavingFilter && onToggleLeavingFilter()}
            title="Click to toggle filter for items marked for deletion"
            className={`p-4 rounded-xl border col-span-2 sm:col-span-1 transition-all cursor-pointer ${
              isLeavingFilterActive
                ? 'bg-rose-500/10 border-rose-500/50 shadow-md shadow-rose-950/30'
                : 'bg-[#131517] border-[#262a2f] hover:border-amber-500/40'
            }`}
          >
            <div className="flex items-center justify-between text-gray-400 text-xs font-medium uppercase tracking-wider mb-1">
              <span className="flex items-center space-x-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>Marked For Deletion</span>
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                isCleanupEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-gray-700/50 text-gray-400'
              }`}>
                {isCleanupEnabled ? 'ACTIVE' : 'PAUSED'}
              </span>
            </div>
            <div className="text-2xl font-bold text-white tracking-tight">
              {stagedCount} <span className="text-sm font-normal text-gray-400">items</span>
            </div>
            <p className="text-xs text-gray-500 mt-1 truncate">
              {isLeavingFilterActive ? 'Filtered to marked items (click to clear)' : 'Plex: Leaving at end of month'}
            </p>
          </div>
        </div>

        {/* Section Action / On-Off Toggle */}
        {isMediaTab && (
          <div className="lg:border-l lg:border-[#2c3138] lg:pl-6 flex flex-col justify-center">
            <div className="flex items-center justify-between lg:justify-start gap-4">
              <div>
                <div className="text-sm font-semibold text-white">
                  {label} Cleanup & Shelf
                </div>
                <div className="text-xs text-gray-400">
                  {isCleanupEnabled ? 'Collection is synced & promoted to Plex TV' : 'Disabled for this library'}
                </div>
              </div>
              <button
                onClick={onToggleCleanup}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isCleanupEnabled ? 'bg-amber-500' : 'bg-gray-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    isCleanupEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
