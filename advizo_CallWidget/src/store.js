import { configureStore } from "@reduxjs/toolkit";
// The EXACT same reducer/thunks the Consultant Dashboard's VideoCallingPage
// uses (createSlice/createAsyncThunk output is plain functions — it does
// not require React or the dashboard's own store to run correctly). This
// gives the widget its own store so the same Agora orchestration logic
// (join/publish/subscribe/leave) can run without duplicating any of it.
import callReducer from "../../advizo_Frontend/src/components/Redux/slices/callSlice";

export const store = configureStore({
  reducer: { call: callReducer },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: false }),
});
