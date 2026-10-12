const { shopModel } = require("../Modal/shopify");
const mongoose = require("mongoose");
const { TransactionHistroy } = require("../Modal/transactionHistroy");
const { User } = require("../Modal/userSchema");
const { WalletHistory } = require("../Modal/walletHistory");
const { WithdrawalRequestSchema } = require("../Modal/withdrawalSchema");
const axios = require("axios");
const { getMenus } = require("../MiddleWare/storeMenu");
const { getMissingRequiredMenus } = require("../Utils/menuPathUtils");
const { assertAdminShopAccess } = require("../Auth/auth");
const { ConsultantSupportRequest } = require("../Modal/consultantSupportRequest");
const { resolveShopProfile } = require("../Utils/shopifyShopProfile");
const { getShopAccessToken } = require("../Utils/shopifyToken");
const Subscription = require("../Modal/Subscription");
const { ensureSubscription } = require("../services/subscriptionMinutes");
const { invalidateThemeAssets } = require("../MiddleWare/ShopifyMiddleware/helperTheme");
const { shopDocCache } = require("../Utils/ttlCache");

const syncShopWelcomeProfile = async (adminDoc) => {
  if (!adminDoc) return adminDoc;

  const needsSync =
    !adminDoc.shopName ||
    !adminDoc.shopOwnerName ||
    !adminDoc.shopEmail ||
    !adminDoc.myshopifyDomain;

  if (!needsSync) return adminDoc;

  const shopWithToken = await shopModel.findById(adminDoc._id);
  if (!shopWithToken?.accessToken || !shopWithToken.shop) return adminDoc;

  const profile = await resolveShopProfile(
    shopWithToken.shop,
    await getShopAccessToken(shopWithToken),
  );

  if (
    !profile.shopName &&
    !profile.shopOwnerName &&
    !profile.shopEmail &&
    !profile.myshopifyDomain
  ) {
    return adminDoc;
  }

  return shopModel
    .findByIdAndUpdate(
      adminDoc._id,
      {
        $set: {
          shopName: profile.shopName || adminDoc.shopName || "",
          shopOwnerName: profile.shopOwnerName || adminDoc.shopOwnerName || "",
          shopEmail: profile.shopEmail || adminDoc.shopEmail || "",
          myshopifyDomain:
            profile.myshopifyDomain || adminDoc.myshopifyDomain || "",
          ...(profile.shopEmail ? { email: profile.shopEmail } : {}),
        },
      },
      { new: true },
    )
    .select("-accessToken");
};

const adminController = async (req, res) => {
  try {
    const { adminId } = req.params;
    if (!adminId) {
      return res.status(400).json({
        success: false,
        message: "Admin ID is required",
      });
    }
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID",
      });
    }

    if (!(await assertAdminShopAccess(req, res, adminId))) return;

    let admin = await shopModel
      .findOne({ _id: adminId })
      .select("-accessToken");
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }
    await invalidateThemeAssets(admin?.shop);
    admin = await syncShopWelcomeProfile(admin);
    res.status(200).json({
      success: true,
      message: "Admin retrieved successfully",
      data: admin,
      welcome: {
        shopOwnerName: admin.shopOwnerName || "",
        shopName: admin.shopName || "",
        isWelcomeShown: admin.isWelcomeShown === true,
      },
    });
  } catch (error) {
    console.error("Error in adminController:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch admin data",
      error: error.message,
    });
  }
};

const voucherController = async (req, res) => {
  try {
    const { adminId } = req.params;
    const { totalCoin, extraCoin, voucherCode } = req.body;

    if (!adminId) {
      return res.status(400).json({
        success: false,
        message: "Admin ID is required",
      });
    }
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID",
      });
    }

    if (!(await assertAdminShopAccess(req, res, adminId))) return;

    const admin = await shopModel
      .findOne({ _id: adminId })
      .select("-accessToken");
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }
    const voucher = {
      voucherCode: voucherCode || "",
      totalCoin: totalCoin,
      extraCoin: extraCoin,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    admin.vouchers.push(voucher);
    await admin.save();
    res.status(200).json({
      success: true,
      message: "Voucher created successfully",
      data: admin,
    });
  } catch (error) {
    console.error("Error in voucherController:", error);
  }
};

const deleteAdminController = async (req, res) => {
  try {
    const shop = req.headers["x-shopify-shop-domain"];
    const admin = await shopModel.findOneAndUpdate(
      { shop },
      {
        accessToken: null,
        uninstalledAt: new Date(),
      },
    );
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }
    res.status(200).json({
      success: true,
      message: "Admin deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteAdminController:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete admin",
      error: error.message,
    });
  }
};

const getTransactionController = async (req, res) => {
  try {
    const { adminId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID",
      });
    }

    if (!(await assertAdminShopAccess(req, res, adminId))) return;

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const search = req.query.searchQuery?.trim();
    const type = Number(req.query.type) || 0;
    const skip = (page - 1) * limit;

    const typeMap = {
      0: "all",
      1: "chat",
      2: "voice",
      3: "video",
    };

    const typeValue = typeMap[type] || "all";

    const filter = { shop_id: adminId };

    if (typeValue !== "all") {
      filter.type = typeValue;
    }

    if (search) {
      const users = await User.find({
        fullname: { $regex: search, $options: "i" },
      }).select("_id");

      const userIds = users.map((u) => u._id);

      filter.$or = [
        { senderId: { $in: userIds } },
        { receiverId: { $in: userIds } },
      ];
    }

    const transactions = await TransactionHistroy.find(filter)
      .populate("senderId", "fullname email profileImage userType")
      .populate("receiverId", "fullname email profileImage userType")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalItems = await TransactionHistroy.countDocuments(filter);
    res.status(200).json({
      success: true,
      message: "Transactions retrieved successfully",
      data: transactions,
      totalItems,
      page,
      limit,
    });
  } catch (error) {
    console.error("Error in getTransactionController:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getUserConsultantController = async (req, res) => {
  try {
    const { adminId } = req.params;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const search = req.query.search || req.query.searchQuery || "";
    const skip = (page - 1) * limit;
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID",
      });
    }

    if (!(await assertAdminShopAccess(req, res, adminId))) return;

    // Filter BEFORE pagination: resolve matching users first, then page over
    // their wallet activity-history — filtering after skip/limit hid matches on later
    // pages and made totalItems wrong.
    const walletFilter = { shop_id: adminId };
    if (search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const matchedUsers = await User.find({
        shop_id: adminId,
        fullname: { $regex: escaped, $options: "i" },
      })
        .select("_id")
        .lean();
      walletFilter.userId = { $in: matchedUsers.map((u) => u._id) };
    }

    const customers = await WalletHistory.find(walletFilter)
      .sort({ createdAt: -1 })
      .populate({
        path: "userId",
        select: "fullname email profileImage phone userType",
      })
      .skip(skip)
      .limit(limit)
      .lean();
    const totalItems = await WalletHistory.countDocuments(walletFilter);

    res.status(200).json({
      success: true,
      message: "Customers retrieved successfully",
      data: customers.filter((item) => item.userId !== null),
      totalItems,
      page,
      limit,
    });
  } catch (error) {
    console.error("Error in getUserConsultantController:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get customers",
    });
  }
};

const getShopAllUserController = async (req, res) => {
  try {
    const { adminId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID",
      });
    }

    if (!(await assertAdminShopAccess(req, res, adminId))) return;

    const users = await User.find({
      shop_id: adminId,
      userType: "customer",
    })
      .select(
        "fullname email profileImage userType walletBalance updatedAt phone",
      )
      .lean();

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Users not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Users retrieved successfully",
      data: users,
    });
  } catch (error) {
    console.error("Error in getShopAllUserController:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get users",
    });
  }
};

const getShopAllConsultantController = async (req, res) => {
  try {
    const { adminId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID",
      });
    }

    if (!(await assertAdminShopAccess(req, res, adminId))) return;

    const users = await User.find({
      shop_id: adminId,
      userType: "consultant",
    })
      .select(
        "fullname email profileImage userType walletBalance updatedAt phone isActive",
      )
      .lean();

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Consultants not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Users retrieved successfully",
      data: users,
    });
  } catch (error) {
    console.error("Error in getShopAllUserController:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get users",
    });
  }
};
const updateUserConsultantController = async (req, res) => {
  try {
    const { adminId } = req.params;
    const body = req.body;
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID",
      });
    }

    if (!(await assertAdminShopAccess(req, res, adminId))) return;

    if (!["manual_credit", "manual_debit"].includes(body.mainType)) {
      return res.status(400).json({
        success: false,
        message: "Please select a main type (Manual Credit or Manual Debit)",
      });
    }

    const uAmount = +body.amount;
    if (!Number.isFinite(uAmount) || uAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid amount",
      });
    }

    const user = await User.findById(body.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (String(user.shop_id) !== String(adminId)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }
    const mType = body.mainType === "manual_credit" ? "credit" : "debit";
    await WalletHistory.create({
      userId: body.userId,
      shop_id: adminId,
      amount: uAmount,
      referenceType: "manual",
      description: body.description,
      transactionType: body.mainType,
      direction: mType,
      status: "success",
    });
    user.walletBalance =
      mType === "credit"
        ? user.walletBalance + uAmount
        : user.walletBalance - uAmount;
    await user.save();
    res.status(200).json({
      success: true,
      message: "User wallet updated successfully",
      data: user,
    });
  } catch (error) {
    console.error("Error in updateUserConsultantController:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update wallet",
    });
  }
};

// app enable and disable
const appEnableAndDisableController = async (req, res) => {
  try {
    const { adminId } = req.params;
    const { appStatus } = req.body;

    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID",
      });
    }

    if (!(await assertAdminShopAccess(req, res, adminId))) return;

    const admin = await shopModel.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    admin.appEnabled = appStatus;
    await admin.save();

    return res.status(200).json({
      success: true,
      message: `App ${appStatus ? "enabled" : "disabled"} successfully`,
      appEnabled: admin.appEnabled,
    });
  } catch (error) {
    console.error("Error in appEnableAndDisableController:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to enable or disable app",
    });
  }
};

const checkAppBillingController = async (req, res) => {
  try {
    const { adminId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID",
      });
    }

    if (!(await assertAdminShopAccess(req, res, adminId))) return;
    const shop = await Subscription.findOne({ shopId: adminId });
    if (!shop) {
      // First install: no subscription exists yet. Respond immediately —
      // returning without a response left the request hanging until the
      // browser timed out, which froze the app on the loading skeleton.
      return res.status(200).json({
        success: true,
        message: "No subscription found",
        data: null,
      });
    }
    return res.status(200).json({
      success: true,
      message: "App status retrieved successfully",
      data: shop,
    });
  } catch (error) {
    console.error("Error in appEnableAndDisableController:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to enable or disable app",
    });
  }
};

const voucherHandlerController = async (req, res) => {
  try {
    const { shopId, voucherId } = req.params;

    if (
      !mongoose.Types.ObjectId.isValid(shopId) ||
      !mongoose.Types.ObjectId.isValid(voucherId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }

    if (!(await assertAdminShopAccess(req, res, shopId))) return;

    const shop = await shopModel.findById(shopId);
    if (!shop) {
      return res
        .status(404)
        .json({ success: false, message: "Shop not found" });
    }

    shop.vouchers = shop.vouchers.filter((v) => v._id.toString() !== voucherId);

    await shop.save();
    return res.status(200).json({
      success: true,
      message: "Voucher deleted successfully",
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

const updatesVoucherController = async (req, res) => {
  try {
    const { shopId, voucherId } = req.params;
    const { totalCoin, extraCoin, voucherCode } = req.body;

    if (
      !mongoose.Types.ObjectId.isValid(shopId) ||
      !mongoose.Types.ObjectId.isValid(voucherId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }

    if (!(await assertAdminShopAccess(req, res, shopId))) return;

    const shop = await shopModel.findById(shopId);

    if (!shop) {
      return res.status(404).json({
        success: false,
        message: "Shop not found",
      });
    }

    const voucher = shop.vouchers.id(voucherId);

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: "Voucher not found",
      });
    }

    if (totalCoin !== undefined) voucher.totalCoin = totalCoin;
    if (extraCoin !== undefined) voucher.extraCoin = extraCoin;
    if (voucherCode !== undefined) voucher.voucherCode = voucherCode;

    await shop.save();

    return res.status(200).json({
      success: true,
      message: "Voucher updated successfully",
      voucher,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

const getWithdrawalRequest = async (req, res) => {
  try {
    const { adminId } = req.params;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID",
      });
    }

    if (!(await assertAdminShopAccess(req, res, adminId))) return;

    // Filter by the search box: consultant name/email live on the User
    // collection, so resolve matching consultants first, then match their
    // requests (plus status/note text and exact amount).
    const query = { shopId: adminId };
    const search = String(req.query.search || "").trim();
    if (search) {
      const rx = new RegExp(
        search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );
      const matchingConsultants = await User.find({
        shop_id: adminId,
        $or: [{ fullname: rx }, { email: rx }],
      })
        .select("_id")
        .lean();

      const or = [
        { consultantId: { $in: matchingConsultants.map((u) => u._id) } },
        { status: rx },
        { note: rx },
      ];
      if (!Number.isNaN(Number(search))) {
        or.push({ amount: Number(search) });
      }
      query.$or = or;
    }

    const widthrawal = await WithdrawalRequestSchema.find(query)
      .populate("consultantId", "fullname email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    if (!widthrawal) return;
    const totalItems = await WithdrawalRequestSchema.countDocuments(query);

    return res.status(200).json({
      success: true,
      message: "App status retrieved successfully",
      data: widthrawal,
      totalItems,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

const updateConsultantWidthrawalRequest = async (req, res) => {
  try {
    const { adminId } = req.params;
    const body = req.body;
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID",
      });
    }

    if (!(await assertAdminShopAccess(req, res, adminId))) return;

    const user = await User.findById(body.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (String(user.shop_id) !== String(adminId)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }

    const withdrawal = await WithdrawalRequestSchema.findById(body.transactionId);
    if (!withdrawal || String(withdrawal.shopId) !== String(adminId)) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }

    const updateReq = await WithdrawalRequestSchema.findByIdAndUpdate(
      body.transactionId,
      {
        status: "paid",
        transactionNumber: body.transactionNumber,
        description: body.description,
      },
    );

    await WalletHistory.create({
      userId: body.userId,
      shop_id: adminId,
      amount: body.amount,
      referenceType: "withdraw",
      description: body.description,
      transactionType: "withdraw",
      direction: body.mainType === "paid" ? "credit" : "",
      status: "success",
    });

    res.status(200).json({
      success: true,
      message: "Paymet successfully",
      data: user,
    });
  } catch (error) {
    console.error("Error in updateUserConsultantController:", error);
  }
};

const declineWithdrawalRequest = async (req, res) => {
  try {
    const { transactionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid transaction ID",
      });
    }

    const withdrawal = await WithdrawalRequestSchema.findById(transactionId);
    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: "Withdrawal request not found",
      });
    }

    if (!(await assertAdminShopAccess(req, res, withdrawal.shopId))) return;

    if (withdrawal.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Withdrawal already processed",
      });
    }
    if (withdrawal.status == "paid" || withdrawal.status == "declined") {
      return res.status(400).json({
        success: false,
        message: "Alredy Updated ? ",
      });
    }

    const user = await User.findById(withdrawal.consultantId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Consultant not found",
      });
    }

    user.walletBalance += withdrawal.amount;
    await user.save();

    withdrawal.status = "declined";
    await withdrawal.save();

    return res.status(200).json({
      success: true,
      message: "Withdrawal request declined and amount refunded",
    });
  } catch (error) {
    console.error("Decline withdrawal error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const updateAdminPercentage = async (req, res) => {
  try {
    const { adminId } = req.params;
    const { adminPercentage } = req.body;

    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID",
      });
    }

    if (!(await assertAdminShopAccess(req, res, adminId))) return;

    if (
      adminPercentage === undefined ||
      adminPercentage < 0 ||
      adminPercentage > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Admin percentage must be between 0 and 100",
      });
    }

    const updatedShop = await shopModel.findByIdAndUpdate(
      adminId,
      {
        adminPersenTage: adminPercentage,
      },
      { new: true },
    );

    if (!updatedShop) {
      return res.status(404).json({
        success: false,
        message: "Admin / Shop not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Admin percentage updated successfully",
      data: updatedShop,
    });
  } catch (error) {
    console.error("Update admin percentage error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// Only 6-digit hex — this is what <input type="color"> always emits, and
// rejecting anything else (rgba(), named colors, "red;}body{display:none")
// is what keeps a saved value from ever being able to inject arbitrary CSS
// into the storefront when the Theme Extension writes it into a CSS custom
// property.
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const CARD_SHADOW_VALUES = ["none", "soft", "default", "strong"];
const CONSULTANT_CARD_COLOR_FIELDS = [
  "cardBackground",
  "cardBorderColor",
  "headerBackground",
  "nameColor",
  "categoryColor",
  "supportingTextColor",
  "priceColor",
  "chatButtonBg",
  "chatButtonText",
  "callButtonBg",
  "callButtonText",
  "videoButtonBg",
  "videoButtonText",
  "buttonBorderColor",
  "buttonHoverColor",
  "onlineColor",
  "busyColor",
  "offlineColor",
];

/**
 * Normalizes + validates one submitted theme into { $set } fields, rejecting
 * (not silently dropping) the whole request if any provided field is
 * invalid — a partial silent drop could save a half-applied theme the admin
 * never actually asked for. Fields the admin never touched are simply
 * absent from req.body and are left completely alone (existing saved value,
 * or the schema's own null default, is untouched) — this is what makes
 * "only override what the admin explicitly set" work.
 */
const sanitizeConsultantCardTheme = (input) => {
  const errors = [];
  const set = {};

  if (!input || typeof input !== "object") {
    return { errors: ["Invalid theme payload"], set };
  }

  CONSULTANT_CARD_COLOR_FIELDS.forEach((field) => {
    if (!(field in input)) return;
    const value = input[field];
    if (value === null || value === "") {
      set[`consultantCardTheme.${field}`] = null; // explicit reset to default
      return;
    }
    if (typeof value !== "string" || !HEX_COLOR_RE.test(value)) {
      errors.push(`${field} must be a 6-digit hex color (e.g. #14563c)`);
      return;
    }
    set[`consultantCardTheme.${field}`] = value;
  });

  if ("cardBorderRadius" in input) {
    const raw = input.cardBorderRadius;
    if (raw === null || raw === "") {
      set["consultantCardTheme.cardBorderRadius"] = null;
    } else {
      const radius = Number(raw);
      if (!Number.isFinite(radius) || radius < 0 || radius > 32) {
        errors.push("cardBorderRadius must be a number between 0 and 32");
      } else {
        set["consultantCardTheme.cardBorderRadius"] = radius;
      }
    }
  }

  if ("cardShadow" in input) {
    const raw = input.cardShadow;
    if (raw === null || raw === "") {
      set["consultantCardTheme.cardShadow"] = null;
    } else if (!CARD_SHADOW_VALUES.includes(raw)) {
      errors.push(`cardShadow must be one of: ${CARD_SHADOW_VALUES.join(", ")}`);
    } else {
      set["consultantCardTheme.cardShadow"] = raw;
    }
  }

  if ("professionColors" in input) {
    const raw = input.professionColors;
    if (raw === null) {
      set["consultantCardTheme.professionColors"] = {};
    } else if (typeof raw !== "object" || Array.isArray(raw)) {
      errors.push("professionColors must be an object of profession -> hex color");
    } else {
      const cleaned = {};
      for (const key of Object.keys(raw)) {
        const profession = String(key).trim().toLowerCase();
        const value = raw[key];
        if (!profession) continue;
        if (typeof value !== "string" || !HEX_COLOR_RE.test(value)) {
          errors.push(`professionColors.${key} must be a 6-digit hex color`);
          continue;
        }
        cleaned[profession] = value;
      }
      set["consultantCardTheme.professionColors"] = cleaned;
    }
  }

  return { errors, set };
};

const updateConsultantCardTheme = async (req, res) => {
  try {
    const { adminId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID",
      });
    }

    if (!(await assertAdminShopAccess(req, res, adminId))) return;

    // "Reset to Default" sends { reset: true } — clears every field back to
    // null in one request rather than requiring the admin UI to enumerate
    // every field name itself.
    if (req.body?.reset === true) {
      const resetShop = await shopModel.findByIdAndUpdate(
        adminId,
        {
          consultantCardTheme: {
            cardBackground: null,
            cardBorderColor: null,
            cardBorderRadius: null,
            cardShadow: null,
            headerBackground: null,
            nameColor: null,
            categoryColor: null,
            supportingTextColor: null,
            priceColor: null,
            chatButtonBg: null,
            chatButtonText: null,
            callButtonBg: null,
            callButtonText: null,
            videoButtonBg: null,
            videoButtonText: null,
            buttonBorderColor: null,
            buttonHoverColor: null,
            onlineColor: null,
            busyColor: null,
            offlineColor: null,
            professionColors: {},
          },
        },
        { new: true },
      );
      if (!resetShop) {
        return res.status(404).json({ success: false, message: "Admin / Shop not found" });
      }
      shopDocCache.delete(`shop:${resetShop.shop}`);
      return res.status(200).json({
        success: true,
        message: "Consultant card appearance reset to default",
        data: resetShop.consultantCardTheme,
      });
    }

    const { errors, set } = sanitizeConsultantCardTheme(req.body);
    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: errors[0],
        errors,
      });
    }
    if (!Object.keys(set).length) {
      return res.status(400).json({
        success: false,
        message: "No valid theme fields provided",
      });
    }

    const updatedShop = await shopModel.findByIdAndUpdate(
      adminId,
      { $set: set },
      { new: true, runValidators: true },
    );

    if (!updatedShop) {
      return res.status(404).json({
        success: false,
        message: "Admin / Shop not found",
      });
    }

    // The storefront reads this shop doc through shopDocCache (5-minute TTL,
    // see getShopDoc/getCachedShopDoc) — without this the admin's saved
    // appearance wouldn't reach the storefront for up to 5 minutes.
    shopDocCache.delete(`shop:${updatedShop.shop}`);

    return res.status(200).json({
      success: true,
      message: "Consultant card appearance updated successfully",
      data: updatedShop.consultantCardTheme,
    });
  } catch (error) {
    console.error("Update consultant card theme error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const getSetupGuideController = async (req, res) => {
  try {
    const { adminId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID",
      });
    }

    if (!(await assertAdminShopAccess(req, res, adminId))) return;

    const admin = await shopModel.findOne({ _id: adminId });
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }
    return res.status(200).json({
      success: true,
      message: "Setup guide open",
      data: admin.setupGuideOpen,
    });
  } catch (error) {
    console.error("Error in getSetupGuideController:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
const getMenuController = async (req, res) => {
  try {
    const { adminId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID",
      });
    }

    if (!(await assertAdminShopAccess(req, res, adminId))) return;

    const admin = await shopModel.findOne({ _id: adminId });
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    const menus = await getMenus({
      shop: admin.shop,
      accessToken: await getShopAccessToken(admin),
    });
    if (!menus) {
      return res.status(404).json({
        success: false,
        message: "Menu not fetched",
      });
    }

    const allMenuItems = menus.flatMap((menu) => menu.node.items || []);
    if (!allMenuItems.length) {
      return res.status(404).json({
        success: false,
        message: "All menu items not found",
      });
    }

    const missingMenus = getMissingRequiredMenus(allMenuItems);

    const isMenuSetupComplete = missingMenus.length === 0;



    return res.status(200).json({
      success: true,
      message: "Menu setup complete",
      missingMenus,
      data: isMenuSetupComplete,
      appEnabled: admin.appEnabled,
    });
  } catch (error) {
    console.error("Error in updateMenuController:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
const updateMenuController = async (req, res) => {
  try {
    const { adminId } = req.params;
    console.log("adminId", adminId);

    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID",
      });
    }

    if (!(await assertAdminShopAccess(req, res, adminId))) return;

    console.log("adminId", adminId);
    const admin = await shopModel.findById(adminId);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }
    console.log("admin", admin);
    admin.menuSetupComplete = !admin.menuSetupComplete;

    await admin.save();

    return res.status(200).json({
      success: true,
      message: "Menu setup status updated",
      data: admin,
    });
  } catch (error) {
    console.error("Error in updateMenuController:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const getConsultantSupportRequests = async (req, res) => {
  try {
    const { adminId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({ success: false, message: "Invalid admin ID" });
    }
    if (!(await assertAdminShopAccess(req, res, adminId))) return;

    const requests = await ConsultantSupportRequest.find({ shopId: adminId })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: requests,
      unreadCount: requests.filter((item) => item.adminHasUnread).length,
    });
  } catch (error) {
    console.error("getConsultantSupportRequests error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch support requests",
    });
  }
};

const replyConsultantSupportRequest = async (req, res) => {
  try {
    const { adminId, requestId } = req.params;
    const replyMessage = String(req.body?.reply || req.body?.message || "").trim();

    if (!mongoose.Types.ObjectId.isValid(adminId) || !mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }
    if (!replyMessage) {
      return res.status(400).json({ success: false, message: "Reply message is required" });
    }
    if (replyMessage.length > 5000) {
      return res.status(400).json({ success: false, message: "Reply is too long" });
    }

    if (!(await assertAdminShopAccess(req, res, adminId))) return;

    const supportRequest = await ConsultantSupportRequest.findOne({
      _id: requestId,
      shopId: adminId,
    });

    if (!supportRequest) {
      return res.status(404).json({ success: false, message: "Support request not found" });
    }

    supportRequest.replies.push({
      message: replyMessage,
      repliedBy: "admin",
      repliedAt: new Date(),
    });
    supportRequest.status = "replied";
    supportRequest.adminHasUnread = false;
    supportRequest.consultantHasUnreadReply = true;
    await supportRequest.save();

    const { sendSupportReplyEmail } = require("../MiddleWare/ShopifyMiddleware/nodemailer");
    await sendSupportReplyEmail({
      to: supportRequest.consultantEmail,
      consultantName: supportRequest.consultantName,
      shop: supportRequest.shopDomain,
      subject: supportRequest.subject,
      replyMessage,
    });

    return res.status(200).json({
      success: true,
      message: "Reply sent to consultant",
      data: supportRequest,
    });
  } catch (error) {
    console.error("replyConsultantSupportRequest error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to send reply",
    });
  }
};

const markConsultantSupportRequestRead = async (req, res) => {
  try {
    const { adminId, requestId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(adminId) || !mongoose.Types.ObjectId.isValid(requestId)) {
      return res.status(400).json({ success: false, message: "Invalid ID" });
    }
    if (!(await assertAdminShopAccess(req, res, adminId))) return;

    await ConsultantSupportRequest.findOneAndUpdate(
      { _id: requestId, shopId: adminId },
      { $set: { adminHasUnread: false } },
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("markConsultantSupportRequestRead error:", error);
    return res.status(500).json({ success: false, message: "Failed to update request" });
  }
};

const completeWelcomeShown = async (req, res) => {
  try {
    const { adminId } = req.params;
    if (!adminId) {
      return res.status(400).json({
        success: false,
        message: "Admin ID is required",
      });
    }
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID",
      });
    }
    if (!(await assertAdminShopAccess(req, res, adminId))) return;

    const admin = await shopModel
      .findOneAndUpdate(
        { _id: adminId },
        { $set: { isWelcomeShown: true } },
        { new: true },
      )
      .select("-accessToken");

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: "Admin not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Welcome flow completed",
      data: {
        shopOwnerName: admin.shopOwnerName || "",
        shopName: admin.shopName || "",
        isWelcomeShown: true,
      },
    });
  } catch (error) {
    console.error("completeWelcomeShown error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to complete welcome flow",
      error: error.message,
    });
  }
};

const _PlanDetails = async (req, res) => {
  try {
    const { adminId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID",
      });
    }
    if (!(await assertAdminShopAccess(req, res, adminId))) return;

    // Provisions the default Basic plan on first visit.
    const plan = await ensureSubscription(adminId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Subscription not found",
      });
    }

    // Billing cycle rolled over — reset usage for the new cycle.
    if (plan.currentPeriodEnd && plan.currentPeriodEnd < new Date()) {
      const periodStart = new Date();
      const periodEnd = new Date(periodStart);
      periodEnd.setDate(
        periodEnd.getDate() + (plan.billingCycle === "yearly" ? 365 : 30),
      );
      plan.usedMinutes = 0;
      plan.remainingMinutes = plan.totalMinutes;
      plan.currentPeriodStart = periodStart;
      plan.currentPeriodEnd = periodEnd;
      await plan.save();
    }

    const totalMinutes = plan.totalMinutes || 0;
    const usedMinutes = Math.min(plan.usedMinutes || 0, totalMinutes);
    const remainingMinutes = Math.max(totalMinutes - usedMinutes, 0);
    const usedPercentage = totalMinutes
      ? Math.round((usedMinutes / totalMinutes) * 100)
      : 0;

    return res.status(200).json({
      success: true,
      message: "Plan details retrieved successfully",
      data: {
        ...plan.toObject(),
        usedMinutes,
        remainingMinutes,
        usedPercentage,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch plan details",
      error: error.message,
    });
  }
}

const getConsultantAd = async (req, res) => {
  try {
    const { shop_id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(shop_id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid shop ID" });
    }

    // Admin endpoint: the session token's shop must own this shop_id.
    if (!(await assertAdminShopAccess(req, res, shop_id))) return;

    // No cache here: consultantListKey is the PUBLIC listing's cache (without
    // walletBalance) — sharing it would either leak wallet data to the
    // storefront or serve the admin a wallet-less payload.
    let consultants = await User.find({
      userType: "consultant",
      shop_id: shop_id,
    })
      .select(
        "fullname displayName profileImage profession specialization experience language voicePerMinute videoPerMinute chatPerMinute isActive isBusy consultantStatus rating shop_id agoraUid walletBalance email",
      )
      .lean();

    consultants = consultants.map((item) => {
      return {
        ...item,
        profileImage: item.profileImage
          ? `${process.env.APP_URL}/${item.profileImage.replace(/\\/g, "/")}`
          : null,
      };
    });

    return res.status(200).send({ success: true, findConsultant: consultants });
  } catch (error) {
    console.log(error);
    res.status(500).send({ success: false, message: error.message });
  }
};

module.exports = {
  adminController,
  voucherController,
  deleteAdminController,
  getTransactionController,
  getUserConsultantController,
  getShopAllUserController,
  getShopAllConsultantController,
  updateUserConsultantController,
  appEnableAndDisableController,
  checkAppBillingController,
  voucherHandlerController,
  updatesVoucherController,
  getWithdrawalRequest,
  updateConsultantWidthrawalRequest,
  declineWithdrawalRequest,
  updateAdminPercentage,
  updateConsultantCardTheme,
  getSetupGuideController,
  updateMenuController,
  getMenuController,
  getConsultantSupportRequests,
  replyConsultantSupportRequest,
  markConsultantSupportRequestRead,
  completeWelcomeShown,
  _PlanDetails,
  getConsultantAd
};
