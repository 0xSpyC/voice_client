import { MicVAD } from "@ricky0123/vad-web"
import PcmPlayer from "pcm-player"

export function createAudioManager(
  onSilenceDetected: (audio: Blob) => void,
  onInterrupt: () => void,
  onResponseFinished: () => void
) {
  let vadInstance: MicVAD | null = null
  let appState: any = null
  let playingQueue: HTMLAudioElement[] = []
  let isPlayingQueue = false
  let responseAudio: HTMLAudioElement | null = null
  let streamPlayer: PcmPlayer | null = null

  const manager = {
    async initialize() {

      streamPlayer = new PcmPlayer({
        inputCodec: 'Int16',
        channels: 1,
        sampleRate: 24000,
        flushTime: 2000,
        fftSize: 1024,
      });

      if (vadInstance) return


      vadInstance = await MicVAD.new({
        positiveSpeechThreshold: 0.65,
        model: "v5",
        onSpeechStart: () => {
          console.log("Speech start detected")
        },
        onSpeechEnd: (float32Array: Float32Array) => {
          console.log("Speech end detected")
          const wavBlob = float32ToWavBlob(float32Array, 16000)
          if (wavBlob.size > 7000) {
            onInterrupt()
            onSilenceDetected(wavBlob)
          } else {
            console.warn("No audio data recorded.")
          }
        }
      })
    },

    startListening(mainState: any) {
      if (!vadInstance || mainState.isListening) return
      appState = mainState
      appState.isListening = true
      vadInstance.start()
    },

    playPCMChunk(pcmBytes: Uint8Array) {
      streamPlayer?.feed(pcmBytes);
    },

    playQueue() {
      if (isPlayingQueue) return
      if (playingQueue.length === 0) {
        console.warn("No audio in queue to play.")
        return
      }

      isPlayingQueue = true

      const playNext = () => {
        if (playingQueue.length === 0) {
          isPlayingQueue = false
          onResponseFinished()
          return
        }

        const audioToPlay = playingQueue.shift()
        if (!audioToPlay) {
          isPlayingQueue = false
          return
        }

        audioToPlay.onended = () => {
          URL.revokeObjectURL(audioToPlay.src)
          playNext()
        }

        audioToPlay.onerror = (e) => {
          console.error("Error playing audio:", e)
          playNext()
        }

        audioToPlay.play().catch(e => {
          console.error("Audio play failed:", e)
          playNext()
        })
      }

      playNext()
    },


    playResponse(audioBlob: Blob) {
      if (appState.isResponding) return
      appState.isResponding = true

      const audioUrl = URL.createObjectURL(audioBlob)
      responseAudio = new Audio(audioUrl)

      responseAudio.onended = () => {
        URL.revokeObjectURL(audioUrl)
        appState.isResponding = false
        responseAudio = null

        if (!appState.isSpeaking) {
          onResponseFinished()
        } else {
          handleInterrupt()
        }
      }

      responseAudio.onerror = (e) => {
        console.error("Error playing response audio:", e)
        URL.revokeObjectURL(audioUrl)
        appState.isResponding = false
      }

      responseAudio.play().catch(e => console.error("Audio play failed:", e))
      checkInterrupt()
    },

    stopAll() {
      if (vadInstance) {
        vadInstance.pause()
      }
      if (responseAudio) {
        responseAudio.pause()
      }

    }
  }

  // function playPCMChunk(pcmBytes: Uint8Array) {
  //   const float32 = pcm16ToFloat32(pcmBytes);
  
  //   const buffer = audioCtx!.createBuffer(1, float32.length, 24000);
  //   buffer.copyToChannel(float32, 0, 0);
  
  //   const source = audioCtx!.createBufferSource();
  //   source.buffer = buffer;
  //   source.connect(audioCtx!.destination);
  //   source.start();
  // }
  
  // function pcm16ToFloat32(pcmBytes: Uint8Array): Float32Array {
  //   const dataView = new DataView(pcmBytes.buffer);
  //   const float32 = new Float32Array(pcmBytes.byteLength / 2);
  //   for (let i = 0; i < float32.length; i++) {
  //     float32[i] = dataView.getInt16(i * 2, true) / 0x8000;
  //   }
  //   return float32;
  // }

  function float32ToWavBlob(float32Array: Float32Array, sampleRate: number) {
    const buffer = encodeWav(float32Array, sampleRate)
    return new Blob([buffer], { type: "audio/wav" })
  }

  function encodeWav(samples: Float32Array, sampleRate: number) {
    const buffer = new ArrayBuffer(44 + samples.length * 2)
    const view = new DataView(buffer)

    // RIFF identifier
    writeString(view, 0, "RIFF")
    // file length minus RIFF identifier length and file description length
    view.setUint32(4, 36 + samples.length * 2, true)
    // RIFF type
    writeString(view, 8, "WAVE")
    // format chunk identifier
    writeString(view, 12, "fmt ")
    // format chunk length
    view.setUint32(16, 16, true)
    // sample format (raw)
    view.setUint16(20, 1, true)
    // channel count
    view.setUint16(22, 1, true)
    // sample rate
    view.setUint32(24, sampleRate, true)
    // byte rate (sample rate * block align)
    view.setUint32(28, sampleRate * 2, true)
    // block align (channel count * bytes per sample)
    view.setUint16(32, 2, true)
    // bits per sample
    view.setUint16(34, 16, true)
    // data chunk identifier
    writeString(view, 36, "data")
    // data chunk length
    view.setUint32(40, samples.length * 2, true)

    floatTo16BitPCM(view, 44, samples)

    return buffer
  }

  function floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
    for (let i = 0; i < input.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, input[i]))
      output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    }
  }

  function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }

  function handleInterrupt() {
    if (!appState?.isResponding) return
    if (responseAudio) {
      responseAudio.pause()
      responseAudio = null
    }
    appState.isResponding = false
  }

  function checkInterrupt() {
    if (!appState || !appState.isResponding) return
    requestAnimationFrame(checkInterrupt)
  }

  return manager
}