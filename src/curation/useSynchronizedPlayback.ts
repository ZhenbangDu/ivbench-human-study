import { useCallback, useEffect, useRef, useState } from 'react';

export function useSynchronizedPlayback(durationSeconds: number, itemId: string) {
  const videos = useRef<Array<HTMLVideoElement | null>>([]);
  const [playing, setPlaying] = useState(false);
  const [time, setTimeState] = useState(0);

  const registerVideo = useCallback((index: number) => (video: HTMLVideoElement | null) => {
    videos.current[index] = video;
  }, []);

  const setTime = useCallback((nextTime: number) => {
    const bounded = Math.max(0, Math.min(durationSeconds, nextTime));
    setTimeState(bounded);
    for (const video of videos.current) {
      if (video && Number.isFinite(video.duration === 0 ? 0 : bounded)) video.currentTime = bounded;
    }
  }, [durationSeconds]);

  const pause = useCallback(() => {
    setPlaying(false);
    for (const video of videos.current) video?.pause();
  }, []);

  const play = useCallback(() => {
    if (time >= durationSeconds - 0.01) setTime(0);
    setPlaying(true);
    for (const video of videos.current) {
      if (video) void video.play().catch(() => setPlaying(false));
    }
  }, [durationSeconds, setTime, time]);

  const toggle = useCallback(() => {
    if (playing) pause();
    else play();
  }, [pause, play, playing]);

  const replay = useCallback(() => {
    setTime(0);
    play();
  }, [play, setTime]);

  const onTimeUpdate = useCallback((sourceIndex: number, currentTime: number) => {
    if (sourceIndex !== 0) return;
    setTimeState(currentTime);
    const comparison = videos.current[1];
    if (comparison && Math.abs(comparison.currentTime - currentTime) > 0.15) {
      comparison.currentTime = currentTime;
    }
  }, []);

  useEffect(() => {
    setPlaying(true);
    setTimeState(0);
    for (const video of videos.current) {
      if (video) video.currentTime = 0;
    }
  }, [itemId]);

  return { playing, time, registerVideo, setTime, toggle, replay, onTimeUpdate };
}
