import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { api } from '@/services/api/client';
import { useAuthStore } from '@/stores/authStore';

type IssueSource = 'mobile_customer' | 'mobile_vendor';
type IssueType = 'crash' | 'unhandled_error' | 'user_report';
type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';

interface ReportIssueInput {
  type: IssueType;
  message: string;
  stack?: string;
  route?: string;
  severity?: IssueSeverity;
  metadata?: Record<string, unknown>;
}

function getSource(): IssueSource {
  const role = useAuthStore.getState().role;
  return role === 'vendor' ? 'mobile_vendor' : 'mobile_customer';
}

/**
 * Fire-and-forget POST to the backend issue-report endpoint.
 * Auth header is attached automatically by the axios client interceptor
 * when a session exists. Unauthenticated crashes still land (the backend
 * strips userId/vendorId when no JWT is present).
 */
export async function reportIssue(input: ReportIssueInput): Promise<void> {
  try {
    const appVersion = Constants.expoConfig?.version ?? undefined;

    await api.post('/api/issues', {
      source: getSource(),
      type: input.type,
      message: input.message.slice(0, 2000),
      stack: input.stack?.slice(0, 8000),
      route: input.route,
      severity: input.severity ?? 'high',
      appVersion,
      platform: `${Platform.OS} ${Platform.Version}`,
      metadata: input.metadata,
    });
  } catch {
    // Best-effort: never block or throw
  }
}
