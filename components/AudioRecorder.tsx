"use client";

import { useRef, useCallback } from "react";

const CHUNK_MS = 4000;

export interface TranscriptResult {
  text: string;
  language: string;
  translation: string;
}

interface Props {
  engine: "openai" | "groq";
  koreanOnly: boolean;
  onResult: (result: TranscriptResult) => void;
  onVolume: (level: number) => void;
  onError: (msg: string) => void;
  onDebug?: (msg: string) => void;
}

export default function useAudioRecorder({
  engine,
  koreanOnly,
  onResult,
  onVolume,
  onError,
  onDebug,
}: Props) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processingRef = useRef(false);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const volumeInterval = setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const level = avg / 255;
        onVolume(level > 0.05 ? level : 0);
      }, 100);

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = async (e) => {
        if (!e.data.size || processingRef.current) return;
        processingRef.current = true;
        try {
          const formData = new FormData();
          formData.append("audio", e.data, "audio.webm");
          formData.append("engine", engine);
          formData.append("koreanOnly", String(koreanOnly));

          onDebug?.(`청크 전송 | size=${e.data.size} engine=${engine}`);
          const sttRes = await fetch("/api/transcribe", { method: "POST", body: formData });
          if (!sttRes.ok) {
            const errText = await sttRes.text();
            onError(`STT ${sttRes.status}: ${errText.slice(0, 200)}`);
            return;
          }
          const sttData = await sttRes.json();
          const { text, language, error: sttErr } = sttData;
          if (sttErr) { onError(`STT: ${sttErr}`); return; }
          if (!text) { onDebug?.("무음 스킵"); return; }
          onDebug?.(`STT OK | [${language}] "${text}"`);

          const transRes = await fetch("/api/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, language }),
          });
          if (!transRes.ok) {
            const errText = await transRes.text();
            onError(`번역 ${transRes.status}: ${errText.slice(0, 200)}`);
            onResult({ text, language, translation: "" });
            return;
          }
          const transData = await transRes.json();
          const { translation, error: transErr } = transData;
          if (transErr) { onError(`번역: ${transErr}`); onResult({ text, language, translation: "" }); return; }

          onResult({ text, language, translation });
        } catch (err) {
          onError(String(err));
        } finally {
          processingRef.current = false;
        }
      };

      recorder.start(CHUNK_MS);

      return () => {
        clearInterval(volumeInterval);
        audioCtx.close();
      };
    } catch (err) {
      onError("마이크 접근 실패: " + String(err));
    }
  }, [engine, koreanOnly, onResult, onVolume, onError]);

  const stop = useCallback(() => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    mediaRecorderRef.current = null;
    streamRef.current = null;
    onVolume(0);
  }, [onVolume]);

  return { start, stop };
}
