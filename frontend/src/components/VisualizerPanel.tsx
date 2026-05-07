import { useEffect, useRef, useState } from "react";
import { Plasma } from "@pipecat-ai/voice-ui-kit/webgl";
import type { PlasmaRef } from "@pipecat-ai/voice-ui-kit/webgl";

const subtleConfig = {
  backgroundColor: "#dcfce7",
  ringBounce: 0.12,
  ringAmplitude: 0.06,
  ringThicknessAudio: 5,
  audioSensitivity: 0.45,
  plasmaVolumeReactivity: 0.35,
  effectScale: 0.5,
  ringDistance: 0,
  ringVariance: 0.18,
  ringVisibility: 0.5,
  ringSegments: 6,
  ringThickness: 3,
  ringSpread: 0.08,
  colorCycleSpeed: 0.1,
  intensity: 0.75,
  radius: 1.0,
  glowFalloff: 1.25,
  glowThreshold: 0,
  plasmaSpeed: 0.08,
  rayLength: 0.55,
  color1: "#bbf7d0",
  color2: "#4ade80",
  color3: "#16a34a",
};

const activeConfig = {
  backgroundColor: "#bbf7d0",
  ringBounce: 0.32,
  ringAmplitude: 0.18,
  ringThicknessAudio: 10,
  audioSensitivity: 1.5,
  plasmaVolumeReactivity: 1.45,
  effectScale: 0.62,
  ringDistance: 0,
  ringVariance: 0.28,
  ringVisibility: 0.42,
  ringSegments: 7,
  ringThickness: 4,
  ringSpread: 0.12,
  colorCycleSpeed: 0.18,
  intensity: 1.2,
  radius: 1.0,
  glowFalloff: 1.35,
  glowThreshold: 0,
  plasmaSpeed: 0.18,
  rayLength: 0.85,
  color1: "#86efac",
  color2: "#22c55e",
  color3: "#15803d",
};

interface VisualizerPanelProps {
    transportState: string;
    botAudioTrack?: MediaStreamTrack;
    visualizerType: "plasma" | "waveform";
    compact?: boolean;
  }

export function VisualizerPanel({
  transportState,
  botAudioTrack,
  visualizerType,
  compact = false,
}: VisualizerPanelProps) {
  const plasmaRef = useRef<PlasmaRef>(null);

  const [micBars, setMicBars] = useState<number[]>(Array(32).fill(5));
  const [botBars, setBotBars] = useState<number[]>(Array(32).fill(5));

  // Audio analysis for bot audio
  useEffect(() => {
    if (!botAudioTrack || visualizerType !== "waveform") return;

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.5;
    const dataArray = new Uint8Array(analyser.fftSize);

    const stream = new MediaStream([botAudioTrack]);
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    let animationId: number;
    const animate = () => {
      analyser.getByteTimeDomainData(dataArray);

      const bars: number[] = [];
      const segmentSize = Math.floor(dataArray.length / 32);

      for (let i = 0; i < 32; i++) {
        let sum = 0;
        for (let j = 0; j < segmentSize; j++) {
          const val = Math.abs((dataArray[i * segmentSize + j] - 128) / 128);
          sum += val * val;
        }
        const rms = Math.sqrt(sum / segmentSize);
        bars.push(Math.max(5, Math.min(95, rms * 400)));
      }

      setBotBars(bars);
      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      source.disconnect();
      audioContext.close();
    };
  }, [botAudioTrack,visualizerType]);

  // Audio analysis for mic (user audio)
  useEffect(() => {
    if (transportState !== "ready" || visualizerType !== "waveform") return;

    let audioContext: AudioContext;
    let analyser: AnalyserNode;
    let animationId: number;

    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      const dataArray = new Uint8Array(analyser.fftSize);

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const animate = () => {
        analyser.getByteTimeDomainData(dataArray);

        const bars: number[] = [];
        const segmentSize = Math.floor(dataArray.length / 32);

        for (let i = 0; i < 32; i++) {
          let sum = 0;
          for (let j = 0; j < segmentSize; j++) {
            const val = Math.abs((dataArray[i * segmentSize + j] - 128) / 128);
            sum += val * val;
          }
          const rms = Math.sqrt(sum / segmentSize);
          bars.push(Math.max(5, Math.min(95, rms * 400)));
        }
        setMicBars(bars);
        animationId = requestAnimationFrame(animate);
      };

      animate();
    });

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      if (audioContext) audioContext.close();
    };
  }, [transportState,  visualizerType]);

  // Switch plasma config on connect/disconnect
  useEffect(() => {
    if (plasmaRef.current) {
      plasmaRef.current.updateConfig(
        transportState === "ready" ? activeConfig : subtleConfig,
      );
    }
  }, [transportState]);
  return (
    <div
      className={`bg-white backdrop-blur-sm ${
        compact
          ? "w-12 h-12 p-2 rounded-full border border-emerald-100 shadow-[0_0_14px_rgba(34,197,94,0.22)]"
          : "rounded-lg p-4"
      } flex flex-col`}
    >
      <div className="relative aspect-square flex items-center justify-center rounded-full overflow-hidden bg-emerald-50">
        {visualizerType === "plasma" ? (
        <>
          <Plasma
            ref={plasmaRef}
            audioTrack={transportState === "ready" ? botAudioTrack : undefined}
            alpha={false}
            initialConfig={
              transportState === "ready" ? activeConfig : subtleConfig
            }
            className="absolute inset-0 pointer-events-none animate-fade-in z-0"
          />
        </>
        ) : (
        <div className="absolute inset-0 flex flex-col p-4">
          <div className="flex-1 flex items-end justify-center gap-1">
            {micBars.map((height, i) => (
              <div
                key={`mic-${i}`}
                className="w-2 bg-emerald-400 rounded-t transition-all duration-100"
                style={{
                  height: `${height}%`,
                  opacity: transportState === "ready" ? 1 : 0.3,
                }}
              />
            ))}
          </div>
          <div className="text-xs text-center py-2 text-emerald-600 font-medium">
            Your Voice
          </div>
          <div className="flex-1 flex items-start justify-center gap-1">
            {botBars.map((height, i) => (
              <div
                key={`bot-${i}`}
                className="w-2 bg-green-500 rounded-b transition-all duration-100"
                style={{
                  height: `${height}%`,
                  opacity: transportState === "ready" ? 1 : 0.3,
                }}
              />
            ))}
          </div>
          <div className="text-xs text-center py-2 text-green-600 font-medium">
            Bot Voice
          </div>
        </div>
        )}
      </div>
    
    </div>
  );
}
