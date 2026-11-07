import { useNavigate, useSearch } from '@tanstack/react-router';
import { cn } from 'cn';
import { useState } from 'react';
import { dailyRecap, lastPlaceRuleOn, parisDay } from '../../lib/domain';
import { useBoardState } from '../board/board-context';
import { lastPlaceRulesOf, shiftDay } from '../board/model';
import { useClub } from '../club';
import { BackLink, Note, PageHeader, Panel } from '../components/club/page';
import { Segmented } from '../components/club/segmented';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Skeleton } from '../components/ui/skeleton';

// The day's result for the team: matches, wins and defeats, and the pushups each player generated.

type Choice = 'yesterday' | 'today' | 'pick';
const choiceItems: { value: Choice; label: string }[] = [
  { value: 'yesterday', label: 'Hier' },
  { value: 'today', label: 'Aujourd’hui' },
  { value: 'pick', label: 'Choisir…' },
];
const titleDay = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric' });
const validDay = (day: unknown): day is string => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day);

/** The design's .mini figures: Archivo at 70 %, wider than the other figures, and proportional. */
const mini = 'block font-heading text-xl font-extrabold [font-stretch:70%] text-foreground';

function Stat({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-1 px-3 py-3.5', className)}>
      <span className="kicker">{label}</span>
      <b className="font-numeral text-[44px] leading-[0.9]">{children}</b>
    </div>
  );
}

export function RecapPage() {
  const { roster } = useClub();
  const { data, me } = useBoardState();
  const search = useSearch({ strict: false }) as { jour?: unknown };
  const navigate = useNavigate();
  const today = parisDay();
  const yesterday = shiftDay(today, -1);
  const day = validDay(search.jour) && search.jour <= today ? search.jour : today;
  const [picking, setPicking] = useState(day !== today && day !== yesterday);
  const choice: Choice = picking ? 'pick' : day === yesterday ? 'yesterday' : 'today';
  const goTo = (next: string) =>
    navigate({ to: '/recap', search: next === today ? {} : { jour: next }, replace: true });

  const rules = lastPlaceRulesOf(data);
  const rule = lastPlaceRuleOn(rules, day);
  const recap = data ? dailyRecap(roster, data.results, day, data.matchRosters || [], rules) : null;
  const wins = recap?.players.reduce((sum, p) => sum + p.wins, 0) ?? 0;
  const losses = recap?.players.reduce((sum, p) => sum + p.losses, 0) ?? 0;
  const generated = recap?.players.reduce((sum, p) => sum + p.generated, 0) ?? 0;
  const top = recap ? [...recap.players].sort((a, b) => b.generated - a.generated)[0] : undefined;
  const spotless = recap?.players.filter((p) => p.played > 0 && p.losses === 0) ?? [];
  const line = [
    top && top.generated > 0
      ? `Lanterne rouge : ${top.name}, ${top.generated} pompe${top.generated > 1 ? 's' : ''} générée${top.generated > 1 ? 's' : ''}.`
      : '',
    ...spotless.map((p) => `${p.name} rentre les mains propres.`),
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <PageHeader
        back={<BackLink to="/" label="Retour au club" />}
        kicker="Le bilan du jour"
        title={`Récap du ${titleDay.format(new Date(`${day}T12:00:00Z`))}`}
      />
      <div className="flex flex-col gap-2 lg:max-w-[420px]">
        <Segmented
          label="Journée"
          items={choiceItems}
          value={choice}
          onChange={(next) => {
            setPicking(next === 'pick');
            if (next === 'today') goTo(today);
            if (next === 'yesterday') goTo(yesterday);
          }}
        />
        {picking && (
          <div className="flex items-center gap-3 text-sm text-soft">
            <label htmlFor="recap-day">Date</label>
            <Input
              id="recap-day"
              type="date"
              value={day}
              max={today}
              onChange={(event) => event.target.value && goTo(event.target.value)}
              className="h-10 w-auto"
            />
          </div>
        )}
      </div>
      {!recap ? (
        <Skeleton className="h-[300px] rounded-card" />
      ) : (
        <>
          <Panel aria-label="Bilan de l’équipe" className="grid grid-cols-3 lg:max-w-[720px]">
            <Stat label="Matchs">{recap.matchCount}</Stat>
            <Stat label="Bilan" className="border-x border-border">
              {wins}
              <span className="text-faint">–</span>
              <span className={losses ? 'text-cost' : undefined}>{losses}</span>
            </Stat>
            <Stat label="Pompes">
              <span className={generated ? 'text-cost' : 'text-settled'}>{generated}</span>
            </Stat>
          </Panel>
          {line && <p className="-mt-1 px-1 text-sm leading-[1.4] text-soft">{line}</p>}
          <Panel aria-label="Par joueur" className="lg:grid lg:grid-cols-3">
            {recap.players.map((p) => (
              <div
                key={p.name}
                className={cn(
                  'flex flex-col gap-2.5 border-t border-border px-4 py-3.5 first:border-t-0 lg:border-t-0 lg:border-l lg:first:border-l-0',
                  p.name === me && 'bg-primary/6',
                )}
              >
                <div className="flex items-baseline justify-between">
                  <b className="text-[15px] font-semibold">
                    {p.name}
                    {p.name === me && (
                      <Badge variant="me" className="ml-1 align-middle">
                        Toi
                      </Badge>
                    )}
                  </b>
                  <span className={cn('font-numeral text-2xl', p.generated ? 'text-cost' : 'text-settled')}>
                    {p.generated ? `+${p.generated}` : '0'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                  <span>
                    <b className={mini}>{p.played}</b>
                    parties
                  </span>
                  <span>
                    <b className={mini}>
                      {p.wins}–{p.losses}
                    </b>
                    V–D
                  </span>
                  <span>
                    <b className={mini}>{p.compared > 0 ? `${p.lowest} / ${p.compared}` : '—'}</b>
                    {p.compared > 0 ? 'moins de pts*' : 'non comparable'}
                  </span>
                </div>
                {(p.bonus > 0 || p.lowestTies > 0 || p.unranked > 0) && (
                  <small className="text-xs text-muted-foreground">
                    {[
                      p.bonus > 0 ? `dont ${p.bonus} de supplément` : '',
                      p.lowestTies > 0 ? `${p.lowestTies} ex æquo` : '',
                      p.unranked > 0 ? `${p.unranked} match${p.unranked > 1 ? 's' : ''} sans comparaison` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                )}
              </div>
            ))}
          </Panel>
          {recap.matchCount === 0 && (
            <p className="px-1 text-sm text-muted-foreground">
              Aucun match reçu pour cette journée. Le récap se complétera après synchronisation.
            </p>
          )}
          <Note>
            * Entre joueurs du club d’une même équipe.{' '}
            {rule.enabled
              ? `Une défaite vaut 5 pompes, avec 5 de plus pour celui du club qui a le moins de points${rule.ties === 'none' ? ', sauf égalité' : ''}.`
              : 'Ce jour-là, une défaite vaut 5 pompes, sans supplément pour le dernier aux points.'}{' '}
            Journée en heure de Paris, {day === today ? 'bilan en cours' : 'journée passée'}.
          </Note>
        </>
      )}
    </>
  );
}
