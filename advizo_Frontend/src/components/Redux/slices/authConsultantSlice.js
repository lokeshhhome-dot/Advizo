import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "axios";
import {
  clearConsultantSession,
  getConsultantToken,
  shouldPreserveSessionForCall,
  CONSULTANT_TOKEN_KEY,
} from "../../../utils/consultantAuth";
import { getActiveSession, SESSION_TYPES } from "../../../utils/browserSession";

const getInitialAuthLoading = () => {
  try {
    return Boolean(localStorage.getItem(CONSULTANT_TOKEN_KEY));
  } catch {
    return false;
  }
};

export const verifyToken = createAsyncThunk(
  "auth/verifyToken",
  async (_, { rejectWithValue }) => {
    const token = getConsultantToken();
    if (!token) {
      return rejectWithValue({ reason: "no-token", hardFailure: true });
    }
    // TEMPORARY diagnostics — tracing the login<->dashboard loop. Never logs
    // the token value itself.
    console.log(`[Consultly Auth] protected route pathname = ${window.location.pathname}`);
    console.log(`[Consultly Auth] token exists on dashboard load = ${Boolean(token)}`);
    try {
      const res = await axios.get(
        `${process.env.REACT_APP_BACKEND_HOST}/api-consultant/verify-token`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      console.log(`[Consultly Auth] verify-token status = ${res.status}`);
      // Safety net: only a consultant identity may authenticate this surface.
      // A customer JWT living under the same "token" key must be rejected,
      // otherwise login ↔ dashboard redirect-loop.
      const user = res.data.user;
      if (user?.role && user.role !== "consultant") {
        console.log(`[Consultly Auth] verify-token success = false (role = ${user.role})`);
        return rejectWithValue({ reason: "not-consultant", hardFailure: true });
      }
      console.log(`[Consultly Auth] verify-token success = true`);
      return user;
    } catch (err) {
      // Distinguish "the server says this token is invalid" from "the request
      // never got an answer". A timeout, an offline blip, a CORS hiccup or a
      // 5xx cold start is NOT proof of a bad session and must never be allowed
      // to destroy a working login.
      const status = err?.response?.status;
      console.log(`[Consultly Auth] verify-token status = ${status || "(no response — network/CORS/timeout)"}`);
      console.log(`[Consultly Auth] verify-token success = false`);
      return rejectWithValue({
        reason: status ? `http-${status}` : "network",
        hardFailure: status === 401 || status === 403,
      });
    }
  },
);

/**
 * A rejected verify may only tear down stored credentials when all three hold:
 * the server actually rejected the token, this browser really is in a consultant
 * session (the "token" key is shared with customers), and no call is on screen.
 */
const shouldClearOnVerifyFailure = (payload) => {
  if (payload?.hardFailure === false) return false;
  if (shouldPreserveSessionForCall()) return false;
  return getActiveSession() === SESSION_TYPES.CONSULTANT;
};

const authSlice = createSlice({
  name: "auth",
  initialState: {
    user: null,
    isAuthenticated: false,
    loading: getInitialAuthLoading(),
  },
  reducers: {
    logout: (state) => {
      clearConsultantSession();
      state.user = null;
      state.isAuthenticated = false;
      state.loading = false;
    },
    setAuthChecked: (state) => {
      state.loading = false;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(verifyToken.pending, (state) => {
        state.loading = true;
      })
      .addCase(verifyToken.fulfilled, (state, action) => {
        state.user = action.payload;
        state.isAuthenticated = true;
        state.loading = false;
      })
      .addCase(verifyToken.rejected, (state, action) => {
        if (shouldClearOnVerifyFailure(action.payload)) {
          clearConsultantSession();
        } else {
          console.warn(
            "[auth] verify-token failed without clearing the session:",
            action.payload?.reason || "unknown",
          );
        }
        state.user = null;
        state.isAuthenticated = false;
        state.loading = false;
      });
  },
});

export const { logout, setAuthChecked } = authSlice.actions;
export default authSlice.reducer;
