const openTokenWindow = ({userId, shopId}) => {
    const tokenWindowUrl = `${window.location.origin}/fcm-token?userId=${encodeURIComponent(
        userId
    )}&shopId=${encodeURIComponent(shopId)}`;

    window.open(
        tokenWindowUrl,
        "fcmTokenWindow",
        "width=600,height=500,scrollbars=yes"
    );
};

export default openTokenWindow;