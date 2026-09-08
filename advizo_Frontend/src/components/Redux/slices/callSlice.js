import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import AgoraRTC from "agora-rtc-sdk-ng";

const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

// 🔊 MIC CONTROL HELPERS

export const enableMic = async () => {
    if (!localAudioTrack) {
        localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        // await localAudioTrack.setEnabled(false)
        await client.publish([localAudioTrack]);
    } else {
        localAudioTrack.setEnabled(true);
    }
};

export const disableMic = async () => {
    if (localAudioTrack) {
        await client.unpublish([localAudioTrack]);
        localAudioTrack.stop();
        localAudioTrack.close();
        localAudioTrack = null;
    }
};


let localAudioTrack = null;
let localVideoTrack = null;
let remoteAudioTrack = null;
let remoteVideoTrack = null;

// Export functions to get tracks for video rendering
export const getLocalVideoTrack = () => localVideoTrack;
export const getRemoteVideoTrack = () => remoteVideoTrack;
// Read-only handle for output-device (speaker) selection — Agora's
// IRemoteAudioTrack exposes setPlaybackDevice(deviceId) on browsers that
// support it; nothing here changes how the track itself is created/played.
export const getRemoteAudioTrack = () => remoteAudioTrack;

// Read-only handle on the Agora client for observers (network-quality monitor).
// Callers must only ever subscribe to events / read stats through this — the
// call lifecycle stays owned by this module.
export const getAgoraClient = () => client;

// 🎥 CAMERA SWITCH HELPERS (additive)
//
// These never join/leave the channel, never unpublish and never recreate the
// call. They swap the capture device underneath the *already published* video
// track, so the remote peer's subscription — and therefore audio, timers and
// billing — is completely untouched.

// Matches the capture profile the call already publishes, so a switched-to
// camera does not change the resolution the remote peer receives.
const CAMERA_SWITCH_CONSTRAINTS = {
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 15 },
};

// Which physical camera the published track is currently capturing from.
export const getLocalCameraDeviceId = () => {
    try {
        return (
            localVideoTrack?.getMediaStreamTrack?.()?.getSettings?.()
                ?.deviceId || null
        );
    } catch (err) {
        return null;
    }
};

// Re-attach the (unchanged) track to the preview element after a device swap.
const replayLocalVideo = () => {
    try {
        const element = document.querySelector("[data-local-video]");
        if (element && localVideoTrack) localVideoTrack.play(element);
    } catch (err) {
        console.warn("Local preview re-attach failed:", err?.message);
    }
};

// Raw camera capture used only by the fallback path. Tries the exact device
// first, then the facing direction (iOS Safari rotates deviceIds between
// getUserMedia calls, so an id alone is not reliable there).
const openRawCameraTrack = async ({ deviceId, facingMode }) => {
    if (!navigator?.mediaDevices?.getUserMedia) {
        throw new Error("Camera access is not supported in this browser");
    }
    const attempts = [];
    if (deviceId) attempts.push({ deviceId: { exact: deviceId } });
    if (facingMode) attempts.push({ facingMode: { exact: facingMode } });
    if (facingMode) attempts.push({ facingMode });

    let lastError = null;
    for (const video of attempts) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { ...CAMERA_SWITCH_CONSTRAINTS, ...video },
                audio: false,
            });
            const [track] = stream.getVideoTracks();
            if (track) return track;
            stream.getTracks().forEach((t) => t.stop());
        } catch (err) {
            lastError = err;
        }
    }
    throw lastError || new Error("No usable camera found");
};

/**
 * Point the live video track at another camera.
 *
 * @param {{deviceId?: string, facingMode?: string}} target
 * @returns {Promise<{deviceId: string|null, method: string}>}
 * Rejects (leaving the current camera running and published) when the switch
 * is not possible — the caller shows a toast and the call carries on.
 */
export const switchCamera = async (target = {}) => {
    if (!localVideoTrack) throw new Error("Camera is not active");

    // Preferred path: Agora reopens the capture device on the same track
    // object, so the publication, its ID and its enabled state all survive.
    if (target.deviceId && typeof localVideoTrack.setDevice === "function") {
        try {
            await localVideoTrack.setDevice(target.deviceId);
            replayLocalVideo();
            return { deviceId: target.deviceId, method: "setDevice" };
        } catch (err) {
            console.warn(
                "setDevice failed, falling back to track replacement:",
                err?.message,
            );
        }
    }

    // Fallback: acquire the new camera FIRST, then hand its MediaStreamTrack to
    // the existing Agora track. If acquisition fails we never got as far as
    // disturbing the current one. stopOldTrack=true releases the old camera, so
    // no device handle leaks.
    if (typeof localVideoTrack.replaceTrack !== "function") {
        throw new Error("Camera switching is not supported in this browser");
    }
    const rawTrack = await openRawCameraTrack(target);
    try {
        await localVideoTrack.replaceTrack(rawTrack, true);
    } catch (err) {
        rawTrack.stop();
        throw err;
    }
    replayLocalVideo();
    return { deviceId: target.deviceId || null, method: "replaceTrack" };
};

// Retry remote audio playback from inside a user gesture (Safari unlock).
export const playRemoteAudio = () => {
    try {
        remoteAudioTrack?.play();
        return true;
    } catch (err) {
        console.warn("Remote audio retry failed:", err?.message);
        return false;
    }
};
let userLeftListenerAdded = false;
let callConnectedEmitted = false; // Track if call-connected event has been emitted
let timerStarted = false; // Track if timer start event has been emitted


const checkAndEmitCallConnected = () => {
    if (
        client.connectionState === "CONNECTED" &&
        client.remoteUsers.length > 0 &&
        !callConnectedEmitted
    ) {
        callConnectedEmitted = true;

        window.dispatchEvent(
            new CustomEvent("call-connected", {
                detail: {
                    at: Date.now(),
                    remoteUid: client.remoteUsers[0]?.uid
                }
            })
        );

    }
};

// Timer start function - fires when both users join
const tryStartTimer = () => {
    if (
        !timerStarted &&
        client.connectionState === "CONNECTED" &&
        client.remoteUsers.length > 0
    ) {
        timerStarted = true;


        window.dispatchEvent(
            new CustomEvent("call-timer-start", {
                detail: {
                    startedAt: Date.now(),
                    remoteUid: client.remoteUsers[0]?.uid
                }
            })
        );
    }
};


export const startCall = createAsyncThunk(
    "call/startCall",
    async ({ token, channel, uid, appId, callType = "voice" }, { rejectWithValue }) => {
        try {
            const numericUid = typeof uid === 'string' ? parseInt(uid) : uid;
            const agoraAppId = appId || process.env.REACT_APP_AGORA_APP_ID;
            if (!agoraAppId) {
                throw new Error("Agora App ID is required");
            }

            if (!token) {
                throw new Error("Token is required");
            }

            if (!channel) {
                throw new Error("Channel name is required");
            }

            // Leave existing connection if any
            if (client.connectionState !== "DISCONNECTED" && client.connectionState !== "DISCONNECTING") {
                try {
                    await client.leave();
                } catch (leaveError) {
                    console.warn("Error leaving previous connection:", leaveError);
                }
            }


            try {
                await client.join(agoraAppId, channel, token, numericUid);
              
            } catch (joinError) {
                console.error("Failed to join channel:", joinError);
                throw new Error(`Failed to join channel: ${joinError.message}`);
            }
            // ✅ JOIN hone ke baad hi listener lagana zaroori hai
            if (!userLeftListenerAdded) {
                client.on("user-left", (user, reason) => {

                    // Remote tracks cleanup
                    remoteAudioTrack?.stop();
                    remoteAudioTrack = null;

                    remoteVideoTrack?.stop();
                    remoteVideoTrack = null;

                    // 🔥 React ko inform karo
                    window.dispatchEvent(
                        new CustomEvent("remote-user-left", {
                            detail: { uid: user.uid, reason }
                        })
                    );
                });

                userLeftListenerAdded = true;
            }


            // Create and publish tracks based on call type
            if (callType === "video") {
                try {
                    // Try to create both audio and video tracks
                    try {
                        [localAudioTrack, localVideoTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
                    } catch (audioError) {
                        // If audio device not found, try creating only video track
                        if (audioError.code === 'DEVICE_NOT_FOUND' || audioError.message?.includes('device not found')) {
                            console.warn("Audio device not found, continuing with video only:", audioError.message);
                            try {
                                localVideoTrack = await AgoraRTC.createCameraVideoTrack({
                                    encoderConfig: {
                                        width: 640,
                                        height: 480,
                                        frameRate: 15,
                                        bitrateMin: 400,
                                        bitrateMax: 800
                                    }
                                });
                            } catch (videoError) {
                                console.error("Failed to create video track:", videoError);
                                throw videoError;
                            }
                        } else {
                            throw audioError;
                        }
                    }

                    // Video call: default camera OFF and mic OFF; user turns on when ready
                    if (localAudioTrack) localAudioTrack.setEnabled(false);
                    if (localVideoTrack) localVideoTrack.setEnabled(false);

                    // Publish available tracks
                    const tracksToPublish = [localAudioTrack, localVideoTrack].filter(Boolean);
                    if (tracksToPublish.length > 0) {
                        await client.publish(tracksToPublish);
                      
                    } else {
                        console.warn("No tracks available to publish");
                    }

                    // Try to play local video immediately if element exists - Multiple attempts
                    if (localVideoTrack) {
                        const playLocalVideo = () => {
                            const localVideoElement = document.querySelector('[data-local-video]');
                            if (localVideoElement && localVideoTrack) {
                                localVideoTrack.play(localVideoElement).then(() => {
                                }).catch(err => {
                                    console.error("Error playing local video:", err);
                                });
                            }
                        };

                        // Try multiple times with delays
                        setTimeout(playLocalVideo, 100);
                        setTimeout(playLocalVideo, 500);
                        setTimeout(playLocalVideo, 1000);

                        // Dispatch event for component to handle
                        window.dispatchEvent(new Event('local-video-ready'));
                    }
                } catch (trackError) {
                    console.error("Error creating/publishing video tracks:", trackError);
                    // Don't throw error - allow call to continue even without local tracks
                    // Remote user can still join and timer should start
                    console.warn("Continuing call without local tracks due to device error");
                }
            } else {
                try {
                    localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();

                    // Start muted (matches initialState.muted: true); user unmutes to enable
                    if (localAudioTrack) localAudioTrack.setEnabled(false);

                    await client.publish([localAudioTrack]);
                  
                } catch (trackError) {
                    // Handle device not found error gracefully
                    if (trackError.code === 'DEVICE_NOT_FOUND' || trackError.message?.includes('device not found')) {
                        console.warn("Audio device not found, continuing call without local audio:", trackError.message);
                        // Don't throw error - allow call to continue
                        // User can still receive remote audio and timer should start
                    } else {
                        console.error("Error creating/publishing audio track:", trackError);
                        // For other errors, still don't throw - allow call to continue
                        console.warn("Continuing call despite audio track error");
                    }
                }
            }

            // Verify tracks are published (default: mic and camera off for video call)
            const publishedTracks = client.localTracks;

           

            // Setup event listeners for remote users
            const handleUserPublished = async (user, mediaType) => {

                try {
                    if (mediaType === "audio") {
                        remoteAudioTrack = await client.subscribe(user, mediaType);
                        try {
                            await remoteAudioTrack.play();
                        } catch (playErr) {
                            // Safari autoplay policy: audio needs a user
                            // gesture. Tell the call UI to show a tap-to-
                            // enable button instead of failing silently.
                            console.warn("Remote audio autoplay blocked:", playErr?.message);
                            window.dispatchEvent(new Event("remote-audio-blocked"));
                        }
                    } else if (mediaType === "video") {
                        remoteVideoTrack = await client.subscribe(user, mediaType);

                        // Try to play immediately and also dispatch event
                        const playRemoteVideo = () => {
                            const remoteVideoElement = document.querySelector('[data-remote-video]');
                            if (remoteVideoElement && remoteVideoTrack) {
                                remoteVideoTrack.play(remoteVideoElement, {
                                    fit: "contain"   // 🔥 NO ZOOM
                                }).then(() => {
                                    console.log("Playing remote video (no zoom)");
                                }).catch(err => {
                                    console.error("Error playing remote video:", err);
                                });
                            }
                        };

                        // Try immediately
                        setTimeout(playRemoteVideo, 100);

                        // Also try after a delay
                        setTimeout(playRemoteVideo, 500);
                        setTimeout(playRemoteVideo, 1000);

                        // Dispatch custom event to notify component
                        window.dispatchEvent(new Event('remote-video-ready'));
                    }
                } catch (error) {
                    console.error(`Error handling remote ${mediaType}:`, error);
                }
            };


            client.on("user-joined", (user) => {
                checkAndEmitCallConnected();
                tryStartTimer(); // Start timer when both users join
                // Receiver refresh ke baad re-join par caller ko pata chale, call end na kare
                window.dispatchEvent(new CustomEvent("remote-user-rejoined", { detail: { uid: user.uid } }));
            });

            // Listen for connection state changes
            client.on("connection-state-change", (curState, revState) => {
                checkAndEmitCallConnected();
                tryStartTimer(); // Start timer when connection state changes to CONNECTED
            });

            const handleUserUnpublished = async (user, mediaType) => {


                if (mediaType === "audio") {
                    remoteAudioTrack?.stop();
                    remoteAudioTrack = null;
                } else if (mediaType === "video") {
                    remoteVideoTrack?.stop();
                    remoteVideoTrack = null;
                    window.dispatchEvent(new Event('remote-video-stopped'));
                }

            };

            // Remove old listeners and add new ones
            client.off("user-published", handleUserPublished);
            client.off("user-unpublished", handleUserUnpublished);
            client.on("user-published", handleUserPublished);
            client.on("user-unpublished", handleUserUnpublished);

            return { channel, type: callType };
        } catch (error) {
            console.error(`START ${callType.toUpperCase()} CALL FAILED:`, error);
            return rejectWithValue(error.message);
        }
    }
);

// Legacy functions for backward compatibility
export const startVoiceCall = createAsyncThunk(
    "call/startVoice",
    async (params, { dispatch }) => {
        return dispatch(startCall({ ...params, callType: "voice" })).unwrap();
    }
);

export const startVideoCall = createAsyncThunk(
    "call/startVideo",
    async (params, { dispatch }) => {
        return dispatch(startCall({ ...params, callType: "video" })).unwrap();
    }
);

export const endCall = createAsyncThunk(
    "call/end",
    async () => {
        // Stop and cleanup remote tracks
        remoteAudioTrack?.stop();
        remoteAudioTrack = null;
        remoteVideoTrack?.stop();
        remoteVideoTrack = null;

        // Stop and cleanup local tracks
        localAudioTrack?.stop();
        localAudioTrack?.close();
        localAudioTrack = null;

        localVideoTrack?.stop();
        localVideoTrack?.close();
        localVideoTrack = null;

        // Reset flags for next call
        callConnectedEmitted = false;
        timerStarted = false;

        // Leave channel – remote peer will get Agora "user offline" / "user-left" (reason: Quit)
        try {
            await client.leave();
        } finally {
            // Full listener cleanup: startCall re-registers fresh handlers on
            // the next call. Without this, user-joined / connection-state /
            // published listeners accumulated across calls in the same window
            // (client.off with a new closure never matched the old handler).
            client.removeAllListeners();
            userLeftListenerAdded = false;
        }
    }
);

const callSlice = createSlice({
    name: "call",
    initialState: {
        inCall: false,
        channel: null,
        type: null,
        muted: true,
        videoEnabled: true,
    },
    reducers: {
        // Use setEnabled only (sync) so voice transfers immediately. Do not destroy track on mute.
        toggleMute: state => {
            state.muted = !state.muted;
            if (localAudioTrack) {
                localAudioTrack.setEnabled(!state.muted);
            }
        },

        toggleVideo: state => {
            state.videoEnabled = !state.videoEnabled;
            localVideoTrack?.setEnabled(state.videoEnabled);
        },
    },
    extraReducers: builder => {
        builder
            .addCase(startCall.pending, (state) => {
            })
            .addCase(startCall.fulfilled, (state, action) => {
                state.inCall = true;
                state.channel = action.payload.channel;
                state.type = action.payload.type;
                // Video call: start with camera off; voice call doesn't use video
                state.videoEnabled = action.payload.type === "video" ? false : true;
            })
            .addCase(startCall.rejected, (state, action) => {
                console.error("Call rejected:", action.payload);
                state.inCall = false;
                state.channel = null;
                state.type = null;
            })
            .addCase(startVoiceCall.fulfilled, (state, action) => {
                state.inCall = true;
                state.channel = action.payload.channel;
                state.type = "voice";
            })
            .addCase(startVideoCall.fulfilled, (state, action) => {
                state.inCall = true;
                state.channel = action.payload.channel;
                state.type = "video";
                state.videoEnabled = false; // Camera off by default
            })
            .addCase(endCall.fulfilled, state => {
                state.inCall = false;
                state.channel = null;
                state.type = null;
                state.muted = false;
                state.videoEnabled = true;
            });
    },
});

export const { toggleMute, toggleVideo } = callSlice.actions;
export default callSlice.reducer;
