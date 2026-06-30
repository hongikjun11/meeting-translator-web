interface Props {
  text: string;
}

export default function SubtitleDisplay({ text }: Props) {
  return (
    <div className="bg-gray-100 rounded-xl px-4 py-4 min-h-[80px] flex items-center justify-center text-center">
      <p className="text-lg font-bold text-gray-800 whitespace-pre-wrap">{text || " "}</p>
    </div>
  );
}
