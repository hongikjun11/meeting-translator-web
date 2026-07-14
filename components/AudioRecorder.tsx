"use client";

import { useRef, useCallback, type MutableRefObject } from "react";

const CHUNK_MS = 4000;

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

function normalizeText(s: string): string {
  return s.trim().toLowerCase().replace(/[.,!?。、♥❤️\s]/g, "");
}

function isHallucination(text: string): boolean {
  const normalized = normalizeText(text);
  if (normalized.length <= 2) return true;
  const lower = text.trim().toLowerCase();
  return HALLUCINATION_PATTERNS.some((p) => lower.includes(p));
}

// "같은 구절 A A" 형태로 반복되면 하나로 축약 (Whisper 루프 현상)
function collapseRepeat(text: string): string {
  const t = text.trim();
  const words = t.split(/\s+/);
  const n = words.length;
  if (n >= 4 && n % 2 === 0) {
    const half = n / 2;
    const first = words.slice(0, half).join(" ");
    const second = words.slice(half).join(" ");
    if (normalizeText(first) === normalizeText(second)) return first;
  }
  return t;
}

export interface TranscriptResult {
  text: string;
  language: string;
  translation: string;
}

interface Props {
  engine: "openai" | "groq";
  koreanOnly: boolean;
  thresholdRef: MutableRefObject<number>;
  contextRef: MutableRefObject<string>;
  onResult: (result: TranscriptResult) => void;
  onVolume: (level: number) => void;
  onError: (msg: string) => void;
  onDebug?: (msg: string) => void;
}

export default function useAudioRecorder({
  engine,
  koreanOnly,
  thresholdRef,
  contextRef,
  onResult,
  onVolume,
  onError,
  onDebug,
}: Props) {
  const streamRef = useRef<MediaStream | null>(null);
  const runningRef = useRef(false);
  const processingRef = useRef(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const lastTextRef = useRef("");

  const processChunk = useCallback(async (blob: Blob) => {
    if (processingRef.current) { onDebug?.("이전 청크 처리 중 — 스킵"); return; }
    processingRef.current = true;
    try {
      onDebug?.(`전송 | size=${blob.size}`);
      const context = contextRef.current.trim();
      const formData = new FormData();
      formData.append("audio", blob, "audio.webm");
      formData.append("engine", engine);
      formData.append("koreanOnly", String(koreanOnly));
      // 힌트(context)는 Whisper에 넣지 않음 — 넣으면 무음 구간에 힌트를 그대로 뱉는 에코 발생.
      // 힌트는 번역/AI 정제 단계에서만 사용.

      const sttRes = await fetch("/api/transcribe", { method: "POST", body: formData });
      if (!sttRes.ok) {
        const errText = await sttRes.text();
        onError(`STT ${sttRes.status}: ${errText.slice(0, 200)}`);
        return;
      }
      const { text: rawText, language, error: sttErr } = await sttRes.json();
      if (sttErr) { onError(`STT: ${sttErr}`); return; }
      if (!rawText) { onDebug?.("STT 빈 결과"); return; }
      // 반복 구절 축약 후 필터링
      const text = collapseRepeat(rawText);
      if (isHallucination(text)) { onDebug?.(`환각 필터 | "${text}"`); return; }
      // 무음 환각은 직전 결과와 동일하게 반복되는 경향 → 중복 차단
      if (text.trim() === lastTextRef.current) { onDebug?.(`중복 차단 | "${text}"`); return; }
      lastTextRef.current = text.trim();

      onDebug?.(`STT OK | [${language}] "${text}"`);

      const transRes = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language, context }),
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
    const timeDomain = new Uint8Array(analyser ? analyser.fftSize : 256);
    // 데스크탑처럼 4초 전체 버퍼의 평균 RMS를 계산 (제곱합 누적)
    let sumSquares = 0;
    let sampleCount = 0;

    const rmsInterval = setInterval(() => {
      if (!analyser) return;
      analyser.getByteTimeDomainData(timeDomain);
      for (let i = 0; i < timeDomain.length; i++) {
        const n = (timeDomain[i] - 128) / 128;
        sumSquares += n * n;
        sampleCount++;
      }
    }, 100);

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      clearInterval(rmsInterval);
      const rms = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;
      const threshold = thresholdRef.current;
      onDebug?.(`청크 완료 | RMS=${rms.toFixed(4)} (기준 ${threshold.toFixed(3)})`);
      if (rms >= threshold && chunks.length > 0) {
        const blob = new Blob(chunks, { type: mimeType });
        processChunk(blob);
      } else {
        onDebug?.(`무음 스킵 | RMS=${rms.toFixed(4)}`);
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
      // AGC(자동 게인)를 끄지 않으면 브라우저가 조용한 방의 소음을 증폭 → 무음인데 RMS가 올라가
      // Whisper 환각 유발. 데스크탑 sounddevice처럼 원본에 가깝게 캡처.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;
      runningRef.current = true;

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      // 볼륨 바도 파형 RMS 기준으로 표시 (무음일 때 진짜 0이 되도록)
      const volData = new Uint8Array(analyser.fftSize);
      const volumeInterval = setInterval(() => {
        analyser.getByteTimeDomainData(volData);
        let sum = 0;
        for (let i = 0; i < volData.length; i++) {
          const n = (volData[i] - 128) / 128;
          sum += n * n;
        }
        const rms = Math.sqrt(sum / volData.length);
        onVolume(rms); // 원본 RMS 그대로 전달 (화면에서 숫자로 표시)
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
