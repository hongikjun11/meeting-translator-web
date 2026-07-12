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

const EXAMPLES = ["오탈자 전부 고쳐줘", "전부 존댓말로 바꿔줘", "'김철수'를 '김민수'로 바꿔줘"];

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
        AI 정제 대화 <span className="text-gray-400 font-normal">(지시하면 대화 기록을 고쳐줍니다)</span>
      </label>

      <div className="bg-white border border-gray-200 rounded-lg p-3 text-sm max-h-56 overflow-y-auto flex flex-col gap-2">
        {messages.length === 0 && (
          <div className="text-gray-400 text-xs flex flex-wrap gap-1 items-center">
            예시:
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => onSend(ex)}
                disabled={loading}
                className="px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded-full disabled:opacity-40"
              >
                {ex}
              </button>
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
          placeholder="예: 이름 표기 통일해줘, 문장 자연스럽게 다듬어줘"
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
