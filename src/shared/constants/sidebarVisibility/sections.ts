import type {
  SidebarItemDefinition,
  SidebarItemGroup,
  SidebarSectionChild,
  SidebarSectionDefinition,
} from "./types";

// ─── Item arrays ────────────────────────────────────────────────────────────

const HOME_ITEMS: readonly SidebarItemDefinition[] = [
  {
    id: "home",
    href: "/home",
    i18nKey: "home",
    subtitleKey: "homeSubtitle",
    icon: "home",
    exact: true,
  },
];

const OMNI_PROXY_ITEMS: readonly SidebarItemDefinition[] = [
  {
    id: "endpoints",
    href: "/dashboard/endpoint",
    i18nKey: "endpoints",
    subtitleKey: "endpointsSubtitle",
    icon: "api",
  },
  {
    id: "api-manager",
    href: "/dashboard/api-manager",
    i18nKey: "apiManager",
    subtitleKey: "apiManagerSubtitle",
    icon: "vpn_key",
  },
  {
    id: "providers",
    href: "/dashboard/providers",
    i18nKey: "providers",
    subtitleKey: "providersSubtitle",
    icon: "dns",
  },
  {
    id: "model-catalog",
    href: "/dashboard/models",
    i18nKey: "modelCatalog",
    labelFallback: "Models & Combos",
    subtitleKey: "modelCatalogSubtitle",
    subtitleFallback: "Browse models and combos across providers",
    icon: "view_list",
  },
  {
    id: "combos",
    href: "/dashboard/combos",
    i18nKey: "combos",
    subtitleKey: "combosSubtitle",
    icon: "layers",
  },
  {
    id: "combos-live",
    href: "/dashboard/combos/live",
    i18nKey: "combosLive",
    labelFallback: "Combo Studio",
    subtitleKey: "combosLiveSubtitle",
    subtitleFallback: "Live routing cascade",
    icon: "account_tree",
  },
  {
    id: "quota",
    href: "/dashboard/quota",
    i18nKey: "providerQuota",
    subtitleKey: "providerQuotaSubtitle",
    icon: "tune",
  },
  {
    id: "cache",
    href: "/dashboard/cache",
    i18nKey: "cache",
    subtitleKey: "cacheSubtitle",
    icon: "cached",
  },
];

export const COMPRESSION_CONTEXT_GROUP: SidebarItemGroup = {
  type: "group",
  id: "compression-context",
  titleKey: "compressionContextGroup",
  titleFallback: "Compression Context",
  // Order: Settings (the unified panel) → Combos → per-engine pages → Studio (analytics).
  items: [
    {
      id: "context-settings",
      href: "/dashboard/context/settings",
      i18nKey: "contextSettings",
      labelFallback: "Compression Settings",
      subtitleKey: "contextSettingsSubtitle",
      subtitleFallback: "Global defaults",
      icon: "settings",
    },
    {
      id: "context-combos",
      href: "/dashboard/context/combos",
      i18nKey: "contextCombos",
      subtitleKey: "contextCombosSubtitle",
      icon: "hub",
    },
    {
      id: "context-caveman",
      href: "/dashboard/context/caveman",
      i18nKey: "contextCaveman",
      subtitleKey: "contextCavemanSubtitle",
      icon: "compress",
    },
    {
      id: "context-rtk",
      href: "/dashboard/context/rtk",
      i18nKey: "contextRtk",
      subtitleKey: "contextRtkSubtitle",
      icon: "filter_alt",
    },
    {
      id: "context-headroom",
      href: "/dashboard/context/headroom",
      i18nKey: "contextHeadroom",
      labelFallback: "Headroom",
      subtitleKey: "contextHeadroomSubtitle",
      subtitleFallback: "Tabular compaction",
      icon: "table_rows",
    },
    {
      id: "context-session-dedup",
      href: "/dashboard/context/session-dedup",
      i18nKey: "contextSessionDedup",
      labelFallback: "Session Dedup",
      subtitleKey: "contextSessionDedupSubtitle",
      subtitleFallback: "Cross-turn dedup",
      icon: "content_copy",
    },
    {
      id: "context-ccr",
      href: "/dashboard/context/ccr",
      i18nKey: "contextCcr",
      labelFallback: "CCR",
      subtitleKey: "contextCcrSubtitle",
      subtitleFallback: "Retrieve markers",
      icon: "archive",
    },
    {
      id: "context-llmlingua",
      href: "/dashboard/context/llmlingua",
      i18nKey: "contextLlmlingua",
      labelFallback: "LLMLingua",
      subtitleKey: "contextLlmlinguaSubtitle",
      subtitleFallback: "Semantic pruning",
      icon: "psychology",
    },
    {
      id: "context-lite",
      href: "/dashboard/context/lite",
      i18nKey: "contextLite",
      labelFallback: "Lite",
      subtitleKey: "contextLiteSubtitle",
      subtitleFallback: "Fast whitespace cleanup",
      icon: "compress",
    },
    {
      id: "context-aggressive",
      href: "/dashboard/context/aggressive",
      i18nKey: "contextAggressive",
      labelFallback: "Aggressive",
      subtitleKey: "contextAggressiveSubtitle",
      subtitleFallback: "Summary + aging",
      icon: "speed",
    },
    {
      id: "context-ultra",
      href: "/dashboard/context/ultra",
      i18nKey: "contextUltra",
      labelFallback: "Ultra",
      subtitleKey: "contextUltraSubtitle",
      subtitleFallback: "Heuristic pruning",
      icon: "bolt",
    },
    {
      id: "context-omniglyph",
      href: "/dashboard/context/omniglyph",
      i18nKey: "contextOmniglyph",
      labelFallback: "OmniGlyph",
      subtitleKey: "contextOmniglyphSubtitle",
      subtitleFallback: "Context-as-image",
      icon: "grain",
    },
    {
      id: "compression-studio",
      href: "/dashboard/compression/studio",
      i18nKey: "compressionStudio",
      labelFallback: "Compression Studio",
      subtitleKey: "compressionStudioSubtitle",
      subtitleFallback: "Live engine cascade",
      icon: "monitoring",
    },
    {
      id: "compression-exclusions",
      href: "/dashboard/compression/exclusions",
      i18nKey: "compressionExclusions",
      labelFallback: "Exclusions",
      subtitleKey: "compressionExclusionsSubtitle",
      subtitleFallback: "Per-model/endpoint bypass",
      icon: "block",
    },
  ],
};

const TOOLS_GROUP: SidebarItemGroup = {
  type: "group",
  id: "tools",
  titleKey: "toolsGroup",
  titleFallback: "Tools",
  items: [
    {
      id: "discovery",
      href: "/dashboard/discovery",
      i18nKey: "discovery",
      subtitleKey: "discoverySubtitle",
      icon: "travel_explore",
    },
  ],
};

const INTEGRATIONS_GROUP: SidebarItemGroup = {
  type: "group",
  id: "integrations",
  titleKey: "integrationsGroup",
  titleFallback: "Integrations",
  items: [
    {
      id: "api-endpoints",
      href: "/dashboard/api-endpoints",
      i18nKey: "apiEndpoints",
      subtitleKey: "apiEndpointsSubtitle",
      icon: "api",
    },
    {
      id: "log-export",
      href: "/dashboard/log-export",
      i18nKey: "logExport",
      subtitleKey: "logExportSubtitle",
      icon: "cloud_upload",
      labelFallback: "Log export",
      subtitleFallback: "Ship call logs out",
    },
  ],
};

const PROXY_ITEM: SidebarItemDefinition = {
  id: "proxy",
  href: "/dashboard/system/proxy",
  i18nKey: "proxy",
  subtitleKey: "proxySubtitle",
  icon: "dns",
};

const MONITORING_ITEMS: readonly SidebarItemDefinition[] = [
  {
    id: "activity",
    href: "/dashboard/activity",
    i18nKey: "activity",
    subtitleKey: "activitySubtitle",
    icon: "timeline",
  },
];

const SYSTEM_GROUP: SidebarItemGroup = {
  type: "group",
  id: "system",
  titleKey: "systemGroup",
  titleFallback: "System",
  items: [
    {
      id: "health",
      href: "/dashboard/health",
      i18nKey: "health",
      subtitleKey: "healthSubtitle",
      icon: "health_and_safety",
    },
    {
      id: "runtime",
      href: "/dashboard/runtime",
      i18nKey: "runtime",
      subtitleKey: "runtimeSubtitle",
      icon: "bolt",
    },
    {
      id: "resilience-connections",
      href: "/dashboard/resilience/connections",
      i18nKey: "resilienceConnections",
      subtitleKey: "resilienceConnectionsSubtitle",
      icon: "shield",
    },
    {
      id: "resilience-cooldowns",
      href: "/dashboard/resilience/cooldowns",
      i18nKey: "resilienceCooldowns",
      subtitleKey: "resilienceCooldownsSubtitle",
      icon: "timer_off",
    },
  ],
};

const DEVTOOLS_ITEMS: readonly SidebarItemDefinition[] = [
  {
    id: "translator",
    href: "/dashboard/translator",
    i18nKey: "translator",
    subtitleKey: "translatorSubtitle",
    icon: "translate",
  },
  {
    id: "playground",
    href: "/dashboard/playground",
    i18nKey: "playground",
    subtitleKey: "playgroundSubtitle",
    icon: "science",
  },
  {
    id: "search-tools",
    href: "/dashboard/search-tools",
    i18nKey: "searchTools",
    subtitleKey: "searchToolsSubtitle",
    icon: "manage_search",
  },
];

const AGENTIC_FEATURES_ITEMS: readonly SidebarSectionChild[] = [
  {
    id: "chaos-config",
    href: "/dashboard/chaos",
    i18nKey: "chaosConfig",
    labelFallback: "Chaos Mode",
    subtitleKey: "chaosConfigSubtitle",
    subtitleFallback: "Multi-model parallel execution",
    icon: "blender",
  },
];

const OTHER_FEATURES_ITEMS: readonly SidebarItemDefinition[] = [
  {
    id: "media",
    href: "/dashboard/cache/media",
    i18nKey: "media",
    subtitleKey: "mediaSubtitle",
    icon: "perm_media",
  },
];

const BATCH_GROUP: SidebarItemGroup = {
  type: "group",
  id: "batch",
  titleKey: "batchGroup",
  titleFallback: "Batch",
  items: [
    {
      id: "batch",
      href: "/dashboard/batch",
      i18nKey: "batch",
      subtitleKey: "batchSubtitle",
      icon: "view_list",
    },
    {
      id: "batch-files",
      href: "/dashboard/batch/files",
      i18nKey: "batchFiles",
      subtitleKey: "batchFilesSubtitle",
      icon: "folder",
    },
  ],
};

const CONFIGURATION_ITEMS: readonly SidebarItemDefinition[] = [
  {
    id: "settings-general",
    href: "/dashboard/settings/general",
    i18nKey: "settingsGeneral",
    subtitleKey: "settingsGeneralSubtitle",
    icon: "tune",
  },
  {
    id: "settings-appearance",
    href: "/dashboard/settings/appearance",
    i18nKey: "settingsAppearance",
    subtitleKey: "settingsAppearanceSubtitle",
    icon: "palette",
  },
  {
    id: "settings-ai",
    href: "/dashboard/settings/ai",
    i18nKey: "settingsAi",
    subtitleKey: "settingsAiSubtitle",
    icon: "auto_awesome",
  },
  {
    id: "settings-modality-bridge",
    href: "/dashboard/settings/modality-bridge",
    i18nKey: "settingsModalityBridge",
    subtitleKey: "settingsModalityBridgeSubtitle",
    icon: "image_search",
  },
  {
    id: "settings-routing",
    href: "/dashboard/settings/routing",
    i18nKey: "globalRouting",
    subtitleKey: "globalRoutingSubtitle",
    icon: "route",
  },
  {
    id: "settings-resilience",
    href: "/dashboard/settings/resilience",
    i18nKey: "settingsResilience",
    subtitleKey: "settingsResilienceSubtitle",
    icon: "health_and_safety",
  },
  {
    id: "settings-advanced",
    href: "/dashboard/settings/advanced",
    i18nKey: "settingsAdvanced",
    subtitleKey: "settingsAdvancedSubtitle",
    icon: "engineering",
  },
  {
    id: "settings-security",
    href: "/dashboard/settings/security",
    i18nKey: "settingsSecurity",
    subtitleKey: "settingsSecuritySubtitle",
    icon: "shield",
  },
  {
    id: "settings-access-tokens",
    href: "/dashboard/settings/access-tokens",
    i18nKey: "settingsAccessTokens",
    labelFallback: "Access Tokens",
    subtitleKey: "settingsAccessTokensSubtitle",
    icon: "key",
  },
  {
    id: "settings-feature-flags",
    href: "/dashboard/settings/feature-flags",
    i18nKey: "settingsFeatureFlags",
    subtitleKey: "settingsFeatureFlagsSubtitle",
    icon: "flag",
  },
  {
    id: "settings-cache",
    href: "/dashboard/settings/cache",
    i18nKey: "settingsCache",
    subtitleKey: "settingsCacheSubtitle",
    icon: "database",
  },
  {
    id: "settings-sidebar",
    href: "/dashboard/settings/sidebar",
    i18nKey: "settingsSidebar",
    subtitleKey: "settingsSidebarSubtitle",
    icon: "view_sidebar",
  },
];

const HELP_ITEMS: readonly SidebarItemDefinition[] = [
  {
    id: "docs",
    href: "/docs",
    i18nKey: "docs",
    subtitleKey: "docsSubtitle",
    icon: "menu_book",
    external: true,
  },
  {
    id: "issues",
    href: "https://github.com/cheaper-inference/OmniRoute/issues",
    i18nKey: "issues",
    subtitleKey: "issuesSubtitle",
    icon: "bug_report",
    external: true,
  },
  {
    id: "changelog",
    href: "/dashboard/changelog",
    i18nKey: "changelog",
    subtitleKey: "changelogSubtitle",
    icon: "campaign",
  },
];

// ─── Sections ────────────────────────────────────────────────────────────────

export const SIDEBAR_SECTIONS: readonly SidebarSectionDefinition[] = [
  {
    id: "home",
    titleKey: "home",
    titleFallback: "Home",
    children: HOME_ITEMS,
    showTitle: false,
  },
  {
    id: "omni-proxy",
    titleKey: "omniProxySection",
    titleFallback: "OmniProxy",
    children: [
      ...OMNI_PROXY_ITEMS,
      COMPRESSION_CONTEXT_GROUP,
      TOOLS_GROUP,
      INTEGRATIONS_GROUP,
      PROXY_ITEM,
    ],
  },
  {
    id: "monitoring",
    titleKey: "monitoringSection",
    titleFallback: "Monitoring",
    children: [...MONITORING_ITEMS, SYSTEM_GROUP],
  },
  {
    id: "devtools",
    titleKey: "devtoolsSection",
    titleFallback: "Dev Tools",
    children: DEVTOOLS_ITEMS,
  },
  {
    id: "agentic-features",
    titleKey: "agenticFeaturesSection",
    titleFallback: "Agentic Features",
    children: AGENTIC_FEATURES_ITEMS,
  },
  {
    id: "other-features",
    titleKey: "otherFeaturesSection",
    titleFallback: "Other Features",
    children: [...OTHER_FEATURES_ITEMS, BATCH_GROUP],
  },
  {
    id: "configuration",
    titleKey: "configurationSection",
    titleFallback: "Configuration",
    children: CONFIGURATION_ITEMS,
  },
  {
    id: "help",
    titleKey: "helpSection",
    titleFallback: "Help",
    children: HELP_ITEMS,
  },
] as const;
