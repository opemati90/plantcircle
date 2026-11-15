import { Redirect } from 'expo-router';
import Screen from '../../../src/features/orders/OrderScreen';
import { features } from '../../../src/lib/features';

/** Group orders are switched off at launch (src/lib/features.ts): their links lead home. */
export default function Route() {
  return features.groupOrders ? <Screen /> : <Redirect href="/home" />;
}
