import { useNavigate, useSearch } from '@tanstack/react-router';
import { cn } from 'cn';
import { BackLink } from '../components/back-link';
import { SegmentedControl } from '../components/segmented-control';
import { TabPage } from '../components/tab-page';
import { Card } from '../components/ui/card';
import { type GoldenRule, type GoldenTier, goldenRulesWords, goldenTiers, type RulesLanguage } from './golden-rules';

const languages = [
  { value: 'fr', label: 'FR' },
  { value: 'en', label: 'EN' },
] as const satisfies readonly { value: RulesLanguage; label: string }[];

/** Squishy's Golden Rules, opened from Matchs: the first tier in cards of their own, the others in lists. */
export function GoldenRulesPage() {
  const { langue } = useSearch({ strict: false });
  const language: RulesLanguage = langue ?? 'fr';
  const navigate = useNavigate();
  const words = goldenRulesWords[language];
  const choose = (next: RulesLanguage) =>
    void navigate({
      to: '.',
      search: (previous) => ({ ...previous, langue: next === 'fr' ? undefined : next }),
      replace: true,
      resetScroll: false,
    });

  return (
    <TabPage
      back={<BackLink to="/matchs">Matchs</BackLink>}
      kicker="SquishyMuffinz · 2v2"
      title="Golden Rules"
      aside={
        <span className="w-[104px]">
          <SegmentedControl label="Langue des règles" options={languages} value={language} onChange={choose} />
        </span>
      }
    >
      <div
        lang={language}
        className="flex animate-rise flex-col gap-12 px-5 pt-3 [animation-delay:.06s] lg:gap-16 lg:px-0 lg:pt-0"
      >
        <p className="m-0 max-w-[560px] text-[17px] text-t2 [line-height:1.45] lg:-mt-8 lg:text-[19px]">{words.lede}</p>
        {goldenTiers.map((tier) => (
          <Tier key={tier.number} tier={tier} language={language} />
        ))}
        <p className="m-0 text-[12px] text-t3 [line-height:1.5] lg:-mt-6">{words.source}</p>
      </div>
    </TabPage>
  );
}

/** A tier: its small capitals and name, beside its rules on a computer, above them on a phone. */
function Tier({ tier, language }: { tier: GoldenTier; language: RulesLanguage }) {
  const headingId = `tier-${tier.number}`;
  const core = tier.number === 1;
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-10"
    >
      <div className="flex flex-col gap-1.5 lg:sticky lg:top-8">
        <span className={cn('label-caps', core && 'text-gold')}>Tier {tier.number}</span>
        <h2 id={headingId} className="title-display text-[24px] [line-height:1.1] lg:text-[26px]">
          {tier.name}
        </h2>
      </div>
      {core ? (
        <ol className="m-0 grid list-none gap-3 p-0 lg:grid-cols-2">
          {tier.rules.map((rule) => (
            <li key={rule.number} className="flex">
              <CoreRule rule={rule} language={language} />
            </li>
          ))}
        </ol>
      ) : (
        <Card variant="glass" className="gap-0 py-0">
          <ol className="m-0 list-none p-0">
            {tier.rules.map((rule) => (
              <RuleRow key={rule.number} rule={rule} language={language} />
            ))}
          </ol>
        </Card>
      )}
    </section>
  );
}

/** A rule of the first tier: a card of its own, its number big and golden. */
function CoreRule({ rule, language }: { rule: GoldenRule; language: RulesLanguage }) {
  return (
    <Card variant="glass" className="relative flex-1 gap-3 p-5">
      <i
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_70%_at_0%_0%,color-mix(in_oklab,var(--gold)_11%,transparent),transparent_62%)]"
      />
      <div className="relative flex items-end gap-3">
        <b aria-hidden="true" className="num text-[52px] text-gold [line-height:.8]">
          {rule.number}
        </b>
        <h3 className="title-display text-[21px] [line-height:1.05]">
          <span className="sr-only">{rule.number}. </span>
          {rule.name}
        </h3>
      </div>
      <RuleWords rule={rule} language={language} />
    </Card>
  );
}

/** A rule of the other tiers: one row of its tier's list. */
function RuleRow({ rule, language }: { rule: GoldenRule; language: RulesLanguage }) {
  return (
    <li className="flex gap-4 px-4 py-4 not-first:border-line not-first:border-t-[.5px] lg:gap-5 lg:px-5 lg:py-[18px]">
      <b aria-hidden="true" className="num w-7 shrink-0 text-right text-[26px] text-gold/55 [line-height:1]">
        {rule.number}
      </b>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h3 className="m-0 font-semibold text-[17px] [line-height:1.2]">
          <span className="sr-only">{rule.number}. </span>
          {rule.name}
        </h3>
        <RuleWords rule={rule} language={language} />
      </div>
    </li>
  );
}

/** The idea to keep in mind, then how to apply it, quieter. */
function RuleWords({ rule, language }: { rule: GoldenRule; language: RulesLanguage }) {
  const { gist, detail } = rule.words[language];
  return (
    <div className="relative flex flex-col gap-1.5">
      <p className="m-0 font-medium text-[15px] text-t1 [line-height:1.4]">{gist}</p>
      <p className="m-0 text-[14px] text-t2 [line-height:1.45]">{detail}</p>
    </div>
  );
}
