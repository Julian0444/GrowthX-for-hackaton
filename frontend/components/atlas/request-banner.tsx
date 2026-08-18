"use client"

import type { RequestState } from "@/lib/api/types"

// Estados de request visibles (§10): error → mensaje pequeño y honesto con
// Retry; partial → aviso de qué fuentes faltan o de que la respuesta llegó
// degradada. La presentación nunca se rompe.
export function RequestBanner({
  request,
  onRetry,
}: {
  request: RequestState
  onRetry: () => void
}) {
  if (request.status === "error") {
    return (
      <div className="req-banner error" role="alert">
        <p className="msg">
          <b>Search failed</b> — {request.message}
        </p>
        {request.retryable && (
          <div className="actions">
            <button className="req-btn" type="button" onClick={onRetry}>
              Retry
            </button>
          </div>
        )}
      </div>
    )
  }
  if (request.status === "partial") {
    return (
      <div className="req-banner partial" role="status">
        <p className="msg">{request.message}</p>
      </div>
    )
  }
  return null
}
