const KnowledgeBase = require("../Modal/KnowledgeBase");

/**
 * Default knowledge entries, imported from the static Admin FAQ page
 * (advizo_Frontend/src/pages/Faq.js), converted to plain text.
 *
 * Later this file is the single place where new sources (PDF, DOCX, CSV,
 * website crawls, Shopify products/policies) feed into the KnowledgeBase.
 */
const DEFAULT_FAQS = [
    {
        title: "Change app status",
        question: "How can I change app status?",
        answer:
            "Go to the Dashboard menu and click on the App Status button to Enable or Disable the consultant management system.",
        keywords: ["app status", "enable", "disable", "activate", "deactivate"],
    },
    {
        title: "Add a new consultant",
        question: "How do I add a new consultant?",
        answer:
            "Navigate to the Consultant List page and click on the Add Consultant button. Fill in all the required details including name, email, contact number, profession, years of experience, and conversion fees. Once you submit the form, the consultant will be added to your list.",
        keywords: ["add consultant", "new consultant", "create consultant"],
    },
    {
        title: "Manage consultant status",
        question: "How do I manage consultant status (Active/Inactive)?",
        answer:
            "Toggle a consultant's status using the toggle switch in the Status column of the consultant table. Active consultants are available for consultations, while inactive consultants are temporarily disabled.",
        keywords: ["consultant status", "active", "inactive", "toggle"],
    },
    {
        title: "Filter consultants",
        question: "How do I filter consultants by consultation type?",
        answer:
            "Use the filter tabs at the top of the consultant list: All, Chat, Voice Call, and Video Call. Click on any tab to view consultants filtered by their consultation type. You can also use the search bar to find consultants by name, email, contact, or profession.",
        keywords: ["filter", "search", "chat", "voice call", "video call"],
    },
    {
        title: "Edit consultant information",
        question: "How do I edit consultant information?",
        answer:
            "Click on the Edit icon in the Action column next to the consultant you want to modify. You can update their contact information, profession, experience, conversion fees, and consultation type. Save your changes to update the consultant's profile.",
        keywords: ["edit consultant", "update consultant", "modify"],
    },
    {
        title: "Delete a consultant",
        question: "How do I delete a consultant?",
        answer:
            "Click on the Delete icon in the Action column next to the consultant you want to remove and confirm the deletion when prompted. This action cannot be undone, and all consultation history for that consultant will be removed.",
        keywords: ["delete consultant", "remove consultant"],
    },
    {
        title: "Dashboard metrics",
        question: "What information is displayed on the Dashboard?",
        answer:
            "The Dashboard displays key metrics including Total Clients, Conversion Rate, Total Consultations, and Total Revenue. These statistics help you track your consultant management performance.",
        keywords: ["dashboard", "metrics", "revenue", "clients", "overview"],
    },
    {
        title: "Storefront setup",
        question: "How do I set up the storefront?",
        answer:
            "Most storefront setup now happens automatically when you install the app: a My Profile page (/pages/my-profile) and a Consultant Profile page (/pages/consultant-profile) are created for you, and My Profile plus Consultant Login menu items are added to your main menu. The one manual step left is placing the Consultant Cards app block on your Home page and the Consultant Profile / My Profile app blocks on their respective pages: go to Online Store > Themes > Customize, open the page, click Add block > Apps, and add the matching Consultly block. Save when done.",
        keywords: ["storefront", "setup", "menu", "navigation", "theme", "links", "my profile", "app block"],
    },
    {
        title: "Consultant login",
        question: "How can a consultant log in?",
        answer:
            "Consultants open https://<your-store>.myshopify.com/apps/advizo/login, enter their registered email and password, and click Login. After login they are redirected to the consultant dashboard where they can view profile, availability status, and incoming calls. They must click Allow when the browser asks for notification permission, otherwise they may miss incoming call alerts. If blocked, click the lock icon near the address bar, set Notifications to Allow, and refresh.",
        keywords: ["consultant login", "login", "notifications", "permission"],
    },
];

/**
 * Import function: copies the default FAQ data into the KnowledgeBase for a
 * shop if that shop has no default entries yet. Idempotent and cheap — safe
 * to call on every chat request.
 */
const ensureDefaultKnowledge = async (shopId) => {
    const existing = await KnowledgeBase.countDocuments({
        shopId,
        isDefault: true,
    });
    if (existing > 0) return false;

    await KnowledgeBase.insertMany(
        DEFAULT_FAQS.map((faq) => ({
            ...faq,
            shopId,
            category: "FAQ",
            isDefault: true,
            status: "active",
        })),
    );
    return true;
};

module.exports = { DEFAULT_FAQS, ensureDefaultKnowledge };
