import { cn } from 'cn';
import type { ReactNode } from 'react';
import { parisDay, shiftDay } from '../../lib/days';
import {
  defaultForfeitRules,
  defaultHighScoreRules,
  defaultLastPlaceRules,
  forfeitRuleOn,
  highScorePoints,
  highScoreRuleOn,
  lastPlaceRuleOn,
  pushupCredit,
} from '../../lib/domain';
import { formatNumber } from '../../lib/format';
import { useBoardState } from '../board';
import { useClub } from '../club';
import { InfoSheet } from '../components/info-sheet';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { undoMs } from '../declare/celebration';

/** Orange costs pushups, green takes some off, white only counts. */
const tones = {
  cost: 'bg-cost-strong/14 text-cost',
  credit: 'bg-win/14 text-win',
  count: 'bg-white/8 text-t1',
};

/** Whether a rule the admins switch applies today, and tomorrow once a change they made takes effect. */
interface Switch {
  today: boolean;
  tomorrow: boolean;
}

/** « Les règles »: every rule of the club, the switched ones as they stand today, with tomorrow's changes. */
export function RulesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const club = useClub();
  const { board } = useBoardState();
  const rules = board?.rules ?? club.rules;
  const today = parisDay();
  const tomorrow = shiftDay(today, 1);
  const lastPlaceRules = rules?.lastPlace ?? defaultLastPlaceRules;
  const lastPlace = lastPlaceRuleOn(lastPlaceRules, today);
  const forfeitRules = rules?.forfeit ?? defaultForfeitRules;
  const highScoreRules = rules?.highScore ?? defaultHighScoreRules;
  const bonus = { today: lastPlace.enabled, tomorrow: lastPlaceRuleOn(lastPlaceRules, tomorrow).enabled };
  const forfeit = {
    today: forfeitRuleOn(forfeitRules, today).enabled,
    tomorrow: forfeitRuleOn(forfeitRules, tomorrow).enabled,
  };
  const highScore = {
    today: highScoreRuleOn(highScoreRules, today).enabled,
    tomorrow: highScoreRuleOn(highScoreRules, tomorrow).enabled,
  };

  return (
    <InfoSheet open={open} onClose={onClose} title="Les règles" description="Celles en vigueur aujourd’hui au club.">
      <RuleGroup title="Les matchs">
        <Rule value="+5" tone="cost">
          Par défaite, pour chaque joueur du club
        </Rule>
        <Rule
          value="+5"
          tone="cost"
          switched={bonus}
          note={lastPlace.ties === 'all' ? 'Ex æquo : chacun prend le bonus.' : 'Ex æquo : pas de bonus.'}
        >
          Bonus pour celui qui a le moins de points de l’équipe
        </Rule>
        <Rule value="+5" tone="cost">
          Quitter avant la fin compte comme une défaite
        </Rule>
        <Rule value="−5" tone="credit" switched={forfeit}>
          Si les adversaires FF
        </Rule>
        <Rule value="−10" tone="credit" switched={highScore}>
          Dès {formatNumber(highScorePoints)} points dans une partie
        </Rule>
      </RuleGroup>
      <RuleGroup title="Les exercices">
        <Rule value={formatNumber(pushupCredit({ type: 'plank', count: 60 }))}>pompes pour 1 min de gainage</Rule>
        <Rule value={formatNumber(pushupCredit({ type: 'crunches', count: 20 }))}>pompes pour 20 abdos</Rule>
        <Rule value="1" note="Elle compte pour tes prochaines défaites.">
          pompe d’avance par pompe faite en trop ou esquivée
        </Rule>
        <Rule value={`${undoMs / 1000} s`}>pour annuler une série déclarée</Rule>
      </RuleGroup>
      <RuleGroup title="Les défis">
        <Rule value="3" note="Les exercices depuis lundi, comptés en pompes.">
          places sur le podium de la semaine
        </Rule>
        <Rule value="MMR">Ton meilleur MMR 2v2, duo ou solo, relevé le dernier jour du mois</Rule>
        <Rule value="1" tone="cost" note="Ex æquo à la dernière place : personne ne paie.">
          boisson par joueur, offerte par le dernier
        </Rule>
      </RuleGroup>
      <p className="m-0 text-center text-[12px] text-t3 [line-height:1.5]">
        Journée en heure de Paris. Une règle changée s’applique dès le lendemain.
      </p>
    </InfoSheet>
  );
}

function RuleGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <span className="label-caps px-1">{title}</span>
      <Card variant="glass" className="gap-0">
        <ul className="m-0 list-none p-0">{children}</ul>
      </Card>
    </section>
  );
}

/** One rule: its figure in a chip, then what it says. A rule the admins switch off for good is left out. */
function Rule({
  value,
  tone = 'count',
  switched,
  note,
  children,
}: {
  value: string;
  tone?: keyof typeof tones;
  switched?: Switch;
  note?: string;
  children: ReactNode;
}) {
  if (switched && !switched.today && !switched.tomorrow) return null;
  const change =
    switched && switched.today !== switched.tomorrow ? (switched.tomorrow ? 'Dès demain' : 'Jusqu’à ce soir') : null;
  return (
    <li className="flex items-center gap-3.5 px-4 py-3 not-first:border-line not-first:border-t-[.5px]">
      <span
        className={cn(
          'num inline-flex h-[30px] min-w-12 shrink-0 items-center justify-center rounded-[10px] px-2 text-[17px]',
          tones[tone],
        )}
      >
        {value}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] [line-height:1.35]">{children}</span>
        {note && <span className="text-[13px] text-t3 [line-height:1.4]">{note}</span>}
      </span>
      {change && <Badge variant="count">{change}</Badge>}
    </li>
  );
}
