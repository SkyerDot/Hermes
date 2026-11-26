"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import ProxyRegistryManager from "../ProxyRegistryManager";
import VercelRelayModal from "./VercelRelayModal";
import DenoRelayModal from "./DenoRelayModal";
import type { ProxyItem } from "../proxyRegistryTypes";
import { useNotificationStore } from "@/store/notificationStore";

export default function ProxyPoolTab() {
  const t = useTranslations("settings");
  const notifySuccess = useNotificationStore((s) => s.success);
  const [vercelModalOpen, setVercelModalOpen] = useState(false);
  const [denoModalOpen, setDenoModalOpen] = useState(false);

  const showVercelRelay = process.env.NEXT_PUBLIC_VERCEL_RELAY_ENABLED !== "false";
  const showDenoRelay = process.env.NEXT_PUBLIC_DENO_RELAY_ENABLED !== "false";

  const handleVercelDeployed = (_poolProxyId: string, relayUrl: string) => {
    notifySuccess(relayUrl, t("vercelRelaySuccess"));
  };

  const handleRedeployRelay = (proxy: ProxyItem) => {
    if (proxy.type === "vercel") setVercelModalOpen(true);
    else if (proxy.type === "deno") setDenoModalOpen(true);
  };

  return (
    <div className="space-y-4">
      <ProxyRegistryManager
        onRedeployRelay={handleRedeployRelay}
        showVercelRelay={showVercelRelay}
        showDenoRelay={showDenoRelay}
        onOpenVercelRelay={() => setVercelModalOpen(true)}
        onOpenDenoRelay={() => setDenoModalOpen(true)}
      />
      <VercelRelayModal
        isOpen={vercelModalOpen}
        onClose={() => setVercelModalOpen(false)}
        onDeployed={handleVercelDeployed}
      />
      <DenoRelayModal
        isOpen={denoModalOpen}
        onClose={() => setDenoModalOpen(false)}
        onDeployed={handleVercelDeployed}
      />
    </div>
  );
}
