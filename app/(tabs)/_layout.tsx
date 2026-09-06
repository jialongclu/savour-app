import { useQuery } from '@tanstack/react-query';
import { usePathname } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import React from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AlbumGlyph, CameraGlyph, FilmGlyph, ProfileGlyph } from '@/components/Aperture';
import { CameraKnob, PillTab, TabDock } from '@/components/TabPill';
import { fetchActiveRolls } from '@/lib/api';
import { colors, space } from '@/theme';

/**
 * A floating pill, split into equal thirds, with the shutter standing apart
 * from it as its own circle.
 *
 * A pill sized by its contents was right at two tabs — two items leave a
 * full-width bar looking sparse. Three fill one honestly, and equal thirds stop
 * the longest label from deciding how much room its neighbours get: the thumb
 * then travels on a fixed rhythm instead of resizing at every stop.
 *
 * Camera used to be the middle third of that same pill. It reads better on its
 * own: the two places you look at — Album, Film — belong together as a set
 * you switch between, but the shutter isn't a place you switch to so much as a
 * thing you fire, and a circle beside the pill says that at a glance instead
 * of asking it to look like a fourth destination among equals.
 *
 * `TabList` ignores children that are not `TabTrigger`s, which is what lets the
 * sliding thumb live inside the dock alongside the tabs.
 */
export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  // The viewfinder is the one screen you are meant to be looking through rather
  // than at, so the bar gets out of its way. The camera carries its own way out
  // in the top plate — without the bar there is nothing else to leave by.
  //
  // Only when there is film in it, though: with no rolls the camera shows an
  // empty state instead of a viewfinder, and that screen has no top plate to
  // leave by. Hiding the bar there would strand you on it.
  const pathname = usePathname();
  const { data: rolls } = useQuery({ queryKey: ['active-rolls'], queryFn: fetchActiveRolls });

  /**
   * Nothing loaded, so nothing to point the camera at.
   *
   * Read from the server's list rather than from what this phone could still
   * shoot into. A roll filled without signal is still active until its frames
   * go up — Film lists it as developing — and treating it as gone here would
   * flip this the instant the last shutter fired, mid-capture, which is how the
   * docket got lost once already.
   */
  const noRolls = rolls?.length === 0;

  const inViewfinder = pathname === '/camera' && !noRolls;

  return (
    <Tabs style={styles.root}>
      <TabSlot />

      <TabList asChild>
        <TabDock
          bottom={Math.max(insets.bottom, space.lg)}
          hidden={inViewfinder}
          groupSize={3}
        >
          <TabTrigger name="album" href="/" asChild>
            <PillTab index={0} label="Album" icon={AlbumGlyph} />
          </TabTrigger>
          <TabTrigger name="film" href="/film" asChild>
            <PillTab index={1} label="Roll" icon={FilmGlyph} />
          </TabTrigger>
          {/* Last in the pill: your own account is the one thing here that is
              not about a roll, so it sits at the end rather than between two
              things that are. */}
          <TabTrigger name="profile" href="/profile" asChild>
            <PillTab index={2} label="Profile" icon={ProfileGlyph} />
          </TabTrigger>
          {/* Detached from the pill — see `groupSize` above — and off the dock
              entirely when there is no film to shoot. The trigger stays
              mounted: it is what declares the route, and the camera is still
              reachable from a roll card on Film.

              No redirect goes with this. Someone standing on the camera when
              the last roll develops keeps the rest of the dock, so they are
              never stranded; adding one would only race the navigation to the
              finished screen for the same roll. */}
          <TabTrigger name="camera" href="/camera" asChild>
            <CameraKnob label="Camera" icon={CameraGlyph} hidden={noRolls} />
          </TabTrigger>
        </TabDock>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
});
