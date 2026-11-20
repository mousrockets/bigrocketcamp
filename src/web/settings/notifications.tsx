import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { remindersOff } from '../../lib/contract';
import { formatHour } from '../../lib/format';
import { networkError } from '../api';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { remindersQuery } from '../queries';
import {
  blockedMessage,
  notificationsBlocked,
  pushSupport,
  subscriptionInput,
  thisDeviceQuery,
  turnRemindersOff,
  turnRemindersOn,
} from '../reminders';
import { saveReminder, testReminder } from '../writes';
import { BellIcon, Chevron, ClockIcon, InstallIcon } from './icons';
import { InstallHelp, useInstall } from './install';
import { ErrorNote, Note, RowIcon, RowLabel, SettingsCard, SettingsGroup, SettingsPage, SettingsRow } from './parts';

// Notifications: the daily reminder of the pushups owed, on this device, at the hour the member picks (Paris time).

export const defaultReminderHour = 19;
const hours = Array.from({ length: 24 }, (_, hour) => ({ value: String(hour), label: formatHour(hour) }));

/** Whether this device receives the daily reminder, and at what hour: the API and the browser must both say so. */
export function useThisDeviceReminder() {
  const settings = useQuery(remindersQuery);
  const device = useQuery(thisDeviceQuery);
  const subscribed = settings.data?.devices.find((known) => known.id === device.data?.id);
  return { settings, device, subscribed: device.data && subscribed ? subscribed : null };
}

export function NotificationSettings() {
  const queryClient = useQueryClient();
  const support = pushSupport();
  const { settings, device, subscribed } = useThisDeviceReminder();
  const publicKey = settings.data?.publicKey ?? null;
  const [hour, setHour] = useState<number | null>(null);
  const shownHour = hour ?? subscribed?.hour ?? defaultReminderHour;
  const reread = () => queryClient.invalidateQueries({ queryKey: remindersQuery.queryKey });

  const toggle = useMutation({
    mutationFn: async (on: boolean) => {
      if (on && publicKey) await turnRemindersOn({ publicKey, hour: shownHour });
      else if (!on && device.data) await turnRemindersOff(device.data);
    },
    onSettled: reread,
  });
  const changeHour = useMutation({
    mutationFn: async (next: number) => {
      setHour(next);
      if (subscribed && device.data)
        await saveReminder({ subscription: subscriptionInput(device.data.subscription), hour: next });
    },
    onSettled: reread,
  });

  const ready = support === 'ready' && publicKey !== null;
  const busy = toggle.isPending || changeHour.isPending || settings.isPending || device.isPending;
  const error = toggle.error ?? changeHour.error ?? settings.error;
  // Allowing the notifications changes nothing while the club has no key: only the note on the club is shown then.
  const blocked = ready && !subscribed && notificationsBlocked();

  return (
    <SettingsPage kicker="Cet appareil" title="Notifications">
      <SettingsGroup
        label="Rappel quotidien"
        note={
          <>
            {error && <ErrorNote errors={[networkError(error)]} />}
            {blocked && !error && <ErrorNote errors={[blockedMessage]} />}
            <Availability support={support} configured={settings.isSuccess ? publicKey !== null : true} />
          </>
        }
      >
        <SettingsCard>
          <SettingsRow>
            <RowIcon>
              <BellIcon />
            </RowIcon>
            <RowLabel>Rappel quotidien</RowLabel>
            <Switch
              size="ios"
              aria-label="Rappel quotidien"
              checked={subscribed !== null}
              disabled={!ready || busy}
              onCheckedChange={(on) => toggle.mutate(on)}
            />
          </SettingsRow>
          <SettingsRow>
            <RowIcon>
              <ClockIcon />
            </RowIcon>
            <RowLabel>Heure</RowLabel>
            <Select
              items={hours}
              value={String(shownHour)}
              disabled={!ready || busy}
              onValueChange={(value) => value !== null && changeHour.mutate(Number(value))}
            >
              <SelectTrigger
                aria-label="Heure du rappel"
                className="h-auto border-0 bg-transparent p-0 text-[15px] text-t3 dark:bg-transparent dark:hover:bg-transparent"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {hours.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingsRow>
        </SettingsCard>
      </SettingsGroup>
      {subscribed && <TestReminder id={subscribed.id} />}
    </SettingsPage>
  );
}

/** Why the switch cannot be turned on here, in one line; on an iPhone, the way to the home screen. */
function Availability({ support, configured }: { support: ReturnType<typeof pushSupport>; configured: boolean }) {
  const { mode, install, help, closeHelp } = useInstall();
  if (support === 'install') {
    return (
      <>
        <Note>Sur iPhone, les rappels marchent une fois l’app ajoutée à l’écran d’accueil.</Note>
        <SettingsCard>
          <SettingsRow render={<button type="button" onClick={install} />}>
            <RowIcon>
              <InstallIcon />
            </RowIcon>
            <RowLabel>Ajouter à l’écran d’accueil</RowLabel>
            <Chevron />
          </SettingsRow>
        </SettingsCard>
        <InstallHelp mode={mode} open={help} onClose={closeHelp} />
      </>
    );
  }
  if (support === 'unsupported') return <Note>Ce navigateur ne reçoit pas de notifications.</Note>;
  if (!configured) return <Note>{remindersOff}</Note>;
  return <Note>Chaque jour à cette heure : tes pompes à rendre, ou un GG si tu es à jour.</Note>;
}

/** Today's reminder, now: to see what it looks like, or check the notifications arrive. */
function TestReminder({ id }: { id: string }) {
  const test = useMutation({ mutationFn: () => testReminder(id) });
  return (
    <SettingsGroup
      note={
        test.error ? (
          <ErrorNote errors={[networkError(test.error)]} />
        ) : (
          test.isSuccess && <Note>Envoyé ! Il arrive dans quelques secondes.</Note>
        )
      }
    >
      <Button variant="pill" size="pill" className="self-start" disabled={test.isPending} onClick={() => test.mutate()}>
        M’envoyer un rappel
      </Button>
    </SettingsGroup>
  );
}
