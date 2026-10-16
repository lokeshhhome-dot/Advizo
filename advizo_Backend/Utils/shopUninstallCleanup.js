const { shopModel } = require("../Modal/shopify");
const { User } = require("../Modal/userSchema");
const { ConsultantClient } = require("../Modal/consultantClient");
const { ConsultantSupportRequest } = require("../Modal/consultantSupportRequest");
const { TransactionHistroy } = require("../Modal/transactionHistroy");
const { WalletHistory } = require("../Modal/walletHistory");
const { ChatList } = require("../Modal/chatListSchema");
const { MessageModal } = require("../Modal/messageSchema");
const { CallSession } = require("../Modal/callSessions");
const { WithdrawalRequestSchema } = require("../Modal/withdrawalSchema");
const { ReachargeTransactionHistroy } = require("../Modal/reachargeTransactionHistroy");
const { AstrologyResult } = require("../Modal/astrologyResult");

const normalizeShopDomain = (shopDomain) => {
  if (!shopDomain || typeof shopDomain !== "string") return "";
  return shopDomain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
};

const buildShopRefFilter = (shopObjectId) => {
  const shopIdStr = String(shopObjectId);
  return {
    $or: [{ shop_id: shopObjectId }, { shop_id: shopIdStr }],
  };
};

const purgeShopTenantData = async (shopDoc) => {
  const shopObjectId = shopDoc._id;
  const shopIdStr = String(shopObjectId);
  const shopDomain = shopDoc.shop;
  const shopRefFilter = buildShopRefFilter(shopObjectId);

  const [
    usersResult,
    consultantClientsResult,
    supportRequestsResult,
    transactionsResult,
    walletHistoryResult,
    chatListResult,
    messagesResult,
    callSessionsResult,
    withdrawalsResult,
    rechargeHistoryResult,
    astrologyResult,
  ] = await Promise.all([
    User.deleteMany(shopRefFilter),
    ConsultantClient.deleteMany({ shop_id: shopObjectId }),
    ConsultantSupportRequest.deleteMany({
      $or: [{ shopId: shopObjectId }, { shopId: shopIdStr }],
    }),
    TransactionHistroy.deleteMany(shopRefFilter),
    WalletHistory.deleteMany(shopRefFilter),
    ChatList.deleteMany({ shop_id: shopObjectId }),
    MessageModal.deleteMany({ shop_id: shopObjectId }),
    CallSession.deleteMany({
      $or: [{ shopId: shopIdStr }, { shopId: shopObjectId }],
    }),
    WithdrawalRequestSchema.deleteMany({
      $or: [{ shopId: shopIdStr }, { shopId: shopObjectId }],
    }),
    ReachargeTransactionHistroy.deleteMany({ shop: shopDomain }),
    AstrologyResult.deleteMany({ shop_id: shopObjectId }),
  ]);

  return {
    shop: shopDomain,
    shopObjectId: shopIdStr,
    deleted: {
      users: usersResult.deletedCount,
      consultantClients: consultantClientsResult.deletedCount,
      supportRequests: supportRequestsResult.deletedCount,
      transactions: transactionsResult.deletedCount,
      walletHistory: walletHistoryResult.deletedCount,
      chatLists: chatListResult.deletedCount,
      messages: messagesResult.deletedCount,
      callSessions: callSessionsResult.deletedCount,
      withdrawals: withdrawalsResult.deletedCount,
      rechargeHistory: rechargeHistoryResult.deletedCount,
      astrologyReadings: astrologyResult.deletedCount,
    },
  };
};

const resetShopCredentials = async (shopDoc) => {
  return shopModel.findByIdAndUpdate(
    shopDoc._id,
    {
      $set: {
        shop: `deleted-${Date.now()}-${shopDoc.shop}`,
        accessToken: null,
        shopId: null,
        appEnabled: false,
        planStatus: "uninstalled",
        uninstalledAt: new Date(),
        isWelcomeShown: false,
        activeChargeId: "",
      },
      $unset: {
        shopName: "",
        shopOwnerName: "",
        shopEmail: "",
        myshopifyDomain: "",
        email: "",
      },
    },
    { new: true },
  );
};

const cleanupShopOnUninstall = async (shopDomain) => {
  const normalizedShop = normalizeShopDomain(shopDomain);
  if (!normalizedShop) {
    return { ok: false, reason: "missing_shop_domain" };
  }

  const shopDoc = await shopModel.findOne({ shop: normalizedShop });
  if (!shopDoc) {
    console.warn(
      `[shopUninstallCleanup] No shop record found for ${normalizedShop}`,
    );
    return { ok: true, reason: "shop_not_found", shop: normalizedShop };
  }

  const ownerEmail = shopDoc.shopEmail || shopDoc.email || "";
  const purgeSummary = await purgeShopTenantData(shopDoc);
  await resetShopCredentials(shopDoc);

  console.log(
    `[shopUninstallCleanup] Completed for ${normalizedShop}:`,
    purgeSummary,
  );

  return {
    ok: true,
    reason: "cleaned",
    shop: normalizedShop,
    ownerEmail,
    purgeSummary,
  };
};

module.exports = {
  normalizeShopDomain,
  cleanupShopOnUninstall,
};
