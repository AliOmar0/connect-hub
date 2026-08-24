import React, { useState, useRef, useEffect } from "react";
import { Play, Pause, Mic, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatVoicePlayerProps {
  url: string;
  isOutbound?: boolean;
}

export const ChatVoicePlayer: React.FC<ChatVoicePlayerProps> = ({
  url,
  isOutbound,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const onLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const onTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const onEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 p-2 rounded-xl min-w-[200px] sm:min-w-[240px]",
        isOutbound
          ? "bg-primary-foreground/10 border border-primary-foreground/20"
          : "bg-background/50 border border-border/50",
      )}
    >
      <audio
        ref={audioRef}
        src={url}
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
        className="hidden"
      />

      <button
        onClick={togglePlay}
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90",
          isOutbound
            ? "bg-white text-primary hover:bg-white/90"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      <div className="flex-1 flex flex-col gap-1 mt-1">
        <div className="relative h-1.5 w-full bg-muted/30 rounded-full overflow-hidden">
          <div
            className={cn(
              "absolute top-0 left-0 h-full transition-all duration-100 ease-linear rounded-full",
              isOutbound ? "bg-white" : "bg-primary",
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between items-center">
          <span
            className={cn(
              "text-caption font-medium",
              isOutbound
                ? "text-primary-foreground/80"
                : "text-muted-foreground",
            )}
          >
            {formatTime(currentTime)}
          </span>
          <div className="flex items-center gap-1 opacity-50">
            <Mic
              className={cn(
                "w-3 h-3",
                isOutbound ? "text-white" : "text-primary",
              )}
            />
            <span
              className={cn(
                "text-caption",
                isOutbound ? "text-white" : "text-primary",
              )}
            >
              {formatTime(duration || 0)}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 opacity-40">
        <Volume2
          className={cn(
            "w-3.5 h-3.5",
            isOutbound ? "text-white" : "text-primary",
          )}
        />
      </div>
    </div>
  );
};
