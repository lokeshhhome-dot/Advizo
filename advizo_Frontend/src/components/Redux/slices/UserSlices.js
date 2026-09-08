import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";


export const fetchStorefrontConsultants = createAsyncThunk(
    "consultants/fetchStorefront",
    async ({ adminIdLocal, authToken }) => {
        const response = await axios.get(
            `${process.env.REACT_APP_BACKEND_HOST}/users/public/find-consultant/${adminIdLocal}`,
            {
                headers: authToken
                    ? { Authorization: `Bearer ${authToken}` }
                    : {},
            }
        );
        return response.data;
    }
);

export const fetchUsers = createAsyncThunk("users/fetch", async () => {
    const response = await axios.get(`${process.env.REACT_APP_BACKEND_HOST}/users/user-details`);
    return response.data;
});

export const fetchUserDetailsByIds = createAsyncThunk("users/fetch-details", async (userId) => {
    const token = localStorage.getItem("token");
    const shopId = localStorage.getItem("shop_o_Identity");

    const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_HOST}/users/shopify/users/${userId}`,
        {
            params: shopId ? { shopId } : undefined,
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
    );
    return response.data;
});

export const fetchVoucherData = createAsyncThunk("users/fetch-voucher-data", async (shopId, token, shop) => {
    const response = await axios.get(`${process.env.REACT_APP_BACKEND_HOST}/users/get/vouchers/${shopId}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
    return response.data.data;
});


const userSlice = createSlice({
    name: "users",
    initialState: {
        consultants: [],
        users: [],
        loading: false,
        error: null,
        userDetails: null,
        voucherData: null,
    },

    extraReducers: (builder) => {
        builder
            .addCase(fetchStorefrontConsultants.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchStorefrontConsultants.fulfilled, (state, action) => {
                state.loading = false;
                state.consultants = action.payload;
            })
            .addCase(fetchStorefrontConsultants.rejected, (state, action) => {
                state.loading = false;
                state.error = action.error.message;
            })
            .addCase(fetchUsers.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchUsers.fulfilled, (state, action) => {
                state.loading = false;
                state.users = action.payload;
            })
            .addCase(fetchUsers.rejected, (state, action) => {
                state.loading = false;
                state.error = action.error.message;
            })
            .addCase(fetchUserDetailsByIds.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchUserDetailsByIds.fulfilled, (state, action) => {
                state.loading = false;
                state.userDetails = action.payload;
            })
            .addCase(fetchUserDetailsByIds.rejected, (state, action) => {
                state.loading = false;
                state.error = action.error.message;
            })
            .addCase(fetchVoucherData.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchVoucherData.fulfilled, (state, action) => {
                state.loading = false;
                state.voucherData = action.payload;
            })
            .addCase(fetchVoucherData.rejected, (state, action) => {
                state.loading = false;
                state.error = action.error.message;
            });
    },
});

export default userSlice.reducer;
