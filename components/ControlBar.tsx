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
}

export default function ControlBar({
  running, engine, koreanOnly,
  onStart, onStop, onNewMeeting,
  onEngineChange, onKoreanOnlyChange,
  volume,
}: Props) {
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
        <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-75"
            style={{ width: `${Math.min(volume * 100, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
