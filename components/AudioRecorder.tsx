"use client";

import { useRef, useCallback } from "react";

const CHUNK_MS = 4000;
const RMS_THRESHOLD = 0.03; // 파형 기반 RMS — 데스크탑 앱과 동일 기준

// Whisper 무음 환각 필터 — 구두점 제거 후 포함 여부 체크
const HALLUCINATION_PATTERNS = [
  "thank you for watching",
  "thanks for watching",
  "please subscribe",
  "like and subscribe",
  "see you next time",
  "see you in the next video",
  "subtitles by",
  "transcribed by",
  "bon appétit",
  "bon appetit",
  "시청해 주셔서 감사합니다",
  "구독과 좋아요",
  "다음 영상에서",
  "오늘도 영상",
  "izlediğiniz için",
  "teşekkür ederim",
  "ありがとうございます",
  "チャンネル登録",
];

function isHallucination(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/[.,!?。、♥❤️\s]/g, "");
  if (normalized.length <= 2) return true;
  const lower = text.trim().toLowerCase();
  return HALLUCINATION_PATTERNS.some((p) => lower.includes(p));
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
  const analyserRef = useRef<AnalyserNode | null>(null);

  const processChunk = useCallback(async (blob: Blob) => {
    if (processingRef.current) { onDebug?.("이전 청크 처리 중 — 스킵"); return; }
    processingRef.current = true;
    try {
      onDebug?.(`전송 | size=${blob.size}`);
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
      if (!text) { onDebug?.("STT 빈 결과"); return; }
      if (isHallucination(text)) { onDebug?.(`환각 필터 | "${text}"`); return; }

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

    const analyser = analyserRef.current;
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    let maxRms = 0;
    const timeDomain = new Uint8Array(analyser ? analyser.fftSize : 256);

    // 청크 녹음 중 파형 RMS 측정 (최대값 추적)
    const rmsInterval = setInterval(() => {
      if (!analyser) return;
      analyser.getByteTimeDomainData(timeDomain);
      let sum = 0;
      for (let i = 0; i < timeDomain.length; i++) {
        const n = (timeDomain[i] - 128) / 128;
        sum += n * n;
      }
      const rms = Math.sqrt(sum / timeDomain.length);
      if (rms > maxRms) maxRms = rms;
    }, 100);

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      clearInterval(rmsInterval);
      onDebug?.(`청크 완료 | maxRMS=${maxRms.toFixed(4)}`);
      if (maxRms >= RMS_THRESHOLD && chunks.length > 0) {
        const blob = new Blob(chunks, { type: mimeType });
        processChunk(blob);
      } else {
        onDebug?.(`무음 스킵 | maxRMS=${maxRms.toFixed(4)}`);
      }
      if (runningRef.current) startChunk(stream, mimeType);
    };

    recorder.start();
    setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, CHUNK_MS);
  }, [processChunk, onDebug]);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      runningRef.current = true;

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const volumeInterval = setInterval(() => {
        analyser.getByteFrequencyData(freqData);
        const avg = freqData.reduce((a, b) => a + b, 0) / freqData.length;
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
        analyserRef.current = null;
      };
    } catch (err) {
      onError("마이크 접근 실패: " + String(err));
    }
  }, [startChunk, onVolume, onError]);

  const stop = useCallback(() => {
    runningRef.current = false;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    onVolume(0);
  }, [onVolume]);

  return { start, stop };
}
