import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { useAppTheme } from '@/hooks/useAppTheme';
import { spacing, radius } from '@/theme';

interface FormTextFieldProps extends TextInputProps {
  label: string;
  error?: string;
}

/**
 * Labelled text input for auth forms. Shows an inline validation error under
 * the field. Styling reads from the active theme so both light/dark work.
 * The native value is kept local; callers read `value`/`onChangeText`.
 */
export function FormTextField({ label, error, ...inputProps }: FormTextFieldProps) {
  const { palette } = useAppTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: palette.textMuted }]}>{label}</Text>
      <TextInput
        {...inputProps}
        placeholderTextColor={palette.textMuted}
        onFocus={(e) => {
          setFocused(true);
          inputProps.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          inputProps.onBlur?.(e);
        }}
        style={[
          styles.input,
          {
            backgroundColor: palette.surface,
            color: palette.text,
            borderColor: error ? palette.danger : focused ? palette.primary : palette.border,
          },
        ]}
      />
      {error ? (
        <Text style={[styles.error, { color: palette.danger }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xxs },
  label: { fontSize: 13, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
  },
  error: { fontSize: 12, marginTop: spacing.xxs },
});
