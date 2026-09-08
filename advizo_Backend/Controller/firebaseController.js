const { User } = require("../Modal/userSchema");
const { authorizeUserResource } = require("../Auth/auth");

const firebaseGetToken = async (req, res) => {
    try {
        const { token, userId, shopId } = req.body;

        if (!token || !userId || !shopId) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields"
            });
        }

        if (!(await authorizeUserResource(req, res, { userId, shopId }))) return;

        const user = await User.findOne({ _id: userId, shop_id: shopId });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const existingToken = user.firebaseToken?.token;
        
        await User.updateOne(
            { _id: userId, shop_id: shopId },
            {
                $set: {
                    firebaseToken: {
                        token,
                        updatedAt: new Date(),
                        userAgent: req.headers["user-agent"] || "",
                        browser: req.headers["sec-ch-ua"] || "",
                        os: req.headers["sec-ch-ua-platform"] || "",
                    }
                }
            }
        );

        const message = existingToken 
            ? "Token updated successfully" 
            : "Token created successfully";

        return res.status(200).json({
            success: true,
            message: message,
            token,
            action: existingToken ? "updated" : "created"
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Server error",
            error: error.message
        });
    }
};

module.exports = { firebaseGetToken };
