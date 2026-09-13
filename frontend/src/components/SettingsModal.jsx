import React, { useState } from 'react';
import { X, CheckCircle, XCircle, Bell, Sliders, Server, ShieldAlert, Sparkles, Send, Info } from 'lucide-react';

export default function SettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onTestDiscord
}) {
  if (!isOpen || !settings) return null;

  const [moviesEnabled, setMoviesEnabled] = useState(settings.movies_cleanup_enabled);
  const [tvEnabled, setTvEnabled] = useState(settings.tv_cleanup_enabled);
  const [moviesMonths, setMoviesMonths] = useState(settings.default_unwatched_months_movies || 6);
  const [showsMonths, setShowsMonths] = useState(settings.default_unwatched_months_shows || 6);
  const [dryRun, setDryRun] = useState(settings.dry_run);
  const [isTestingDiscord, setIsTestingDiscord] = useState(false);
  const [discordFeedback, setDiscordFeedback] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    await onUpdateSettings({
      movies_cleanup_enabled: moviesEnabled,
      tv_cleanup_enabled: tvEnabled,
      default_unwatched_months_movies: Number(moviesMonths),
      default_unwatched_months_shows: Number(showsMonths),
      dry_run: dryRun
    });
    setIsSaving(false);
    onClose();
  };

  const handleTestDiscord = async () => {
    setIsTestingDiscord(true);
    setDiscordFeedback(null);
    try {
      const res = await onTestDiscord();
      setDiscordFeedback({ success: true, message: "Test alert sent to Discord!" });
    } catch (e) {
      setDiscordFeedback({ success: false, message: e.message || "Failed to send webhook" });
    } finally {
      setIsTestingDiscord(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#181a1d] border border-[#2c3138] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[#2c3138]">
          <div className="flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-white">Settings & Integrations</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Integration Statuses */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Connected Services (.env)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-[#131517] p-3 rounded-xl border border-[#262a2f] flex items-center justify-between">
                <span className="text-sm font-medium text-gray-300">Plex Media Server</span>
                {settings.plex?.connected ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400" />
                )}
              </div>

              <div className="bg-[#131517] p-3 rounded-xl border border-[#262a2f] flex items-center justify-between">
                <span className="text-sm font-medium text-gray-300">Overseerr / Seerr</span>
                {settings.seerr?.configured ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-gray-500" />
                )}
              </div>

              <div className="bg-[#131517] p-3 rounded-xl border border-[#262a2f] flex items-center justify-between">
                <span className="text-sm font-medium text-gray-300">Radarr</span>
                {settings.radarr?.configured ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-gray-500" />
                )}
              </div>

              <div className="bg-[#131517] p-3 rounded-xl border border-[#262a2f] flex items-center justify-between">
                <span className="text-sm font-medium text-gray-300">Sonarr</span>
                {settings.sonarr?.configured ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-gray-500" />
                )}
              </div>

              <div className="bg-[#131517] p-3 rounded-xl border border-[#262a2f] flex items-center justify-between col-span-2 sm:col-span-2">
                <span className="text-sm font-medium text-gray-300">Discord Webhook</span>
                {settings.discord?.configured ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : (
                  <XCircle className="w-4 h-4 text-gray-500" />
                )}
              </div>
            </div>
          </div>

          {/* Cleanup Automation Toggles */}
          <div className="border-t border-[#262a2f] pt-5 space-y-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Automated Cleanup & Plex TV Shelves
            </h3>

            {/* Movies Cleanup Toggle */}
            <div className="flex items-center justify-between p-3.5 bg-[#131517] rounded-xl border border-[#262a2f]">
              <div>
                <div className="text-sm font-semibold text-white">Movies Cleanup & 'Leaving Soon' Shelf</div>
                <div className="text-xs text-gray-400">
                  Automatically populates the Leaving Soon collection and displays on Plex TV
                </div>
              </div>
              <button
                onClick={() => setMoviesEnabled(!moviesEnabled)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                  moviesEnabled ? 'bg-amber-500' : 'bg-gray-700'
                }`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition duration-200 ${moviesEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* TV Cleanup Toggle */}
            <div className="flex items-center justify-between p-3.5 bg-[#131517] rounded-xl border border-[#262a2f]">
              <div>
                <div className="text-sm font-semibold text-white">TV Shows Cleanup & 'Leaving Soon' Shelf</div>
                <div className="text-xs text-gray-400">
                  Automatically populates the Leaving Soon collection for TV series
                </div>
              </div>
              <button
                onClick={() => setTvEnabled(!tvEnabled)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                  tvEnabled ? 'bg-amber-500' : 'bg-gray-700'
                }`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition duration-200 ${tvEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            {/* Unwatched Thresholds */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Default Unwatched Cutoff (Movies)
                </label>
                <select
                  value={moviesMonths}
                  onChange={(e) => setMoviesMonths(e.target.value)}
                  className="w-full bg-[#131517] border border-[#2c3138] rounded-xl px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500/80"
                >
                  <option value={1}>1 Month (30 Days)</option>
                  <option value={2}>2 Months (60 Days)</option>
                  <option value={3}>3 Months (90 Days)</option>
                  <option value={6}>6 Months (180 Days)</option>
                  <option value={9}>9 Months (270 Days)</option>
                  <option value={12}>12 Months (1 Year)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  Default Unwatched Cutoff (TV Shows)
                </label>
                <select
                  value={showsMonths}
                  onChange={(e) => setShowsMonths(e.target.value)}
                  className="w-full bg-[#131517] border border-[#2c3138] rounded-xl px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-amber-500/80"
                >
                  <option value={1}>1 Month (30 Days)</option>
                  <option value={2}>2 Months (60 Days)</option>
                  <option value={3}>3 Months (90 Days)</option>
                  <option value={6}>6 Months (180 Days)</option>
                  <option value={9}>9 Months (270 Days)</option>
                  <option value={12}>12 Months (1 Year)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Safety: Dry Run Mode */}
          <div className="border-t border-[#262a2f] pt-5">
            <div className="flex items-center justify-between p-3.5 bg-amber-500/10 rounded-xl border border-amber-500/20">
              <div>
                <div className="text-sm font-semibold text-amber-300 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4" />
                  Dry Run Mode (Simulation)
                </div>
                <div className="text-xs text-amber-400/80">
                  When enabled, no media files will actually be deleted from Radarr/Sonarr or disk.
                </div>
              </div>
              <button
                onClick={() => setDryRun(!dryRun)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                  dryRun ? 'bg-amber-500' : 'bg-gray-700'
                }`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition duration-200 ${dryRun ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>

          {/* Discord Webhook Testing */}
          <div className="border-t border-[#262a2f] pt-5 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-amber-400" />
                Test Discord Notifications
              </div>
              <div className="text-xs text-gray-400">
                Sends a sample embed to your configured webhook URL
              </div>
              {discordFeedback && (
                <div className={`text-xs mt-1 font-medium ${discordFeedback.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {discordFeedback.message}
                </div>
              )}
            </div>
            <button
              onClick={handleTestDiscord}
              disabled={isTestingDiscord || !settings.discord?.configured}
              className="flex items-center space-x-1.5 bg-[#282c31] hover:bg-[#343a42] text-gray-200 px-3 py-2 rounded-xl text-xs font-semibold border border-[#383d43] transition-colors disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isTestingDiscord ? 'Sending...' : 'Send Test'}</span>
            </button>
          </div>

          {/* TV App Home Row Notice */}
          <div className="bg-[#131517] p-3.5 rounded-xl border border-[#262a2f] flex gap-3 text-xs text-gray-400">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-gray-300">Plex TV App Placement:</strong> The collections created by this tool are automatically flagged to appear on your Home and Recommended screens. To customize their order relative to *Continue Watching* or *Recently Added*, open Plex Web &rarr; <em>Settings &rarr; Manage &rarr; Libraries &rarr; Manage Recommendations</em>.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-[#2c3138] bg-[#141618]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-[#E5A00D] hover:bg-[#CC8A0A] text-black shadow-md transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
