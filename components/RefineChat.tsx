"use client";

import { useRef, useEffect, useState } from "react";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  messages: ChatMessage[];
  loading: boolean;
  onSend: (instruction: string) => void;
}

const EXAMPLES = [
  "이번 회의는 차량용 반도체 SoC 설계 리뷰야. 참석자는 김철수, 이영희.",
  "'의원님'을 '위원님'으로 고쳐줘",
  "문장 자연스럽게 다듬어줘",
];

// 전체 정제 기본 지시 — 같은 단어의 오인식 편차를 유추해 올바른 형태로 통일
const AUTO_REFINE =
  "전체 대화 기록을 검토해서 음성인식 오류를 교정해줘. " +
  "핵심 규칙: 같은 단어인데 어떤 곳은 정확히, 어떤 곳은 다르게(오인식) 표기된 경우가 있어. " +
  "이런 표기 편차들을 서로 같은 단어로 유추해서, 문맥상 가장 올바른 하나의 형태로 통일해줘. " +
  "(예: '위원님'과 '의원님', '위언님'이 섞여 있으면 문맥상 맞는 '위원님'으로 모두 통일) " +
  "그 밖에 문맥상 어색하거나 잘못 인식된 단어, 오탈자, 어색한 문장도 자연스럽게 다듬어줘. " +
  "발언의 의미와 내용은 그대로 유지해줘.";

export default function RefineChat({ messages, loading, onSend }: Props) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = () => {
    const v = input.trim();
    if (!v || loading) return;
    onSend(v);
    setInput("");
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-gray-600">
        AI 대화 기록 정제 <span className="text-gray-400 font-normal">(회의 시작 전 배경을 알려주면 기억했다가 정제에 활용)</span>
      </label>

      <button
        onClick={() => onSend(AUTO_REFINE)}
        disabled={loading}
        className="self-start px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white rounded-lg text-sm font-semibold"
      >
        ✨ 전체 정제 (오인식·반복 자동 교정)
      </button>

      <div className="bg-white border border-gray-200 rounded-lg p-3 text-sm max-h-56 overflow-y-auto flex flex-col gap-2">
        {messages.length === 0 && (
          <div className="text-gray-400 text-xs flex flex-wrap gap-1 items-center">
            예시:
            {EXAMPLES.map((ex) => (
              <span
                key={ex}
                className="px-2 py-0.5 bg-gray-100 rounded-full text-gray-500 select-none"
              >
                {ex}
              </span>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <span
              className={
                "inline-block px-3 py-1.5 rounded-2xl whitespace-pre-wrap " +
                (m.role === "user" ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-800")
              }
            >
              {m.content}
            </span>
          </div>
        ))}
        {loading && <div className="text-gray-400 text-xs">수정 중...</div>}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); send(); }
          }}
          placeholder="회의 배경 설명 또는 수정 지시 (예: 이번 회의는 ~야 / 이름 표기 통일해줘)"
          disabled={loading}
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-white rounded-lg font-semibold text-sm"
        >
          보내기
        </button>
      </div>
    </div>
  );
}
