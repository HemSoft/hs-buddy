import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useMemo } from "react";

/**
 * Convex client provider for the Buddy app.
 * 
 * Wraps the app with ConvexProvider to enable real-time subscriptions
 * and type-safe queries/mutations throughout the component tree.
 */

// Get Convex URL from environment or use default dev URL
const CONVEX_URL = import.meta.env.VITE_CONVEX_URL || "https://balanced-trout-451.convex.cloud";

interface ConvexClientProviderProps {
  children: ReactNode;
}

export function ConvexClientProvider({ children }: ConvexClientProviderProps) {
  const client = useMemo(() => new ConvexReactClient(CONVEX_URL), []);

  return (
    <ConvexProvider client={client}>
      {children}
    </ConvexProvider>
  );
}

// Export the client type for use in hooks
export type { ConvexReactClient };
