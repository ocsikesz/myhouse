import { Alert } from 'react-native';

export function confirm(title: string, message: string, okText = 'Da', cancelText = 'Anulează'): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
        { text: okText, onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export function info(title: string, message: string): void {
  Alert.alert(title, message);
}
