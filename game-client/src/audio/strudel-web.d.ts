declare module '@strudel/web' {
  export interface StrudelInstance {
    evaluate: (code: string) => Promise<{ pattern?: unknown }>;
    stop: () => void;
  }

  export function initStrudel(): Promise<StrudelInstance>;
}
