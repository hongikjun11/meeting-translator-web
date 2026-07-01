"use client";

import { useRef, useCallback } from "react";

const CHUNK_MS = 4000;

// Whisper 무음 환각 필터
const HALLUCINATIONS = [
  "thank you for watching",
  "thanks for watching",
  "please subscribe",
  "like and subscribe",
  "you",
  ".",
  "...",
];

function isHallucination(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return HALLUCINATIONS.some((h) => lower === h) || lower.length <= 1;
}

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
  const streamRef = useRef<MediaStream | null>(null);
  const runningRef = useRef(false);
  const processingRef = useRef(false);

  const processChunk = useCallback(async (blob: Blob) => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      onDebug?.(`청크 전송 | size=${blob.size} engine=${engine}`);
      const formData = new FormData();
      formData.append("audio", blob, "audio.webm");
      formData.append("engine", engine);
      formData.append("koreanOnly", String(koreanOnly));

      const sttRes = await fetch("/api/transcribe", { method: "POST", body: formData });
      if (!sttRes.ok) {
        const errText = await sttRes.text();
        onError(`STT ${sttRes.status}: ${errText.slice(0, 200)}`);
        return;
      }
      const { text, language, error: sttErr } = await sttRes.json();
      if (sttErr) { onError(`STT: ${sttErr}`); return; }
      if (!text || isHallucination(text)) {
        onDebug?.(`스킵 | "${text}"`);
        return;
      }
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
      const { translation, error: transErr } = await transRes.json();
      if (transErr) { onError(`번역: ${transErr}`); onResult({ text, language, translation: "" }); return; }

      onResult({ text, language, translation });
    } catch (err) {
      onError(String(err));
    } finally {
      processingRef.current = false;
    }
  }, [engine, koreanOnly, onResult, onError, onDebug]);

  const startChunk = useCallback((stream: MediaStream, mimeType: string) => {
    if (!runningRef.current) return;

    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      if (chunks.length > 0) {
        const blob = new Blob(chunks, { type: mimeType });
        processChunk(blob);
      }
      // 4초 후 다음 청크 시작
      if (runningRef.current) startChunk(stream, mimeType);
    };

    recorder.start();
    setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, CHUNK_MS);
  }, [processChunk]);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      runningRef.current = true;

      // 볼륨 분석
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

      startChunk(stream, mimeType);

      return () => {
        clearInterval(volumeInterval);
        audioCtx.close();
      };
    } catch (err) {
      onError("마이크 접근 실패: " + String(err));
    }
  }, [startChunk, onVolume, onError]);

  const stop = useCallback(() => {
    runningRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    onVolume(0);
  }, [onVolume]);

  return { start, stop };
}
