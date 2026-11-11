import type { CSSProperties } from 'react';
import ui from '../../design/ui/ui.module.css';
import styles from './home.module.css';

function Block({
  width,
  height,
  radius,
}: {
  width: number | string;
  height: number;
  radius: number;
}) {
  const style: CSSProperties = { width, height, borderRadius: radius, flexShrink: 0 };
  return <span className={ui.skeleton} style={style} />;
}

export function HomeSkeleton() {
  return (
    <div className={styles.screen} aria-busy="true" aria-label="Loading">
      <div className={styles.skeletonSpread}>
        <Block width={96} height={40} radius={999} />
        <span className={styles.headerActions}>
          <Block width={44} height={44} radius={999} />
          <Block width={44} height={44} radius={999} />
        </span>
      </div>
      <div className={styles.skeletonStack}>
        <Block width="40%" height={16} radius={6} />
        <Block width="75%" height={34} radius={8} />
      </div>
      <div className={styles.skeletonRow}>
        <Block width={78} height={36} radius={999} />
        <Block width={78} height={36} radius={999} />
        <Block width={78} height={36} radius={999} />
        <Block width={70} height={36} radius={999} />
      </div>
      <div className={styles.row}>
        <Block width="100%" height={430} radius={28} />
      </div>
      <div className={styles.skeletonRow} style={{ overflow: 'hidden' }}>
        <Block width={240} height={160} radius={20} />
        <Block width={240} height={160} radius={20} />
      </div>
    </div>
  );
}
