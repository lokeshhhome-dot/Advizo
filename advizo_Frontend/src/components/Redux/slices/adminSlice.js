import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import axios from 'axios'
import { getAppBridgeToken } from '../../../utils/getAppBridgeToken'




export const fetchAdminDetails = createAsyncThunk("admin/fetchAdminDetails", async ({ adminIdLocal, app }) => {
    const token = await getAppBridgeToken(app);
    const response = await axios.get(`${process.env.REACT_APP_BACKEND_HOST}/admin/admin/${adminIdLocal}`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    })
    return response.data?.data
})

export const fetchActivityHistory = createAsyncThunk("admin/fetchActivityHistory", async ({ adminIdLocal, page, limit, type = 'all', app, searchQuery }) => {
    const token = await getAppBridgeToken(app);
    const response = await axios.get(`${process.env.REACT_APP_BACKEND_HOST}/admin/activity/transactions/${adminIdLocal}`, {
        headers: {
            Authorization: `Bearer ${token}`
        },
        params: {
            page,
            limit,
            type,
            searchQuery
        }
    })
    return response.data
})

export const fetchWalletHistory = createAsyncThunk("admin/fetchWalletHistory", async ({ adminIdLocal, page = 1, limit = 10, app, searchQuery }) => {
    const token = await getAppBridgeToken(app);
    const response = await axios.get(`${process.env.REACT_APP_BACKEND_HOST}/admin/user/consultant/${adminIdLocal}`, {
        headers: {
            Authorization: `Bearer ${token}`
        },
        params: {
            page,
            limit,
            search: searchQuery
        }
    })
    return response.data
})

export const fetchShopAllUsers = createAsyncThunk("admin/fetchShopAllUsers", async ({ adminIdLocal, app }) => {
    const token = await getAppBridgeToken(app);
    const response = await axios.get(`${process.env.REACT_APP_BACKEND_HOST}/admin/shop/all-user/${adminIdLocal}`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    })
    return response.data
})
// ADMIN consultant listing — authenticates with the Shopify App Bridge session token.
export const fetchConsultants = createAsyncThunk("admin/fetchConsultants", async ({ adminIdLocal, app }) => {
    const token = await getAppBridgeToken(app);
    const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_HOST}/admin/api-find-consultant/${adminIdLocal}`,
        token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    );
    return response.data;
})

export const fetchShopAllConsultants = createAsyncThunk("admin/fetchShopAllConsultants", async ({ adminIdLocal, app }) => {
    const token = await getAppBridgeToken(app);
    const response = await axios.get(`${process.env.REACT_APP_BACKEND_HOST}/admin/shop/all-consultant/${adminIdLocal}`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    })
    return response.data
})

// ____________________----- manage app status --------____________________

export const manageAppStatus = createAsyncThunk("admin/manageAppStatus", async ({ adminIdLocal, app, status }) => {
    const token = await getAppBridgeToken(app);
    const response = await axios.post(`${process.env.REACT_APP_BACKEND_HOST}/admin/app-enable-and-disable/${adminIdLocal}`, {
        appStatus: status
    }, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    })
    return response.data
})

//

export const deleteVoucher = createAsyncThunk("admin/deleteVoucher", async ({ adminIdLocal, app, voucherId }) => {
    const token = await getAppBridgeToken(app);
    const response = await axios.delete(`${process.env.REACT_APP_BACKEND_HOST}/admin/voucher-delete/${adminIdLocal}/${voucherId}`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    })
    return response.data
})

export const fetchWithdrawalRequests = createAsyncThunk("admin/fetchWithdrawalRequests", async ({ adminIdLocal, page = 1, limit = 10, app, searchQuery }) => {
    const token = await getAppBridgeToken(app);
    const response = await axios.get(`${process.env.REACT_APP_BACKEND_HOST}/admin/withdrawal-requests/${adminIdLocal}`, {
        headers: {
            Authorization: `Bearer ${token}`
        },
        params: {
            page,
            limit,
            search: searchQuery
        }
    })
    return response.data
})

export const fetchSetupGuideWarning = createAsyncThunk("admin/fetchSetupGuideWarning", async ({ adminIdLocal, app }) => {
    const token = await getAppBridgeToken(app);
    const response = await axios.get(`${process.env.REACT_APP_BACKEND_HOST}/admin/menu/${adminIdLocal}`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    })
    return response.data
})

export const completeWelcome = createAsyncThunk(
    "admin/completeWelcome",
    async ({ adminIdLocal, app }) => {
        const token = await getAppBridgeToken(app);
        const response = await axios.patch(
            `${process.env.REACT_APP_BACKEND_HOST}/admin/shop/welcome-complete/${adminIdLocal}`,
            {},
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            },
        );
        return response.data?.data;
    },
);

export const _PlanDetails  = createAsyncThunk("admin/_PlanDetails", async ({ adminIdLocal, app }) => {
    const token = await getAppBridgeToken(app);
    const response = await axios.get(`${process.env.REACT_APP_BACKEND_HOST}/admin/plan/details/${adminIdLocal}`, {
        headers: {
            Authorization: `Bearer ${token}`
        }
    })
    return response.data
})



const adminSlice = createSlice({
    name: "admin",
    initialState: {
        activityHistory: [],
        walletHistory: [],
        loading: false,
        error: null,
        shopAllUsers: [],
        shopAllConsultants: [],
        consultants: [],
        consultantsLoading: false,
        adminDetails_: [],
        appStatus: null,
        deletedVoucher: null,
        withdrawalRequests: [],
        menuSetupComplete: null,
        planDetails :null
    },
    extraReducers: (builder) => {
        builder
            .addCase(fetchConsultants.pending, (state) => {
                state.consultantsLoading = true;
            })
            .addCase(fetchConsultants.fulfilled, (state, action) => {
                state.consultantsLoading = false;
                state.consultants = action.payload;
            })
            .addCase(fetchConsultants.rejected, (state, action) => {
                state.consultantsLoading = false;
                state.error = action.error.message;
            })
            .addCase(fetchActivityHistory.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchActivityHistory.fulfilled, (state, action) => {
                state.loading = false;
                state.activityHistory = action.payload;
            })
            .addCase(fetchActivityHistory.rejected, (state, action) => {
                state.loading = false;
                state.error = action.error.message;
            })
            .addCase(fetchWalletHistory.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchWalletHistory.fulfilled, (state, action) => {
                state.loading = false;
                state.walletHistory = action.payload;
            })
            .addCase(fetchWalletHistory.rejected, (state, action) => {
                state.loading = false;
                state.error = action.error.message;
            })
            .addCase(fetchShopAllUsers.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchShopAllUsers.fulfilled, (state, action) => {
                state.loading = false;
                state.shopAllUsers = action.payload;
            })
            .addCase(fetchShopAllUsers.rejected, (state, action) => {
                state.loading = false;
                state.error = action.error.message;
            })
            .addCase(fetchShopAllConsultants.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchShopAllConsultants.fulfilled, (state, action) => {
                state.loading = false;
                state.shopAllConsultants = action.payload;
            })
            .addCase(fetchShopAllConsultants.rejected, (state, action) => {
                state.loading = false;
                state.error = action.error.message;
            })
            .addCase(fetchAdminDetails.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchAdminDetails.fulfilled, (state, action) => {
                state.loading = false;
                state.adminDetails_ = action.payload;
            })
            .addCase(fetchAdminDetails.rejected, (state, action) => {
                state.loading = false;
                state.error = action.error.message;
            })
            .addCase(manageAppStatus.pending, (state) => {
                state.loading = true;
            })
            .addCase(manageAppStatus.fulfilled, (state, action) => {
                state.loading = false;
                state.appStatus = action.payload;
            })
            .addCase(manageAppStatus.rejected, (state, action) => {
                state.loading = false;
                state.error = action.error.message;
            })
            .addCase(deleteVoucher.pending, (state) => {
                state.loading = true;
            })
            .addCase(deleteVoucher.fulfilled, (state, action) => {
                state.loading = false;
                state.deletedVoucher = action.payload;
            })
            .addCase(deleteVoucher.rejected, (state, action) => {
                state.loading = false;
                state.error = action.error.message;
            })
            .addCase(fetchWithdrawalRequests.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchWithdrawalRequests.fulfilled, (state, action) => {
                state.loading = false;
                state.withdrawalRequests = action.payload;
            })
            .addCase(fetchWithdrawalRequests.rejected, (state, action) => {
                state.loading = false;
                state.error = action.error.message;
            })
            .addCase(fetchSetupGuideWarning.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchSetupGuideWarning.fulfilled, (state, action) => {
                state.loading = false;
                state.menuSetupComplete = action.payload;
            })
            .addCase(fetchSetupGuideWarning.rejected, (state, action) => {
                state.loading = false;
                state.error = action.error.message;
            })
             .addCase(_PlanDetails.pending, (state) => {
                state.loading = true;
            })
            .addCase(_PlanDetails.fulfilled, (state, action) => {
                state.loading = false;
                state.planDetails = action.payload;
            })
            .addCase(_PlanDetails.rejected, (state, action) => {
                state.loading = false; 
                state.error = action.error.message;
            })
            .addCase(completeWelcome.fulfilled, (state, action) => {
                if (state.adminDetails_ && action.payload) {
                    state.adminDetails_ = {
                        ...state.adminDetails_,
                        shopOwnerName: action.payload.shopOwnerName,
                        shopName: action.payload.shopName,
                        isWelcomeShown: true,
                    };
                }
            })
    }
});
export default adminSlice.reducer;