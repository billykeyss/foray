"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useApiKey } from "@/lib/api-key-context";
import OfflineDownload from "@/components/offline-download";
import { useLicense } from "@/lib/use-license.ts";
import type { LicenseState } from "@/lib/license.ts";
import { FISHING_DATA } from "@/lib/fishing/meta.ts";

const FISHING_DATE = new Date(FISHING_DATA.exportedAt).toLocaleDateString(
  "en-US",
  { month: "short", day: "numeric", year: "numeric" },
);

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ApiKeyDialog({ open, onClose }: Props) {
  const { apiKey, setApiKey } = useApiKey();
  const [input, setInput] = useState(apiKey ?? "");
  const [show, setShow] = useState(false);
  const { licenses, setExpiry } = useLicense();
  const [resetN, setResetN] = useState(0);

  if (!open) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    if (!v) {
      setApiKey(null);
    } else if (v.startsWith("sk-")) {
      setApiKey(v);
    } else {
      alert("That doesn't look like an Anthropic API key (should start with sk-).");
      return;
    }
    onClose();
  };

  // Portal to <body>: the nav bars use backdrop-filter, which makes `fixed`
  // resolve against the bar instead of the viewport and clips this sheet.
  return createPortal(
    <div
      className="fixed inset-0 z-[80] grid items-end sm:items-center"
      style={{ background: "rgba(26, 20, 16, 0.5)" }}
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="mx-auto w-full max-w-[480px] p-6 sm:rounded-3xl"
        style={{
          background: "var(--parchment)",
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          boxShadow: "0 -30px 60px -30px rgba(0,0,0,0.4)",
          paddingBottom: "max(24px, env(safe-area-inset-bottom))",
          maxHeight: "100dvh",
          overflowY: "auto",
        }}
      >
        <div
          className="mx-auto mb-4"
          style={{
            width: 36,
            height: 4,
            borderRadius: 4,
            background: "var(--line)",
          }}
        />
        <div className="eyebrow mb-3">Settings · Claude API</div>
        <h2 className="title-hero" style={{ fontSize: 30, marginBottom: 8 }}>
          Bring your <em>own key.</em>
        </h2>
        <p
          className="font-body mb-5"
          style={{
            fontSize: 14,
            color: "var(--ink-soft)",
            lineHeight: 1.5,
          }}
        >
          Foray is a static site with no backend, so the LLM call goes from your
          browser straight to Anthropic. Your key is stored in{" "}
          <code style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>
            localStorage
          </code>{" "}
          on this device only — never sent anywhere else.
        </p>

        <label
          className="font-mono block mb-1.5"
          style={{
            fontSize: 9,
            letterSpacing: "0.22em",
            color: "var(--ink-soft)",
            textTransform: "uppercase",
          }}
        >
          Anthropic API key
        </label>
        <div className="relative">
          <input
            autoFocus
            type={show ? "text" : "password"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="sk-ant-…"
            className="field-input"
            style={{ paddingRight: 56 }}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide key" : "Show key"}
            className="font-mono absolute"
            style={{
              top: "50%",
              right: 12,
              transform: "translateY(-50%)",
              background: "transparent",
              border: 0,
              color: "var(--ink-soft)",
              fontSize: 10,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            {show ? "hide" : "show"}
          </button>
        </div>

        <p
          className="font-mono mt-3"
          style={{
            fontSize: 10,
            letterSpacing: "0.06em",
            color: "var(--ink-soft)",
            opacity: 0.7,
            lineHeight: 1.5,
          }}
        >
          Get a key at{" "}
          <a
            href="https://console.anthropic.com/settings/keys"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--rust)",
              textDecoration: "underline",
              textDecorationStyle: "dotted",
            }}
          >
            console.anthropic.com ↗
          </a>
          . Pay-as-you-go; each spot analysis costs roughly $0.005.
        </p>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            {input.trim() ? "Save key" : "Clear key"}
          </button>
        </div>

        <OfflineDownload />

        <fieldset className="kp kp-license">
          <legend>Fishing license</legend>
          <p>Optional. Stored on this device only; used to remind you before a license lapses.</p>
          {(["CA", "NV"] as LicenseState[]).map((st) => {
            const cur = licenses.find((l) => l.state === st)?.expires ?? "";
            return (
              <div className="kp-license-row" key={st}>
                <label htmlFor={`lic-${st}`}>{st} expires</label>
                <input
                  id={`lic-${st}`}
                  type="date"
                  key={`${st}-${resetN}`}
                  defaultValue={cur}
                  // Uncontrolled so a half-typed date segment isn't reset. A cleared/half-typed date emits "" mid-edit; only a full YYYY-MM-DD commits.
                  // Removal is the explicit Remove button.
                  onChange={(e) => {
                    if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setExpiry(st, e.target.value);
                  }}
                />
                {cur && (
                  <button type="button" onClick={() => {
                      setExpiry(st, null);
                      setResetN((n) => n + 1);
                    }} aria-label={`Remove ${st} license`}>
                    Remove
                  </button>
                )}
              </div>
            );
          })}
        </fieldset>

        <p
          className="font-mono mt-4"
          style={{ fontSize: 11, color: "var(--ink-soft)" }}
        >
          Fishing data as of {FISHING_DATE} · {FISHING_DATA.waterCount} waters
        </p>
      </form>
    </div>,
    document.body,
  );
}
