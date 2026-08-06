const mongoose = require("mongoose");
const { sendEmail } = require("../MiddleWare/ShopifyMiddleware/nodemailer");
const { shopModel } = require("../Modal/shopify");
const { User } = require("../Modal/userSchema");
const { WalletHistory } = require("../Modal/walletHistory");
const {
  cleanupShopOnUninstall,
  normalizeShopDomain,
} = require("../Utils/shopUninstallCleanup");
const { invalidateThemeAssets } = require("../MiddleWare/ShopifyMiddleware/helperTheme");

const webhooksAppUninstalled = async (req, res) => {
  try {
    const shop = normalizeShopDomain(req.headers["x-shopify-shop-domain"]);
    console.log("shop___________unistallweb hook ", shop)

    if (!shop) {
      return res.status(400).send("Missing shop domain");
    }

    const cleanupResult = await cleanupShopOnUninstall(shop);

    if (cleanupResult.ownerEmail) {
      sendEmail({
        ownerEmail: cleanupResult.ownerEmail,
        userInstall: false,
      }).catch((error) => {
        console.error(
          `[webhooksAppUninstalled] Uninstall email failed for ${shop}:`,
          error?.message || error,
        );
      });
    }

    console.log(
      `[webhooksAppUninstalled] Cleanup finished for ${shop}:`,
      cleanupResult,
    );
    return res.status(200).send("OK");
  } catch (error) {
    console.error("[webhooksAppUninstalled] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while processing webhook",
    });
  }
};

const parseWebhookBody = (req) => {
  try {
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString());
    if (typeof req.body === "string") return JSON.parse(req.body);
    return req.body || {};
  } catch {
    return {};
  }
};

// GDPR: acknowledge a data-request. We store only minimal customer data
// (id, name, email, wallet); the merchant fulfils the request from this record.
const webhooksCustomerDataRequest = async (req, res) => {
  try {
    const payload = parseWebhookBody(req);
    console.log(
      `[GDPR] customers/data_request shop=${payload.shop_domain || "?"} customer=${payload.customer?.id || "?"}`,
    );
  } catch (_) { }
  return res.status(200).send("OK");
};

// GDPR: erase a customer's PII. We ANONYMIZE (rather than hard-delete) so
// financial/transaction integrity is preserved while all personal data is gone.
const webhooksCustomerRedact = async (req, res) => {
  try {
    const payload = parseWebhookBody(req);
    const shopDomain =
      payload.shop_domain || req.headers["x-shopify-shop-domain"];
    const customerId = payload.customer?.id
      ? String(payload.customer.id)
      : null;

    if (customerId) {
      const filter = { shopifyCustomerId: customerId };
      if (shopDomain) {
        const shopDoc = await shopModel.findOne({ shop: shopDomain }).select("_id");
        if (shopDoc) filter.shop_id = shopDoc._id;
      }

      const result = await User.updateMany(filter, {
        $set: {
          fullname: "Redacted",
          email: null,
          phone: null,
          pan_cardNumber: null,
          address: null,
          houseNumber: null,
          streetArea: null,
          landmark: null,
          dateOfBirth: null,
          firebaseToken: null,
          profileImage: "default.png",
          redactedAt: new Date(),
        },
      });
      console.log(
        `[GDPR] customers/redact anonymized ${result.modifiedCount} record(s) for customer ${customerId}`,
      );
    }
    return res.status(200).send("OK");
  } catch (error) {
    // Acknowledge to avoid Shopify retry storms; failure is logged for follow-up.
    console.error("[GDPR] customer redact error:", error.message);
    return res.status(200).send("OK");
  }
};

const webhooksShopRedact = async (req, res) => {
  try {
    const shop = normalizeShopDomain(req.headers["x-shopify-shop-domain"]);
    console.log(`[webhooksShopRedact] GDPR shop redact for shop=${shop || "unknown"}`);

    if (shop) {
      const cleanupResult = await cleanupShopOnUninstall(shop);
      const shopDoc = await shopModel.findOne({ shop });
      if (shopDoc) {
        await shopModel.deleteOne({ _id: shopDoc._id });
        console.log(`[webhooksShopRedact] Shop document deleted for ${shop}`);
      }
      console.log(`[webhooksShopRedact] Cleanup result:`, cleanupResult);
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error("[webhooksShopRedact] Error:", error);
    return res.status(500).send("Error");
  }
};

// const paymentSucessController = async (req, res) => {
//   try {
//     let orderData = req.body;

//     if (Buffer.isBuffer(orderData)) {
//       orderData = JSON.parse(orderData.toString());
//     }

//     const noteAttrs = orderData.note_attributes;

//     if (!noteAttrs || !Array.isArray(noteAttrs)) {
//       return res.status(400).send("No note attributes found");
//     }
//     const appUserIdAttr = noteAttrs.find((attr) => attr.name === "app_user_id");
//     const customerIdAttr = noteAttrs.find(
//       (attr) => attr.name === "customer_id",
//     );
//     const customerIdAttrTransId = noteAttrs.find(
//       (attr) => attr.name === "transaction_id",
//     );
//     const shopId = noteAttrs.find((attr) => attr.name === "shop_id");

//     if (
//       !appUserIdAttr ||
//       !customerIdAttr ||
//       !customerIdAttrTransId ||
//       !shopId
//     ) {
//       return res.status(400).send("Required attributes missing");
//     }

//     const appUserId = appUserIdAttr.value;
//     const transactionId = customerIdAttrTransId.value;
//     const shopId_ = shopId.value;
//     const orderAmount = parseFloat(orderData.total_price) || 0;

//     if (
//       !mongoose.Types.ObjectId.isValid(appUserId) ||
//       !mongoose.Types.ObjectId.isValid(transactionId) ||
//       !mongoose.Types.ObjectId.isValid(shopId_)
//     ) {
//       return res.status(400).send("Invalid attribute ids");
//     }

//     const findVoucherPlan = await shopModel.findById(shopId_);
//     const matchedVoucher = findVoucherPlan?.vouchers.find(
//       (v) => Number(v.totalCoin) === Number(orderAmount),
//     );
//     const bonus = matchedVoucher ? Number(matchedVoucher.extraCoin || 0) : 0;
//     const totalCredit = Number(orderAmount) + bonus;

//     // IDEMPOTENCY: atomically claim the pending recharge row. Only ONE delivery
//     // can flip pending -> success; Shopify retries (up to 19x) and duplicates
//     // therefore no longer re-credit the wallet.
//     const claimed = await WalletHistory.findOneAndUpdate(
//       { _id: transactionId, userId: appUserId, shop_id: shopId_, status: "pending" },
//       { $set: { status: "success", amount: totalCredit } },
//       { new: true },
//     );

//     if (!claimed) {
//       // Already processed (retry) or bad reference → do NOT credit again.
//       return res.status(200).send("Already processed");
//     }

//     // ATOMIC increment — never read-modify-write (prevents lost-update races).
//     const updated = await User.findByIdAndUpdate(
//       appUserId,
//       { $inc: { walletBalance: totalCredit } },
//       { new: true },
//     );

//     if (!updated) {
//       // Roll the claim back so a valid retry can still succeed.
//       await WalletHistory.findByIdAndUpdate(transactionId, {
//         $set: { status: "pending" },
//       });
//       return res.status(404).send("User not found");
//     }

//     res.status(200).json({
//       success: true,
//       message: "Balance updated successfully",
//       userId: appUserId,
//       amountAdded: orderAmount,
//       newBalance: updated.walletBalance,
//     });
//   } catch (error) {
//     console.error("❌ Webhook processing error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Internal server error",
//       error: error.message,
//     });
//   }
// };
const paymentSucessController = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    let orderData = req.body;

    if (Buffer.isBuffer(orderData)) {
      orderData = JSON.parse(orderData.toString());
    }

    const noteAttrs = orderData.note_attributes;

    if (!noteAttrs || !Array.isArray(noteAttrs)) {
      session.endSession();
      return res.status(400).send("No note attributes found");
    }

    const appUserIdAttr = noteAttrs.find(
      (attr) => attr.name === "app_user_id"
    );

    const customerIdAttr = noteAttrs.find(
      (attr) => attr.name === "customer_id"
    );

    const transactionIdAttr = noteAttrs.find(
      (attr) => attr.name === "transaction_id"
    );

    const shopIdAttr = noteAttrs.find(
      (attr) => attr.name === "shop_id"
    );

    if (
      !appUserIdAttr ||
      !customerIdAttr ||
      !transactionIdAttr ||
      !shopIdAttr
    ) {
      session.endSession();
      return res.status(400).send("Required attributes missing");
    }

    const appUserId = appUserIdAttr.value;
    const transactionId = transactionIdAttr.value;
    const shopId = shopIdAttr.value;

    const orderAmount = Number(orderData.total_price) || 0;

    if (
      !mongoose.Types.ObjectId.isValid(appUserId) ||
      !mongoose.Types.ObjectId.isValid(transactionId) ||
      !mongoose.Types.ObjectId.isValid(shopId)
    ) {
      session.endSession();
      return res.status(400).send("Invalid attribute ids");
    }

    // Find voucher
    const shop = await shopModel.findById(shopId).lean();

    if (!shop) {
      session.endSession();
      return res.status(404).send("Shop not found");
    }

    const matchedVoucher = shop.vouchers.find(
      (v) => Number(v.totalCoin) === Number(orderAmount)
    );

    const bonus = matchedVoucher
      ? Number(matchedVoucher.extraCoin || 0)
      : 0;

    const totalCredit = orderAmount + bonus;

    // -----------------------
    // START TRANSACTION
    // -----------------------

    await session.startTransaction();

    // Claim pending transaction (Idempotency)
    const claimed = await WalletHistory.findOneAndUpdate(
      {
        _id: transactionId,
        userId: appUserId,
        shop_id: shopId,
        status: "pending",
      },
      {
        $set: {
          status: "success",
          amount: totalCredit,
        },
      },
      {
        new: true,
        session,
      }
    );

    if (!claimed) {
      await session.abortTransaction();
      session.endSession();

      return res.status(200).send("Already processed");
    }

    // Credit wallet
    const updatedUser = await User.findByIdAndUpdate(
      appUserId,
      {
        $inc: {
          walletBalance: totalCredit,
        },
      },
      {
        new: true,
        session,
      }
    );

    if (!updatedUser) {
      throw new Error("User not found");
    }

    // Update admin/shop earnings
    await shopModel.findByIdAndUpdate(
      shopId,
      {
        $inc: {
          totalEarning: orderAmount,
        },
      },
      {
        session,
      }
    );

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      success: true,
      message: "Wallet credited successfully.",
      userId: appUserId,
      rechargeAmount: orderAmount,
      bonusCoin: bonus,
      totalCredit,
      newWalletBalance: updatedUser.walletBalance,
    });
  } catch (error) {
    try {
      await session.abortTransaction();
    } catch (e) { }

    session.endSession();

    console.error("Webhook Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
/**
 * themes/publish + themes/update — the merchant changed or switched their
 * theme, so every scraped head/header/footer we hold is now wrong. Drop the
 * shop's theme cache (memory + Redis) and let the NEXT storefront request
 * rebuild it; nothing is scraped eagerly here.
 */
const webhooksThemeChanged = async (req, res) => {
  try {
    const topic = req.headers["x-shopify-topic"] || "unknown";
    const shopDomain = req.headers["x-shopify-shop-domain"] || "";
    console.log(`[webhook] ${topic} received for ${shopDomain}`);
    console.log(`[webhook] ${topic} received for ${shopDomain}`);


    if (shopDomain) {
      await invalidateThemeAssets(shopDomain);
    }
    return res.status(200).send("OK");
  } catch (error) {
    // Always 200 — a cache-cleanup hiccup must never trigger Shopify's
    // webhook retry/backoff machinery.
    console.error("[webhook] theme webhook error:", error.message);
    return res.status(200).send("OK");
  }
};

module.exports = {
  webhooksAppUninstalled,
  webhooksCustomerDataRequest,
  webhooksCustomerRedact,
  webhooksShopRedact,
  paymentSucessController,
  webhooksThemeChanged,
};
