import { useEffect, useState } from 'react';
import { Button } from '../components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '../components/ui/drawer';

// Adding the app to the home screen. Chrome, Edge and Android keep an install prompt (index.html stores it in
// `window.__rlInstall`, as it fires before React starts); Safari on iPhone has none: the member is told where to tap.

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type InstallWindow = Window & { __rlInstall?: InstallPrompt | null };

export type InstallMode = 'installed' | 'prompt' | 'ios' | 'manual';

const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function currentMode(): InstallMode {
  if (isStandalone()) return 'installed';
  if ((window as InstallWindow).__rlInstall) return 'prompt';
  return isIos() ? 'ios' : 'manual';
}

/** How this browser installs the app, and the action that does it: the browser's prompt, or the instructions. */
export function useInstall(): {
  mode: InstallMode;
  install: () => Promise<void>;
  help: boolean;
  closeHelp: () => void;
} {
  const [mode, setMode] = useState<InstallMode>(currentMode);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const ready = () => setMode((now) => (now === 'installed' ? now : 'prompt'));
    const installed = () => {
      (window as InstallWindow).__rlInstall = null;
      setMode('installed');
    };
    addEventListener('rl-install-ready', ready);
    addEventListener('appinstalled', installed);
    return () => {
      removeEventListener('rl-install-ready', ready);
      removeEventListener('appinstalled', installed);
    };
  }, []);

  async function install() {
    const installWindow = window as InstallWindow;
    const prompt = installWindow.__rlInstall;
    if (mode !== 'prompt' || !prompt) {
      setHelp(true);
      return;
    }
    // A prompt is shown once: the browser offers a new one later if the member says no.
    installWindow.__rlInstall = null;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    setMode(outcome === 'accepted' ? 'installed' : currentMode());
  }

  return { mode, install, help, closeHelp: () => setHelp(false) };
}

/** Where to tap when the browser cannot install the app by itself. */
export function InstallHelp({ mode, open, onClose }: { mode: InstallMode; open: boolean; onClose: () => void }) {
  return (
    <Drawer open={open} onOpenChange={(next) => !next && onClose()} showSwipeHandle>
      <DrawerContent className="mx-auto max-w-[520px] rounded-t-[22px] border-0 bg-[#16171b] pt-2 lg:mb-6 lg:rounded-[22px]">
        <DrawerHeader className="gap-2 px-5 pt-4 text-left group-data-[swipe-axis=y]/drawer-popup:text-left md:text-left">
          <DrawerTitle className="title-display text-[24px] [line-height:1]">Ajouter à l’écran d’accueil</DrawerTitle>
          <DrawerDescription className="text-[15px] text-t2 leading-[1.45]">
            {mode === 'ios'
              ? 'Dans Safari, touche Partager (le carré avec une flèche), puis « Sur l’écran d’accueil ». Le club s’ouvre ensuite comme une vraie app.'
              : 'Ouvre le menu du navigateur (⋮ ou …), puis « Installer l’application » ou « Ajouter à l’écran d’accueil ».'}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter className="px-5 pt-6 pb-[max(20px,env(safe-area-inset-bottom))]">
          <DrawerClose render={<Button variant="cta" size="cta" className="w-full" />}>Compris</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
