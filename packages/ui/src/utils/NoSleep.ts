/**
 * NoSleep.js
 * Prevents mobile devices from sleeping.
 * usage:
 * const noSleep = new NoSleep();
 *
 * startButton.addEventListener('click', () => {
 *   noSleep.enable();
 * });
 *
 * stopButton.addEventListener('click', () => {
 *   noSleep.disable();
 * });
 *
 *
 */


class NoSleep {


  private wakeLock: WakeLockSentinel | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private enabled = false;

  async enable(): Promise<void> {
    if (this.enabled) return;
    this.enabled = true;

    // Probeer eerst de native Wake Lock API (vereist https)
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
        });

        // opnieuw aanvragen als tab weer zichtbaar wordt
        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        return;
      } catch {
        // val stil door naar de video-fallback
      }
    }

    // Fallback: onzichtbaar, muted, loopend video-elementje
    this.startVideoFallback();
  }

  disable(): void {
    this.enabled = false;

    if (this.wakeLock) {
      this.wakeLock.release();
      this.wakeLock = null;
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }

    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.remove();
      this.videoElement = null;
    }
  }

  private handleVisibilityChange = async (): Promise<void> => {
    if (this.enabled && document.visibilityState === 'visible' && !this.wakeLock) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
      } catch {
        // negeren, blijft gewoon zonder lock tot volgende poging
      }
    }
  };

  private startVideoFallback(): void {
    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    video.muted = true;
    video.loop = true;
    video.style.position = 'fixed';
    video.style.top = '-1px';
    video.style.left = '-1px';
    video.style.width = '1px';
    video.style.height = '1px';
    video.style.opacity = '0';
    video.style.pointerEvents = 'none';

    // minimale geldige mp4, base64-encoded (1 frame, zwart, stil)
    video.src =
      'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAtNtZGF0AAACrgYF//+q3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE1NSByMjkxNyAwYTg0ZDk4IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAxOCAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0wIHdlaWdodHA9MCBrZXlpbnQ9MjUwIGtleWludF9taW49MjUgc2NlbmVjdXQ9NDAgaW50cmFfcmVmcmVzaD0wIHJjX2xvb2thaGVhZD00MCByYz1jcmYgbWJ0cmVlPTEgY3JmPTIzLjAgcWNvbXA9MC42MCBxcG1pbj0wIHFwbWF4PTY5IHFwc3RlcD00IGlwX3JhdGlvPTEuNDAgYXE9MToxLjAwAIAAAAAOZWSAAK//8m+P0zGxAAAAB2WIhAA3//727L4FNf2f0JcRLMXaSnA+KqSAgHc0wAAAwAAAwAAAwB1oyu4YRfNAAAAB2WIhAA3//727L4FNf2f0JcRLMXaSnA+KqSAgHc0wAAAwAAAwAAAwB1oyu4YRfNAAAAAB1htdHRwOi8vd3d3LmZmbXBlZy5vcmcv';

    document.body.appendChild(video);
    video.play().catch(() => {
      // sommige browsers vereisen alsnog een user-gesture; genegeerd
    });

    this.videoElement = video;
  }
}

export default NoSleep;
