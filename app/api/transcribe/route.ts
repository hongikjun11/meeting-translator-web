import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const maxDuration = 60;

const RMS_THRESHOLD = 0.03;

function calcRms(buffer: ArrayBuffer): number {
  const view = new Int16Array(buffer);
  let sum = 0;
  for (let i = 0; i < view.length; i++) {
    const s = view[i] / 32768;
    sum += s * s;
  }
  return Math.sqrt(sum / view.length);
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("audio") as File;
  const engine = (formData.get("engine") as string) ?? "openai";
  const koreanOnly = formData.get("koreanOnly") === "true";

  if (!file) return NextResponse.json({ text: "", language: "" });

  // RMS 체크
  const arrayBuffer = await file.arrayBuffer();
  const rms = calcRms(arrayBuffer);
  if (rms < RMS_THRESHOLD) {
    return NextResponse.json({ text: "", language: "" });
  }

  const audioFile = new File([arrayBuffer], "audio.webm", { type: file.type });

  if (engine === "groq") {
    const { Groq } = await import("groq-sdk");
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const kwargs: any = {
      model: "whisper-large-v3",
      file: audioFile,
      response_format: "verbose_json",
    };
    if (koreanOnly) kwargs.language = "ko";
    const transcript = await groq.audio.transcriptions.create(kwargs);
    return NextResponse.json({ text: transcript.text.trim(), language: (transcript as { language?: string }).language ?? "" });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const kwargs: any = {
    model: "whisper-1",
    file: audioFile,
    response_format: "verbose_json",
  };
  if (koreanOnly) kwargs.language = "ko";
  const transcript = await openai.audio.transcriptions.create(kwargs);
  return NextResponse.json({ text: transcript.text.trim(), language: (transcript as { language?: string }).language ?? "" });
}
