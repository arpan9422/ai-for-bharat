'use client';
import { emotionEmoji, intentLabel, languageLabel } from '@/lib/utils';

interface Message {
  role: string; content: string; timestamp: number;
  language?: string; intent?: string; emotion?: string; score?: number;
}

export default function TranscriptViewer({ messages }: { messages: Message[] }) {
  if (!messages.length) return <p className="text-sm text-gray-400 text-center py-8">No transcript available</p>;

  return (
    <div className="space-y-4 max-h-[480px] overflow-y-auto pr-1">
      {messages.map((msg, i) => {
        const isAgent = msg.role === 'assistant';
        return (
          <div key={i} className={`flex gap-2.5 ${isAgent ? '' : 'flex-row-reverse'}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
              isAgent ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-600'
            }`}>
              {isAgent ? 'P' : 'L'}
            </div>
            <div className={`max-w-[78%] flex flex-col gap-1 ${isAgent ? '' : 'items-end'}`}>
              <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                isAgent ? 'bg-indigo-600 text-white rounded-tl-sm' : 'bg-gray-100 text-gray-800 rounded-tr-sm'
              }`}>
                {msg.content}
              </div>
              <div className={`flex items-center gap-1.5 text-xs text-gray-400 ${isAgent ? '' : 'flex-row-reverse'}`}>
                <span>{new Date(msg.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                {msg.language && <span className="text-gray-300">·</span>}
                {msg.language && <span>{languageLabel(msg.language)}</span>}
                {msg.intent && !isAgent && <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{intentLabel(msg.intent)}</span>}
                {msg.emotion && !isAgent && <span>{emotionEmoji(msg.emotion)}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
