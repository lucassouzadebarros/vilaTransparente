import { ReactNode } from 'react';
import { KeyboardTypeOptions, ReturnKeyTypeOptions, StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { colors, spacing } from '../theme';

type FormFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  returnKeyType?: ReturnKeyTypeOptions;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  maxLength?: number;
  multiline?: boolean;
  compactMultiline?: boolean;
  /** Marks the field with an asterisk. */
  required?: boolean;
  /** Shown in red under the field, which also gets a red border. */
  error?: string;
  /** Small help text under the field, replaced by the error when there is one. */
  hint?: string;
  right?: ReactNode;
  onBlur?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Label, input and message used by the registration forms (budget and service). */
export function FormField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  returnKeyType,
  autoCapitalize,
  maxLength,
  multiline,
  compactMultiline,
  required,
  error,
  hint,
  right,
  onBlur,
  style
}: FormFieldProps) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <View
        style={[
          styles.inputFrame,
          multiline ? styles.inputFrameMultiline : null,
          compactMultiline ? styles.inputFrameCompactMultiline : null,
          error ? styles.inputFrameError : null
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          placeholder={placeholder}
          keyboardType={keyboardType}
          returnKeyType={returnKeyType}
          autoCapitalize={autoCapitalize}
          maxLength={maxLength}
          multiline={multiline}
          accessibilityLabel={label}
          style={[styles.input, multiline ? styles.inputMultiline : null, compactMultiline ? styles.inputCompactMultiline : null]}
          placeholderTextColor={colors.muted}
        />
        {right ? <View style={styles.inputAction}>{right}</View> : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : hint ? <Text style={styles.hintText}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 5,
    // Lets two fields share a row on a narrow phone without pushing the page wider than the screen.
    minWidth: 0
  },
  fieldLabel: {
    color: colors.ink,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900'
  },
  required: {
    color: colors.red
  },
  inputFrame: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center'
  },
  inputFrameError: {
    borderColor: colors.red,
    backgroundColor: colors.redSoft
  },
  inputFrameMultiline: {
    minHeight: 76,
    alignItems: 'flex-start'
  },
  inputFrameCompactMultiline: {
    minHeight: 62
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    fontSize: 14,
    fontWeight: '600'
  },
  inputMultiline: {
    minHeight: 74,
    paddingTop: 11,
    textAlignVertical: 'top'
  },
  inputCompactMultiline: {
    minHeight: 60
  },
  inputAction: {
    minWidth: 38,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: spacing.sm
  },
  errorText: {
    color: colors.red,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800'
  },
  hintText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600'
  }
});
