export type RecoveryItem = 'none' | 'gold' | 'silver' | 'bronze' | 'copper';

// Number selected for one AP recovery. This is game behavior, not the battle count.
export function recoveryFruitQuantity(item: RecoveryItem): number {
  switch (item) {
    case 'gold':
      return 1;
    case 'silver':
      return 2;
    case 'bronze':
      return 4;
    case 'copper':
      return 10;
    default:
      return 0;
  }
}
