const mongoose = require("mongoose");
const { User } = require("../Modal/userSchema");
const { shopModel } = require("../Modal/shopify");
const {
  authorizeUserResource,
  usersShareShop,
  resolveAuthenticatedUserId,
} = require("../Auth/auth");
const { consultantListKey, cacheGetJSON, cacheSetJSON } = require("../Utils/redis");
const { getCommunicationStatus } = require("../services/subscriptionMinutes");


const CONSULTANT_LIST_TTL_SECONDS = Number(
  process.env.CONSULTANT_LIST_TTL_SECONDS || 60,
);


const usersController = async (req, res) => {
  try {
    const { userId } = req.params;
    const shopId = req.query.shopId;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid admin ID",
      });
    }

    if (!(await authorizeUserResource(req, res, { userId, shopId }))) return;

    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    res.status(200).json({
      success: true,
      message: "User retrieved successfully",
      data: user,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching user",
    });
  }
};

const checkedUserBlance = async (req, res) => {
  try {
    const { userId, consultantId } = req.params;
    const { callType = "voice" } = req.query;

    console.log(" req.params", req.params)
    console.log(" req.params", req.query)

    if (
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(consultantId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid user or consultant ID",
      });
    }

    if (!(await usersShareShop(userId, consultantId))) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }

    const userRecord = await User.findById(userId).select("shop_id walletBalance");
    if (
      !(await authorizeUserResource(req, res, {
        userId,
        shopId: userRecord?.shop_id,
      }))
    ) {
      return;
    }

    const user = userRecord;
    const consultant = await User.findById(consultantId)
      .select("voicePerMinute videoPerMinute chatPerMinute")
      .lean();

    if (!user || !consultant) {
      return res.status(404).json({
        success: false,
        message: "User or consultant not found",
      });
    }

    let callCost = 0;

    if (callType === "chat") {
      callCost = consultant.chatPerMinute;
    } else if (callType === "voice") {
      callCost = consultant.voicePerMinute;
    } else if (callType === "video") {
      callCost = consultant.videoPerMinute;
    }

    if (!callCost) {
      return res.status(400).json({
        success: false,
        message: "Invalid call type",
      });
    }

    if (user.walletBalance < callCost) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        userBalance: user.walletBalance,
        callCost,
        callType,
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

const checkUserAvailable = async (req, res) => {
  try {
    const { userId } = req.params;
    const { shop } = req.query;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (shop) {
      const shopDoc = await shopModel.findOne({ shop }).select("_id");
      if (!shopDoc || String(user.shop_id) !== String(shopDoc._id)) {
        return res.status(403).json({
          success: false,
          message: "Forbidden",
        });
      }
    } else {
      const authUserId = await resolveAuthenticatedUserId(req);
      if (!authUserId) {
        return res.status(401).json({
          success: false,
          message: "Authentication required",
        });
      }

      if (!(await usersShareShop(authUserId, userId))) {
        return res.status(403).json({
          success: false,
          message: "Forbidden",
        });
      }
    }

    if (user.isActive === false) {
      return res.status(400).json({
        success: false,
        message: "User is not available",
      });
    }
    if (user.isBusy === true) {
      return res.status(400).json({
        success: false,
        message: `${user.fullname} is busy`,
        isBusy: true,
      });
    }
    return res.status(200).json({
      success: true,
      data: user.isActive,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

const getConsultant = async (req, res) => {
  try {
    const { shop_id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(shop_id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid shop ID" });
    }
    // Computed fresh on every request (never cached with the list) so the
    // storefront learns immediately when the shop's minute pool runs out.
    const commStatus = await getCommunicationStatus(shop_id);
    const communicationDisabled = !commStatus.allowed;

    const cacheKey = consultantListKey(shop_id);
    const cached = await cacheGetJSON(cacheKey);
    if (cached) {
      return res
        .status(200)
        .send({ success: true, findConsultant: cached, communicationDisabled });
    }

    let consultants = await User.find({
      userType: "consultant",
      shop_id: shop_id,
    })
      .select(
        "fullname displayName profileImage profession specialization experience language voicePerMinute videoPerMinute chatPerMinute isActive isBusy consultantStatus rating shop_id agoraUid",
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

    await cacheSetJSON(cacheKey, consultants, CONSULTANT_LIST_TTL_SECONDS);

    return res
      .status(200)
      .send({ success: true, findConsultant: consultants, communicationDisabled });
  } catch (error) {
    console.log(error);
    res.status(500).send({ success: false, message: error.message });
  }
};

module.exports = { usersController, checkedUserBlance, checkUserAvailable, getConsultant };
