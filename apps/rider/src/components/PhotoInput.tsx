import { useRef, useState } from "react";

export function PhotoInput({ label, onCapture }: { label: string; onCapture: (dataUri: string | null) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;
      setPreview(dataUri);
      onCapture(dataUri);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {preview ? (
        <div className="relative">
          <img src={preview} alt={label} className="h-40 w-full rounded-lg object-cover" />
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              onCapture(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-xs text-white"
          >
            Retake
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-40 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 text-slate-400"
        >
          <span className="text-3xl">📷</span>
          <span className="mt-1 text-sm">Tap to capture</span>
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={onChange} className="hidden" />
    </div>
  );
}
