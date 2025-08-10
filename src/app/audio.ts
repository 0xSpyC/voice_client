const SILENCE_DETECTION_THRESHOLD_MS = 700;
const AUDIO_MIME_TYPE = 'audio/webm; codecs=opus';
const VAD_ENERGY_THRESHOLD = 0.1;

export function createAudioManager(
    onSilenceDetected: (audio: Blob) => void,
    onInterrupt: () => void,
    onResponseFinished: () => void
) {
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let microphoneStream: MediaStream | null = null;

    let silenceTimer: number | null = null;
    let vadLoopId: number | null = null;

    let isSpeaking = false;
    let mediaRecorder: MediaRecorder | null = null;
    let currentChunks: Blob[] = [];

    let playingQueue: HTMLAudioElement[] = [];
    let isPlayingQueue = false;

    let responseAudio: HTMLAudioElement | null = null;
    let appState: any = null;

    const manager = {
        async initialize() {
            if (audioContext) return;

            microphoneStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }});
            audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(microphoneStream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
        },

        startListening(mainState: any) {
            if (!microphoneStream || mainState.isListening) return;
            appState = mainState;
            appState.isListening = true;
            startVadLoop();
        },

        playQueue() {
            if (isPlayingQueue) return;
            if (playingQueue.length === 0) {
                console.warn("No audio in queue to play.");
                return;
            }

            isPlayingQueue = true;

            const playNext = () => {
                if (playingQueue.length === 0) {
                    isPlayingQueue = false;
                    onResponseFinished();
                    return;
                }

                const audioToPlay = playingQueue.shift();
                if (!audioToPlay) {
                    isPlayingQueue = false;
                    return;
                }

                audioToPlay.onended = () => {
                    URL.revokeObjectURL(audioToPlay.src);
                    playNext();
                };

                audioToPlay.onerror = (e) => {
                    console.error("error playing audio:", e);
                    playNext();
                };

                audioToPlay.play().catch(e => {
                    console.error("reading audio failed:", e);
                    playNext();
                });
            };

            playNext();
        },

        playResponse(audioBlob: Blob) {
            console.log("Playing response audio:", audioBlob);
            if (appState.isResponding) return;
            appState.isResponding = true;

            const audioUrl = URL.createObjectURL(audioBlob);
            responseAudio = new Audio(audioUrl);

            responseAudio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                appState.isResponding = false;
                responseAudio = null;

                if (!appState.isSpeaking) {
                    onResponseFinished();
                } else {
                    handleInterrupt();
                }
            };

            responseAudio.onerror = (e) => {
                console.error("Error playing response audio:", e);
                URL.revokeObjectURL(audioUrl);
                appState.isResponding = false;
            };
            console.log("Playing response audio:", audioUrl);
            responseAudio.play().catch(e => console.error("Audio play failed:", e));
            checkInterrupt();
        },

        stopAll() {
            stopVadLoop();
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
            if (microphoneStream) {
                microphoneStream.getTracks().forEach(track => track.stop());
            }
            if (audioContext && audioContext.state !== 'closed') {
                audioContext.close();
            }
            if (responseAudio) {
                responseAudio.pause();
            }
            if (silenceTimer) {
                clearTimeout(silenceTimer);
                silenceTimer = null;
            }
            audioContext = null;
            microphoneStream = null;
        }
    };

    function startVadLoop() {
        stopVadLoop();
        vadLoopId = requestAnimationFrame(detectVoiceActivity);
    }

    function stopVadLoop() {
        if (vadLoopId !== null) {
            cancelAnimationFrame(vadLoopId);
            vadLoopId = null;
        }
    }

    async function startRecorder() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            return;
        }
        currentChunks = [];
        mediaRecorder = new MediaRecorder(microphoneStream!, { mimeType: AUDIO_MIME_TYPE });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                currentChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(currentChunks, { type: AUDIO_MIME_TYPE });
            if (audioBlob.size > 0) {
                onInterrupt();
                onSilenceDetected(audioBlob);
            } else {
                console.warn("No audio data recorded.");
            }
            currentChunks = [];
        };

        mediaRecorder.start();
    }

    function detectVoiceActivity() {
        if (!appState || !appState.isListening) return;

        const dataArray = new Uint8Array(analyser!.frequencyBinCount);
        analyser!.getByteTimeDomainData(dataArray);

        let sumSquares = 0;
        for (const amplitude of dataArray) {
            const normalized = (amplitude / 128.0) - 1.0;
            sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);

        if (rms > VAD_ENERGY_THRESHOLD) {
            if (!isSpeaking) {
                console.log("Speech started.");
                isSpeaking = true;
                startRecorder().catch(e => console.error("Failed to start recorder:", e));
            }
            if (silenceTimer) clearTimeout(silenceTimer);
            silenceTimer = setTimeout(handleSilence, SILENCE_DETECTION_THRESHOLD_MS);
        }

        vadLoopId = requestAnimationFrame(detectVoiceActivity);
    }

    function handleSilence() {
        if (!isSpeaking) return;
        console.log("Silence detected.");
        isSpeaking = false;

        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
    }

    function handleInterrupt() {
        if (!appState?.isResponding) return;
        if (responseAudio) {
            responseAudio.pause();
            responseAudio = null;
        }
        appState.isResponding = false;
        handleSilence();
    }

    function checkInterrupt() {
        if (!appState || !appState.isResponding) return;
        if (isSpeaking) {
            handleInterrupt();
        } else {
            requestAnimationFrame(checkInterrupt);
        }
    }

    return manager;
}
