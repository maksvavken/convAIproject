import { useEffect, useRef, useState } from "react";
import { Plasma } from "@pipecat-ai/voice-ui-kit/webgl";
import type { PlasmaRef } from "@pipecat-ai/voice-ui-kit/webgl";

const subtleConfig = {
  backgroundColor: "#22c55e",
  ringBounce: 0.15,
  ringAmplitude: 0.08,
  ringThicknessAudio: 4,
  audioSensitivity: 0.3,
  plasmaVolumeReactivity: 0.4,
  effectScale: 0.45,
  ringDistance: 0,
  ringVariance: 0.2,
  ringVisibility: 0.6,
  ringSegments: 5,
  ringThickness: 3,
  ringSpread: 0.06,
  colorCycleSpeed: 0.15,
  intensity: 0.7,
  radius: 1.0,
  glowFalloff: 1,
  glowThreshold: 0,
  plasmaSpeed: 0.12,
  rayLength: 0.6,
  color1: "#6b7280",
  color2: "#4b5563",
  color3: "#374151",
};

const activeConfig = {
  backgroundColor: "#22c55e",
  ringBounce: 0.4,
  ringAmplitude: 0.15,
  ringThicknessAudio: 15,
  audioSensitivity: 1.8,
  plasmaVolumeReactivity: 1.8,
  effectScale: 0.55,
  ringDistance: 0,
  ringVariance: 0.35,
  ringVisibility: 0.32,
  ringSegments: 6,
  ringThickness: 4,
  ringSpread: 0.1,
  colorCycleSpeed: 0.25,
  intensity: 1.3,
  radius: 1.0,
  glowFalloff: 1.5,
  glowThreshold: 0,
  plasmaSpeed: 0.22,
  rayLength: 1.0,
  color1: "#22d3ee",
  color2: "#34d399",
  color3: "#818cf8",
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
      className={`bg-white backdrop-blur-sm rounded-lg ${
        compact ? "w-12 h-12 p-2" : "p-4"
      } flex flex-col`}
    >
      <div className="relative aspect-square flex items-center justify-center rounded-full overflow-hidden">
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
                className="w-2 bg-purple-500 rounded-t transition-all duration-100"
                style={{
                  height: `${height}%`,
                  opacity: transportState === "ready" ? 1 : 0.3,
                }}
              />
            ))}
          </div>
          <div className="text-xs text-center py-2 text-purple-600 font-medium">
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
