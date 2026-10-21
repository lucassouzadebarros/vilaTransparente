import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, TOUCH_TARGET } from '../theme';

export type FilterOption<K extends string = string> = {
  key: K;
  label: string;
  /** How many items the option would show; omitted when it is not known. */
  count?: number;
};

type Props<K extends string> = {
  /** What is being filtered, read by screen readers as the name of the group ("Situação do orçamento"). */
  label: string;
  options: Array<FilterOption<K>>;
  value: K;
  onChange: (key: K) => void;
};

/**
 * The one filter every list uses: a single choice among a few options, with the number of items behind each.
 * It is announced as a group of radio buttons, so a screen reader says which option is selected.
 */
export function FilterBar<K extends string>({ label, options, value, onChange }: Props<K>) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.bar}>
      {options.map((option) => {
        const selected = option.key === value;
        const spoken = option.count == null ? option.label : `${option.label}, ${option.count}`;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="radio"
            accessibilityLabel={spoken}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.key)}
            style={({ pressed }) => [styles.chip, selected ? styles.chipSelected : null, pressed ? styles.pressed : null]}
          >
            <Text style={[styles.text, selected ? styles.textSelected : null]}>{option.label}</Text>
            {option.count != null ? <Text style={[styles.count, selected ? styles.countSelected : null]}>{option.count}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** What a list shows when the chosen filter matches nothing: says so and offers the way back to everything. */
export function EmptyFilter({ message, onClear }: { message: string; onClear?: () => void }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{message}</Text>
      {onClear ? (
        <Pressable accessibilityRole="button" onPress={onClear} style={styles.clear}>
          <Text style={styles.clearText}>Ver todos</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm
  },
  chip: {
    minHeight: TOUCH_TARGET,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm
  },
  chipSelected: {
    borderColor: colors.blue,
    backgroundColor: colors.blue
  },
  pressed: {
    opacity: 0.85
  },
  text: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700'
  },
  textSelected: {
    color: colors.surface
  },
  count: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700'
  },
  countSelected: {
    color: colors.blueSoft
  },
  empty: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm
  },
  emptyText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    textAlign: 'center'
  },
  clear: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center'
  },
  clearText: {
    color: colors.blue,
    fontSize: 14,
    fontWeight: '700'
  }
});
