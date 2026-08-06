
const { shopModel } = require("../Modal/shopify");
const Subscription = require("../Modal/Subscription");
const { User } = require("../Modal/userSchema");
const { assertAdminShopAccess } = require("../Auth/auth");
const { getShopAccessToken } = require("../Utils/shopifyToken");
const axios = require("axios");
const dotenv = require("dotenv")
dotenv.config()

async function getChargeDetails(shop, accessToken, charge_id) {
    const url = `https://${shop}/admin/api/2023-10/recurring_application_charges/${charge_id}.json`;

    const response = await axios.get(url, {
        headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json"
        }
    });

    return response.data.recurring_application_charge;
}

// Shopify REFUSES a live recurring charge on a development / sandbox / staff
// store — those may only ever create `test: true` charges, and the API returns a
// validation error otherwise. Detect it from the shop's own plan so dev stores
// work with no extra config, while real merchants are still billed for real.
// SHOPIFY_BILLING_TEST=true still forces test mode everywhere when needed.
const TEST_ONLY_BILLING_PLANS = new Set([
    "partner_test",
    "affiliate",
    "plus_partner_sandbox",
    "staff",
    "staff_business",
    "dev_preview",
    "development",
    "trial",
]);

const SHOP_PLAN_TTL_MS = 10 * 60 * 1000;
const shopPlanCache = new Map();

async function fetchShopPlanName(shopDoc) {
    const cached = shopPlanCache.get(shopDoc.shop);
    if (cached && Date.now() - cached.at < SHOP_PLAN_TTL_MS) return cached.plan;

    try {
        const response = await axios.get(
            `https://${shopDoc.shop}/admin/api/2024-10/shop.json?fields=plan_name`,
            {
                headers: {
                    "X-Shopify-Access-Token": await getShopAccessToken(shopDoc),
                },
            },
        );
        const plan = String(response.data?.shop?.plan_name || "").toLowerCase();
        shopPlanCache.set(shopDoc.shop, { plan, at: Date.now() });
        return plan;
    } catch (err) {
        console.error(
            "[billing] could not read shop plan_name:",
            err.response?.data || err.message,
        );
        return null;
    }
}

async function shouldUseTestCharge(shopDoc) {
    if (String(process.env.SHOPIFY_BILLING_TEST).toLowerCase() === "true") {
        return true;
    }
    const plan = await fetchShopPlanName(shopDoc);
    if (!plan) return false;
    if (TEST_ONLY_BILLING_PLANS.has(plan)) {
        console.log(
            `[billing] ${shopDoc.shop} is a "${plan}" store — creating a TEST charge`,
        );
        return true;
    }
    return false;
}

// Shopify's validation text, pulled out of whichever shape the API used. Shown
// to the merchant so a failed upgrade is never an unexplained dead end.
function describeShopifyError(err) {
    const errors = err?.response?.data?.errors;
    if (typeof errors === "string") return errors;
    if (errors) {
        try {
            return JSON.stringify(errors);
        } catch (_) {
            /* fall through */
        }
    }
    return err?.message || "unknown error";
}

function getBillingCycle(trialEndsOn, billingOn) {
    const trialDate = new Date(trialEndsOn);
    const billingDate = new Date(billingOn);

    const diffInDays = (billingDate - trialDate) / (1000 * 60 * 60 * 24);

    return diffInDays > 300 ? "yearly" : "monthly";
}

// Build the plan list dynamically from env. The env is the single source of
// truth for limits/minutes — change values there and nothing else needs
// updating. Each plan also carries a keyword (basic / pro / enterprise,
// derived from the env prefix) used for fuzzy-matching the Shopify charge
// name, so cosmetic name differences can never break plan limits.
function loadPlanLimitsFromEnv() {
    const planKeys = ["BASIC_PLAN", "PRO_PLAN", "ENTERPRISE_PLAN"]; // add more prefixes as needed
    const plans = [];

    for (const key of planKeys) {
        const name = process.env[`${key}_NAME`];
        const maxConsultants = process.env[`${key}_MAX_CONSULTANTS`];
        const totalMinutes = process.env[`${key}_TOTAL_MINUTES`];

        if (!name || !maxConsultants || !totalMinutes) {
            console.warn(`Skipping ${key}: missing env vars`);
            continue;
        }

        plans.push({
            keyword: key.replace(/_PLAN$/, "").toLowerCase(),
            name,
            maxConsultants: parseInt(maxConsultants, 10),
            totalMinutes: parseInt(totalMinutes, 10),
            // Price is env-driven too (e.g. BASIC_PLAN_PRICE). Plans without a
            // configured price are still usable for limits, but can't be
            // purchased through the in-app pricing page.
            price: parseFloat(process.env[`${key}_PRICE`]) || 0,
        });
    }

    return plans;
}

const PLANS = loadPlanLimitsFromEnv();

// Fallback limits if a charge name doesn't match any configured plan
const DEFAULT_LIMITS = { maxConsultants: 3, totalMinutes: 3000 };

const normalizePlanName = (value) =>
    String(value || "").toLowerCase().trim().replace(/\s+/g, " ");

function getPlanLimits(chargeName) {
    const normalized = normalizePlanName(chargeName);

    // 1) Exact match against the env plan name (case/space-insensitive).
    let plan = PLANS.find((p) => normalizePlanName(p.name) === normalized);

    // 2) Keyword match: the charge name contains "basic" / "pro" /
    //    "enterprise" as a word — so "Pro Plan", "PRO plan (yearly)" etc.
    //    all resolve to the right env config.
    if (!plan) {
        plan = PLANS.find((p) =>
            new RegExp(`\\b${p.keyword}\\b`, "i").test(normalized),
        );
    }

    if (!plan) {
        console.error(
            `[billing] Charge name "${chargeName}" matched NO configured plan ` +
            `(configured: ${PLANS.map((p) => p.name).join(", ")}). ` +
            `Falling back to default limits`,
            DEFAULT_LIMITS,
        );
        return DEFAULT_LIMITS;
    }

    return {
        maxConsultants: plan.maxConsultants,
        totalMinutes: plan.totalMinutes,
    };
}


async function upsertSubscriptionFromCharge(shop_, charge) {
    const billingCycle = getBillingCycle(charge.trial_ends_on, charge.billing_on);
    const { maxConsultants, totalMinutes } = getPlanLimits(charge.name);

    const existingSub = await Subscription.findOne({ shopId: shop_._id });
    const isPlanChange = !existingSub || existingSub.planName !== charge.name;

    const currentPeriodStart = charge.trial_ends_on
        ? new Date(charge.trial_ends_on)
        : new Date();
    const currentPeriodEnd = new Date(charge.billing_on);
    const update = {
        shopId: shop_._id,
        planName: charge.name,
        billingCycle,
        planStatus: "ACTIVE",
        planPrice: charge.price,
        currency: charge.currency,
        maxConsultants,
        totalMinutes,
        shopifyChargeId: String(charge.id),
        currentPeriodStart,
        currentPeriodEnd,
        autoRenew: true,
        // Trial window from Shopify: while trial_ends_on is in the future the
        // shop runs on the separate free trial minute pool. An immediate
        // upgrade (trial_days=0) has no trial_ends_on → instantly paid mode.
        trialEndsOn:
            charge.trial_ends_on && new Date(charge.trial_ends_on) > new Date()
                ? new Date(charge.trial_ends_on)
                : null,
    };

    if (isPlanChange) {
        update.usedMinutes = 0;
        update.remainingMinutes = totalMinutes;
    }

    await Subscription.findOneAndUpdate(
        { shopId: shop_._id },
        { $set: update },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    shop_.planStatus = "ACTIVE";
    shop_.activeChargeId = charge.id;
    await shop_.save();
}

// After (re)install: Shopify managed pricing lets a merchant buy a plan from
// the App Store BEFORE the app has been opened (so before OAuth recreated the
// shop record). This pulls any already-active recurring charge and syncs it
// into the Subscription collection so the merchant lands on a working app.
async function syncActiveRecurringCharge(shopDoc) {
    try {
        if (!shopDoc?.accessToken || !shopDoc?.shop) return false;

        const url = `https://${shopDoc.shop}/admin/api/2023-10/recurring_application_charges.json`;
        const response = await axios.get(url, {
            headers: {
                "X-Shopify-Access-Token": await getShopAccessToken(shopDoc),
                "Content-Type": "application/json",
            },
        });

        const activeCharge = (
            response.data?.recurring_application_charges || []
        ).find((c) => c.status === "active");

        if (!activeCharge) return false;

        await upsertSubscriptionFromCharge(shopDoc, activeCharge);
        console.log(
            `[billing] Synced active charge "${activeCharge.name}" for ${shopDoc.shop} after install`,
        );
        return true;
    } catch (err) {
        console.error(
            `[billing] syncActiveRecurringCharge failed for ${shopDoc?.shop}:`,
            err.message,
        );
        return false;
    }
}

const pricingCallback = async (req, res) => {
    try {
        const { shop, charge_id } = req.query;

        if (!shop) return res.status(400).send("not found");
        const match = shop?.match(/^([a-z0-9-]+)\.myshopify\.com$/);
        if (!match) {
            return res.status(400).send("Invalid shop domain");
        }
        const shopHandle = match[1];
        console.log("shopHandle", shopHandle)
        const shop_ = await shopModel.findOne({ shop });

        if (!shop_ || !shop_.accessToken) {
            console.warn(
                `[billing] pricing callback before install for ${shop} — starting OAuth`,
            );
            const baseUrl = `${req.protocol}://${req.get("host")}`;
            return res.redirect(
                `${baseUrl}/api/app/install/begin?shop=${encodeURIComponent(shop)}`,
            );
        }

        const charge = await getChargeDetails(shop, await getShopAccessToken(shop_), charge_id);

        if (!charge || charge.status !== "active") {
            // Declined / cancelled on the Shopify approval screen — send the
            // merchant back into the app (the billing gate shows the pricing
            // page again) instead of a dead-end plain-text 402.
            console.warn(
                `[billing] Charge ${charge_id} not active (status: ${charge?.status || "unknown"}) for ${shop}`,
            );
            console.log("process.env.SHOPIFY_APP_HANDLE", process.env.SHOPIFY_APP_HANDLE)
            return res.send(`
                <script>
                window.top.location.href = "https://admin.shopify.com/store/${shopHandle}/apps/${process.env.SHOPIFY_APP_HANDLE || "consultly-live-expert-calls"}";
                </script>
                `);
        }

        await upsertSubscriptionFromCharge(shop_, charge);
        console.log("charge", charge.name)



        return res.send(`
                <script>
                window.top.location.href = "https://admin.shopify.com/store/${shopHandle}/apps/${process.env.SHOPIFY_APP_HANDLE || "consultly-live-expert-calls"}";
                </script>
                `);
    } catch (err) {
        console.error(err);
        res.status(500).send("Billing callback failed");
    }
};

/**
 * GET /api/admin/billing/plans/:adminId
 * Env-driven plan catalog + the shop's current subscription and usage,
 * for the in-app pricing page. Admin-authenticated.
 */
const getBillingPlans = async (req, res) => {
    try {
        const { adminId } = req.params;
        if (!(await assertAdminShopAccess(req, res, adminId))) return;

        const [subscription, consultantsUsed] = await Promise.all([
            Subscription.findOne({ shopId: adminId }).lean(),
            User.countDocuments({ shop_id: adminId, userType: "consultant" }),
        ]);

        return res.json({
            success: true,
            plans: PLANS.map((p) => ({
                key: p.keyword,
                name: p.name,
                price: p.price,
                maxConsultants: p.maxConsultants,
                totalMinutes: p.totalMinutes,
            })),
            currentSubscription:
                subscription && subscription.planStatus === "ACTIVE"
                    ? {
                        planName: subscription.planName,
                        planPrice: subscription.planPrice,
                        billingCycle: subscription.billingCycle,
                        currency: subscription.currency,
                        maxConsultants: subscription.maxConsultants,
                        totalMinutes: subscription.totalMinutes,
                        usedMinutes: subscription.usedMinutes || 0,
                        remainingMinutes: subscription.remainingMinutes || 0,
                        currentPeriodEnd: subscription.currentPeriodEnd,
                        consultantsUsed,
                    }
                    : null,
        });
    } catch (err) {
        console.error("[billing] getBillingPlans error:", err.message);
        return res
            .status(500)
            .json({ success: false, message: "Failed to load plans" });
    }
};

/**
 * POST /api/admin/billing/subscribe/:adminId  { planKey }
 * Creates a Shopify recurring application charge (Shopify remains the ONLY
 * billing provider) and returns its confirmation_url. Approval, callback,
 * and activation continue through the existing pricingCallback unchanged —
 * Shopify appends charge_id to the return_url automatically.
 */
const createSubscription = async (req, res) => {
    try {
        const { adminId } = req.params;
        if (!(await assertAdminShopAccess(req, res, adminId))) return;

        const planKey = String(req.body?.planKey || "").toLowerCase().trim();
        const plan = PLANS.find((p) => p.keyword === planKey);
        if (!plan) {
            return res
                .status(400)
                .json({ success: false, message: "Unknown plan" });
        }
        if (!plan.price || plan.price <= 0) {
            return res.status(500).json({
                success: false,
                message: `Price for the ${plan.name} plan is not configured`,
            });
        }

        const shopDoc = await shopModel.findById(adminId);
        if (!shopDoc?.accessToken) {
            return res
                .status(404)
                .json({ success: false, message: "Shop not found" });
        }

        const currentSub = await Subscription.findOne({ shopId: adminId }).lean();
        // immediate=true → mid-trial upgrade: the new charge carries
        // trial_days 0 so Shopify activates billing right away.
        const immediate = Boolean(req.body?.immediate);
        const { isInTrial } = require("../services/subscriptionMinutes");
        const currentlyInTrial = isInTrial(currentSub);

        if (
            currentSub?.planStatus === "ACTIVE" &&
            normalizePlanName(currentSub.planName) === normalizePlanName(plan.name) &&
            // A trial shop upgrading to the SAME plan is a real upgrade
            // (trial → paid), never "already on this plan".
            !(immediate && currentlyInTrial)
        ) {
            return res.status(400).json({
                success: false,
                message: "You are already on this plan.",
            });
        }

        const appUrl = String(process.env.APP_URL || "").replace(/\/+$/, "");
        const returnUrl = `${appUrl}/api/princing-callback/1?shop=${encodeURIComponent(shopDoc.shop)}`;

        const useTestCharge = await shouldUseTestCharge(shopDoc);

        const chargePayload = {
            recurring_application_charge: {
                name: plan.name,
                price: plan.price,
                return_url: returnUrl,
                ...(useTestCharge ? { test: true } : {}),
                ...(immediate
                    ? { trial_days: 0 }
                    : Number(process.env.TRIAL_DAYS) > 0
                      ? { trial_days: Number(process.env.TRIAL_DAYS) }
                      : {}),
            },
        };

        const response = await axios.post(
            `https://${shopDoc.shop}/admin/api/2023-10/recurring_application_charges.json`,
            chargePayload,
            {
                headers: {
                    "X-Shopify-Access-Token": await getShopAccessToken(shopDoc),
                    "Content-Type": "application/json",
                },
            },
        );

        const confirmationUrl =
            response.data?.recurring_application_charge?.confirmation_url;
        if (!confirmationUrl) {
            throw new Error("Shopify did not return a confirmation URL");
        }

        console.log(
            `[billing] Created charge for ${shopDoc.shop}: ${plan.name} @ ${plan.price}`,
        );
        return res.json({ success: true, confirmationUrl });
    } catch (err) {
        console.error(
            "[billing] createSubscription error:",
            err.response?.data || err.message,
        );
        // Include Shopify's own validation text: this endpoint is admin-only, and
        // a bare "please try again" gave the merchant nothing to act on.
        return res.status(500).json({
            success: false,
            message: `Could not start the billing process: ${describeShopifyError(err)}`,
        });
    }
};

/**
 * GET /api/admin/billing/trial-status/:adminId
 * Trial usage snapshot for the merchant upgrade screen. Admin-authenticated.
 */
const getTrialStatus = async (req, res) => {
    try {
        const { adminId } = req.params;
        if (!(await assertAdminShopAccess(req, res, adminId))) return;

        const {
            isInTrial,
            getTrialLimit,
        } = require("../services/subscriptionMinutes");

        const sub = await Subscription.findOne({ shopId: adminId }).lean();
        const inTrial = isInTrial(sub);
        const limit = getTrialLimit(sub);
        const used = Math.min(sub?.trialMinutesUsed || 0, limit);
        const msLeft = inTrial
            ? new Date(sub.trialEndsOn).getTime() - Date.now()
            : 0;

        return res.json({
            success: true,
            inTrial,
            trialEndsOn: sub?.trialEndsOn || null,
            trialDaysRemaining: inTrial
                ? Math.max(0, Math.ceil(msLeft / 86400000))
                : 0,
            trialMinutesLimit: limit,
            trialMinutesUsed: used,
            trialMinutesRemaining: Math.max(0, limit - used),
            exhausted: inTrial && used >= limit,
            planName: sub?.planName || null,
            planStatus: sub?.planStatus || null,
        });
    } catch (err) {
        console.error("[billing] getTrialStatus error:", err.message);
        return res.status(500).json({ success: false });
    }
};

module.exports = {
    pricingCallback,
    getPlanLimits,
    upsertSubscriptionFromCharge,
    syncActiveRecurringCharge,
    getBillingPlans,
    createSubscription,
    getTrialStatus,
};