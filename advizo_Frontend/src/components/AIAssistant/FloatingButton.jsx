import { Icon } from "@shopify/polaris";
import { ChatIcon, XIcon } from "@shopify/polaris-icons";
import { useAiAssistant } from "../../context/AiAssistantContext";
import styles from "./AiAssistant.module.css";

export default function FloatingButton() {
  const { isOpen, toggle } = useAiAssistant();

  return (
    <button
      type="button"
      className={styles.fab}
      onClick={toggle}
      aria-label={isOpen ? "Close Consultly AI" : "Open Consultly AI"}
      aria-expanded={isOpen}
    >
      <Icon source={isOpen ? XIcon : ChatIcon} />
      {!isOpen && <span className={styles.fabDotBadge} aria-hidden="true" />}
    </button>
  );
}
