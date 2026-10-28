import { ReactNode } from 'react';
import { Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, TextStyle, View, ViewStyle } from 'react-native';
import { ArrowLeft, Circle, CheckCircle2, CircleAlert, Clock3, LucideIcon } from 'lucide-react-native';
import { colors, radius, spacing, TOUCH_TARGET } from '../theme';
import { CONTENT_MAX_WIDTH } from '../utils/layout';
import { SoftBackdrop } from './SoftBackdrop';

type ScreenProps = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  right?: ReactNode;
};

// `aria-level` is read by the web build to pick h1..h6; React Native's types do not list it.
const HEADING_LEVEL_1 = { 'aria-level': 1 } as object;
const HEADING_LEVEL_2 = { 'aria-level': 2 } as object;

export function Screen({ children, title, subtitle, right }: ScreenProps) {
  return (
    <ScrollView role="main" style={styles.screen} contentContainerStyle={styles.screenContent}>
      <SoftBackdrop compact />
      {(title || right) && (
        <View style={styles.header}>
          <View style={styles.headerText}>
            {title ? <Text role="heading" {...HEADING_LEVEL_1} style={styles.title}>{title}</Text> : null}
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

/** A section title inside a screen. Same look as <Value>, but screen readers can jump between sections. */
export function SectionTitle({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <Text role="heading" {...HEADING_LEVEL_2} style={[styles.value, styles.sectionTitle, style]}>
      {children}
    </Text>
  );
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

type Tone = 'ok' | 'wait' | 'bad' | 'off' | 'info';

const toneStyle: Record<Tone, { bg: string; fg: string; Icon: LucideIcon }> = {
  ok: { bg: colors.greenSoft, fg: colors.green, Icon: CheckCircle2 },
  wait: { bg: colors.amberSoft, fg: colors.amber, Icon: Clock3 },
  bad: { bg: colors.redSoft, fg: colors.red, Icon: CircleAlert },
  off: { bg: colors.track, fg: colors.muted, Icon: Circle },
  info: { bg: colors.blueSoft, fg: colors.blue, Icon: Circle }
};

/** What each status code means for the reader: how it is written and which tone it takes. */
const statusInfo: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Ativo', tone: 'ok' },
  INACTIVE: { label: 'Inativo', tone: 'off' },
  LIBERADA: { label: 'Liberada', tone: 'ok' },
  PAID: { label: 'Pago', tone: 'ok' },
  PENDING: { label: 'Pendente', tone: 'wait' },
  OVERDUE: { label: 'Vencida', tone: 'bad' },
  CANCELLED: { label: 'Cancelado', tone: 'off' },
  // Bills to pay.
  PENDING_APPROVAL: { label: 'Aguardando aprovação', tone: 'wait' },
  APPROVED: { label: 'A pagar', tone: 'info' },
  PAGA: { label: 'Paga', tone: 'ok' },
  CANCELADA: { label: 'Cancelada', tone: 'off' },
  CANCELADO: { label: 'Cancelado', tone: 'off' },
  EM_VOTACAO: { label: 'Em votação', tone: 'wait' },
  EM_ANALISE: { label: 'Em análise', tone: 'wait' },
  APROVADO: { label: 'Aprovado', tone: 'ok' },
  REJEITADO: { label: 'Recusado', tone: 'bad' },
  PLANEJADO: { label: 'Planejado', tone: 'wait' },
  EM_ANDAMENTO: { label: 'Em andamento', tone: 'info' },
  FINALIZADO: { label: 'Finalizado', tone: 'ok' },
  RESOLVIDO: { label: 'Resolvido', tone: 'ok' },
  ABERTO: { label: 'Aberto', tone: 'wait' },
  PROCESSADO: { label: 'Processado', tone: 'ok' },
  ERRO: { label: 'Com erro', tone: 'bad' },
  VOTOU: { label: 'Votou', tone: 'ok' },
  'AGUARDANDO SEU VOTO': { label: 'Aguardando seu voto', tone: 'wait' },
  'MENOR VALOR': { label: 'Menor valor', tone: 'info' },
  'OUTRO TRABALHO': { label: 'Outro trabalho', tone: 'info' },
  CONCORRE: { label: 'Concorre', tone: 'info' },
  'DESTE SERVIÇO': { label: 'Deste serviço', tone: 'info' }
};

function describeStatus(status: string): { label: string; tone: Tone } {
  const known = statusInfo[status.toUpperCase()];
  if (known) {
    return known;
  }
  // A status that is not in the table: write it as a sentence and pick a tone from its words.
  const upper = status.toUpperCase();
  const tone: Tone = /CANCEL|INATIV/.test(upper)
    ? 'off'
    : /REJEIT|ERRO|VENC|OVERDUE/.test(upper)
      ? 'bad'
      : /APROV|FINALIZ|RESOLV|PAGO|ATIV/.test(upper)
        ? 'ok'
        : /ANALISE|VOTA|PEND|PLANEJ/.test(upper)
          ? 'wait'
          : 'info';
  const text = status.replace(/_/g, ' ').toLowerCase();
  return { label: text.charAt(0).toUpperCase() + text.slice(1), tone };
}

/** A status in words, with an icon, so the meaning never depends on color alone. */
export function Badge({ status }: { status: string }) {
  const { label, tone } = describeStatus(status);
  const { bg, fg, Icon } = toneStyle[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Icon color={fg} size={13} strokeWidth={2.4} />
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

type ButtonProps = {
  title: string;
  onPress?: () => void;
  icon?: LucideIcon;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  /** Name read by screen readers. Only needed for icon-only buttons; those default to "Atualizar". */
  accessibilityLabel?: string;
};

export function Button({ title, onPress, icon: Icon, variant = 'primary', disabled, accessibilityLabel }: ButtonProps) {
  const iconOnly = !title;
  // Primary is the one filled action of a screen; the rest are quiet. An icon-only button has no frame at all.
  // Danger is a quiet red outline, not a solid block: a destructive action should be findable, not the loudest thing.
  const bg = variant === 'primary' ? colors.blue : colors.surface;
  const fg = variant === 'primary' ? colors.surface : variant === 'danger' ? colors.red : colors.blue;
  const border = iconOnly ? 'transparent' : variant === 'primary' ? colors.blue : variant === 'danger' ? colors.dangerBorder : colors.border;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (iconOnly ? 'Atualizar' : undefined)}
      accessibilityState={disabled ? { disabled: true } : undefined}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        iconOnly ? styles.buttonIconOnly : null,
        {
          backgroundColor: iconOnly ? (pressed ? colors.blueSoft : 'transparent') : bg,
          borderColor: border,
          opacity: disabled ? 0.5 : pressed && !iconOnly ? 0.86 : 1
        }
      ]}
    >
      {Icon ? <Icon color={iconOnly ? colors.muted : fg} size={iconOnly ? 20 : 16} /> : null}
      {title ? <Text style={[styles.buttonText, { color: fg }]}>{title}</Text> : null}
    </Pressable>
  );
}

type Fact = { label: string; value: ReactNode };

/** A short list of facts, each a label on the left and its value on the right on one line, with a hairline between. */
export function Facts({ items }: { items: Fact[] }) {
  return (
    <View style={styles.facts}>
      {items.map((item, index) => (
        <View key={item.label} style={[styles.fact, index > 0 ? styles.factDivider : null]}>
          <Text style={styles.factLabel}>{item.label}</Text>
          <View style={styles.factValue}>
            {typeof item.value === 'string' || typeof item.value === 'number' ? <Text style={styles.factText}>{item.value}</Text> : item.value}
          </View>
        </View>
      ))}
    </View>
  );
}

/** "Back to the list" as a quiet link above the title, instead of a full-width button. */
export function BackLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={onPress} style={styles.backLink}>
      <ArrowLeft color={colors.blue} size={16} />
      <Text style={styles.backLinkText}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ icon: Icon, onPress, label, danger }: { icon: LucideIcon; onPress?: () => void; label: string; danger?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed ? { backgroundColor: colors.blueSoft } : null]}
    >
      <Icon color={danger ? colors.red : colors.muted} size={20} />
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
          accessibilityLabel={label}
          accessibilityHint={errorText ?? helpText}
          {...(errorText ? ({ 'aria-invalid': true } as object) : null)}
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
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: 104,
    gap: spacing.lg
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md
  },
  headerText: {
    flex: 1,
    minWidth: 0
  },
  title: {
    color: colors.ink,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.3
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 2
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderColor: colors.border,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm
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
    fontSize: 13,
    lineHeight: 18,
    flexShrink: 1
  },
  value: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    flexShrink: 1
  },
  sectionTitle: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700'
  },
  money: {
    color: colors.ink,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    flexShrink: 0
  },
  moneyStrong: {
    color: colors.ink,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums']
  },
  badge: {
    minHeight: 26,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 9
  },
  badgeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600'
  },
  button: {
    minHeight: TOUCH_TARGET,
    borderRadius: radius.control,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm
  },
  buttonIconOnly: {
    width: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
    paddingHorizontal: 0
  },
  buttonText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600'
  },
  iconButton: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center'
  },
  facts: {
    gap: 0
  },
  fact: {
    minHeight: TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.xs
  },
  factDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  factLabel: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18
  },
  factValue: {
    flex: 1,
    alignItems: 'flex-end',
    minWidth: 0
  },
  factText: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    textAlign: 'right'
  },
  backLink: {
    minHeight: TOUCH_TARGET,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  backLinkText: {
    color: colors.blue,
    fontSize: 14,
    fontWeight: '600'
  },
  field: {
    gap: spacing.xs
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600'
  },
  inputFrame: {
    minHeight: TOUCH_TARGET,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    borderRadius: radius.control,
    flexDirection: 'row',
    alignItems: 'center'
  },
  inputFrameError: {
    borderColor: colors.red,
    backgroundColor: colors.redSoft
  },
  inputFrameMultiline: {
    alignItems: 'flex-start'
  },
  input: {
    flex: 1,
    minHeight: 42,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    fontSize: 15
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
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600'
  },
  fieldHelp: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 16
  },
  empty: {
    color: colors.muted,
    textAlign: 'center',
    fontWeight: '600'
  }
});
