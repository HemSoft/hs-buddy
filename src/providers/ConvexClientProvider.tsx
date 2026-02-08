import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useMemo } from "react";

/**
 * Convex client provider for the Buddy app.
 * 
 * Wraps the app with ConvexProvider to enable real-time subscriptions
 * and type-safe queries/mutations throughout the component tree.
 */

// Get Convex URL from environment — must be set in .env.local
const CONVEX_URL = import.meta.env.VITE_CONVEX_URL;

if (!CONVEX_URL) {
  throw new Error(
    "VITE_CONVEX_URL is not set. Run 'npx convex dev' or './runServer.ps1' first to generate .env.local"
  );
}

interface ConvexClientProviderProps {
  children: ReactNode;
}

export function ConvexClientProvider({ children }: ConvexClientProviderProps) {
  const client = useMemo(() => {
    console.log(`[Convex] Connecting to ${CONVEX_URL}`);
    return new ConvexReactClient(CONVEX_URL);
  }, []);

  return (
    <ConvexProvider client={client}>
      {children}
    </ConvexProvider>
  );
}

// Export the client type for use in hooks
export type { ConvexReactClient };
