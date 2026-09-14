import { Page, Collapsible, Text, BlockStack, Icon } from "@shopify/polaris";
import { ChevronDownIcon, SearchIcon } from "@shopify/polaris-icons";
import { useState, useEffect, useMemo } from "react";
import { useSelector } from "react-redux";
import { fetchAdminDetails } from "../components/Redux/slices/adminSlice";
import { useDispatch } from "react-redux";
import { useAppBridge } from "../components/createContext/AppBridgeContext";
import styles from "./Faq.module.css";
import { Redirect } from "@shopify/app-bridge/actions";

function Faq() {
  const [expanded, setExpanded] = useState(0);
  const [queryValue, setQueryValue] = useState("");
  const { adminDetails_, loading: adminDetailsLoading } = useSelector(
    (state) => state.admin,
  );

  const dispatch = useDispatch();
  const app = useAppBridge();
  useEffect(() => {
    const adminIdLocal = localStorage.getItem("advizo");
    if (adminIdLocal) {
      dispatch(fetchAdminDetails({ adminIdLocal, app }));
    }
  }, [dispatch]);

  const redirect = useMemo(() => {
    if (!app) return null;
    return Redirect.create(app);
  }, [app]);

  const goToAddConsultant = () => {
    if (!redirect) return;
    redirect.dispatch(Redirect.Action.APP, "/settings");
  };
  const ACCORDION_ITEMS = [
    {
      id: 0,
      title: "How can I change app status?",
      content: (
        <BlockStack gap="300">
          <Text variant="bodyMd" as="p">
            Simply go to the{" "}
            <span className="Polaris-Text--bold">Dashboard</span> menu and click
            on the <span className="Polaris-Text--bold">App Status</span> button
            to Enable/Disable the consultant management system.
          </Text>
        </BlockStack>
      ),
    },
    {
      id: 1,
      title: "How do I add a new consultant?",
      content: (
        <BlockStack gap="300">
          <Text variant="bodyMd" as="p">
            Navigate to the{" "}
            <span className="Polaris-Text--bold">Consultants</span> page and
            click on the{" "}
            <span className="Polaris-Text--bold">Add Consultant</span> button.
            Fill in all the required details including name, email, contact
            number, profession, years of experience, and conversion fees. Once
            you submit the form, the consultant will be added to your list.
          </Text>
        </BlockStack>
      ),
    },
    {
      id: 2,
      title: "How do I manage consultant status (Active/Inactive)?",
      content: (
        <BlockStack gap="300">
          <Text variant="bodyMd" as="p">
            You can easily toggle a consultant's status using the toggle switch
            in the <span className="Polaris-Text--bold">Status</span> column of
            the consultant table. Click the toggle to switch between Active and
            Inactive states. Active consultants are available for consultations,
            while inactive consultants are temporarily disabled.
          </Text>
        </BlockStack>
      ),
    },
    {
      id: 3,
      title: "How do I filter consultants by consultation type?",
      content: (
        <BlockStack gap="300">
          <Text variant="bodyMd" as="p">
            Use the filter tabs at the top of the consultant list:{" "}
            <span className="Polaris-Text--bold">All</span>,{" "}
            <span className="Polaris-Text--bold">Chat</span>,{" "}
            <span className="Polaris-Text--bold">Voice Call</span>, and{" "}
            <span className="Polaris-Text--bold">Video Call</span>. Click on any
            tab to view consultants filtered by their consultation type. You can
            also use the search bar to find consultants by name, email, contact,
            or profession.
          </Text>
        </BlockStack>
      ),
    },
    {
      id: 4,
      title: "How do I edit consultant information?",
      content: (
        <BlockStack gap="300">
          <Text variant="bodyMd" as="p">
            Click on the <span className="Polaris-Text--bold">Edit</span> icon
            in the Action column next to the consultant you want to modify. This
            will allow you to update their contact information, profession,
            experience, conversion fees, and consultation type. Save your
            changes to update the consultant's profile.
          </Text>
        </BlockStack>
      ),
    },
    {
      id: 5,
      title: "How do I delete a consultant?",
      content: (
        <BlockStack gap="300">
          <Text variant="bodyMd" as="p">
            Click on the <span className="Polaris-Text--bold">Delete</span> icon
            in the Action column next to the consultant you want to remove.
            Confirm the deletion when prompted. Please note that this action
            cannot be undone, and all consultation activity-history for that consultant
            will be removed.
          </Text>
        </BlockStack>
      ),
    },
    {
      id: 6,
      title: "What information is displayed on the Dashboard?",
      content: (
        <BlockStack gap="300">
          <Text variant="bodyMd" as="p">
            The Dashboard displays key metrics including:{" "}
            <span className="Polaris-Text--bold">Total Clients</span>,{" "}
            <span className="Polaris-Text--bold">Conversion Rate</span>,{" "}
            <span className="Polaris-Text--bold">Total Consultations</span>, and{" "}
            <span className="Polaris-Text--bold">Total Revenue</span>. These
            statistics help you track your consultant management performance and
            make informed decisions.
          </Text>
        </BlockStack>
      ),
    },
    {
      id: 7,
      title: "How to set up store front",
      content: (
        <BlockStack gap="300">
          <Text variant="bodyMd" as="p">
            To set up the storefront, please follow these steps:
          </Text>

          <ol>
            <li>Log in to your Shopify Admin panel.</li>

            <li>
              From the left menu, go to <b style={{ fontSize: "14px" }}>Content → Menus</b>.
            </li>

            <li>
              Click on <b style={{ fontSize: "14px" }}>Create menu</b> (or Footer menu if you prefer).
            </li>

            <li>
              Click <b style={{ fontSize: "14px" }}>Add menu item</b>.
            </li>

            <li>
              Enter a name for the menu (for example: <b style={{ fontSize: "14px" }}>Consult Now</b>,{" "}
              <b style={{ fontSize: "14px" }}>Consultant Login</b>, or <b style={{ fontSize: "14px" }}>Profile</b>).
            </li>

            <li>
              In the Link field, paste your store URL using the format
              below:
              <br />
              <br />
              <b style={{ fontSize: "14px" }}>Storefront Home Page:</b>
              <br />
              <a
                style={{ fontSize: "14px" }}
                href={`https://${adminDetails_.shop}/apps/advizo`}
                target="_blank"
                rel="noopener noreferrer"
              >
                https://{adminDetails_?.shop}/apps/advizo
              </a>
              <br />
              <br />
              <b style={{ fontSize: "14px" }}>User Profile Page:</b>
              <br />
              <a
                style={{ fontSize: "14px" }}
                href={`https://${adminDetails_.shop}/pages/my-profile`}
                target="_blank"
                rel="noopener noreferrer"
              >
                https://{adminDetails_?.shop}/pages/my-profile
              </a>
              <br />
              <br />
              <b style={{ fontSize: "14px" }}>Consultant Login Page:</b>
              <br />
              <a
                style={{ fontSize: "14px" }}
                href={`https://${adminDetails_.shop}/apps/advizo`}
                target="_blank"
                rel="noopener noreferrer"
              >
                https://{adminDetails_?.shop}/apps/advizo/login
              </a>
              <br />
              <br />
            </li>

            <li>
              Click <b style={{ fontSize: "14px" }}>Save</b>.
            </li>

            <li>
              Repeat the same steps to add multiple menu items (Consult Now, Consultant Login,
              User Profile) if required.
            </li>

            <li>
              Go to <b style={{ fontSize: "14px" }}>Online Store → Themes → Customize</b>.
            </li>

            <li>Make sure the menu is visible in your header or footer.</li>

            <li>Visit your storefront and test all menu links.</li>
          </ol>
        </BlockStack>
      ),
    },
    {
      id: 8,
      title: "How Consultant Can Login",
      content: (
        <BlockStack gap="300">
          <Text variant="bodyMd" as="p">
            Consultants can log in to the system by following these steps:
          </Text>

          <ol>
            <li>
              Open your Shopify store URL in this format:
              <br />
              <b>https://{adminDetails_?.shop}/apps/advizo/login</b>
            </li>

            <li>
              Replace <b>{adminDetails_?.shop}</b> with your actual Shopify
              store name.
              <br />
              Example:
              <br />
              <b>https://{adminDetails_?.shop}/apps/advizo/login</b>
            </li>

            <li>Enter your registered email and password.</li>

            <li>
              Click on <b>Login</b>.
            </li>

            <li>
              After successful login, you will be redirected to your consultant
              dashboard.
            </li>

            <li>
              From the dashboard, you can view your profile, availability
              status, and incoming calls.
            </li>
          </ol>

          <Text variant="bodyMd" as="p">
            <b>Important: Enable Notification Permission</b>
          </Text>

          <ol>
            <li>
              After login, your browser will ask for notification permission.
            </li>

            <li>
              Click <b>Allow</b> to enable notifications.
            </li>

            <li>Notifications are required to receive incoming call alerts.</li>

            <li>
              If you accidentally clicked <b>Block</b>, follow these steps:
              <ul>
                <li>Click the lock icon near the browser address bar.</li>
                <li>
                  Find <b>Notifications</b>.
                </li>
                <li>
                  Select <b>Allow</b>.
                </li>
                <li>Refresh the page.</li>
              </ul>
            </li>

            <li>
              Without notification permission, you may miss incoming calls.
            </li>
          </ol>
        </BlockStack>
      ),
    },
  ];

  const filteredItems = useMemo(() => {
    if (!queryValue.trim()) return ACCORDION_ITEMS;
    const query = queryValue.toLowerCase();
    return ACCORDION_ITEMS.filter((item) =>
      item.title.toLowerCase().includes(query),
    );
  }, [queryValue]);

  return (
    <Page fullWidth>
      <div className={styles.page}>
        <div className={styles.header}>
          <p
            className={styles.backLink}
            onClick={goToAddConsultant}
          >
            ‹ settings
          </p>
          <h1 className={styles.title}>Frequently Asked Questions</h1>
          <p className={styles.subtitle}>
            Answers to common questions about managing your consultants and
            storefront.
          </p>
        </div>

        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}><Icon source={SearchIcon} /></span>
          <input
            className={styles.searchInput}
            value={queryValue}
            onChange={(e) => setQueryValue(e.target.value)}
            placeholder="Search FAQs"
          />
        </div>

        <div className={styles.card}>
          {filteredItems.length === 0 ? (
            <div className={styles.emptyState}>
              No FAQs match your search.
            </div>
          ) : (
            filteredItems.map(({ title, id, content }) => {
              const isExpanded = expanded === id;
              return (
                <div className={styles.faqItem} key={id}>
                  <button
                    type="button"
                    className={`${styles.faqHeader} ${isExpanded ? styles.faqHeaderOpen : ""
                      }`}
                    onClick={() =>
                      setExpanded((prev) => (id === prev ? null : id))
                    }
                  >
                    <span className={styles.faqNumber}>{id + 1}</span>
                    <span className={styles.faqTitle}>{title}</span>
                    <span
                      className={`${styles.faqChevron} ${isExpanded ? styles.faqChevronOpen : ""
                        }`}
                    >
                      <ChevronDownIcon width="1.25rem" height="1.25rem" />
                    </span>
                  </button>
                  <Collapsible open={isExpanded} id={id.toString()}>
                    <div className={styles.faqContent}>{content}</div>
                  </Collapsible>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Page>
  );
}

export default Faq;
