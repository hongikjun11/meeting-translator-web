"use client";

import { useRef, useEffect } from "react";
import type { Record } from "@/app/api/refine/route";

interface Props {
  records: Record[];
  onSaveTxt: () => void;
  onRefine: () => void;
  onSummarize: () => void;
  refineLabel: string;
}

export default function HistoryPanel({ records, onSaveTxt, onRefine, onSummarize, refineLabel }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [records]);

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <label className="text-sm font-medium text-gray-600">대화 기록</label>
      <div className="flex-1 overflow-y-auto bg-white border border-gray-200 rounded-lg p-3 font-[Malgun Gothic,sans-serif] text-sm min-h-[200px] max-h-[400px]">
        {records.map((r, i) => (
          <div key={i} className="mb-1">
            <span className="text-gray-500">[{r.timestamp}]</span>{" "}
            <span className="text-gray-400 text-xs">[{r.language}]</span>{" "}
            <span>{r.original}</span>
            {r.translation && (
              <div className="ml-8 text-blue-600">→ {r.translation}</div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 flex-wrap">
        <button onClick={onSaveTxt} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">
          TXT 저장
        </button>
        <button onClick={onRefine} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">
          {refineLabel}
        </button>
        <button onClick={onSummarize} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">
          📋 회의 요약
        </button>
      </div>
    </div>
  );
}
