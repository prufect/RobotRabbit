declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

declare module 'npm:@insforge/sdk' {
  export function createClient(options: Record<string, unknown>): any;
  export function createAdminClient(options: Record<string, unknown>): any;
}
