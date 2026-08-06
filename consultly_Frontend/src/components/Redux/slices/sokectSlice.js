
import { createSlice } from "@reduxjs/toolkit";

const getPersistedChatTimer = () => {
    if (typeof window === "undefined") return null;
    try {
        const raw = localStorage.getItem("chatTimer");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.startTime || !parsed.transactionId) return null;
        return {
            transactionId: parsed.transactionId,
            startTime: parsed.startTime,
            isRunning: Boolean(parsed.isRunning),
            userId: parsed.userId || null,
            shopId: parsed.shopId || null,
            consultantId: parsed.consultantId || null,
        };
    } catch (error) {
        return null;
    }
};

const persistedChatTimer = getPersistedChatTimer();

const socketSlice = createSlice({
    name: "socket",
    initialState: {
        isConnected: false,
        activeUsers: [],
        messages: [],
        insufficientBalance: null,
        isChatAccepted: null,
        chatTimer: persistedChatTimer || {
            transactionId: null,
            startTime: null,
            isRunning: false,
            userId: null,
            shopId: null,
            consultantId: null,
        },
        autoChatEnded: null,
        incomingCall: null,
        callAccepted: null,
        callEnded: null,
        callRejected: null,
        confirmChat: null,
        
    },
    reducers: {
        setConnected: (state, action) => {
            state.isConnected = action.payload;
        },
        setActiveUsers: (state, action) => {
            state.activeUsers = action.payload;
        },
        addMessage: (state, action) => {
            state.messages.push(action.payload);
        },
        markMessagesSeen: (state, action) => {
            const { senderId } = action.payload;
            state.messages = state.messages.map((msg) =>
                msg.senderId === senderId ? { ...msg, seen: true } : msg
            );
        },
        setInsufficientBalanceError: (state, action) => {
            state.insufficientBalance = action.payload;
        },
        setChatAccepted: (state, action) => {
            state.isChatAccepted = action.payload;
        },
        setChatTimerStarted: (state, action) => {
            Object.assign(state.chatTimer, {
                transactionId: action.payload.transactionId,
                startTime: action.payload.startTime,
                isRunning: true,
                userId: action.payload.userId,
                shopId: action.payload.shopId,
                consultantId: action.payload.consultantId,
            });
            try {
                localStorage.setItem("chatTimer", JSON.stringify(state.chatTimer));
            } catch (error) {
                // ignore storage errors
            }
        },
        setChatTimerStopped: (state) => {
            state.chatTimer = {
                transactionId: null,
                startTime: null,
                isRunning: false,
                userId: null,
                shopId: null,
                consultantId: null,
            };
            try {
                localStorage.removeItem("chatTimer");
            } catch (error) {
                // ignore storage errors
            }
        },
        setAutoChatEnded: (state, action) => {
            state.autoChatEnded = action.payload;
        },
        setIncomingCall: (state, action) => {
            state.incomingCall = action.payload;
        },
        setCallAccepted: (state, action) => {
            state.callAccepted = action.payload;
            localStorage.setItem("callAccepted", JSON.stringify(state.callAccepted));
        },
        setCallEnded: (state, action) => {
            state.callEnded = action.payload;
        },
        setCallRejected: (state, action) => {
            state.callRejected = action.payload;
            if (state.callRejected) {
                localStorage.setItem("callRejected", true);
            }
        },
        clearMessages: (state) => {
            state.messages = [];
        },
        setConfirmChat: (state, action) => {
            state.confirmChat = action.payload;
        },
        // connectSocket is a no-op reducer for compatibility
        // Socket connection is handled in sokectProvider.js
        connectSocket: (state, action) => {
            // No state change needed - connection is handled in provider
            // This action exists for backward compatibility
        },
    },
});

export const {
    setConnected,
    setActiveUsers,
    addMessage,
    markMessagesSeen,
    setInsufficientBalanceError,
    setChatAccepted,
    setChatTimerStarted,
    setChatTimerStopped,
    setAutoChatEnded,
    setIncomingCall,
    setCallAccepted,
    setCallEnded,
    setCallRejected,
    clearMessages,
    connectSocket,
    setConfirmChat,
} = socketSlice.actions;

export default socketSlice.reducer;
