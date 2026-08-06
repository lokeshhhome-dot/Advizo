


let ringtone = null;
let audioContext = null;
let oscillator = null;

export const initRingtone = () => {
    try {
        // Try to load the audio file
        ringtone = new Audio("/sounds/ringing_tone.mp3");
        ringtone.loop = true;
        ringtone.preload = "auto";

        // Add event listeners for debugging
        ringtone.addEventListener('play', () => console.log("✅ Ringtone started playing"));
        ringtone.addEventListener('pause', () => console.log("⏸️ Ringtone paused"));
        ringtone.addEventListener('ended', () => console.log("⏹️ Ringtone ended"));
        ringtone.addEventListener('error', (e) => console.error("❌ Ringtone error:", e));

    } catch (error) {
        console.error("Failed to initialize ringtone:", error);
    }
};

export const playRingtone = async () => {
    try {
        // Stop any currently playing audio
        await stopRingtone();

        // Initialize if needed
        if (!ringtone) {
            initRingtone();
        }

        // Make sure we have a valid ringtone object
        if (ringtone) {
            ringtone.currentTime = 0;

            // Browser autoplay policies might require user interaction
            const playPromise = ringtone.play();

            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        console.log("🎵 Ringtone playing successfully!");
                    })
                    .catch(error => {
                        console.error("Failed to play ringtone:", error);
                        // Fallback to oscillator
                        playFallbackTone();
                    });
            }
        } else {
            // Fallback if ringtone object is null
            playFallbackTone();
        }
    } catch (error) {
        console.error("Error in playRingtone:", error);
        playFallbackTone();
    }
};

const playFallbackTone = () => {
    try {
        // Stop any existing oscillator
        stopFallbackTone();

        // Create new audio context if needed
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        // Create and configure oscillator
        oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.value = 800;

        // Connect nodes
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        // Set volume
        gainNode.gain.value = 0.5;

        // Start oscillator
        if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                oscillator.start();
            });
        } else {
            oscillator.start();
        }

        // Don't auto-stop - let it loop until manually stopped
        // We removed the setTimeout to keep it playing until stopRingtone is called
    } catch (error) {
        console.error("Fallback tone failed:", error);
    }
};

const stopFallbackTone = () => {
    if (oscillator) {
        try {
            oscillator.stop();
            oscillator.disconnect();
        } catch (error) {
            // Ignore errors if oscillator already stopped
        }
        oscillator = null;
    }

    // Don't close audio context, just suspend it
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.suspend();
    }
};

export const stopRingtone = () => {

    // Stop HTML5 Audio
    if (ringtone) {
        try {
            // Check if it's actually playing
            if (!ringtone.paused) {
                ringtone.pause();
                ringtone.currentTime = 0;
            } else {
                console.log("HTML5 Audio was already paused");
            }
        } catch (error) {
            console.error("Error stopping HTML5 Audio:", error);
        }
    } else {
        console.log("No HTML5 Audio instance found");
    }

    // Stop fallback oscillator
    stopFallbackTone();

    // Double-check by trying to pause any audio elements with a specific selector
    try {
        const audioElements = document.querySelectorAll('audio');
        audioElements.forEach(audio => {
            if (!audio.paused) {
                audio.pause();
                audio.currentTime = 0;
            }
        });
    } catch (error) {
        console.error("Error stopping additional audio elements:", error);
    }

};

// Optional: Add a cleanup function
export const cleanupRingtone = () => {
    stopRingtone();
    ringtone = null;
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
};





