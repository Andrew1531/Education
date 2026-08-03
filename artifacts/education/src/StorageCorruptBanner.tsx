import React, { useState } from 'react';

const STORAGE_KEY = 'ge_users';

/**
 * Prominent warning shown when `ge_users` exists but cannot be parsed.
 * Gives the admin a clear path to recover (clear the key) or dismiss and
 * continue without user data.
 */
export function StorageCorruptBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  const [confirming, setConfirming] = useState(false);

  function handleClearClick() {
    setConfirming(true);
  }

  function handleConfirmClear() {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  }

  function handleCancelClear() {
    setConfirming(false);
  }

  return (
    <>
      <div
        role="alert"
        data-testid="banner-storage-corrupt"
        className="relative z-50 mx-4 mt-4 rounded-2xl border border-red-500/50 bg-red-950/80 backdrop-blur-sm px-5 py-4 shadow-xl shadow-red-900/30"
      >
        <div className="flex items-start gap-3">
          <span className="text-red-400 text-xl flex-shrink-0 mt-0.5">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="text-red-300 font-bold text-sm mb-1">User store is unreadable — accounts may be inaccessible</p>
            <p className="text-red-400 text-xs leading-relaxed mb-3">
              The saved account data appears to be corrupted or malformed. Sign-in and registration are unavailable until this is resolved.
              Use the button below to permanently delete the corrupted data and restore access.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={handleClearClick}
                data-testid="button-clear-corrupt-store"
                className="inline-flex items-center gap-1.5 bg-red-700 hover:bg-red-600 active:bg-red-800 text-white font-bold text-xs px-4 py-2 rounded-xl transition-colors cursor-pointer border border-red-500/50 shadow-sm"
              >
                🗑️ Clear &amp; Reset
              </button>
              <details className="group">
                <summary className="text-red-500 text-[11px] font-mono cursor-pointer hover:text-red-300 transition-colors select-none">
                  Technical detail
                </summary>
                <p className="text-red-500 text-[11px] font-mono mt-1 break-all leading-relaxed">{message}</p>
              </details>
            </div>
          </div>
          {onDismiss && (
            <button
              onClick={onDismiss}
              data-testid="button-dismiss-storage-corrupt"
              aria-label="Dismiss warning"
              className="text-red-600 hover:text-red-400 transition-colors flex-shrink-0 bg-transparent border-none cursor-pointer text-lg leading-none"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {confirming && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          data-testid="modal-confirm-clear-store"
          onClick={(e) => { if (e.target === e.currentTarget) handleCancelClear(); }}
        >
          <div className="bg-slate-900 border border-red-500/50 rounded-3xl p-8 max-w-md w-full shadow-2xl shadow-red-900/40">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">🗑️</span>
              <h2 className="text-white font-bold text-lg">Permanently delete all account data?</h2>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed mb-2">
              This will permanently erase all registered accounts stored in this browser.
            </p>
            <p className="text-red-400 text-xs font-semibold leading-relaxed mb-6 bg-red-950/60 border border-red-500/30 rounded-xl px-4 py-3">
              ⚠️ This action cannot be undone. All account data will be lost and cannot be recovered.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleCancelClear}
                data-testid="button-cancel-clear-store"
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm py-3 rounded-xl transition-colors cursor-pointer border border-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClear}
                data-testid="button-confirm-clear-store"
                className="flex-1 bg-red-700 hover:bg-red-600 text-white font-bold text-sm py-3 rounded-xl transition-colors cursor-pointer border border-red-500/50 shadow-lg shadow-red-900/30"
              >
                Yes, Delete Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
