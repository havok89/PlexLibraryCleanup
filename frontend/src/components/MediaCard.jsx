import React, { useState } from 'react';
import { Star, Shield, ShieldAlert, Trash2, Clock, HardDrive, User, Check, AlertCircle } from 'lucide-react';

export default function MediaCard({
  item,
  onToggleWhitelist,
  onToggleRecommend,
  onDelete,
  thresholdDays,
  isLeavingSoon
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const sizeGb = item.size_bytes ? (item.size_bytes / (1024 ** 3)).toFixed(1) : null;
  const isUnwatchedLongEnough = item.days_unwatched >= thresholdDays;

  // Format unwatched text
  const unwatchedText = item.last_viewed_at
    ? `Watched ${Math.floor(item.days_unwatched / 30)} mo ago`
    : `Never watched (added ${Math.floor(item.days_unwatched / 30)} mo ago)`;

  return (
    <div className="group relative bg-[#181a1d] border border-[#2c3138] rounded-2xl overflow-hidden flex flex-col transition-all duration-200 hover:border-amber-500/50 hover:shadow-xl hover:shadow-black/40">
      {/* Poster Container */}
      <div className="relative aspect-[2/3] w-full bg-[#131517] overflow-hidden">
        {item.thumb ? (
          <img
            src={item.thumb}
            alt={item.title}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-4 text-center bg-gradient-to-b from-[#202429] to-[#131517]">
            <span className="text-gray-400 font-bold text-sm tracking-wide line-clamp-3">
              {item.title}
            </span>
          </div>
        )}

        {/* Top Badges */}
        <div className="absolute top-2.5 inset-x-2.5 flex flex-wrap gap-1.5 z-10">
          {item.is_recommended && (
            <span className="flex items-center gap-1 bg-amber-500 text-black text-[11px] font-bold px-2 py-0.5 rounded-md shadow-md">
              <Star className="w-3 h-3 fill-black text-black" />
              On TV Shelf
            </span>
          )}

          {item.is_whitelisted && (
            <span className="flex items-center gap-1 bg-emerald-600/90 text-white text-[11px] font-bold px-2 py-0.5 rounded-md shadow-md backdrop-blur-sm">
              <Shield className="w-3 h-3 fill-white text-white" />
              Kept
            </span>
          )}

          {!item.is_whitelisted && isLeavingSoon && (
            <span className="flex items-center gap-1 bg-rose-600/90 text-white text-[11px] font-bold px-2 py-0.5 rounded-md shadow-md backdrop-blur-sm">
              <AlertCircle className="w-3 h-3" />
              Leaving Soon
            </span>
          )}
        </div>

        {/* Gradient Overlay for bottom text */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#181a1d] via-transparent to-transparent opacity-90" />

        {/* Requester overlay (if from Seerr) */}
        {item.requester_name && (
          <div className="absolute bottom-2.5 left-2.5 right-2.5 z-10 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10">
            {item.requester_avatar ? (
              <img
                src={item.requester_avatar}
                alt={item.requester_name}
                className="w-4 h-4 rounded-full"
              />
            ) : (
              <User className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="text-[11px] font-medium text-gray-200 truncate">
              Req: <strong className="text-amber-300 font-semibold">{item.requester_name}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Card Body */}
      <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
        <div>
          <div className="flex items-start justify-between gap-1.5">
            <h3 className="text-sm font-semibold text-white line-clamp-1 group-hover:text-amber-400 transition-colors" title={item.title}>
              {item.title}
            </h3>
            {item.year && (
              <span className="text-xs font-medium text-gray-400 shrink-0">
                {item.year}
              </span>
            )}
          </div>

          {/* Stats pills */}
          <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-400">
            <div className="flex items-center gap-1 bg-[#131517] px-2 py-0.5 rounded-md border border-[#262a2f]">
              <Clock className="w-3 h-3 text-amber-400" />
              <span>{unwatchedText}</span>
            </div>
            {sizeGb && (
              <div className="flex items-center gap-1 bg-[#131517] px-2 py-0.5 rounded-md border border-[#262a2f]">
                <HardDrive className="w-3 h-3 text-gray-400" />
                <span>{sizeGb} GB</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons Bar */}
        <div className="pt-2 border-t border-[#262a2f] flex items-center justify-between gap-1.5">
          {/* Recommend Button */}
          <button
            onClick={() => onToggleRecommend(item)}
            title={item.is_recommended ? "Remove from TV Home shelf" : "Feature on TV Home shelf"}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              item.is_recommended
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                : 'bg-[#131517] text-gray-300 hover:text-white hover:bg-[#202428] border border-[#262a2f]'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${item.is_recommended ? 'fill-amber-400 text-amber-400' : ''}`} />
            <span>{item.is_recommended ? 'Featured' : 'Recommend'}</span>
          </button>

          {/* Whitelist / Keep Button */}
          <button
            onClick={() => onToggleWhitelist(item)}
            title={item.is_whitelisted ? "Remove protection" : "Keep forever (never delete)"}
            className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              item.is_whitelisted
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                : 'bg-[#131517] text-gray-300 hover:text-white hover:bg-[#202428] border border-[#262a2f]'
            }`}
          >
            <Shield className={`w-3.5 h-3.5 ${item.is_whitelisted ? 'fill-emerald-400 text-emerald-400' : ''}`} />
            <span>{item.is_whitelisted ? 'Kept' : 'Keep'}</span>
          </button>

          {/* Delete Button */}
          {!showConfirmDelete ? (
            <button
              onClick={() => setShowConfirmDelete(true)}
              title="Delete via Radarr/Sonarr"
              className="p-1.5 rounded-lg bg-[#131517] hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 border border-[#262a2f] transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setShowConfirmDelete(false);
                  onDelete(item);
                }}
                title="Confirm delete"
                className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-bold hover:bg-rose-700 transition-colors"
              >
                Delete?
              </button>
              <button
                onClick={() => setShowConfirmDelete(false)}
                className="px-1.5 py-1 rounded-lg bg-gray-700 text-gray-300 text-[11px] hover:bg-gray-600"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
