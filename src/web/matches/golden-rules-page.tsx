import { useNavigate, useSearch } from '@tanstack/react-router';
import { BackLink } from '../components/back-link';
import { SegmentedControl } from '../components/segmented-control';
import { TabPage } from '../components/tab-page';
import { Card } from '../components/ui/card';
import { type GoldenRule, type GoldenTier, goldenRulesWords, goldenTiers, type RulesLanguage } from './golden-rules';

const languages = [
  { value: 'fr', label: 'FR' },
  { value: 'en', label: 'EN' },
] as const satisfies readonly { value: RulesLanguage; label: string }[];

/** Squishy's Golden Rules, opened from Matchs: each tier, then each of its rules in a card of its own. */
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
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-10"
    >
      <div className="flex flex-col gap-1.5 lg:sticky lg:top-8">
        <span className="label-caps text-gold">Tier {tier.number}</span>
        <h2 id={headingId} className="title-display text-[24px] [line-height:1.1] lg:text-[26px]">
          {tier.name}
        </h2>
      </div>
      <ol className="m-0 grid list-none gap-3 p-0 lg:grid-cols-2">
        {tier.rules.map((rule) => (
          <li key={rule.number} className="flex">
            <RuleCard rule={rule} language={language} />
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A rule: a card of its own, its number big and golden. */
function RuleCard({ rule, language }: { rule: GoldenRule; language: RulesLanguage }) {
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

/** The idea to keep in mind, then how to apply it, quieter. */
function RuleWords({ rule, language }: { rule: GoldenRule; language: RulesLanguage }) {
  const { gist, detail } = rule.words[language];
  return (
    <div className="relative flex flex-col gap-1.5">
      <p className="m-0 font-medium text-[15px] text-t1 [line-height:1.4]">
        <Italics text={gist} />
      </p>
      <p className="m-0 text-[14px] text-t2 [line-height:1.45]">
        <Italics text={detail} />
      </p>
    </div>
  );
}

/** A rule's words, the game's English words between asterisks set in italics. */
function Italics({ text }: { text: string }) {
  return text.split('*').map((part, index) =>
    // biome-ignore lint/suspicious/noArrayIndexKey: the parts of a fixed text keep their order.
    index % 2 === 1 ? <em key={index}>{part}</em> : part,
  );
}
