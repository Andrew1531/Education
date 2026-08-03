import React from 'react';

/**
 * Prominent warning shown when `ge_users` exists but cannot be parsed.
 * Gives the admin a clear path to recover (clear the key) or dismiss and
 * continue without user data.
 */
export function StorageCorruptBanner({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return (
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
            An administrator can clear the corrupted data from the browser&apos;s Application → Local Storage tab
            (<code className="font-mono bg-red-900/40 px-1 rounded">ge_users</code>) to restore access.
          </p>
          <details className="group">
            <summary className="text-red-500 text-[11px] font-mono cursor-pointer hover:text-red-300 transition-colors select-none">
              Technical detail
            </summary>
            <p className="text-red-500 text-[11px] font-mono mt-1 break-all leading-relaxed">{message}</p>
          </details>
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
  );
}
