"use client";

import { useTranslations } from "next-intl";
import { PageHeader } from "@omniroute/ui-kit/page-header";
import { ComboLiveStudio } from "./ComboLiveStudio";
import { useProviderBreakerHealth } from "@/hooks/useProviderBreakerHealth";

/**
 * Combo/Routing Studio (Tela B) — live combo cascade.
 *
 * Live WS removed; the studio renders a local empty state.
 * `useProviderBreakerHealth` overlays the real circuit-breaker state
 * (U1b) from the monitoring health snapshot — fail-soft, so it never breaks the
 * cascade when the endpoint is unavailable.
 */
export default function ComboLiveStudioPage() {
  const { providerHealth, connectionHealth } = useProviderBreakerHealth();
  const t = useTranslations("sidebar");

  // Local empty state — live WS removed
  const comboEvents: never[] = [];
  const activeCombos = new Set<string>();
  const isConnected = false;

  return (
    <div className="flex h-[calc(100dvh-6rem)] min-h-[480px] flex-col gap-3 p-4">
      <PageHeader compact title={t("combosLive")} description={t("combosLiveSubtitle")} />
      <div className="min-h-0 flex-1">
        <ComboLiveStudio
          comboEvents={comboEvents}
          combos={[...activeCombos]}
          isConnected={isConnected}
          providerHealth={providerHealth}
          connectionHealth={connectionHealth}
        />
      </div>
    </div>
  );
}
