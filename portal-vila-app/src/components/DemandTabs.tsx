import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing } from '../theme';

type DemandKey = 'problems' | 'budgets' | 'services';

const tabs: Array<{ key: DemandKey; label: string }> = [
  { key: 'problems', label: 'Problemas' },
  { key: 'budgets', label: 'Orçamentos' },
  { key: 'services', label: 'Serviços' }
];

/**
 * The three registrations of one chain (a problem is reported, quotes are voted, a service is done and paid).
 * They live in different parts of the app, so this strip sits on top of each list and moves between them.
 */
export function DemandTabs({ current }: { current: DemandKey }) {
  const navigation = useNavigation<any>();

  function open(key: DemandKey) {
    if (key === current) {
      return;
    }
    if (key === 'problems') {
      navigation.navigate('Mais', { screen: 'ProblemReports' });
    } else if (key === 'budgets') {
      navigation.navigate('Budgets');
    } else {
      navigation.navigate('Servicos');
    }
  }

  return (
    <View style={styles.strip}>
      {tabs.map((tab) => {
        const selected = tab.key === current;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => open(tab.key)}
            style={[styles.tab, selected ? styles.tabSelected : null]}
          >
            <Text style={[styles.tabText, selected ? styles.tabTextSelected : null]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    zIndex: 1
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    borderRadius: 8,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tabSelected: {
    backgroundColor: colors.blue
  },
  tabText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '800'
  },
  tabTextSelected: {
    color: colors.surface
  }
});
