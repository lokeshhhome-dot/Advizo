import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";

// API call using createAsyncThunk
// NOTE: the ADMIN consultant listing thunk (fetchConsultants) lives in
// adminSlice.js — this slice only serves storefront/consultant surfaces.

// STOREFRONT (customer) site: public listing endpoint (no Shopify token needed).


/**
 * get consultant with shop id and consultant id
 */
export const fetchConsultantById = createAsyncThunk("consultants/fetchById", async ({ shop_id, consultant_id,token, shop }) => {
    const response = await axios.get(`${process.env.REACT_APP_BACKEND_HOST}/api-consultant/consultant-by-shop-id-and-consultant-id/${shop_id}/${consultant_id}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    },);
    return response.data;
});


/**
 * get chat history with shop id and consultant id
 */
export const fetchChatHistory = createAsyncThunk("consultants/fetchChatHistory", async ({ shopId, userId, consultantId }) => {
    const response = await axios.get(`${process.env.REACT_APP_BACKEND_HOST}/chat/get/chat-history/${shopId}/${userId}/${consultantId}`);
    return response.data;
});

export const deleteConsultantById = createAsyncThunk("consultants/delete", async (id) => {
    const response = await axios.delete(`${process.env.REACT_APP_BACKEND_HOST}/api-consultant/delete-consultant/${id}`);
    return response.data;
});

export const updateUserRequestById = createAsyncThunk("consultants/updateUserRequestById", async ({ shopId, userId, consultantId, token, shop    }) => {
    const response = await axios.put(`${process.env.REACT_APP_BACKEND_HOST}/chat/update-user-request/${shopId}/${userId}/${consultantId}`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    },);
    return response.data;
});


const consultantSlice = createSlice({
    name: "consultants",
    initialState: {
        consultantOverview: null,
        chatHistory: null,
        loading: false,
        error: null,
        deletedConsultant: null,
        userInRequest: null,
    },

    extraReducers: (builder) => {
        builder
           
            .addCase(deleteConsultantById.pending, (state) => {
                state.loading = true;
            })
            .addCase(deleteConsultantById.fulfilled, (state, action) => {
                state.loading = false;
                state.deletedConsultant = action.payload;
            })
            .addCase(deleteConsultantById.rejected, (state, action) => {
                state.loading = false;
                state.error = action.error.message;
            })
            .addCase(fetchConsultantById.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchConsultantById.fulfilled, (state, action) => {
                state.loading = false;
                state.consultantOverview = action.payload;
            })
            .addCase(fetchConsultantById.rejected, (state, action) => {
                state.loading = false;
                state.error = action.error.message;
            })
            .addCase(fetchChatHistory.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchChatHistory.fulfilled, (state, action) => {
                state.loading = false;
                state.chatHistory = action.payload;
            })
            .addCase(fetchChatHistory.rejected, (state, action) => {
                state.loading = false;
                state.error = action.error.message;
            })
            .addCase(updateUserRequestById.pending, (state) => {
                state.loading = true;
            })
            .addCase(updateUserRequestById.fulfilled, (state, action) => {
                state.loading = false;
                state.userInRequest = action.payload;
            })
            .addCase(updateUserRequestById.rejected, (state, action) => {
                state.loading = false;
                state.error = action.error.message;
            });
    },
});

export default consultantSlice.reducer;
