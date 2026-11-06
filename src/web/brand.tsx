import { clubName } from './club-config';

// The header shows the club name on two lines with its last word standing out ("Les Trois" over "Mousrockets").
const lastSpace = clubName.lastIndexOf(' ');
const clubNameLead = lastSpace > 0 ? clubName.slice(0, lastSpace) : '';
const clubNameMain = lastSpace > 0 ? clubName.slice(lastSpace + 1) : clubName;

export function Brand() {
  return (
    <a className="brand" href="/" aria-label={`${clubName}, accueil`}>
      <img className="club-logo" src="/club-photo.jpg" alt="" width={64} height={64} />
      <span className="brand-name">
        {clubNameLead && <span>{clubNameLead}</span>}
        <strong>{clubNameMain}</strong>
      </span>
    </a>
  );
}
