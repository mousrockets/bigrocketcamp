/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLUB_NAME?: string;
  readonly VITE_CLUB_ROSTER?: string;
  /** Players who do not play on PC, as `name:platform` pairs separated by commas (e.g. `carla:PS5`). */
  readonly VITE_CLUB_PLATFORMS?: string;
}
