'use client';

import { FlatMapBackdrop, useFlatMap } from '@/components/nexride/trip/flat-map';
import { TripFlow } from '@/components/nexride/trip/trip-flow';

const PICKUP = { lngLat: [38.7578, 9.0108] as [number, number], label: 'Bole Medhanialem' };
const DEST = { lngLat: [38.7469, 9.0302] as [number, number], label: 'Meskel Square' };

export default function TripDemo() {
  const map = useFlatMap(PICKUP.lngLat);
  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      <FlatMapBackdrop map={map} />
      <TripFlow map={map} pickup={PICKUP} destination={DEST} />
    </div>
  );
}
