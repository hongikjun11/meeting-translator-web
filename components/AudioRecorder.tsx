"use client";

import { useRef, useCallback, type MutableRefObject } from "react";

// VAD(무음 감지) 기반 분할 파라미터
const TICK_MS = 100; // RMS 측정 주기
const SILENCE_HANG_MS = 800; // 말이 멈춘 뒤 이만큼 무음이면 문장 끝으로 보고 자름
const MIN_CHUNK_MS = 1200; // 너무 짧게 자르지 않도록 최소 길이
const MAX_CHUNK_MS = 15000; // 계속 말해도 이 길이에서 강제 분할

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
  onResult: (result: TranscriptResult) => void;
  onVolume: (level: number) => void;
  onError: (msg: string) => void;
  onDebug?: (msg: string) => void;
}

export default function useAudioRecorder({
  engine,
  koreanOnly,
  thresholdRef,
  onResult,
  onVolume,
  onError,
  onDebug,
}: Props) {
  const streamRef = useRef<MediaStream | null>(null);
  const runningRef = useRef(false);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const lastTextRef = useRef("");
  // 처리 대기열 — 조각을 버리지 않고 순서대로 STT·번역 (처리가 4초보다 느려도 손실 없음)
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const processChunk = useCallback(async (blob: Blob) => {
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
    }
  }, [engine, koreanOnly, onResult, onError, onDebug]);

  // 큐에 순차 등록 (앞 조각 처리가 끝난 뒤 다음 조각 처리)
  const enqueueChunk = useCallback((blob: Blob) => {
    queueRef.current = queueRef.current.then(() => processChunk(blob));
  }, [processChunk]);

  const startChunk = useCallback((stream: MediaStream, mimeType: string) => {
    if (!runningRef.current) return;

    const analyser = analyserRef.current;
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    const timeDomain = new Uint8Array(analyser ? analyser.fftSize : 256);

    // VAD 상태: 말이 감지됐는지, 말 이후 무음이 얼마나 지속됐는지, 총 경과 시간
    let speechDetected = false;
    let silenceMs = 0;
    let elapsedMs = 0;

    const rmsInterval = setInterval(() => {
      if (!analyser) return;
      analyser.getByteTimeDomainData(timeDomain);
      let sum = 0;
      for (let i = 0; i < timeDomain.length; i++) {
        const n = (timeDomain[i] - 128) / 128;
        sum += n * n;
      }
      const tickRms = Math.sqrt(sum / timeDomain.length);
      elapsedMs += TICK_MS;

      const threshold = thresholdRef.current;
      if (tickRms >= threshold) {
        speechDetected = true;
        silenceMs = 0;
      } else if (speechDetected) {
        silenceMs += TICK_MS;
      }

      // 문장 끝(말 후 충분한 무음) 또는 최대 길이 도달 시 자름
      const utteranceEnd =
        speechDetected && silenceMs >= SILENCE_HANG_MS && elapsedMs >= MIN_CHUNK_MS;
      const forceCut = elapsedMs >= MAX_CHUNK_MS;
      if ((utteranceEnd || forceCut) && recorder.state === "recording") {
        recorder.stop();
      }
    }, TICK_MS);

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      clearInterval(rmsInterval);
      // 먼저 녹음을 즉시 재개해 조각 사이 공백을 최소화
      if (runningRef.current) startChunk(stream, mimeType);
      onDebug?.(`청크 완료 | ${(elapsedMs / 1000).toFixed(1)}초 | 말감지=${speechDetected}`);
      if (speechDetected && chunks.length > 0) {
        const blob = new Blob(chunks, { type: mimeType });
        enqueueChunk(blob); // 큐에 등록 — 버리지 않고 순서대로 처리
      } else {
        onDebug?.("무음 스킵");
      }
    };

    recorder.start();
  }, [enqueueChunk, onDebug]);

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
