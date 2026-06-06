import { ReactNode } from 'react';
import { Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, TextStyle, View, ViewStyle } from 'react-native';
import { LucideIcon } from 'lucide-react-native';
import { colors, spacing } from '../theme';
import { SoftBackdrop } from './SoftBackdrop';

type ScreenProps = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  right?: ReactNode;
};

export function Screen({ children, title, subtitle, right }: ScreenProps) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      <SoftBackdrop compact />
      {(title || right) && (
        <View style={styles.header}>
          <View style={styles.headerText}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      )}
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Stack({ children, gap = spacing.md }: { children: ReactNode; gap?: number }) {
  return <View style={{ gap }}>{children}</View>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Value({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.value, style]}>{children}</Text>;
}

export function Money({ value, strong }: { value: number; strong?: boolean }) {
  return <Text style={strong ? styles.moneyStrong : styles.money}>{formatMoney(value)}</Text>;
}

export function formatMoney(value?: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value ?? 0);
}

export function Badge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const palette =
    normalized.includes('INACTIVE') || normalized.includes('INATIVO')
      ? { bg: colors.redSoft, fg: colors.red }
      : normalized.includes('ACTIVE') || normalized.includes('ATIVO') || normalized.includes('LIBERADA') || normalized.includes('PAID') || normalized.includes('APROVADO') || normalized.includes('FINALIZADO')
      ? { bg: colors.greenSoft, fg: colors.green }
      : normalized.includes('PENDING') || normalized.includes('ANALISE') || normalized.includes('PLANEJADO')
        ? { bg: colors.amberSoft, fg: colors.amber }
        : normalized.includes('OVERDUE') || normalized.includes('REJEITADO') || normalized.includes('CANCEL')
          ? { bg: colors.redSoft, fg: colors.red }
          : { bg: colors.blueSoft, fg: colors.blue };
  const label = normalized
    .replace('INACTIVE', 'INATIVO')
    .replace('ACTIVE', 'ATIVO')
    .replace('PAID', 'PAGO')
    .replace('PENDING', 'PENDENTE')
    .replace('OVERDUE', 'VENCIDA')
    .replace('_', ' ');
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.badgeText, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

type ButtonProps = {
  title: string;
  onPress?: () => void;
  icon?: LucideIcon;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
};

export function Button({ title, onPress, icon: Icon, variant = 'primary', disabled }: ButtonProps) {
  const bg = variant === 'danger' ? colors.red : variant === 'ghost' ? 'transparent' : colors.blue;
  const fg = variant === 'ghost' ? colors.blue : colors.surface;
  const iconOnly = !title;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        iconOnly ? styles.buttonIconOnly : null,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.82 : 1, borderColor: variant === 'ghost' ? colors.border : bg }
      ]}
    >
      {Icon ? <Icon color={fg} size={iconOnly ? 18 : 16} /> : null}
      {title ? <Text style={[styles.buttonText, { color: fg }]}>{title}</Text> : null}
    </Pressable>
  );
}

export function IconButton({ icon: Icon, onPress, label, danger }: { icon: LucideIcon; onPress?: () => void; label: string; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.iconButton}>
      <Icon color={danger ? colors.red : colors.ink} size={20} />
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  secureTextEntry,
  multiline,
  autoCapitalize,
  errorText,
  helpText,
  right
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'email-address';
  secureTextEntry?: boolean;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  errorText?: string;
  helpText?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputFrame, errorText ? styles.inputFrameError : null, multiline ? styles.inputFrameMultiline : null]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          multiline={multiline}
          style={[styles.input, multiline ? styles.inputMultiline : null]}
          placeholderTextColor={colors.muted}
        />
        {right ? <View style={styles.inputAction}>{right}</View> : null}
      </View>
      {errorText ? <Text style={styles.fieldError}>{errorText}</Text> : helpText ? <Text style={styles.fieldHelp}>{helpText}</Text> : null}
    </View>
  );
}

export function EmptyState({ title }: { title: string }) {
  return (
    <Card>
      <Text style={styles.empty}>{title}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg
  },
  screenContent: {
    width: '100%',
    maxWidth: 430,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 104,
    gap: spacing.md
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: 2
  },
  headerText: {
    flex: 1,
    minWidth: 0
  },
  title: {
    color: colors.ink,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '800',
    letterSpacing: 0
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderColor: colors.border,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
    shadowColor: '#1D2939',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minWidth: 0
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    flexShrink: 1
  },
  value: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    flexShrink: 1
  },
  money: {
    color: colors.ink,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
    flexShrink: 0
  },
  moneyStrong: {
    color: colors.ink,
    fontSize: 29,
    lineHeight: 35,
    fontWeight: '900'
  },
  badge: {
    minHeight: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800'
  },
  button: {
    minHeight: 41,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm
  },
  buttonIconOnly: {
    width: 42,
    minHeight: 42,
    paddingHorizontal: 0
  },
  buttonText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800'
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center'
  },
  field: {
    gap: spacing.xs
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800'
  },
  inputFrame: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center'
  },
  inputFrameError: {
    borderColor: colors.red,
    backgroundColor: '#FFF8F8'
  },
  inputFrameMultiline: {
    alignItems: 'flex-start'
  },
  input: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    color: colors.ink,
    fontSize: 14
  },
  inputMultiline: {
    minHeight: 88,
    paddingTop: spacing.sm,
    textAlignVertical: 'top'
  },
  inputAction: {
    minWidth: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: spacing.xs
  },
  fieldError: {
    color: colors.red,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700'
  },
  fieldHelp: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16
  },
  empty: {
    color: colors.muted,
    textAlign: 'center',
    fontWeight: '700'
  }
});
