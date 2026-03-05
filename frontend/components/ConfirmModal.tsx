'use client'

import { AlertTriangle } from 'lucide-react'

interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning'
  onConfirm: () => void
  onCancel: () => void
  /** Optional: show text input for reason */
  showReason?: boolean
  reason?: string
  onReasonChange?: (reason: string) => void
  reasonPlaceholder?: string
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Bestätigen',
  cancelLabel = 'Abbrechen',
  variant = 'danger',
  onConfirm,
  onCancel,
  showReason = false,
  reason = '',
  onReasonChange,
  reasonPlaceholder = 'Grund (optional)',
}: ConfirmModalProps) {
  if (!open) return null

  const confirmColors = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-amber-600 hover:bg-amber-700 text-white'

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className={`p-2 rounded-xl ${variant === 'danger' ? 'bg-red-100' : 'bg-amber-100'}`}>
            <AlertTriangle className={`w-5 h-5 ${variant === 'danger' ? 'text-red-600' : 'text-amber-600'}`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
            <p className="text-sm text-neutral-600 mt-1">{message}</p>
          </div>
        </div>

        {showReason && onReasonChange && (
          <textarea
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder={reasonPlaceholder}
            className="w-full px-3 py-2 border border-neutral-200 rounded-xl text-sm mb-4 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            rows={2}
          />
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-neutral-700 bg-neutral-100 rounded-xl hover:bg-neutral-200 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${confirmColors}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
