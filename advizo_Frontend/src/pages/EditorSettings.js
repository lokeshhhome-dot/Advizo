import { Page, Icon } from "@shopify/polaris";
import { PaintBrushFlatIcon, ChevronRightIcon } from "@shopify/polaris-icons";
import { useNavigate } from "react-router-dom";
import styles from "./EditorSettings.module.css";
import {
  TransactionFeeRupeeIcon,
  ChatIcon,
  QuestionCircleIcon,
} from "@shopify/polaris-icons";

// A single flat nav entry ("Editor") that opens this hub page, which then
// lists every customizable sub-area. Shopify's NavMenu (ui-nav-menu) has no
// documented support for real nested submenus — this hub page is the
// in-app substitute so new customization pages can be added here later
// without needing another top-level sidebar entry each time.
const EDITOR_ITEMS = [
  {
    key: "Commission",
    path: "/settings/admin-percentage",
    icon: TransactionFeeRupeeIcon,
    title: "Commission",
    description:
      "Set and manage the commission percentage the platform earns from consultant consultations.",
  },
  {
    key: "consultant-card-theme",
    path: "/settings/consultant-card-theme",
    icon: PaintBrushFlatIcon,
    title: "Card Appearance",
    description:
      "Customize colors, borders, and button styling for the Consultant Card shown on your storefront.",
  },
  {
    key: "Support",
    path: "/settings/consultant-support",
    icon: ChatIcon,
    title: "Support",
    description:
      "Manage consultant support requests, respond to inquiries, and help consultants resolve their issues.",
  },
  {
    key: "FAQ",
    path: "/settings/faq",
    icon: QuestionCircleIcon,
    title: "FAQ",
    description:
      "Create and manage frequently asked questions to help users and consultants find answers quickly.",
  },

];

export function EditorSettings() {
  const navigate = useNavigate();

  return (
    <Page fullWidth>
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>Settings</h1>
          <p className={styles.subtitle}>
            Storefront customization tools for your advizo app.
          </p>
        </div>

        <div className={styles.list}>
          {EDITOR_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={styles.item}
              onClick={() => navigate(item.path)}
            >
              <span className={styles.itemIcon}>
                <Icon source={item.icon} />
              </span>
              <span className={styles.itemBody}>
                <span className={styles.itemTitle}>{item.title}</span>
                <span className={styles.itemDescription}>{item.description}</span>
              </span>
              <span className={styles.itemChevron}>
                <Icon source={ChevronRightIcon} />
              </span>
            </button>
          ))}
        </div>
      </div>
    </Page>
  );
}

export default EditorSettings;
