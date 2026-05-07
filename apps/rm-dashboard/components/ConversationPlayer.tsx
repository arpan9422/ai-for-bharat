'use client';
import { useEffect, useState, useRef } from 'react';
import { fetchCallAudioChunks } from '@/lib/api';

interface Chunk {
  index: number;
  speaker?: 'agent' | 'user';
  text?: string;
  mimeType: string;
  url: string | null;
  sizeBytes: number;
}

interface Props {
  callId: string;
}

export default function ConversationPlayer({ callId }: Props) {
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [playAll, setPlayAll] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetchCallAudioChunks(callId)
      .then(data => setChunks(data.chunks))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [callId]);

  const playChunk = (index: number) => {
    const chunk = chunks[index];
    if (!chunk?.url) return;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = chunk.url;
      setCurrentTime(0);
      setDuration(0);
      audioRef.current.play().catch(() => {});
      setPlayingIndex(index);
    }
  };

  const seekTo = (value: number) => {
    if (!audioRef.current || !Number.isFinite(value)) return;
    audioRef.current.currentTime = value;
    setCurrentTime(value);
  };

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const nextPlayableIndex = (fromIndex: number) => {
    for (let i = fromIndex; i < chunks.length; i += 1) {
      if (chunks[i]?.url) return i;
    }
    return -1;
  };

  const handleEnded = () => {
    if (playAll && playingIndex !== null) {
      const next = nextPlayableIndex(playingIndex + 1);
      if (next >= 0) {
        playChunk(next);
      } else {
        setPlayingIndex(null);
        setPlayAll(false);
      }
    } else {
      setPlayingIndex(null);
    }
    setCurrentTime(0);
  };

  const startPlayAll = () => {
    setPlayAll(true);
    const first = nextPlayableIndex(0);
    if (first >= 0) playChunk(first);
  };

  const stopAll = () => {
    setPlayAll(false);
    setPlayingIndex(null);
    setCurrentTime(0);
    setDuration(0);
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ''; }
  };

  if (loading) {
    return (
      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-48 mb-3" />
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-10 bg-gray-200 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (error || chunks.length === 0) {
    return (
      <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-center">
        <svg className="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
        <p className="text-sm text-gray-400">
          {error ? 'Could not load recordings' : 'No audio chunks available for this call'}
        </p>
      </div>
    );
  }

  const playableChunks = chunks.filter(c => c.url);
  const hasAudio = playableChunks.length > 0;

  return (
    <div className="space-y-3">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onEnded={handleEnded}
        onLoadedMetadata={event => setDuration(event.currentTarget.duration || 0)}
        onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime || 0)}
        className="hidden"
      />

      {/* Header + Play All */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Full Conversation Recording
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {playableChunks.length} recorded turn{playableChunks.length !== 1 ? 's' : ''} in sequence
          </p>
        </div>
        {hasAudio && (
          playAll ? (
            <button onClick={stopAll}
              className="inline-flex items-center gap-1.5 text-xs bg-red-100 text-red-700 border border-red-200 px-3 py-1.5 rounded-lg font-semibold hover:bg-red-200 transition-colors">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
              Stop
            </button>
          ) : (
            <button onClick={startPlayAll}
              className="inline-flex items-center gap-1.5 text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-indigo-700 transition-colors shadow-sm">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play Full Recording
            </button>
          )
        )}
      </div>

      {hasAudio && (
        <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
          <div className="flex items-center gap-3">
            <span className="w-10 text-xs font-medium text-gray-400 tabular-nums">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(currentTime, duration || 0)}
              disabled={playingIndex === null || duration <= 0}
              onChange={event => seekTo(Number(event.target.value))}
              className="h-2 flex-1 cursor-pointer accent-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Seek audio"
            />
            <span className="w-10 text-right text-xs font-medium text-gray-400 tabular-nums">{formatTime(duration)}</span>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            {playingIndex === null ? 'Play a turn to scrub through its audio' : `Turn ${chunks[playingIndex]?.index ?? ''}`}
          </p>
        </div>
      )}

      {/* Turn list */}
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {chunks.map((chunk, i) => {
          const isAgent = chunk.speaker === 'agent';
          const isPlaying = playingIndex === i;
          const hasUrl = !!chunk.url;

          return (
            <div key={chunk.index}
              className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                isPlaying
                  ? 'border-indigo-300 bg-indigo-50'
                  : isAgent
                    ? 'border-gray-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/30'
                    : 'border-gray-100 bg-gray-50'
              }`}>

              {/* Speaker badge */}
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                isAgent ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-600'
              }`}>
                {isAgent ? 'P' : 'L'}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-gray-600">
                    {isAgent ? 'Priya (Agent)' : 'Lead'}
                  </span>
                  <span className="text-xs text-gray-300">·</span>
                  <span className="text-xs text-gray-400">Turn {chunk.index}</span>
                  {isPlaying && (
                    <span className="inline-flex items-center gap-1 text-xs text-indigo-600 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                      Playing
                    </span>
                  )}
                </div>
                {chunk.text && (
                  <p className="text-sm text-gray-700 leading-relaxed line-clamp-2">{chunk.text}</p>
                )}
              </div>

              <button
                onClick={() => hasUrl && playChunk(i)}
                disabled={!hasUrl}
                className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  !hasUrl ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                  : isPlaying ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-500 hover:bg-indigo-100 hover:text-indigo-600'
                }`}
                title={hasUrl ? 'Play this turn' : 'No audio available'}>
                {isPlaying ? (
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
