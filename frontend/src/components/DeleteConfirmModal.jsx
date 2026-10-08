import React from 'react';
import { Trash2, AlertTriangle, X, Loader2, HardDrive, Clock, User, ShieldAlert } from 'lucide-react';

export default function DeleteConfirmModal({
  item,
  isOpen,
  onClose,
  onConfirm,
  isDryRun,
  isDeleting
}) {
  if (!isOpen || !item) return null;

  const sizeGb = item.size_bytes ? (item.size_bytes / (1024 ** 3)).toFixed(1) : null;
  const isMovie = item.media_type === 'movie';
  const serviceName = isMovie ? 'Radarr' : 'Sonarr';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#181a1d] border border-[#2c3138] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-scaleUp">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#2c3138] bg-[#141618]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Delete Media</h3>
              <p className="text-xs text-gray-400">Confirm removal from server</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          {/* Media Card Preview */}
          <div className="flex gap-3.5 bg-[#131517] p-3 rounded-xl border border-[#262a2f]">
            {item.thumb ? (
              <img
                src={item.thumb}
                alt={item.title}
                className="w-16 h-24 object-cover rounded-lg shrink-0 border border-[#2c3138]"
              />
            ) : (
              <div className="w-16 h-24 rounded-lg bg-[#202428] flex items-center justify-center text-gray-500 text-xs text-center p-1 shrink-0">
                No Poster
              </div>
            )}
            <div className="flex flex-col justify-between overflow-hidden flex-1">
              <div>
                <h4 className="text-sm font-bold text-white truncate" title={item.title}>
                  {item.title}
                </h4>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                  {item.year && <span>{item.year}</span>}
                  <span>•</span>
                  <span className="capitalize">{isMovie ? 'Movie' : 'TV Series'}</span>
                </div>
              </div>

              {/* Stats badges */}
              <div className="flex flex-wrap gap-2 text-[11px] text-gray-400">
                {sizeGb && (
                  <span className="flex items-center gap-1 bg-[#1a1d21] px-2 py-0.5 rounded-md border border-[#2c3138]">
                    <HardDrive className="w-3 h-3 text-amber-400" />
                    {sizeGb} GB
                  </span>
                )}
                {item.requester_name && (
                  <span className="flex items-center gap-1 bg-[#1a1d21] px-2 py-0.5 rounded-md border border-[#2c3138] truncate max-w-[150px]">
                    <User className="w-3 h-3 text-blue-400" />
                    {item.requester_name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action explanation */}
          <div className="text-xs text-gray-300 bg-[#131517] p-3.5 rounded-xl border border-[#262a2f] space-y-1.5">
            <p className="flex items-start gap-2">
              <span className="text-rose-400 font-bold">•</span>
              <span>Permanently removes media files from disk via <strong>{serviceName}</strong>.</span>
            </p>
            <p className="flex items-start gap-2">
              <span className="text-rose-400 font-bold">•</span>
              <span>Sets the item to <strong>Unmonitored</strong> in {serviceName} so it is not re-downloaded.</span>
            </p>
          </div>

          {/* Dry Run / Live Warning Banner */}
          {isDryRun ? (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
              <ShieldAlert className="w-4 h-4 shrink-0 text-amber-400" />
              <span><strong>Dry Run Active:</strong> This action will be simulated and logged without removing any real files.</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span><strong>Live Action:</strong> This file will be deleted immediately from disk.</span>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="flex items-center justify-end gap-2.5 p-4 border-t border-[#2c3138] bg-[#141618]">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(item)}
            disabled={isDeleting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/30 transition-all disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete {isMovie ? 'Movie' : 'Series'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
