import { useClubLogo, useClubName } from './club';

export function Brand() {
  const clubName = useClubName();
  const logo = useClubLogo();
  // The header shows the club name on two lines with its last word standing out ("Les Trois" over "Mousrockets").
  const lastSpace = clubName.lastIndexOf(' ');
  const clubNameLead = lastSpace > 0 ? clubName.slice(0, lastSpace) : '';
  const clubNameMain = lastSpace > 0 ? clubName.slice(lastSpace + 1) : clubName;
  return (
    <a className="brand" href="/" aria-label={clubName ? `${clubName}, accueil` : 'Accueil'}>
      <img className="club-logo" src={logo} alt="" width={64} height={64} />
      <span className="brand-name">
        {clubNameLead && <span>{clubNameLead}</span>}
        <strong>{clubNameMain}</strong>
      </span>
    </a>
  );
}
