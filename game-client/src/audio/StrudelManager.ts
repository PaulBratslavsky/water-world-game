/**
 * StrudelManager - Handles Strudel live coding music integration
 *
 * Provides play/stop controls and volume management for the acid techno pattern.
 */

import { initStrudel } from '@strudel/web';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StrudelInstance = any;

export class StrudelManager {
  private strudel: StrudelInstance | null = null;
  private isPlaying: boolean = false;
  private isInitialized: boolean = false;
  private volume: number = 0.5;
  private customPattern: string | null = null;

  // Generate pattern with current volume applied as master gain
  private getPattern(): string {
    const vol = this.volume;
    return `
stack(
  // Acid lead - sawtooth with filter envelope
  n("<0 4 7 11 0 4 9 7>*8")
    .scale("G:minor")
    .sound("sawtooth")
    .cutoff(sine.range(200, 2000).slow(4))
    .resonance(15)
    .gain(${0.4 * vol}),

  // Kick - sine wave with pitch envelope
  note("g1")
    .struct("x*4")
    .sound("sine")
    .decay(0.15)
    .sustain(0)
    .gain(${0.8 * vol}),

  // Hi-hat - noise with short decay
  sound("square")
    .struct("x*16")
    .note(100)
    .decay(0.02)
    .sustain(0)
    .gain(${0.2 * vol})
    .cutoff(8000),

  // Bass
  n("<0 0 5 0>*4")
    .scale("G:minor")
    .sound("sawtooth")
    .cutoff(400)
    .gain(${0.5 * vol}),

  // Pad chords
  n("<[0,2,4] [0,2,4] [4,6,9] [2,4,7]>/2")
    .scale("G:minor")
    .sound("sawtooth")
    .attack(0.1)
    .decay(0.3)
    .sustain(0.6)
    .cutoff(1200)
    .gain(${0.15 * vol})
)
`;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.strudel = await initStrudel();
      this.isInitialized = true;
      console.log('Strudel initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Strudel:', error);
    }
  }

  async play(): Promise<void> {
    if (this.isPlaying) {
      console.log('Already playing');
      return;
    }

    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.strudel) {
      console.error('Strudel not initialized');
      return;
    }

    try {
      // Stop any existing patterns first
      this.strudel.stop();

      console.log('Evaluating pattern...');
      const pattern = this.customPattern || this.getPattern();
      await this.strudel.evaluate(pattern);
      this.isPlaying = true;
      console.log('Strudel playback started');
    } catch (error) {
      console.error('Failed to start Strudel playback:', error);
    }
  }

  async stop(): Promise<void> {
    if (!this.strudel) return;

    try {
      this.strudel.stop();
      this.isPlaying = false;
      console.log('Strudel playback stopped');
    } catch (error) {
      console.error('Failed to stop Strudel playback:', error);
    }
  }

  async toggle(): Promise<void> {
    if (this.isPlaying) {
      await this.stop();
    } else {
      await this.play();
    }
  }

  setVolume(value: number): void {
    this.volume = Math.max(0, Math.min(1, value));

    // Re-evaluate pattern with new volume if playing (only for default pattern)
    if (this.isPlaying && this.strudel && !this.customPattern) {
      this.strudel.evaluate(this.getPattern());
    }
  }

  getVolume(): number {
    return this.volume;
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Set a custom pattern to play (overrides the default pattern)
   */
  setPattern(pattern: string): void {
    this.customPattern = pattern;
    // If already playing, update the pattern
    if (this.isPlaying && this.strudel) {
      this.strudel.evaluate(pattern);
    }
  }

  /**
   * Clear custom pattern and use default
   */
  clearCustomPattern(): void {
    this.customPattern = null;
    if (this.isPlaying && this.strudel) {
      this.strudel.evaluate(this.getPattern());
    }
  }
}
