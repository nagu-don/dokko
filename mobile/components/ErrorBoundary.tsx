import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/AppText';
import { BrandTopBar } from '@/components/BrandTopBar';
import { Button } from '@/components/form';
import { useSettingsStore } from '@/stores/settingsStore';
import { t } from '@/i18n';
import { reportIssue } from '@/services/issues/reportIssue';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Best-effort current route, read at the call site (expo-router's usePathname). */
  route?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** Localized fallback UI. Hook-based so the active language stays reactive. */
function ErrorBoundaryFallback({ onRetry }: { onRetry: () => void }) {
  const lang = useSettingsStore((s) => s.lang);
  return (
    <View style={styles.container}>
      <BrandTopBar title={t(lang, 'errorBoundaryTitle')} />
      <View style={styles.body}>
        <Text style={styles.message}>{t(lang, 'errorBoundaryMessage')}</Text>
        <Button title={t(lang, 'errorBoundaryRetry')} onPress={onRetry} />
      </View>
    </View>
  );
}

/**
 * Top-level error boundary. Catches render-phase and lifecycle errors in the
 * React tree, reports them to the backend, and shows a localized fallback UI
 * so the user is never stuck on a blank screen.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportIssue({
      type: 'crash',
      message: error.message,
      stack: `${error.stack ?? ''}\n\nComponent Stack:\n${info.componentStack ?? ''}`.slice(0, 8000),
      route: this.props.route,
      severity: 'critical',
    });
  }

  handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return <ErrorBoundaryFallback onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 24,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    color: '#374151',
  },
});