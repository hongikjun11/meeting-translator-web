"use client";

interface Props {
  running: boolean;
  engine: "openai" | "groq";
  koreanOnly: boolean;
  onStart: () => void;
  onStop: () => void;
  onNewMeeting: () => void;
  onEngineChange: (v: "openai" | "groq") => void;
  onKoreanOnlyChange: (v: boolean) => void;
  volume: number;
  threshold: number;
  onThresholdChange: (v: number) => void;
}

export default function ControlBar({
  running, engine, koreanOnly,
  onStart, onStop, onNewMeeting,
  onEngineChange, onKoreanOnlyChange,
  volume, threshold, onThresholdChange,
}: Props) {
  const active = volume >= threshold; // 임계값 넘으면 전송 대상(초록), 아니면 무음(회색)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2 items-center">
        <button
          onClick={onStart}
          disabled={running}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white rounded-lg font-semibold text-sm"
        >
          🎙️ 시작
        </button>
        <button
          onClick={onStop}
          disabled={!running}
          className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white rounded-lg font-semibold text-sm"
        >
          ⏹ 중지
        </button>
        <button
          onClick={onNewMeeting}
          className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-semibold text-sm"
        >
          🔄 새 회의
        </button>
        <select
          value={engine}
          onChange={(e) => onEngineChange(e.target.value as "openai" | "groq")}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="openai">OpenAI Whisper-1</option>
          <option value="groq">Groq Whisper large-v3 (무료)</option>
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={koreanOnly}
            onChange={(e) => onKoreanOnlyChange(e.target.checked)}
            className="w-4 h-4"
          />
          한국어 고정
        </label>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm">🎙️</span>
        <div className="relative flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
          {/* 바: RMS 0~0.3 범위를 100%로 확대 표시 */}
          <div
            className={`h-full rounded-full transition-all duration-75 ${active ? "bg-green-500" : "bg-gray-400"}`}
            style={{ width: `${Math.min((volume / 0.3) * 100, 100)}%` }}
          />
          {/* 임계값 위치 표시선 */}
          <div
            className="absolute top-0 h-full w-0.5 bg-red-500"
            style={{ left: `${Math.min((threshold / 0.3) * 100, 100)}%` }}
          />
        </div>
        <span className="text-xs font-mono text-gray-500 w-24 text-right">
          RMS {volume.toFixed(3)}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="whitespace-nowrap">무음 기준 {threshold.toFixed(3)}</span>
        <input
          type="range"
          min={0}
          max={0.15}
          step={0.005}
          value={threshold}
          onChange={(e) => onThresholdChange(Number(e.target.value))}
          className="flex-1"
        />
        <span className="whitespace-nowrap text-gray-400">← 조용할 때 RMS보다 살짝 높게</span>
      </div>
    </div>
  );
}
