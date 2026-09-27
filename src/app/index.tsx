import { StyleSheet, Text, View } from 'react-native';

// 仮のライブラリ画面。SC-1 は #23 で実装する
export default function LibraryScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Leaves</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0E1310',
  },
  title: { fontSize: 28, fontWeight: '600', color: '#E7ECE8' },
});
