/**
 * Ambient types for the `promise` npm package's rejection-tracking module
 * (a transitive dependency of react-native; ships without bundled types).
 */
declare module 'promise/setimmediate/rejection-tracking' {
  export interface RejectionTrackingOptions {
    allRejections?: boolean;
    whitelist?: Array<unknown>;
    onUnhandled?: (id: number, rejection: unknown) => void;
    onHandled?: (id: number) => void;
  }
  export function enable(options?: RejectionTrackingOptions): void;
  export function disable(): void;
}