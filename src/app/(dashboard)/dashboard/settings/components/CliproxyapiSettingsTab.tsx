"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Card, Button, Input, Toggle } from "@/shared/components";
import Icon from "@/shared/components/Icon";

interface Settings {
  cliproxyapi_fallback_enabled?: boolean;
  cliproxyapi_url?: string;
  cliproxyapi_fallback_codes?: string;
  [key: string]: unknown;
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export default function CliproxyapiSettingsTab() {
  const t = useTranslations("settings");
  const [settings, setSettings] = useState<Settings>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);
  // #1934: import CLIProxyAPI auth files (~/.cli-proxy-api/) as OmniRoute connections.
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const handleImportAuth = useCallback(async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch("/api/oauth/cliproxy-import", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setImportResult(
          t("cliproxyapiImportResult", {
            imported: data.imported ?? 0,
            scanned: data.scanned ?? 0,
            skipped: data.skipped ?? 0,
          })
        );
      } else {
        setImportResult(data.error || t("cliproxyapiImportFailed"));
      }
    } catch {
      setImportResult(t("cliproxyapiImportFailed"));
    } finally {
      setImporting(false);
    }
  }, [t]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => {
        if (!r.ok) throw new Error(`Settings API returned ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setSettings(data);
      })
      .catch((err) => {
        console.error("Failed to load settings:", err);
      });
  }, []);

  const updateSetting = useCallback(
    async (key: string, value: boolean | string) => {
      if (key === "cliproxyapi_url" && typeof value === "string" && value.trim() !== "") {
        if (!isValidUrl(value)) {
          setMessage({ type: "error", text: t("cliproxyapiInvalidUrl") });
          return;
        }
      }

      setSaving(true);
      setMessage(null);
      try {
        const res = await fetch("/api/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [key]: value }),
        });
        if (!res.ok) {
          throw new Error(`Server returned ${res.status}`);
        }
        await res.json();
        setSettings((prev) => ({ ...prev, [key]: value }));
        setMessage({ type: "success", text: t("settingSaved") });
      } catch {
        setMessage({ type: "error", text: t("settingSaveFailed") });
      } finally {
        setSaving(false);
      }
    },
    [t]
  );

  const cpaEnabled = settings.cliproxyapi_fallback_enabled === true;
  const cpaUrl = settings.cliproxyapi_url || "http://127.0.0.1:8317";
  const cpaCodes = settings.cliproxyapi_fallback_codes || "502,401,403,429,503";

  return (
    <div className="space-y-4">
      {message && (
        <div
          role={message.type === "success" ? "status" : "alert"}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
            message.type === "success" ? "bg-success-bg text-success" : "bg-error-bg text-error"
          }`}
        >
          <Icon name={message.type === "success" ? "check_circle" : "error"} size={14} />
          {message.text}
        </div>
      )}

      <Card
        padding="md"
        icon="swap_horiz"
        title={t("cliproxyapiFallback")}
        subtitle={t("cliproxyapiFallbackDescription")}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm text-text-main">{t("cliproxyapiEnableFallback")}</span>
            <Toggle
              ariaLabel={t("cliproxyapiEnableFallback")}
              checked={cpaEnabled}
              onChange={(checked) => updateSetting("cliproxyapi_fallback_enabled", checked)}
            />
          </div>

          {cpaEnabled && (
            <>
              <Input
                label={t("cliproxyapiUrl")}
                value={cpaUrl}
                onChange={(e) => updateSetting("cliproxyapi_url", e.target.value)}
                placeholder="http://127.0.0.1:8317"
                className="w-full"
              />

              <Input
                label={t("cliproxyapiFallbackCodes")}
                value={cpaCodes}
                onChange={(e) => updateSetting("cliproxyapi_fallback_codes", e.target.value)}
                placeholder="502,401,403,429,503"
                className="w-full"
              />
            </>
          )}
        </div>
      </Card>

      <Card
        padding="md"
        title={t("cliproxyapiImportAuthTitle")}
        subtitle={t("cliproxyapiImportAuthDesc")}
      >
        <Button onClick={handleImportAuth} loading={importing} disabled={importing}>
          {t("cliproxyapiImportAuthButton")}
        </Button>
        {importResult ? (
          <p className="text-sm text-text-muted mt-3" role="status">
            {importResult}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
