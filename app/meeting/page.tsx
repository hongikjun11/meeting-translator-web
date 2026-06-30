"use client";

import { useState, useCallback, useRef } from "react";
import useAudioRecorder from "@/components/AudioRecorder";
import ControlBar from "@/components/ControlBar";
import SubtitleDisplay from "@/components/SubtitleDisplay";
import HistoryPanel from "@/components/HistoryPanel";
import type { Record } from "@/app/api/refine/route";

export default function MeetingPage() {
  const [running, setRunning] = useState(false);
  const [engine, setEngine] = useState<"openai" | "groq">("openai");
  const [koreanOnly, setKoreanOnly] = useState(false);
  const [subtitle, setSubtitle] = useState("번역 준비 완료");
  const [records, setRecords] = useState<Record[]>([]);
  const [originalRecords, setOriginalRecords] = useState<Record[] | null>(null);
  const [volume, setVolume] = useState(0);
  const [summary, setSummary] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  const onResult = useCallback(({ text, language, translation }: { text: string; language: string; translation: string }) => {
    const timestamp = new Date().toTimeString().slice(0, 8);
    setSubtitle(translation || text);
    setRecords((prev) => [
      ...prev,
      { timestamp, language: language.toUpperCase(), original: text, translation },
    ]);
  }, []);

  const onError = useCallback((msg: string) => {
    setSubtitle(`⚠️ ${msg}`);
  }, []);

  const { start, stop } = useAudioRecorder({
    engine,
    koreanOnly,
    onResult,
    onVolume: setVolume,
    onError,
  });

  const handleStart = async () => {
    setRunning(true);
    setSubtitle("번역 중... 말씀하세요");
    const cleanup = await start();
    if (cleanup) cleanupRef.current = cleanup;
  };

  const handleStop = () => {
    stop();
    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
    setRunning(false);
    setSubtitle("중지됨");
    setVolume(0);
  };

  const handleNewMeeting = () => {
    handleStop();
    setRecords([]);
    setOriginalRecords(null);
    setSubtitle("번역 준비 완료");
  };

  const handleRefine = async () => {
    if (originalRecords !== null) {
      setRecords(originalRecords);
      setOriginalRecords(null);
      setSubtitle("↩️ 원본으로 복원됐습니다");
      return;
    }
    if (!records.length) { setSubtitle("⚠️ 정제할 내용이 없습니다"); return; }
    setSubtitle("텍스트 정제 중...");
    const res = await fetch("/api/refine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records }),
    });
    const { records: refined } = await res.json();
    setOriginalRecords(records);
    setRecords(refined);
    setSubtitle("✅ 정제 완료 — 요약 버튼을 누르세요");
  };

  const handleSummarize = async () => {
    if (!records.length) { setSubtitle("⚠️ 요약할 내용이 없습니다"); return; }
    setSubtitle("요약 생성 중...");
    const res = await fetch("/api/summarize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records }),
    });
    const { summary: s } = await res.json();
    setSummary(s);
    setShowSummary(true);
    setSubtitle("요약 완료");
  };

  const handleSaveTxt = () => {
    const lines = records.map((r) => {
      let line = `[${r.timestamp}] [${r.language}] ${r.original}`;
      if (r.translation) line += `\n        → ${r.translation}`;
      return line;
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `meeting-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const refineLabel = originalRecords !== null ? "↩️ 원복" : "✏️ 텍스트 정제";

  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-3xl mx-auto flex flex-col gap-4">
        <h1 className="text-xl font-bold text-gray-800">🎙️ 실시간 회의 번역기</h1>

        <ControlBar
          running={running}
          engine={engine}
          koreanOnly={koreanOnly}
          volume={volume}
          onStart={handleStart}
          onStop={handleStop}
          onNewMeeting={handleNewMeeting}
          onEngineChange={setEngine}
          onKoreanOnlyChange={setKoreanOnly}
        />

        <div>
          <label className="text-sm font-medium text-gray-600">실시간 자막</label>
          <SubtitleDisplay text={subtitle} />
        </div>

        <HistoryPanel
          records={records}
          onSaveTxt={handleSaveTxt}
          onRefine={handleRefine}
          onSummarize={handleSummarize}
          refineLabel={refineLabel}
        />
      </div>

      {showSummary && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 flex flex-col gap-4">
            <h2 className="text-lg font-bold">📋 회의 요약</h2>
            <p className="whitespace-pre-wrap text-sm text-gray-800 max-h-96 overflow-y-auto">{summary}</p>
            <button
              onClick={() => setShowSummary(false)}
              className="self-end px-4 py-2 bg-blue-500 text-white rounded-lg font-semibold"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
