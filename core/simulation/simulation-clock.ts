/**
 * SIMULATION CLOCK
 * 
 * Virtual time that can run at any speed.
 * 1 real second = N simulated days/weeks/months
 * 
 * "5 years in 5 minutes" - The time machine for economic testing
 */

import type { Timestamp } from '../shared/types';

// =============================================================================
// CLOCK CONFIGURATION
// =============================================================================

export interface ClockConfig {
  /** Starting point of simulation */
  startTime: Timestamp;
  
  /** Speed multiplier: 1 = real-time, 86400 = 1 day per second */
  speed: number;
  
  /** Tick interval in real milliseconds */
  tickIntervalMs: number;
}

export const CLOCK_PRESETS = {
  /** Real-time (for production) */
  REALTIME: { speed: 1, tickIntervalMs: 1000 },
  
  /** 1 day per second - good for watching */
  DAILY: { speed: 86400, tickIntervalMs: 1000 },
  
  /** 1 week per second */
  WEEKLY: { speed: 604800, tickIntervalMs: 1000 },
  
  /** 1 month per second - fast forward */
  MONTHLY: { speed: 2592000, tickIntervalMs: 1000 },
  
  /** 1 year per second - LUDICROUS SPEED */
  YEARLY: { speed: 31536000, tickIntervalMs: 1000 },
  
  /** 5 years in 5 minutes */
  FIVE_YEARS_FIVE_MINUTES: { speed: 31536000 * 5 / 300, tickIntervalMs: 1000 },
} as const;

// =============================================================================
// SIMULATION CLOCK
// =============================================================================

export type TickHandler = (tick: SimulationTick) => Promise<void>;

export interface SimulationTick {
  /** Real wall clock time */
  realTime: Timestamp;
  
  /** Simulated time */
  simulatedTime: Timestamp;
  
  /** Tick number since start */
  tickNumber: number;
  
  /** Simulated day number (from start) */
  simulatedDay: number;
  
  /** Simulated year (from start) */
  simulatedYear: number;
  
  /** Time elapsed in simulation (ms) */
  simulatedElapsed: number;
}

export class SimulationClock {
  private config: ClockConfig;
  private running: boolean = false;
  private tickNumber: number = 0;
  private handlers: TickHandler[] = [];
  private intervalId: NodeJS.Timeout | null = null;
  private realStartTime: Timestamp;
  
  constructor(config: Partial<ClockConfig> = {}) {
    this.config = {
      startTime: config.startTime ?? Date.now(),
      speed: config.speed ?? CLOCK_PRESETS.DAILY.speed,
      tickIntervalMs: config.tickIntervalMs ?? 1000,
    };
    this.realStartTime = Date.now();
  }
  
  // ---------------------------------------------------------------------------
  // LIFECYCLE
  // ---------------------------------------------------------------------------
  
  start(): void {
    if (this.running) return;
    
    this.running = true;
    this.realStartTime = Date.now();
    
    this.intervalId = setInterval(async () => {
      await this.tick();
    }, this.config.tickIntervalMs);
    
    console.log(`⏰ Simulation started at ${this.config.speed}x speed`);
    console.log(`   1 real second = ${this.formatDuration(this.config.speed * 1000)}`);
  }
  
  stop(): void {
    if (!this.running) return;
    
    this.running = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    console.log(`⏹️ Simulation stopped at tick ${this.tickNumber}`);
  }
  
  pause(): void {
    this.stop();
  }
  
  resume(): void {
    this.start();
  }
  
  // ---------------------------------------------------------------------------
  // TIME QUERIES
  // ---------------------------------------------------------------------------
  
  /** Get current simulated time */
  now(): Timestamp {
    const realElapsed = Date.now() - this.realStartTime;
    const simulatedElapsed = realElapsed * this.config.speed;
    return this.config.startTime + simulatedElapsed;
  }
  
  /** Get current tick info */
  getCurrentTick(): SimulationTick {
    const realTime = Date.now();
    const realElapsed = realTime - this.realStartTime;
    const simulatedElapsed = realElapsed * this.config.speed;
    const simulatedTime = this.config.startTime + simulatedElapsed;
    
    return {
      realTime,
      simulatedTime,
      tickNumber: this.tickNumber,
      simulatedDay: Math.floor(simulatedElapsed / (24 * 60 * 60 * 1000)),
      simulatedYear: Math.floor(simulatedElapsed / (365 * 24 * 60 * 60 * 1000)),
      simulatedElapsed,
    };
  }
  
  /** How much simulated time has passed */
  getSimulatedDuration(): { days: number; months: number; years: number } {
    const tick = this.getCurrentTick();
    return {
      days: tick.simulatedDay,
      months: Math.floor(tick.simulatedDay / 30),
      years: tick.simulatedYear,
    };
  }
  
  // ---------------------------------------------------------------------------
  // HANDLERS
  // ---------------------------------------------------------------------------
  
  /** Register a tick handler */
  onTick(handler: TickHandler): () => void {
    this.handlers.push(handler);
    return () => {
      const idx = this.handlers.indexOf(handler);
      if (idx >= 0) this.handlers.splice(idx, 1);
    };
  }
  
  /** Register handler for specific day intervals */
  onDay(dayInterval: number, handler: TickHandler): () => void {
    let lastDay = -1;
    return this.onTick(async (tick) => {
      const currentDay = tick.simulatedDay;
      if (currentDay !== lastDay && currentDay % dayInterval === 0) {
        lastDay = currentDay;
        await handler(tick);
      }
    });
  }
  
  /** Register handler for specific year intervals */
  onYear(yearInterval: number, handler: TickHandler): () => void {
    let lastYear = -1;
    return this.onTick(async (tick) => {
      const currentYear = tick.simulatedYear;
      if (currentYear !== lastYear && currentYear % yearInterval === 0) {
        lastYear = currentYear;
        await handler(tick);
      }
    });
  }
  
  // ---------------------------------------------------------------------------
  // INTERNAL
  // ---------------------------------------------------------------------------
  
  private async tick(): Promise<void> {
    this.tickNumber++;
    const tick = this.getCurrentTick();
    
    // Run all handlers
    for (const handler of this.handlers) {
      try {
        await handler(tick);
      } catch (error) {
        console.error(`Tick handler error:`, error);
      }
    }
  }
  
  private formatDuration(ms: number): string {
    const seconds = ms / 1000;
    const minutes = seconds / 60;
    const hours = minutes / 60;
    const days = hours / 24;
    const months = days / 30;
    const years = days / 365;
    
    if (years >= 1) return `${years.toFixed(1)} years`;
    if (months >= 1) return `${months.toFixed(1)} months`;
    if (days >= 1) return `${days.toFixed(1)} days`;
    if (hours >= 1) return `${hours.toFixed(1)} hours`;
    if (minutes >= 1) return `${minutes.toFixed(1)} minutes`;
    return `${seconds.toFixed(1)} seconds`;
  }
  
  // ---------------------------------------------------------------------------
  // CONFIGURATION
  // ---------------------------------------------------------------------------
  
  setSpeed(speed: number): void {
    this.config.speed = speed;
    console.log(`⏰ Speed changed to ${speed}x`);
  }
  
  usePreset(preset: keyof typeof CLOCK_PRESETS): void {
    const p = CLOCK_PRESETS[preset];
    this.config.speed = p.speed;
    this.config.tickIntervalMs = p.tickIntervalMs;
    console.log(`⏰ Using preset: ${preset}`);
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function createSimulationClock(
  preset: keyof typeof CLOCK_PRESETS = 'DAILY',
  startTime?: Timestamp
): SimulationClock {
  const p = CLOCK_PRESETS[preset];
  return new SimulationClock({
    startTime: startTime ?? Date.now(),
    speed: p.speed,
    tickIntervalMs: p.tickIntervalMs,
  });
}
