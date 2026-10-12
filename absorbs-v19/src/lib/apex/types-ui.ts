/** أنواع خاصة بواجهة الاستوديو */

export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error';

export interface ConsoleLine {
  level: ConsoleLevel;
  text: string;
  at: number;
}

export type Device = 'desktop' | 'tablet' | 'mobile';
