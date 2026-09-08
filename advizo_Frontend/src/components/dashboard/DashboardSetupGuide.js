import { useEffect, useMemo, useState } from "react";
import { Button, Icon } from "@shopify/polaris";
import {
  CheckIcon,
  PersonAddIcon,
  CashDollarIcon,
  ThemeEditIcon,
  MenuIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XIcon,
  HomeIcon,
  PersonIcon,
  LockIcon,
} from "@shopify/polaris-icons";
import styles from "./DashboardSetupGuide.module.css";

const STEP_ICONS = {
  1: PersonAddIcon,
  2: CashDollarIcon,
  3: ThemeEditIcon,
  4: MenuIcon,
};

const REQUIRED_STORE_MENUS = [
  { path: "/apps/advizo", label: "Home" },
  // /pages/my-profile is the live customer profile (native Theme
  // Extension block) — /apps/advizo/profile was the old iframe launcher,
  // removed. Kept in sync with REQUIRED_MENU_PATHS in
  // advizo_Backend/Utils/menuPathUtils.js.
  { path: "/pages/my-profile", label: "Profile" },
  { path: "/apps/advizo/login", label: "Consultant login" },
];

export function normalizeShopDomain(shop) {
  if (!shop) return null;
  const trimmed = String(shop).trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!trimmed) return null;
  return trimmed.includes(".") ? trimmed : `${trimmed}.myshopify.com`;
}

export function buildStorefrontMenuUrl(shop, path) {
  const domain = normalizeShopDomain(shop);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!domain) return normalizedPath;
  return `https://${domain}${normalizedPath}`;
}

function getMenuChecklist(menuSetupComplete, shop) {
  const missing = menuSetupComplete?.missingMenus || [];
  return REQUIRED_STORE_MENUS.map((menu) => ({
    label: menu.label,
    hint: menu.path,
    fullUrl: buildStorefrontMenuUrl(shop, menu.path),
    isSet: !missing.includes(menu.path),
    copyable: true,
  }));
}

function buildChecklist(items) {
  const setCount = items.filter((item) => item.isSet).length;
  return { items, setCount, total: items.length };
}

function enrichStepsWithCardState(steps) {
  const firstPendingIndex = steps.findIndex((s) => s.status !== "completed");

  return steps.map((step, index) => {
    if (step.status === "completed") {
      return { ...step, cardState: "completed" };
    }
    if (index === firstPendingIndex) {
      return { ...step, cardState: "current" };
    }
    return { ...step, cardState: "upcoming" };
  });
}

export function getSetupGuideSteps({
  consultantCount,
  adminPercentage,
  appEnabled,
  menuSetupComplete,
  shop,
}) {
  const hasConsultant = consultantCount > 0;
  const hasCommission = Number(adminPercentage || 0) > 0;
  const menusComplete =
    menuSetupComplete && !menuSetupComplete.missingMenus?.length;

  const consultantChecklist = buildChecklist([
    { label: "Profile completed", isSet: hasConsultant },
    { label: "Bio added", isSet: hasConsultant },
    { label: "Visible on storefront", isSet: hasConsultant },
  ]);

  const commissionChecklist = buildChecklist([
    { label: "Commission percentage set", isSet: hasCommission },
    { label: "Payout rules saved", isSet: hasCommission },
  ]);

  const embedChecklist = buildChecklist([
    { label: "Theme app embed added", isSet: !!appEnabled },
    { label: "Consultly active on store", isSet: !!appEnabled },
  ]);

  const menuChecklist = buildChecklist(getMenuChecklist(menuSetupComplete, shop));

  return [
    {
      id: 1,
      icon: STEP_ICONS[1],
      title: "Add your first consultant",
      description:
        "Create consultant profiles so customers can book sessions on your store.",
      status: hasConsultant ? "completed" : "pending",
      actionLabel: "Add consultant",
      manageLabel: "Manage consultants",
      checklist: consultantChecklist,
    },
    {
      id: 2,
      icon: STEP_ICONS[2],
      title: "Set commission percentage",
      description:
        "Define how much you earn from each consultation booking.",
      status: hasCommission ? "completed" : "pending",
      actionLabel: "Set commission",
      manageLabel: "Manage commission",
      checklist: commissionChecklist,
    },
    {
      id: 3,
      icon: STEP_ICONS[3],
      title: "Activate app on storefront",
      description:
        "Enable Consultly so customers can access consultants from your online store.",
      status: appEnabled ? "completed" : "pending",
      actionLabel: "Activate app",
      manageLabel: "Manage app status",
      checklist: embedChecklist,
    },
    {
      id: 4,
      icon: STEP_ICONS[4],
      title: "Add store navigation links",
      description:
        "Add Home, Profile, and Consultant login links to your store menu.",
      status: menusComplete ? "completed" : "pending",
      actionLabel: "Configure menus",
      manageLabel: "Manage navigation",
      checklist: menuChecklist,
    },
  ];
}

export function isSetupGuideComplete(props) {
  return getSetupGuideSteps(props).every((step) => step.status === "completed");
}

const MENU_LINK_STYLES = {
  Home: { icon: HomeIcon, bg: "#E3F2FD", color: "#1565C0" },
  Profile: { icon: PersonIcon, bg: "#E8F5E9", color: "#2E7D32" },
  "Consultant login": { icon: LockIcon, bg: "#FFF3E0", color: "#EF6C00" },
};

function ChecklistItem({ item, onCopy, copiedLabel }) {
  const menuStyle = MENU_LINK_STYLES[item.label];

  if (item.copyable && menuStyle) {
    return (
      <li className={styles.menuLinkItem}>
        <div className={styles.menuLinkLeft}>
          <div
            className={styles.menuLinkIcon}
            style={{ background: menuStyle.bg, color: menuStyle.color }}
          >
            <Icon
              source={item.isSet ? CheckIcon : menuStyle.icon}
              tone="base"
            />
          </div>
          <div className={styles.menuLinkText}>
            <span className={styles.menuLinkTitle}>{item.label}</span>
            <span
              className={
                item.isSet ? styles.menuLinkStatus : styles.menuLinkUrl
              }
            >
              {item.isSet ? "Added to store menu" : item.fullUrl}
            </span>
          </div>
        </div>
        {!item.isSet && item.fullUrl && (
          <Button
            size="slim"
            onClick={() => onCopy(item.fullUrl, item.label)}
          >
            {copiedLabel === item.label ? "Copied" : "Copy"}
          </Button>
        )}
      </li>
    );
  }

  return (
    <li className={styles.checkItem}>
      <span
        className={`${styles.checkDot} ${
          item.isSet ? styles.checkDotDone : ""
        }`}
      />
      <div className={styles.checkItemContent}>
        <span className={styles.checkItemLabel}>{item.label}</span>
        {!item.isSet && item.hint && (
          <span className={styles.checkHint}>Link: {item.hint}</span>
        )}
      </div>
    </li>
  );
}

function StepItem({ step, onStepAction }) {
  const [copiedLabel, setCopiedLabel] = useState(null);

  const handleCopy = async (url, label) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLabel(label);
      setTimeout(() => setCopiedLabel(null), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement("textarea");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopiedLabel(label);
      setTimeout(() => setCopiedLabel(null), 2000);
    }
  };
  const isCompleted = step.cardState === "completed";
  const isCurrent = step.cardState === "current";
  const isExpanded = isCurrent;

  const itemClass = [
    styles.stepItem,
    isCompleted && styles.stepItemCompleted,
    isCurrent && styles.stepItemCurrent,
    !isCompleted && !isCurrent && styles.stepItemUpcoming,
  ]
    .filter(Boolean)
    .join(" ");

  const iconClass = [
    styles.stepIcon,
    isCompleted ? styles.stepIconDone : styles.stepIconPending,
  ].join(" ");

  const handlePrimary = () => onStepAction(step.id, "primary");
  const handleManage = () => onStepAction(step.id, "manage");

  return (
    <article className={itemClass}>
      <div className={styles.stepRow}>
        <div className={iconClass} aria-hidden="true">
          {isCompleted && (
            <span style={{ display: "flex", lineHeight: 0 }}>
              <Icon source={CheckIcon} tone="base" />
            </span>
          )}
        </div>
        <div className={styles.stepBody}>
          <h4 className={styles.stepTitle}>{step.title}</h4>
          {!isCompleted && (
            <p className={styles.stepDescription}>{step.description}</p>
          )}

          {isExpanded && (
            <div className={styles.stepExpanded}>
              <ul
                className={
                  step.id === 4 ? styles.menuLinkList : styles.checklist
                }
              >
                {step.checklist.items.map((item) => (
                  <ChecklistItem
                    key={item.label}
                    item={item}
                    onCopy={handleCopy}
                    copiedLabel={copiedLabel}
                  />
                ))}
              </ul>
              <div className={styles.stepCta}>
                <Button variant="primary" onClick={handlePrimary}>
                  {step.actionLabel}
                </Button>
                {isCompleted && (
                  <Button variant="plain" onClick={handleManage}>
                    {step.manageLabel}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function DashboardSetupGuide({
  consultantCount,
  adminPercentage,
  appEnabled,
  menuSetupComplete,
  shop,
  onStepAction,
  onDismiss,
}) {
  const steps = useMemo(() => {
    const base = getSetupGuideSteps({
      consultantCount,
      adminPercentage,
      appEnabled,
      menuSetupComplete,
      shop,
    });
    return enrichStepsWithCardState(base);
  }, [consultantCount, adminPercentage, appEnabled, menuSetupComplete, shop]);

  const completedCount = steps.filter((s) => s.status === "completed").length;
  const progress = Math.round((completedCount / steps.length) * 100);
  const allComplete = completedCount === steps.length;

  const [collapsed, setCollapsed] = useState(false);
  const [animatedProgress, setAnimatedProgress] = useState(0);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimatedProgress(progress));
    return () => cancelAnimationFrame(frame);
  }, [progress]);

  if (allComplete) return null;

  return (
    <section className={styles.shell} aria-label="Set up Consultly">
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <h3 className={styles.title}>Set up Consultly</h3>
            <p className={styles.subtitle}>
              Use this guide to get your consultation service up and running.
            </p>
          </div>
          <div className={styles.headerActions}>
            <p className={styles.progressText}>
              {completedCount} of {steps.length} tasks complete
            </p>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? "Expand setup guide" : "Collapse setup guide"}
            >
              <Icon source={collapsed ? ChevronDownIcon : ChevronUpIcon} />
            </button>
            {onDismiss && (
              <button
                type="button"
                className={styles.iconBtn}
                onClick={onDismiss}
                aria-label="Dismiss setup guide"
              >
                <Icon source={XIcon} />
              </button>
            )}
          </div>
        </div>
        {!collapsed && (
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={styles.progressFill}
              style={{ width: `${animatedProgress}%` }}
            />
          </div>
        )}
      </header>

      {!collapsed && (
        <div className={styles.stepList}>
          {steps.map((step) => (
            <StepItem key={step.id} step={step} onStepAction={onStepAction} />
          ))}
        </div>
      )}
    </section>
  );
}
