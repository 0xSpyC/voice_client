import './css/style.css'
import './css/visualizer.css'
import './css/voice-client.css'
import * as UI from './ui'
import { createWebSocketConnection } from './websocket'
import { createAudioManager } from './audio'


const WEBSOCKET_URL = "ws://0.0.0.0:7777"

const state = {
    websocket: null as WebSocket | null,
    isConnected: false,
    isMuted: false,
    isDeafened: false,
    isSpeaking: false,
    isListening: false,
    isResponding: false,
    audioManager: null as any | null,
}

async function handleToggleConnection() {
    if (state.isConnected) {
        handleHangUp();
    }
    else {
        await handleConnect();
    }
}

async function handleDebugVoice() {
    if (state.isConnected) {
        console.log("Debugging voice...");
        UI.updateStatus('Debugging voice...', '#00ff00');
        state.audioManager.playQueue();
    } else {
        console.warn("Cannot debug voice, not connected.");
    }
}

async function handleConnect() {
    UI.updateStatus('Connecting...', '#888888');

    try { 
        state.audioManager = createAudioManager(onSilenceDetected, onInterrupt, onResponseFinished);
        await state.audioManager.initialize();
    } catch (err) {
        console.error('Failed to initialize audio manager:', err);
        handleHangUp();
    }

    state.isConnected = true;
    UI.updateButtonState(false);
    UI.updateStatus('Connected', '#ffffff');
    state.audioManager.startListening(state);
    UI.updateStatus('Listening...', '#ffffff');

    try {
        state.websocket = createWebSocketConnection(
                WEBSOCKET_URL,
                onWsOpen,
                onWsMessage,
                onWsError,
                onWsClose
        );
    } catch (error) {
        console.error('WebSocket connection failed:', error);
        handleHangUp();
    }
}

function handleHangUp() {
    if (state.websocket) {
        state.websocket.close();
    }
    if (state.audioManager) {
        state.audioManager.stopAll();
    }

    state.isConnected = false;
    state.isListening = false;
    state.isSpeaking = false;
    state.isResponding = false;
    state.websocket = null;
    state.audioManager = null;

    UI.updateButtonState(true);
    UI.updateStatus('Disconnected', '#cccccc');
    console.log("Client has been hung up and reset.");
}

function onWsOpen() {
    state.isConnected = true;
    UI.updateButtonState(false);
    UI.updateStatus('Connected', '#ffffff');
    state.audioManager.startListening(state);
    UI.updateStatus('Listening...', '#ffffff');
}

function onWsMessage(data: any) {
    try {
        // Check if data is a string or an ArrayBuffer
        if (typeof data === 'string') {
            console.log("Received string message from server:", data);
            const jsonData = JSON.parse(data);
            if (jsonData.command) {
                console.log("Command received:", jsonData.command);
                switch (jsonData.command.toLowerCase()) {
                    case "end_of_sythesis":
                        onResponseFinished();
                    default:
                        console.warn("Unknown command received:", jsonData.command);
                }
            }
            
        } else {
            // NON STREAMING MODE
            // const audioBlob: Blob = new Blob([data], { type: 'audio/wav' });
            // console.log("Received audio blob from server.");
            // UI.updateStatus('Responding...', '#ffffff');
            // state.audioManager.playResponse(audioBlob, state);
            // STREAMING MODE
            console.log("Received binary data from server, playing audio chunk.", data);
            const pcmChunck = new Uint8Array(data);
            state.audioManager.playPCMChunk(pcmChunck);
        }

    } catch (error) {
        console.error("Error processing WebSocket message:", error);
    }
}

function onWsError(error: Event) {
    console.error("WebSocket Error:", error);
    handleHangUp();
}

function onWsClose() {
    handleHangUp();
}

function getPayloadFromCommand(command: string): string {
    const payload = {
        command: command.toUpperCase(),
    }
    return JSON.stringify(payload);
}

async function onSilenceDetected(audioBlob: Blob) {
    console.log(`Sending audio blob of size: ${audioBlob.size} bytes`);
    if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
        const binary_audio = await audioBlob.arrayBuffer();
        state.websocket.send(binary_audio);
        console.log("Audio blob sent to server.", binary_audio);
    }
    if (!state.isResponding) {
        UI.updateStatus('Listening...', '#ffffff');
    }
}

function onInterrupt() {
    console.log("INTERRUPT: Sending command and new audio.");
    if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
        const payload = getPayloadFromCommand("INTERRUPT");
        state.websocket.send(payload);
        console.log("Interrupt command sent to server:", payload);
    }
    UI.updateStatus('Listening...', '#ffffff');
}

function onResponseFinished() {
    console.log("RESPONSE FINISHED: Sending end_of_turn.");
    if (state.websocket && state.websocket.readyState === WebSocket.OPEN) {
        const payload = getPayloadFromCommand("END_OF_TURN");
        state.websocket.send(payload);
        console.log("end command sent to server:", payload);
    }
    UI.updateStatus('Listening...', '#ffffff');
}

function initialize() {
    UI.elements.hangButton.addEventListener('click', handleToggleConnection);
    UI.elements.debugButton.addEventListener('click', handleDebugVoice);
    UI.updateButtonState(true); 
}

initialize();