import { configureStore } from "@reduxjs/toolkit";
import userReducer from "../slices/UserSlices";
import consultantReducer from "../slices/ConsultantSlices";
import socketReducer from "../slices/sokectSlice";
import callReducer from "../slices/callSlice";
import userBalanceSlice from "../slices/UserSlices";
import adminReducer from "../slices/adminSlice";
import authConsultantReducer from "../slices/authConsultantSlice";

export const store = configureStore({
    reducer: {
        users: userReducer,
        consultants: consultantReducer,
        socket: socketReducer,
        call: callReducer,
        userBalance: userBalanceSlice,
        admin: adminReducer,
        authConsultant: authConsultantReducer,
        // deletedConsultant: deletedConsultantReducer,    

    },  
});
