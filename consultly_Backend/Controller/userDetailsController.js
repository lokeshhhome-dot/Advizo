const { default: mongoose } = require("mongoose");
const { shopModel } = require("../Modal/shopify");
const { User } = require("../Modal/userSchema");
const { WalletHistory } = require("../Modal/walletHistory");
const { CallSession } = require("../Modal/callSessions");
const { TransactionHistroy } = require("../Modal/transactionHistroy");
const {
  authorizeUserResource,
  authorizeCallParticipant,
  assertAdminShopAccess,
  userBelongsToShop,
} = require("../Auth/auth");
const { getCommunicationStatus } = require("../services/subscriptionMinutes");

const getAllUsers = async (req, res) => {
    try {
        const shopDoc = await shopModel.findOne({ shop: req.shop }).select("_id");
        if (!shopDoc) {
            return res.status(404).json({
                success: false,
                message: "Shop not found",
            });
        }

        const users = await User.find({
            shop_id: shopDoc._id,
            userType: "customer",
        }).select("-password");

        res.status(200).json({
            success: true,
            message: "Users retrieved successfully",
            count: users.length,
            data: users
        });

    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch users",
            error: error.message
        });
    }
};

const getUserById = async (req, res) => {
    try {
        const { id } = req.params;
        const shopId = req.query.shopId;

        if (!(await authorizeUserResource(req, res, { userId: id, shopId }))) return;

        const user = await User.findById(id).select("-password")
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }
        res.status(200).json({
            success: true,
            message: "User retrieved successfully",
            data: user
        });

    } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch user",
            error: error.message
        });
    }
};

const getVouchersController = async (req, res) => {
    try {
        const { adminId } = req.params;
        if (!adminId) {
            return res.status(400).json({
                success: false,
                message: "Admin ID is required"
            });
        }
        if (!mongoose.Types.ObjectId.isValid(adminId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid admin ID"
            });
        }

        if (req.shop && !(await assertAdminShopAccess(req, res, adminId))) return;

        const admin = await shopModel.findOne({ _id: adminId }).select("-accessToken").select("vouchers").select("_id");
        if (!admin) {
            return res.status(404).json({
                success: false,
                message: "Admin not found"
            });
        }
        // Storefront pages fetch vouchers on load — piggyback the shop-level
        // communication flag so buttons disable without a new endpoint.
        const commStatus = await getCommunicationStatus(admin._id);
        const vouchers = {
            voucherCode: admin.vouchers,
            shopCurrency: admin.currency,
            id: admin._id,
            shop: admin.shop,
            communicationDisabled: !commStatus.allowed,
            remainingMinutes: commStatus.remainingMinutes,
        }
        res.status(200).json({
            success: true,
            message: "Vouchers retrieved successfully",
            data: vouchers
        });
    } catch (error) {
        console.error("Error in getVouchersController:", error);
    }
}

// get app status
const getAppStatusController = async (req, res) => {
    try {
        const { shop, adminIdLocal } = req.query;
        // if (!mongoose.Types.ObjectId.isValid(shop)) {
        //     return res.status(400).json({
        //         success: false,
        //         message: "Invalid admin ID"
        //     });
        // }
        if (!shop) {
            return res.status(400).json({
                success: false,
                message: "Shop is required",
            });
        }
        const admin = await shopModel.findOne({ shop: shop });
        if (!admin) {
            return res.status(404).json({
                success: false,
                message: "Admin not found",
            });
        }
        return res.status(200).json({
            success: true,
            message: "App status retrieved successfully",
            data: admin.appEnabled,
            shopId: admin._id,
        });
    } catch (error) {
        console.error("Error in getAppStatusController:", error);
    }
}

const getUserWalletHistroy = async (req, res) => {
    try {
        const { userId, shopId } = req.params;

        if (
            !mongoose.Types.ObjectId.isValid(userId) ||
            !mongoose.Types.ObjectId.isValid(shopId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid ID"
            });
        }

        if (!(await authorizeUserResource(req, res, { userId, shopId }))) return;

        const wallet = await WalletHistory.find({
            userId,
            shop_id: shopId
        })
            .populate("userId", "fullname email")
            .sort({ createdAt: -1 })
            .lean();

        return res.status(200).json({
            success: true,
            data: wallet
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};

const getcallSessionsController = async (req, res) => {
    try {
        const { channelName } = req.query;
        const callSession = await CallSession.findOne({ sessionId: channelName });
        if (!callSession) {
            return res.status(404).json({
                success: false,
                message: "Call session not found"
            });
        }

        if (
            !(await authorizeCallParticipant(req, res, {
                callerId: callSession.callerId,
                receiverId: callSession.receiverId,
                shopId: callSession.shopId,
            }))
        ) {
            return;
        }

        return res.status(200).json({
            success: true,
            data: callSession
        });
    } catch (error) {
        console.error("Error fetching call session:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch call session",
            error: error.message
        });
    }
}

const getUserConversationController = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid ID" });
        }

        const user = await User.findById(id).select("shop_id");
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        if (!(await authorizeUserResource(req, res, { userId: id, shopId: user.shop_id }))) return;

        const conversations = await TransactionHistroy.find({
            $or: [
                { senderId: id },
                { receiverId: id }
            ]
        })
            .populate("senderId", "fullname email")
            .populate("receiverId", "fullname email")
            .sort({ createdAt: -1 })
            .lean();

        // `.lean()` docs are already plain — the previous `.toObject()` needed a
        // full Mongoose document hydrated per row first. Payload is identical.
        const final = conversations.map(c => {
            const consultant =
                c.senderId._id.toString() === id
                    ? c.receiverId
                    : c.senderId;

            return {
                ...c,
                consultant
            };
        });

        res.json({ success: true, data: final });

    } catch (error) {
        return res.status(500).send({ success: false, message: "Somthing went wrong " })
    }
}

module.exports =
{
    getAllUsers,
    getUserById,
    getVouchersController,
    getAppStatusController,
    getUserWalletHistroy,
    getcallSessionsController,
    getUserConversationController
};
