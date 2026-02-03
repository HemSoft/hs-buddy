import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

/**
 * One-time migration from electron-store to Convex
 * Runs on app startup with a timeout to prevent infinite loading
 */
export function useMigrateToConvex() {
  const bulkImportAccounts = useMutation(api.githubAccounts.bulkImport);
  const initSettings = useMutation(api.settings.initFromMigration);
  const [isComplete, setIsComplete] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const migrationAttempted = useRef(false);

  // Check if Convex already has data (skip migration if so)
  const existingAccounts = useQuery(api.githubAccounts.list);
  const existingSettings = useQuery(api.settings.get);

  // Loading until Convex queries resolve OR timeout
  const isLoading = (existingAccounts === undefined || existingSettings === undefined) && !timedOut;

  // Timeout after 3 seconds to prevent infinite loading
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isComplete) {
        console.warn('[Migration] Convex connection timeout - proceeding without migration');
        setTimedOut(true);
        setIsComplete(true);
      }
    }, 3000);
    return () => clearTimeout(timeout);
  }, [isComplete]);

  useEffect(() => {
    // Wait for Convex queries to load first
    if (isLoading) {
      return;
    }

    // Only attempt migration once per session
    if (migrationAttempted.current) {
      setIsComplete(true);
      return;
    }
    migrationAttempted.current = true;

    const migrate = async () => {
      try {
        // Get data from electron-store
        const config = await window.ipcRenderer.invoke('config:get-config');
        
        // Migrate GitHub accounts if any exist in electron-store AND not already in Convex
        // Guard against undefined (convex not connected)
        if (config.github?.accounts?.length > 0 && existingAccounts && existingAccounts.length === 0) {
          console.log('[Migration] Importing GitHub accounts from electron-store...');
          const imported = await bulkImportAccounts({ accounts: config.github.accounts });
          if (imported.length > 0) {
            console.log(`[Migration] Imported ${imported.length} GitHub accounts to Convex`);
          }
        }

        // Migrate PR settings if they exist in electron-store AND settings don't exist in Convex yet
        // existingSettings without _id means it's a default object, not a real Convex document
        const settingsExistInConvex = existingSettings && '_id' in existingSettings;
        if (config.pr && !settingsExistInConvex) {
          console.log('[Migration] Importing PR settings from electron-store...');
          await initSettings({ pr: config.pr });
          console.log('[Migration] PR settings migrated to Convex');
        }
      } catch (error) {
        console.error('[Migration] Failed to migrate from electron-store:', error);
      } finally {
        setIsComplete(true);
      }
    };

    migrate();
  }, [isLoading, existingAccounts, existingSettings, bulkImportAccounts, initSettings]);

  return { isComplete, isLoading };
}
