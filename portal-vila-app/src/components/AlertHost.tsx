import { useEffect, useState } from 'react';
import { AlertButton, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { AlertDialog, subscribeToAlerts } from '../utils/alert';

/** Draws the dialogs opened through utils/alert, one at a time, in the order they were requested. */
export function AlertHost() {
  const [queue, setQueue] = useState<AlertDialog[]>([]);

  useEffect(() => subscribeToAlerts((dialog) => setQueue((current) => [...current, dialog])), []);

  const dialog = queue[0];
  if (!dialog) {
    return null;
  }

  function close(button?: AlertButton) {
    setQueue((current) => current.slice(1));
    button?.onPress?.();
  }

  const cancelButton = dialog.buttons.find((button) => button.style === 'cancel');

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => close(cancelButton)}>
      <View style={styles.overlay}>
        <View style={styles.box} accessibilityRole="alert">
          <Text style={styles.title}>{dialog.title}</Text>
          {dialog.message ? <Text style={styles.message}>{dialog.message}</Text> : null}
          <View style={styles.actions}>
            {dialog.buttons.map((button, index) => (
              <Pressable
                key={`${button.text ?? 'ok'}-${index}`}
                accessibilityRole="button"
                onPress={() => close(button)}
                style={({ pressed }) => [
                  styles.button,
                  button.style === 'cancel' ? styles.buttonGhost : null,
                  button.style === 'destructive' ? styles.buttonDanger : null,
                  pressed ? styles.pressed : null
                ]}
              >
                <Text style={[styles.buttonText, button.style === 'cancel' ? styles.buttonGhostText : null]}>{button.text ?? 'OK'}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20
  },
  box: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 20,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border
  },
  title: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: '700'
  },
  message: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600'
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8
  },
  button: {
    minHeight: 44,
    minWidth: 88,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonGhost: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  buttonDanger: {
    backgroundColor: colors.red
  },
  pressed: {
    opacity: 0.8
  },
  buttonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '700'
  },
  buttonGhostText: {
    color: colors.ink
  }
});
