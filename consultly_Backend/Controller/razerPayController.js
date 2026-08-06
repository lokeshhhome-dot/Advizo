
const Razorpay = require('razorpay');
const crypto = require('crypto');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { User } = require('../Modal/userSchema');
const { WalletHistory } = require('../Modal/walletHistory');
const { resolveAuthenticatedUserId } = require('../Auth/auth');

dotenv.config();

const MIN_RECHARGE_INR = Number(process.env.RAZORPAY_MIN_AMOUNT_INR || 1);
const MAX_RECHARGE_INR = Number(process.env.RAZORPAY_MAX_AMOUNT_INR || 100000);

let razorpayClient = null;

function getRazorpayCredentials() {
    const keyId = process.env.RZP_KEY_ID;
    const keySecret = process.env.RZP_KEY_SECRET;
    if (!keyId || !keySecret) {
        return null;
    }
    return { keyId, keySecret };
}

function getRazorpayClient() {
    const credentials = getRazorpayCredentials();
    if (!credentials) {
        return null;
    }

    if (!razorpayClient) {
        razorpayClient = new Razorpay({
            key_id: credentials.keyId,
            key_secret: credentials.keySecret,
        });
    }

    return razorpayClient;
}

function ensureRazorpayConfigured(res) {
    if (!getRazorpayCredentials()) {
        res.status(503).json({
            success: false,
            message:
                'Razorpay is not configured on this server. Set RZP_KEY_ID and RZP_KEY_SECRET in the environment.',
        });
        return false;
    }
    return true;
}

function verifyRazorpaySignature(orderId, paymentId, signature) {
    const keySecret = getRazorpayCredentials()?.keySecret;
    if (!keySecret) {
        return false;
    }

    const expected = crypto
        .createHmac('sha256', keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

    if (!signature || typeof signature !== 'string') {
        return false;
    }

    const expectedBuffer = Buffer.from(expected, 'utf8');
    const receivedBuffer = Buffer.from(signature, 'utf8');

    if (expectedBuffer.length !== receivedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function parseRechargeAmount(amountINR) {
    const amount = Number(amountINR);
    if (!Number.isFinite(amount) || amount <= 0) {
        return null;
    }

    if (amount < MIN_RECHARGE_INR || amount > MAX_RECHARGE_INR) {
        return null;
    }

    return Math.round(amount * 100) / 100;
}

const createOrderController = async (req, res) => {
    try {
        if (!ensureRazorpayConfigured(res)) return;

        const razorpay = getRazorpayClient();
        const userId = await resolveAuthenticatedUserId(req);
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required',
            });
        }

        const amountINR = parseRechargeAmount(req.body.amountINR);
        if (!amountINR) {
            return res.status(400).json({
                success: false,
                message: `Invalid amount. Allowed range is ${MIN_RECHARGE_INR} to ${MAX_RECHARGE_INR} INR.`,
            });
        }

        const user = await User.findById(userId).select('_id shop_id');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        if (!user.shop_id || !mongoose.Types.ObjectId.isValid(String(user.shop_id))) {
            return res.status(400).json({
                success: false,
                message: 'User shop is not configured for wallet recharge',
            });
        }

        const order = await razorpay.orders.create({
            amount: Math.round(amountINR * 100),
            currency: 'INR',
            receipt: `wallet_${userId}_${Date.now()}`,
            notes: {
                userId: String(userId),
                shopId: String(user.shop_id),
            },
        });

        await WalletHistory.create({
            userId,
            shop_id: user.shop_id,
            amount: amountINR,
            currency: 'INR',
            transactionType: 'recharge',
            referenceType: 'recharge',
            direction: 'credit',
            status: 'pending',
            description: 'Razorpay wallet recharge',
            razorpayOrderId: order.id,
        });

        res.json({ success: true, order });
    } catch (err) {
        if (err?.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'Duplicate Razorpay order request',
            });
        }

        res.status(500).json({ success: false, error: err.message });
    }
};

/**
 * Verify Payment & Add Wallet Balance
 * POST /api/razerpay-create-order/verify-payment
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * Auth: Bearer JWT (user id taken from token, never from body)
 */
const verifyPaymentController = async (req, res) => {
    const session = await mongoose.startSession();

    try {
        if (!ensureRazorpayConfigured(res)) return;

        const razorpay = getRazorpayClient();
        const userId = await resolveAuthenticatedUserId(req);
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required',
            });
        }

        const {
            razorpay_order_id: razorpayOrderId,
            razorpay_payment_id: razorpayPaymentId,
            razorpay_signature: razorpaySignature,
        } = req.body;

        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
            return res.status(400).json({
                success: false,
                message: 'Missing Razorpay verification fields',
            });
        }

        const existingSuccess = await WalletHistory.findOne({
            razorpayPaymentId: razorpayPaymentId,
            status: 'success',
        }).select('_id userId amount');

        if (existingSuccess) {
            if (String(existingSuccess.userId) !== String(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Payment already processed for another user',
                });
            }

            return res.json({
                success: true,
                message: 'Wallet recharged successfully',
                idempotent: true,
                amountINR: existingSuccess.amount,
            });
        }

        if (!verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid signature',
            });
        }

        const pendingTx = await WalletHistory.findOne({
            razorpayOrderId: razorpayOrderId,
            userId,
            status: 'pending',
            transactionType: 'recharge',
        });

        if (!pendingTx) {
            return res.status(400).json({
                success: false,
                message: 'No pending recharge found for this order',
            });
        }

        const [order, payment] = await Promise.all([
            razorpay.orders.fetch(razorpayOrderId),
            razorpay.payments.fetch(razorpayPaymentId),
        ]);

        if (payment.order_id !== razorpayOrderId) {
            return res.status(400).json({
                success: false,
                message: 'Payment does not belong to this order',
            });
        }

        if (payment.status !== 'captured') {
            return res.status(400).json({
                success: false,
                message: 'Payment is not captured',
            });
        }

        const verifiedAmountINR = Number(order.amount) / 100;
        const pendingAmountINR = Number(pendingTx.amount);

        if (
            !Number.isFinite(verifiedAmountINR) ||
            Math.abs(verifiedAmountINR - pendingAmountINR) > 0.01
        ) {
            await WalletHistory.findByIdAndUpdate(pendingTx._id, {
                status: 'failed',
                description: 'Razorpay amount mismatch during verification',
            });

            return res.status(400).json({
                success: false,
                message: 'Verified payment amount does not match order',
            });
        }

        if (order.status !== 'paid') {
            return res.status(400).json({
                success: false,
                message: 'Order is not paid',
            });
        }

        session.startTransaction();

        const lockedTx = await WalletHistory.findOneAndUpdate(
            {
                _id: pendingTx._id,
                userId,
                status: 'pending',
                razorpayOrderId: razorpayOrderId,
            },
            {
                $set: {
                    status: 'success',
                    amount: verifiedAmountINR,
                    razorpayPaymentId: razorpayPaymentId,
                    description: 'Razorpay wallet recharge',
                },
            },
            { session, new: true }
        );

        if (!lockedTx) {
            await session.abortTransaction();
            const replay = await WalletHistory.findOne({
                razorpayPaymentId: razorpayPaymentId,
                status: 'success',
            }).select('userId amount');

            if (replay && String(replay.userId) === String(userId)) {
                return res.json({
                    success: true,
                    message: 'Wallet recharged successfully',
                    idempotent: true,
                    amountINR: replay.amount,
                });
            }

            return res.status(409).json({
                success: false,
                message: 'Payment verification already in progress or completed',
            });
        }

        const walletUpdate = await User.findOneAndUpdate(
            { _id: userId },
            { $inc: { walletBalance: verifiedAmountINR } },
            { new: true, session }
        );

        if (!walletUpdate) {
            throw new Error('User not found during wallet update');
        }

        await session.commitTransaction();

        return res.json({
            success: true,
            message: 'Wallet recharged successfully',
            amountINR: verifiedAmountINR,
            walletBalance: walletUpdate.walletBalance,
        });
    } catch (err) {
        await session.abortTransaction().catch(() => {});

        if (err?.code === 11000) {
            const replay = await WalletHistory.findOne({
                razorpayPaymentId: req.body?.razorpay_payment_id,
                status: 'success',
            }).select('userId amount');

            if (replay && String(replay.userId) === String(await resolveAuthenticatedUserId(req))) {
                return res.json({
                    success: true,
                    message: 'Wallet recharged successfully',
                    idempotent: true,
                    amountINR: replay.amount,
                });
            }
        }

        res.status(500).json({ success: false, error: err.message });
    } finally {
        session.endSession();
    }
};


module.exports = { createOrderController, verifyPaymentController };
