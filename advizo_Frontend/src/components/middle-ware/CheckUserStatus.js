import axios from "axios";

export const checkUserStatus = async (receiverId, shop) => {
  try {
    const response = await axios.get(
      `${process.env.REACT_APP_BACKEND_HOST}/users/check/user/available/${receiverId}`,
      {
        params: {
          shop: shop,
        },
      },
    );
    return response.data;
  } catch (error) {
    if (error.response?.data) {
      return {
        ...error.response.data,
        statusCode: error.response.status,
      };
    }
    return {
      success: false,
      message: "Unable to check user status",
    };
  }
};
