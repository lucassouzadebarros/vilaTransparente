import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, savedThemeChoice, setThemeChoice, spacing, ThemeChoice } from '../theme';

const options: Array<{ key: ThemeChoice; label: string }> = [
  { key: 'auto', label: 'Automático' },
  { key: 'light', label: 'Claro' },
  { key: 'dark', label: 'Escuro' }
];

/**
 * Light, dark, or follow the system. Only on the web: phones always follow the system setting. The choice is kept in
 * the browser and the page reloads, because the whole app is drawn from the palette picked when it opens.
 */
export function ThemeSwitch() {
  if (Platform.OS !== 'web') {
    return null;
  }
  const current = savedThemeChoice();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Aparência do aplicativo" style={styles.track}>
      {options.map((option) => {
        const selected = option.key === current;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: selected }}
            aria-checked={selected}
            onPress={() => (selected ? undefined : setThemeChoice(option.key))}
            style={[styles.option, selected ? styles.optionSelected : null]}
          >
            <Text style={[styles.text, selected ? styles.textSelected : null]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: 2,
    padding: 3,
    borderRadius: radius.control,
    backgroundColor: colors.track
  },
  option: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center'
  },
  optionSelected: {
    backgroundColor: colors.surface,
    borderColor: colors.border
  },
  text: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600'
  },
  textSelected: {
    color: colors.ink,
    fontWeight: '700'
  }
});
