const { shopModel } = require("../Modal/shopify");
const mongoose = require("mongoose");
const axios = require("axios");
const { ReachargeTransactionHistroy } = require("../Modal/reachargeTransactionHistroy");
const { User } = require("../Modal/userSchema");
const { WalletHistory } = require("../Modal/walletHistory");
const { authorizeUserResource } = require("../Auth/auth");
const { getShopAccessToken } = require("../Utils/shopifyToken");

/**
 * Create Shopify Draft Order (Latest GraphQL version)
 * API: POST /api/draft-order/create-draft-order
 * Body: { shop, amount, title, userId }
 */


// Core recharge logic, parametrized by an already-authorized userId and an
// already-resolved shop doc — reused by both the Bearer-token route below
// (createDraftOrder, used by the now-unreachable React app) and the
// App-Proxy storefront route (proxyWalletRechargeJson in
// shopifyController.js, used by the customer-facing My Profile Theme
// Extension block), so the actual GraphQL draft-order creation only exists
// once. Callers are responsible for authorizing userId before calling this.
const createRechargeDraftOrderCore = async ({ shop, shopAccessToken, userId, amount, title }, res) => {
    try {
        let customerId = null;
        const user = await User.findById(userId).select("shopifyCustomerId");
        if (user) {
            customerId = user.shopifyCustomerId;
        }

        const accessToken = await getShopAccessToken(shopAccessToken);
        const transaction_ = await WalletHistory.create({
            userId,
            shop_id: shopAccessToken._id,
            currency: shopAccessToken?.currency,
            amount: 0,
            referenceType: "recharge",
            transactionType: "recharge",
            direction: "credit",
            status: "pending"
        });
        await transaction_.save();


        const response = await axios.post(
            `https://${shop}/admin/api/2026-07/graphql.json`,
            {
                query: `
                    mutation draftOrderCreate($input: DraftOrderInput!) {
                        draftOrderCreate(input: $input) {
                        draftOrder {
                            id
                            name
                            invoiceUrl
                            totalPriceSet {
                            shopMoney {
                                amount
                                currencyCode
                            }
                            }
                        }
                        userErrors {
                            field
                            message
                        }
                        }
                    }
                    `,
                variables: {
                    input: {
                        lineItems: [
                            {
                                title: title || "Consultation Fee",
                                quantity: 1,
                                originalUnitPrice: amount
                            }
                        ],
                        note: "User wallet  payment from talk to consultant ",
                        customAttributes: [
                            { key: "app_user_id", value: String(userId) },
                            { key: "customer_id", value: String(customerId) },
                            { key: "transaction_id", value: String(transaction_._id) },
                            { key: "shop_id", value: String(shopAccessToken._id) },
                        ]
                    }
                }
            },
            {
                headers: {
                    "X-Shopify-Access-Token": accessToken,
                    "Content-Type": "application/json"
                }
            }
        );

        const result = response.data?.data?.draftOrderCreate;


        if (!result) {
            return res.status(500).json({
                success: false,
                message: "Failed to create draft order"
            });
        }

        if (result.userErrors && result.userErrors.length) {
            return res.status(400).json({
                success: false,
                message: "Draft order creation failed",
                errors: result.userErrors
            });
        }

        const draftOrder = result.draftOrder;
        const draftOrderId = draftOrder?.id.split("/").pop();

        await WalletHistory.findByIdAndUpdate(transaction_._id, {
            draftOrderId: draftOrderId,
            invoiceUrl: draftOrder.invoiceUrl,

        });

        console.log("draftOrder", draftOrder)
        return res.status(200).json({
            success: true,
            invoiceUrl: draftOrder?.invoiceUrl || null,
            draftOrderId: draftOrder?.id || null,
            name: draftOrder?.name || null,
            totalPrice: draftOrder?.totalPriceSet?.shopMoney || null
        });
    } catch (error) {
        console.log(
            "createDraftOrder error:",
            error.response?.data || error.message
        );
        res.status(500).json({
            success: false,
            message: "Server error while creating draft order"
        });
    }
};

// Bearer-token entry point — unchanged validation/behavior, now delegating
// the actual draft-order creation to the shared core above.
const createDraftOrder = async (req, res) => {
    try {
        const { shop, amount, title, userId } = req.body;

        if (!amount || !title || !userId) {
            return res
                .status(400)
                .json({ success: false, message: "All fields are required" });
        }

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res
                .status(400)
                .json({ success: false, message: "Invalid user ID" });
        }

        const shopAccessToken = await shopModel.findOne({ shop });
        if (!shopAccessToken) {
            return res
                .status(400)
                .json({ success: false, message: "Invalid shop" });
        }

        if (
            !(await authorizeUserResource(req, res, {
                userId,
                shopId: shopAccessToken._id,
            }))
        ) {
            return;
        }

        return createRechargeDraftOrderCore({ shop, shopAccessToken, userId, amount, title }, res);
    } catch (error) {
        console.log("createDraftOrder error:", error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: "Server error while creating draft order"
        });
    }
};

module.exports = { createDraftOrder, createRechargeDraftOrderCore };
