const Subscription = require("../Modal/Subscription");

const DEFAULT_PLAN = {
  planName: "Basic",
  planPrice: 0,
  totalMinutes: 3000,
};

// Free consultation minutes granted during the Shopify billing trial.
const TRIAL_MINUTES_DEFAULT = Number(process.env.TRIAL_FREE_MINUTES || 40);

// A shop is "in trial" while its Shopify charge's trial window is still open.
// Upgrading with trial_days=0 clears trialEndsOn → instantly paid mode.
const isInTrial = (sub) =>
  Boolean(sub?.trialEndsOn && new Date(sub.trialEndsOn) > new Date());

const getTrialLimit = (sub) =>
  Number.isFinite(sub?.trialMinutesLimit)
    ? sub.trialMinutesLimit
    : TRIAL_MINUTES_DEFAULT;

const TRIAL_MINUTES_EXHAUSTED_ERROR = {
  success: false,
  code: "TRIAL_MINUTES_EXHAUSTED",
  message:
    "All free trial consultation minutes have been used. Upgrade to continue.",
};

// Returns the shop's subscription, creating the default Basic plan on first
// use so minute deduction never silently no-ops for shops that have not
// opened the dashboard yet.
const ensureSubscription = async (shopId, session = null) => {
  if (!shopId) return null;

  const query = Subscription.findOne({ shopId });
  if (session) query.session(session);
  const existing = await query;
  if (existing) return existing;

  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  periodEnd.setDate(periodEnd.getDate() + 30);

  try {
    const docs = await Subscription.create(
      [
        {
          shopId,
          ...DEFAULT_PLAN,
          usedMinutes: 0,
          remainingMinutes: DEFAULT_PLAN.totalMinutes,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        },
      ],
      session ? { session } : {},
    );
    return docs[0];
  } catch (error) {
    // Unique index on shopId — another request created it concurrently.
    if (error?.code === 11000) {
      const retry = Subscription.findOne({ shopId });
      if (session) retry.session(session);
      return retry;
    }
    throw error;
  }
};

// Deducts communication minutes for a finished chat / voice / video session.
// Billed per started minute. The pipeline update clamps usedMinutes to the
// plan total and remainingMinutes to zero, so two concurrent session-ends
// can never overdraw the plan.
const consumeMinutes = async (shopId, totalSeconds, session = null) => {
  if (!shopId || !totalSeconds || totalSeconds <= 0) return;

  const billedMinutes = Math.ceil(totalSeconds / 60);

  const sub = await ensureSubscription(shopId, session);

  // TRIAL MODE: consume ONLY the separate trial counter — the paid plan's
  // usedMinutes/remainingMinutes are never touched, so an upgrade always
  // starts with the plan's FULL minutes.
  if (sub && isInTrial(sub)) {
    const limit = getTrialLimit(sub);
    await Subscription.findOneAndUpdate(
      { shopId },
      [
        {
          $set: {
            trialMinutesUsed: {
              $min: [
                limit,
                {
                  $add: [{ $ifNull: ["$trialMinutesUsed", 0] }, billedMinutes],
                },
              ],
            },
          },
        },
      ],
      session ? { session } : {},
    );
    return;
  }

  await Subscription.findOneAndUpdate(
    { shopId },
    [
      {
        $set: {
          usedMinutes: {
            $min: [
              "$totalMinutes",
              { $add: [{ $ifNull: ["$usedMinutes", 0] }, billedMinutes] },
            ],
          },
        },
      },
      {
        $set: {
          remainingMinutes: {
            $max: [0, { $subtract: ["$totalMinutes", "$usedMinutes"] }],
          },
        },
      },
    ],
    session ? { session } : {},
  );
};

// Standard rejection payload for every communication entry point.
const COMMUNICATION_DISABLED_ERROR = {
  success: false,
  code: "COMMUNICATION_DISABLED",
  message: "Communication minutes exhausted.",
};

// Authoritative pre-flight check used by every call/chat entry point.
// Fails OPEN on infrastructure errors: a transient DB failure must not take
// communication down for every shop — minutes are still consumed at session
// end, so enforcement self-corrects on the next check.
const getCommunicationStatus = async (shopId) => {
  try {
    if (!shopId) return { allowed: true, remainingMinutes: null };

    const sub = await ensureSubscription(shopId);
    if (!sub) return { allowed: true, remainingMinutes: null };

    // TRIAL MODE: the shop runs on its separate free-trial minute pool.
    if (isInTrial(sub)) {
      const limit = getTrialLimit(sub);
      const used = Math.min(sub.trialMinutesUsed || 0, limit);
      const remainingMinutes = Math.max(limit - used, 0);
      return {
        allowed: remainingMinutes > 0,
        remainingMinutes,
        trial: true,
        code:
          remainingMinutes > 0
            ? undefined
            : TRIAL_MINUTES_EXHAUSTED_ERROR.code,
      };
    }

    // Billing cycle rolled over — the new period's minutes are available even
    // if the admin hasn't opened the dashboard yet (_PlanDetails persists the
    // actual reset on their next visit).
    if (sub.currentPeriodEnd && sub.currentPeriodEnd < new Date()) {
      const total = sub.totalMinutes || 0;
      return { allowed: total > 0, remainingMinutes: total };
    }

    const total = sub.totalMinutes || 0;
    const used = Math.min(sub.usedMinutes || 0, total);
    const remainingMinutes = Math.max(total - used, 0);
    return { allowed: remainingMinutes > 0, remainingMinutes };
  } catch (error) {
    console.error(
      "[subscriptionMinutes] getCommunicationStatus error:",
      error.message,
    );
    return { allowed: true, remainingMinutes: null };
  }
};

module.exports = {
  ensureSubscription,
  consumeMinutes,
  getCommunicationStatus,
  COMMUNICATION_DISABLED_ERROR,
  TRIAL_MINUTES_EXHAUSTED_ERROR,
  TRIAL_MINUTES_DEFAULT,
  isInTrial,
  getTrialLimit,
  DEFAULT_PLAN,
};
