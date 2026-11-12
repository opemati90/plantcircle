import { Slot } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { TabBar } from '../../src/components/TabBar';
import { color } from '../../src/components/theme';

/** The five tabs. The floating tab bar is shown here only, never on detail screens. */
export default function TabsLayout() {
  return (
    <View style={styles.root}>
      <Slot />
      <TabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface },
});
