const admin = require("../firebase/firebase");

async function sendCallFCM({
    token,
    callerId,
    callerName,
    channelName,
    callType,
    receiverId,
    shop,
    shopId,
    avatar
}) {
    const message = {
        token,
        data: {
            type: "CALL",
            callerId,
            callerName,
            channelName,
            callType,
            receiverId,
            shop,
            shopId,
            avatar: avatar || "",
        },
        android: {
            priority: "high",
        },
        apns: {
            payload: {
                aps: {
                    contentAvailable: true,
                },
            },
        },
    };
    console.log("message____________call", message)

    await admin.messaging().send(message);
}

module.exports = { sendCallFCM };
