import { Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/AppText';
import { useAppTheme } from '@/hooks/useAppTheme';
import { t } from '@/i18n';
import type { Role } from '@/types';
import { spacing, radius } from '@/theme';

interface RoleSelectorProps {
  value: Role;
  onChange: (role: Role) => void;
  disabled?: boolean;
  /** Which role labels to show (customer/vendor). */
  label: 'loginAs' | 'registerAs';
  hint?: string;
}

const ROLE_CHOICES: ReadonlyArray<{ value: Role; labelKey: 'roleCustomer' | 'roleVendor' }> = [
  { value: 'customer', labelKey: 'roleCustomer' },
  { value: 'vendor', labelKey: 'roleVendor' },
];

/**
 * Segmented customer/vendor toggle used on the login and register screens.
 * Choosing a role selects the matching backend endpoint (/api/users vs
 * /api/vendors). Disabled while an attempt is in flight so the role cannot
 * change mid-request.
 */
export function RoleSelector({ value, onChange, disabled = false, label, hint }: RoleSelectorProps) {
  const { palette, lang } = useAppTheme();

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: palette.textMuted }]}>{t(lang, label)}</Text>
      <View
        style={[styles.segment, { backgroundColor: palette.surface, borderColor: palette.border }]}
      >
        {ROLE_CHOICES.map((choice) => {
          const active = value === choice.value;
          return (
            <Pressable
              key={choice.value}
              disabled={disabled}
              onPress={() => onChange(choice.value)}
              style={[
                styles.option,
                active && { backgroundColor: palette.primary },
                disabled && styles.disabledOption,
              ]}
            >
              <Text
                style={[
                  styles.optionText,
                  { color: active ? '#FFFFFF' : palette.text },
                ]}
              >
                {t(lang, choice.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {hint ? (
        <Text style={[styles.hint, { color: palette.textMuted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xxs },
  label: { fontSize: 13, fontWeight: '600' },
  segment: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.xxs,
    gap: spacing.xxs,
  },
  option: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  optionText: { fontSize: 15, fontWeight: '600' },
  disabledOption: { opacity: 0.6 },
  hint: { fontSize: 12 },
});
