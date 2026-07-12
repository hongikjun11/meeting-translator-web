"use client";

import { useRef, useEffect, useState } from "react";
import type { Record } from "@/app/api/refine/route";

interface Props {
  records: Record[];
  onSaveTxt: () => void;
  onSummarize: () => void;
  onEditRecord: (index: number, field: "original" | "translation", value: string) => void;
  canRevert: boolean;
  onRevert: () => void;
}

export default function HistoryPanel({
  records, onSaveTxt, onSummarize, onEditRecord, canRevert, onRevert,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<{ index: number; field: "original" | "translation" } | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (!editing) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [records, editing]);

  const startEdit = (index: number, field: "original" | "translation", value: string) => {
    setEditing({ index, field });
    setDraft(value);
  };

  const commitEdit = () => {
    if (editing) onEditRecord(editing.index, editing.field, draft);
    setEditing(null);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commitEdit();
    } else if (e.key === "Escape") {
      setEditing(null);
    }
  };

  const isEditing = (i: number, f: "original" | "translation") =>
    editing?.index === i && editing?.field === f;

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <label className="text-sm font-medium text-gray-600">
        대화 기록 <span className="text-gray-400 font-normal">(잘못된 부분을 클릭해 바로 수정)</span>
      </label>
      <div className="flex-1 overflow-y-auto bg-white border border-gray-200 rounded-lg p-3 font-[Malgun Gothic,sans-serif] text-sm min-h-[200px] max-h-[400px]">
        {records.map((r, i) => (
          <div key={i} className="mb-1">
            <span className="text-gray-500">[{r.timestamp}]</span>{" "}
            <span className="text-gray-400 text-xs">[{r.language}]</span>{" "}
            {isEditing(i, "original") ? (
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={onKeyDown}
                rows={1}
                className="align-top w-full border border-blue-400 rounded px-1 py-0.5 text-sm resize-y"
              />
            ) : (
              <span
                onClick={() => startEdit(i, "original", r.original)}
                className="cursor-text hover:bg-yellow-50 rounded px-0.5"
                title="클릭해서 수정"
              >
                {r.original}
              </span>
            )}
            {(r.translation || isEditing(i, "translation")) && (
              <div className="ml-8 text-blue-600">
                →{" "}
                {isEditing(i, "translation") ? (
                  <textarea
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={onKeyDown}
                    rows={1}
                    className="align-top w-[90%] border border-blue-400 rounded px-1 py-0.5 text-sm resize-y text-blue-600"
                  />
                ) : (
                  <span
                    onClick={() => startEdit(i, "translation", r.translation)}
                    className="cursor-text hover:bg-yellow-50 rounded px-0.5"
                    title="클릭해서 수정"
                  >
                    {r.translation}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 flex-wrap">
        <button onClick={onSaveTxt} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">
          TXT 저장
        </button>
        {canRevert && (
          <button onClick={onRevert} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">
            ↩️ 정제 원복
          </button>
        )}
        <button onClick={onSummarize} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium">
          📋 회의 요약
        </button>
      </div>
    </div>
  );
}
