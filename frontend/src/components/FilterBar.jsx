import React from 'react';
import { Search, UserCheck, Shield, Clock, SlidersHorizontal, ArrowUpDown } from 'lucide-react';

export default function FilterBar({
  searchQuery,
  setSearchQuery,
  unwatchedMonths,
  setUnwatchedMonths,
  requestedByOthersOnly,
  setRequestedByOthersOnly,
  includeWhitelisted,
  setIncludeWhitelisted,
  sortBy,
  setSortBy
}) {
  const monthOptions = [
    { label: '1 mo', value: 1 },
    { label: '2 mo', value: 2 },
    { label: '3 mo', value: 3 },
    { label: '6 mo', value: 6 },
    { label: '9 mo', value: 9 },
    { label: '12 mo', value: 12 },
    { label: 'All', value: 0 }
  ];

  return (
    <div className="bg-[#181a1d] border border-[#2c3138] rounded-2xl p-4 mb-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by title, year..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#131517] border border-[#2c3138] rounded-xl pl-10 pr-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-amber-500/80 transition-colors"
          />
        </div>

        {/* Unwatched Threshold Quick Chips */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0">
          <span className="text-xs font-semibold text-gray-400 flex items-center gap-1 mr-1">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            Unwatched:
          </span>
          {monthOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setUnwatchedMonths(opt.value)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                unwatchedMonths === opt.value
                  ? 'bg-amber-500 text-black font-semibold shadow-sm'
                  : 'bg-[#131517] text-gray-400 hover:text-white hover:bg-[#282c31] border border-[#262a2f]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Sort selector */}
        <div className="flex items-center space-x-2">
          <ArrowUpDown className="w-4 h-4 text-gray-400" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-[#131517] border border-[#2c3138] rounded-xl px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-amber-500/80"
          >
            <option value="unwatched">Longest Unwatched</option>
            <option value="size">Largest Size on Disk</option>
            <option value="added">Recently Added</option>
            <option value="title">Title (A-Z)</option>
          </select>
        </div>
      </div>

      {/* Second Row: Toggle Filters */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#262a2f]">
        {/* Toggle: Seerr Requested by Others */}
        <button
          onClick={() => setRequestedByOthersOnly(!requestedByOthersOnly)}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
            requestedByOthersOnly
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
              : 'bg-[#131517] text-gray-400 border-[#262a2f] hover:text-white hover:bg-[#202428]'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5" />
          <span>Requested by Others in Seerr</span>
          {requestedByOthersOnly && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 ml-1"></span>
          )}
        </button>

        {/* Toggle: Include Whitelisted / Kept items */}
        <button
          onClick={() => setIncludeWhitelisted(!includeWhitelisted)}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
            includeWhitelisted
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
              : 'bg-[#131517] text-gray-400 border-[#262a2f] hover:text-white hover:bg-[#202428]'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Show Whitelisted / Kept</span>
        </button>
      </div>
    </div>
  );
}
