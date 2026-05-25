"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Info, X } from "lucide-react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "info";
  onConfirm: () => void | Promise<unknown>;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState(false);
  useFocusTrap(modalRef, { onEscape: onCancel, enabled: isOpen });

  async function handleConfirm() {
    if (submitting) return;
    try {
      setSubmitting(true);
      const result = onConfirm();
      if (result instanceof Promise) await result;
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen || typeof document === "undefined") return null;

  const accentColor = variant === "danger" ? "var(--rose)" : variant === "warning" ? "var(--amber)" : "var(--cyan)";
  const Icon = variant === "info" ? Info : AlertTriangle;

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
    >
      {/* Backdrop */}
      <div
        onClick={() => !submitting && onCancel()}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)" }}
      />

      {/* Panel */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: "420px",
          background: "#0b0e17",
          border: `1px solid ${accentColor}30`,
          borderRadius: "16px",
          boxShadow: `0 0 40px rgba(0,0,0,0.6), 0 0 0 1px ${accentColor}15`,
          overflow: "hidden",
          animation: "fade-up 0.2s cubic-bezier(0.22,1,0.36,1) both",
        }}
      >
        {/* Top accent */}
        <div style={{ height: "2px", background: `linear-gradient(90deg, ${accentColor}, transparent)` }} />

        <div style={{ padding: "24px" }}>
          {/* Icon + Title */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "12px" }}>
            <div style={{
              width: "34px", height: "34px", borderRadius: "8px", flexShrink: 0,
              background: `${accentColor}14`, border: `1px solid ${accentColor}28`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Icon size={16} style={{ color: accentColor }} />
            </div>
            <div>
              <h2 id="confirm-title" style={{ fontSize: "15px", fontWeight: 700, color: "#f0f4f8", margin: 0 }}>
                {title}
              </h2>
              <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px", lineHeight: 1.5 }}>
                {message}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", gap: "8px", padding: "16px 24px", borderTop: "1px solid var(--border)", background: "rgba(255,255,255,0.01)", justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            disabled={submitting}
            style={{
              padding: "8px 16px", fontSize: "13px", fontWeight: 500,
              background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)",
              color: "var(--text-muted)", borderRadius: "8px", cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.5 : 1, transition: "all 150ms", fontFamily: "'Sora', sans-serif",
            }}
            onMouseEnter={(e) => { if (!submitting) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.09)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            style={{
              padding: "8px 18px", fontSize: "13px", fontWeight: 600,
              background: `${accentColor}18`, border: `1px solid ${accentColor}40`,
              color: accentColor, borderRadius: "8px", cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.6 : 1, transition: "all 150ms", fontFamily: "'Sora', sans-serif",
            }}
            onMouseEnter={(e) => { if (!submitting) (e.currentTarget as HTMLElement).style.background = `${accentColor}28`; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = `${accentColor}18`; }}
          >
            {submitting ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  , document.body);
}
