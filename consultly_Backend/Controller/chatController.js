const mongoose = require("mongoose");
const { MessageModal } = require("../Modal/messageSchema");
const { ChatList } = require("../Modal/chatListSchema");
const { authorizeChatParticipant } = require("../Auth/auth");

const getChatHistory = async (request, response) => {
    try {
        const { shopId, consultantId, userId } = request.params;

        if (
            !(await authorizeChatParticipant(request, response, {
                shopId,
                userId,
                consultantId,
            }))
        ) {
            return;
        }

        const chatHistory = await MessageModal.find({
            shop_id: shopId,
            $or: [
                { senderId: userId, receiverId: consultantId },
                { senderId: consultantId, receiverId: userId }
            ]
        }).sort({ timestamp: 1 });

        if (!chatHistory) {
            return response.status(400).json({ message: "Chat history not found" });
        }

        return response.status(200).json({
            success: true,
            message: "Chat history fetched successfully",
            chatHistory
        });

    } catch (error) {
        console.error(error);
        return response.status(500).json({ message: "Server error" });
    }
};


const getUserInRecentChat = async (request, response) => {
    try {
        const { shopId, userId, consultantId } = request.params;

        if (
            !(await authorizeChatParticipant(request, response, {
                shopId,
                userId,
                consultantId,
            }))
        ) {
            return;
        }

        const userInRecentChat = await ChatList.findOne({ shop_id: shopId, senderId: userId, receiverId: consultantId });
        if (!userInRecentChat) {
            return response.status(400).json({ message: "User not found in recent chat" });
        }
        userInRecentChat.isRequest = true;
        await userInRecentChat.save();
        return response.status(200).json({ success: true, message: "User found in recent chat", });
    } catch (error) {
        console.error(error);
        return response.status(500).json({ message: "Server error" });
    }
};

module.exports = { getChatHistory, getUserInRecentChat };
