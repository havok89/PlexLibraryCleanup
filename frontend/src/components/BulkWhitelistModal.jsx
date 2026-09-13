import React, { useState } from 'react';
import { X, ShieldCheck, Shield, Loader2 } from 'lucide-react';

export default function BulkWhitelistModal({
  isOpen,
  onClose,
  mediaType = 'movie',
  items = [],
  onConfirm
}) {
  if (!isOpen) return null;

  // Compute breakdown for current media items
  const unkeptDirect = items.filter(
    (it) => !it.is_whitelisted && it.requester_name === null
  );
  const unkeptAdmin = items.filter(
    (it) => !it.is_whitelisted && it.is_admin_request === true
  );
  const otherUsersCount = items.filter((it) => it.requested_by_other === true).length;

  const [scope, setScope] = useState('all_my_additions'); // 'all_my_additions' or 'non_seerr'
  const [isProcessing, setIsProcessing] = useState(false);

  const selectedCount =
    scope === 'all_my_additions'
      ? unkeptDirect.length + unkeptAdmin.length
      : unkeptDirect.length;

  const handleExecute = async () => {
    setIsProcessing(true);
    try {
      await onConfirm({
        media_type: mediaType,
        scope: scope
      });
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const typeLabel = mediaType === 'movie' ? 'movies' : 'shows';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#181a1d] border border-[#2c3138] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#2c3138] bg-[#141618]">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Keep Items Added by You</h2>
              <p className="text-xs text-gray-400">Protect your personal library from automated cleanup</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 text-xs text-gray-300">
          {/* Library Breakdown Box */}
          <div className="bg-[#131517] rounded-xl border border-[#262a2f] p-3.5 space-y-2.5">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">
              Library Breakdown ({items.length} {typeLabel})
            </span>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-[#181a1d] p-2.5 rounded-lg border border-emerald-500/20 flex flex-col">
                <span className="text-emerald-400 font-bold text-lg">{unkeptDirect.length}</span>
                <span className="text-[11px] text-gray-400">Added by you (not in Seerr)</span>
              </div>
              <div className="bg-[#181a1d] p-2.5 rounded-lg border border-blue-500/20 flex flex-col">
                <span className="text-blue-400 font-bold text-lg">{unkeptAdmin.length}</span>
                <span className="text-[11px] text-gray-400">Your Seerr requests</span>
              </div>
              <div className="bg-[#181a1d] p-2.5 rounded-lg border border-amber-500/20 flex flex-col">
                <span className="text-amber-400 font-bold text-lg">{otherUsersCount}</span>
                <span className="text-[11px] text-gray-400">Other users' requests</span>
              </div>
            </div>
          </div>

          {/* Scope Selector */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block">
              Choose What to Protect
            </label>

            <label
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                scope === 'all_my_additions'
                  ? 'bg-emerald-500/10 border-emerald-500/50 text-white'
                  : 'bg-[#131517] border-[#262a2f] text-gray-300 hover:border-gray-600'
              }`}
            >
              <input
                type="radio"
                name="scope"
                value="all_my_additions"
                checked={scope === 'all_my_additions'}
                onChange={() => setScope('all_my_additions')}
                className="mt-0.5 accent-emerald-500"
              />
              <div className="flex-1">
                <div className="font-semibold text-white flex items-center justify-between">
                  <span>Keep All My Additions</span>
                  <span className="text-emerald-400 font-bold">
                    +{unkeptDirect.length + unkeptAdmin.length} {typeLabel}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Protects items added directly to Plex <strong className="text-gray-200">AND</strong> your own admin Seerr requests.
                </p>
              </div>
            </label>

            <label
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                scope === 'non_seerr'
                  ? 'bg-emerald-500/10 border-emerald-500/50 text-white'
                  : 'bg-[#131517] border-[#262a2f] text-gray-300 hover:border-gray-600'
              }`}
            >
              <input
                type="radio"
                name="scope"
                value="non_seerr"
                checked={scope === 'non_seerr'}
                onChange={() => setScope('non_seerr')}
                className="mt-0.5 accent-emerald-500"
              />
              <div className="flex-1">
                <div className="font-semibold text-white flex items-center justify-between">
                  <span>Only Direct Additions (Not in Seerr)</span>
                  <span className="text-emerald-400 font-bold">+{unkeptDirect.length} {typeLabel}</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Protects only media added directly to Plex with no record in Overseerr.
                </p>
              </div>
            </label>
          </div>

          {/* Explanation Alert */}
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300/90 text-xs flex items-start gap-2.5">
            <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p>
              Protected items receive the green <strong className="text-emerald-400">Kept</strong> badge, will never be automatically deleted, and are immediately removed from Plex's <em>"Leaving at the end of the month"</em> shelf.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#2c3138] bg-[#141618] flex items-center justify-end gap-2.5">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 rounded-xl text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleExecute}
            disabled={isProcessing || selectedCount === 0}
            className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 text-white text-xs font-semibold shadow-lg shadow-emerald-900/30 transition-all"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Protecting Items &amp; Syncing Plex...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Mark {selectedCount} {typeLabel} as Keep</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
