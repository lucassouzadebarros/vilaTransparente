import { StyleSheet, View } from 'react-native';
import { colors } from '../theme';

export function SoftBackdrop({ compact }: { compact?: boolean }) {
  return (
    <View pointerEvents="none" style={[styles.backdrop, compact ? styles.backdropCompact : null]}>
      <View style={styles.glow} />
      <View style={[styles.cloud, styles.cloudLeft]} />
      <View style={[styles.cloud, styles.cloudRight]} />

      <View style={styles.leafGroupLeft}>
        <View style={[styles.leaf, styles.leafOne]} />
        <View style={[styles.leaf, styles.leafTwo]} />
        <View style={[styles.leaf, styles.leafThree]} />
      </View>
      <View style={styles.leafGroupRight}>
        <View style={[styles.leaf, styles.leafOne]} />
        <View style={[styles.leaf, styles.leafTwo]} />
        <View style={[styles.leaf, styles.leafThree]} />
      </View>

      <View style={styles.village}>
        <View style={[styles.house, styles.houseMuted, { height: 42, width: 43 }]} />
        <View style={[styles.house, { height: 60, width: 54 }]} />
        <View style={[styles.house, styles.houseSoft, { height: 48, width: 48 }]} />
        <View style={[styles.house, { height: 68, width: 60 }]} />
        <View style={[styles.house, styles.houseSoft, { height: 52, width: 50 }]} />
        <View style={[styles.house, { height: 58, width: 54 }]} />
        <View style={[styles.house, styles.houseMuted, { height: 40, width: 44 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: -32,
    right: -32,
    height: 270,
    alignItems: 'center',
    overflow: 'hidden'
  },
  backdropCompact: {
    height: 230
  },
  glow: {
    position: 'absolute',
    top: 4,
    width: 520,
    height: 230,
    borderRadius: 230,
    backgroundColor: '#EDF7FC',
    opacity: 0.74
  },
  cloud: {
    position: 'absolute',
    width: 56,
    height: 15,
    borderRadius: 999,
    backgroundColor: '#E3EDF7',
    opacity: 0.38
  },
  cloudLeft: {
    top: 78,
    left: 48
  },
  cloudRight: {
    top: 82,
    right: 46
  },
  leafGroupLeft: {
    position: 'absolute',
    top: 86,
    left: '50%',
    width: 82,
    height: 42,
    marginLeft: -168,
    opacity: 0.38,
    transform: [{ rotate: '-6deg' }]
  },
  leafGroupRight: {
    position: 'absolute',
    top: 88,
    left: '50%',
    width: 82,
    height: 42,
    marginLeft: 84,
    opacity: 0.34,
    transform: [{ scaleX: -1 }, { rotate: '-6deg' }]
  },
  leaf: {
    position: 'absolute',
    width: 32,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#C8E0E4'
  },
  leafOne: {
    top: 2,
    left: 4,
    transform: [{ rotate: '28deg' }]
  },
  leafTwo: {
    top: 17,
    left: 26,
    transform: [{ rotate: '-18deg' }]
  },
  leafThree: {
    top: 28,
    left: 8,
    transform: [{ rotate: '18deg' }]
  },
  village: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 0,
    height: 104,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    opacity: 0.14
  },
  house: {
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    backgroundColor: '#DCE9F4'
  },
  houseSoft: {
    backgroundColor: '#E6F0F8'
  },
  houseMuted: {
    backgroundColor: '#D4E3F0'
  }
});
